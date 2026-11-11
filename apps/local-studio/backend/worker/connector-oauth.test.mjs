import assert from "node:assert/strict";
import test from "node:test";
import { oauthAad, sealOauthToken } from "../../../../packages/agentsam-vault/src/crypto/oauth-envelope.js";
import {
  listGitHubConnectionRepositories,
  beginConnectorOAuth,
  completeConnectorOAuth,
  connectorForCallback,
  disconnectConnector,
  handleConnectorWorkRequest,
  isConnectorWorkRequest,
} from "./connector-oauth.js";

function fakeDb() {
  const log = [];
  let nonce = null;
  return {
    log,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              log.push({ sql, args });
              if (/^INSERT INTO oauth_state_nonces/.test(sql)) {
                nonce = { id: args[0], user_id: args[1], provider: args[2], state_hash: args[3],
                  code_verifier_encrypted: args[4], redirect_after: args[5], expires_at: args[7], consumed_at: null };
              }
              if (/^UPDATE oauth_state_nonces SET consumed_at/.test(sql)) {
                if (!nonce || nonce.consumed_at) return { meta: { changes: 0 } };
                nonce.consumed_at = args[0];
              }
              return { meta: { changes: 1 } };
            },
            async first() {
              log.push({ sql, args });
              if (/FROM oauth_state_nonces/.test(sql)) return nonce && nonce.state_hash === args[0] && nonce.provider === args[1] ? nonce : null;
              if (/FROM agentsam_plugins/.test(sql)) return { id: "plg_test_" + args[0] };
              return null;
            },
            async all() { log.push({ sql, args }); return { results: [] }; },
          };
        },
        async run() { log.push({ sql, args: [] }); return { meta: { changes: 1 } }; },
      };
    },
  };
}

const env = () => ({
  DB: fakeDb(),
  VAULT_MASTER_KEY: "a".repeat(64),
  GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsecret",
  GITHUB_CLIENT_ID: "ghid", GITHUB_CLIENT_SECRET: "ghsecret",
});

const post = (path, body) => new Request("https://agentsam.inneranimalmedia.com" + path, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}),
});

test("route matcher only admits the three connector providers", () => {
  assert.ok(isConnectorWorkRequest("/api/work/connect/github/start"));
  assert.ok(isConnectorWorkRequest("/api/work/connect/google_calendar/disconnect"));
  assert.ok(!isConnectorWorkRequest("/api/work/connect/google_gmail/start"));
  assert.ok(!isConnectorWorkRequest("/api/work/connect/github/start/extra"));
});

for (const [key, authHost, cb, prefix] of [
  ["google_drive", "accounts.google.com", "/api/oauth/google/callback", "gdrive_"],
  ["google_calendar", "accounts.google.com", "/api/oauth/google/callback", "gcal_"],
  ["github", "github.com", "/api/oauth/github/callback", "ghub_"],
]) {
  test(`${key}: start -> callback persists encrypted grant and installation`, async (t) => {
    const e = env();
    const res = await beginConnectorOAuth(post(`/api/work/connect/${key}/start`, { return_to: "/settings/customize?view=plugins" }), e, "au_test", key);
    const { authorize_url } = await res.json();
    const auth = new URL(authorize_url);
    assert.equal(auth.host, authHost);
    assert.equal(auth.searchParams.get("redirect_uri"), "https://agentsam.inneranimalmedia.com" + cb);
    const state = auth.searchParams.get("state");
    assert.ok(state.startsWith(prefix));
    assert.ok(auth.searchParams.get("code_challenge"));

    const callback = new Request("https://agentsam.inneranimalmedia.com" + cb + "?code=abc&state=" + state);
    assert.equal(connectorForCallback(callback)?.provider, key);

    const realFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = realFetch; });
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("token")) return Response.json({ access_token: "at", refresh_token: key === "github" ? undefined : "rt", expires_in: key === "github" ? undefined : 3600, scope: "x y" });
      if (u.includes("api.github.com")) return Response.json({ login: "SamPrimeaux", name: "Sam" });
      return Response.json({ email: "Info@InnerAnimals.com" });
    };
    const done = await completeConnectorOAuth(callback, e);
    assert.equal(done.status, 302);
    const loc = new URL(done.headers.get("location"));
    assert.equal(loc.pathname, "/settings/customize");
    assert.equal(loc.searchParams.get("provider"), key);

    const upsert = e.DB.log.find((l) => /INSERT INTO user_oauth_tokens/.test(l.sql));
    assert.ok(upsert, "token upsert ran");
    assert.equal(upsert.args[1], key);
    assert.equal(upsert.args[2], key === "github" ? "SamPrimeaux" : "info@inneranimals.com");
    assert.notEqual(upsert.args[3], "at", "access token is sealed, not plaintext");
    assert.ok(e.DB.log.some((l) => /INSERT INTO agentsam_plugin_installations/.test(l.sql)));

    // state is single-use
    const replay = await completeConnectorOAuth(callback, e);
    assert.equal(replay.status, 400);
  });
}

test("disconnect revokes token and resets installation", async () => {
  const e = env();
  const out = await disconnectConnector(e, "au_test", "github:SamPrimeaux");
  assert.deepEqual(out, { ok: true, provider: "github" });
  assert.ok(e.DB.log.some((l) => /SET is_active = 0/.test(l.sql) && l.args.includes("SamPrimeaux")));
  assert.ok(e.DB.log.some((l) => /setup_status = 'unconfigured'/.test(l.sql)));
  await assert.rejects(() => disconnectConnector(e, "au_test", "google_gmail:x@y.z"), /connection_required/);
});

test("missing client config fails closed", async () => {
  const e = env(); e.GITHUB_CLIENT_SECRET = "";
  const res = await handleConnectorWorkRequest(post("/api/work/connect/github/start"), e, "au_test");
  assert.equal(res.status, 503);
});

test("GitHub repository read uses only the account-bound sealed grant and never exposes tokens", async () => {
  const account = "au_user23";
  const e = env();
  const token = "test_github_access_token_secret";
  const encoded = await sealOauthToken(e.VAULT_MASTER_KEY,token,oauthAad("github",account,"user23"));
  let lookedUpAccount=null,lookedUpUser=null,providerAuth="";
  e.DB={prepare(sql){
    assert.match(sql,/account_id\s*=\s*\?/);
    return {bind(...args){lookedUpAccount=args[0];lookedUpUser=args[1];return {async first(){
      if(args[0]!==account||args[1]!=="user23")return null;
      return {account_identifier:"user23",access_token_encrypted:encoded,expires_at:null};
    }};}};
  }};
  const read=async (url, options)=>{
    assert.equal(new URL(url).hostname,"api.github.com");
    providerAuth=options.headers.authorization;
    return Response.json([{id:1,full_name:"user23/my-project",private:true,default_branch:"main",permissions:{push:true,pull:true,admin:false},description:"Project"}]);
  };
  const path="https://agentsam.inneranimalmedia.com/api/work/github/repos?connection_id=github%3Auser23";
  const success=await listGitHubConnectionRepositories(new Request(path),e,account,read);
  assert.equal(success.status,200);
  const result=await success.json();
  assert.equal(result.repositories[0].fullName,"user23/my-project");
  assert.equal(result.repositories[0].permissions.push,true);
  assert.equal(lookedUpAccount,account);
  assert.equal(lookedUpUser,"user23");
  assert.equal(providerAuth,"Bearer "+token);
  assert.ok(!JSON.stringify(result).includes(token));
  assert.ok(!JSON.stringify(result).includes(encoded));
  const denied=await listGitHubConnectionRepositories(new Request(path),e,"au_other",read);
  assert.equal(denied.status,404);
  const invalid=await listGitHubConnectionRepositories(new Request(path.replace("user23","../../evil")),e,account,read);
  assert.equal(invalid.status,400);
  assert.ok(isConnectorWorkRequest("/api/work/github/repos"));
});

test("GitHub repository read rejects missing grants and revoked provider responses", async () => {
  const e=env();
  const missing=await listGitHubConnectionRepositories(new Request("https://agentsam.inneranimalmedia.com/api/work/github/repos?connection_id=github%3Anope"),e,"au_missing",async()=>{throw new Error("network should not be called");});
  assert.equal(missing.status,404);
  const encoded=await sealOauthToken(e.VAULT_MASTER_KEY,"test_revoke_token",oauthAad("github","au_one","owner"));
  e.DB={prepare(sql){return {bind(){return {async first(){return {account_identifier:"owner",access_token_encrypted:encoded,expires_at:null};}};}};}};
  const revoked=await listGitHubConnectionRepositories(new Request("https://agentsam.inneranimalmedia.com/api/work/github/repos?connection_id=github%3Aowner"),e,"au_one",async()=>Response.json({message:"Requires reauthorization"},{status:401}));
  assert.equal(revoked.status,403);
  assert.equal((await revoked.json()).error,"github_repository_access_denied");
});


test("expired GitHub App user token refreshes before the account-scoped repository read", async () => {
  const e=env(), owner="au_refresh_owner", account="ExampleOwner";
  const aad=oauthAad("github",owner,account);
  const oldAccess=await sealOauthToken(e.VAULT_MASTER_KEY,"old-expired-access",aad);
  const refresh=await sealOauthToken(e.VAULT_MASTER_KEY,"refresh-once",aad);
  const oldExpiry=Math.floor(Date.now()/1000)-50;
  const events=[];
  e.DB={prepare(sql){return {bind(...args){return {
    async first(){
      assert.match(sql,/account_id=\?/);
      assert.deepEqual(args,[owner,account]);
      return {account_identifier:account,access_token_encrypted:oldAccess,refresh_token_encrypted:refresh,expires_at:oldExpiry};
    },
    async run(){
      events.push({sql,args});
      return {meta:{changes:1}};
    },
  };}};}};
  const fetcher=async (url,options)=>{
    if(String(url).startsWith("https://api.github.com/")){
      assert.equal(options.headers.authorization,"Bearer fresh-access");
      return Response.json([{id:7,full_name:"ExampleOwner/repo",default_branch:"main"}]);
    }
    assert.equal(options.method,"POST");
    assert.equal(options.body.get("grant_type"),"refresh_token");
    assert.equal(options.body.get("refresh_token"),"refresh-once");
    return Response.json({access_token:"fresh-access",refresh_token:"next-refresh",expires_in:28800});
  };
  const response=await listGitHubConnectionRepositories(new Request(
    "https://agentsam.inneranimalmedia.com/api/work/github/repos?connection_id=github%3AExampleOwner"
  ),e,owner,fetcher);
  assert.equal(response.status,200);
  const json=await response.json();
  assert.equal(json.repositories[0].fullName,"ExampleOwner/repo");
  assert.equal(events.length,1,"refreshed token persisted to account row");
  assert.ok(!JSON.stringify(json).includes("fresh-access"),"no secret returned to browser");
});

test("repository transport failure is redacted but distinguishes timeout",async()=>{
  const e=env(),owner="au_timeout",account="ExampleOwner";
  const encrypted=await sealOauthToken(e.VAULT_MASTER_KEY,"existing-account-token",oauthAad("github",owner,account));
  e.DB={prepare(){return {bind(){return {async first(){return {access_token_encrypted:encrypted,expires_at:null};}};}};}};
  const response=await listGitHubConnectionRepositories(new Request(
    "https://agentsam.inneranimalmedia.com/api/work/github/repos?connection_id=github%3AExampleOwner"
  ),e,owner,async()=>{const error=new Error("sensitive upstream URL and bearer text");error.name="TimeoutError";throw error;});
  assert.equal(response.status,502);
  const result=await response.json();
  assert.deepEqual(result,{ok:false,error:"github_repositories_unreachable",reason:"timeout"});
  assert.ok(!JSON.stringify(result).includes("sensitive"));
});
