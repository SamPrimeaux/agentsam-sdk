import test from "node:test";
import assert from "node:assert/strict";
import {handleStudioMcps,validMcpEndpoint} from "./studio-mcps.js";

function fakeDb(){
  const servers=[
    {id:"mcps_platform",server_key:"main",display_name:"Main MCP",url:"https://private.example/mcp",auth_type:"bearer",is_active:1,health_status:"healthy",account_id:null},
    {id:"mcps_own",server_key:"custom-1",display_name:"Mine",url:"https://mine.example/mcp",auth_type:"none",is_active:0,health_status:"unknown",account_id:"acct_a"},
    {id:"mcps_other",server_key:"custom-2",display_name:"Other",url:"https://other.example/mcp",auth_type:"none",is_active:1,health_status:"unknown",account_id:"acct_b"},
  ];
  return {
    servers,
    prepare(sql){
      return {
        bind(...args){return {
          async all(){
            assert.match(sql,/account_id IS NULL OR account_id=\?/);
            return {results:servers.filter(row=>row.account_id===null||row.account_id===args[0])};
          },
          async run(){
            if(sql.includes("INSERT INTO")){
              servers.push({id:args[0],server_key:args[1],display_name:args[2],url:args[3],account_id:args[4],auth_type:"none",is_active:0});
              return {meta:{changes:1}};
            }
            const id=sql.startsWith("DELETE")?args[0]:sql.includes("SET is_active=")?args[1]:args[2];
            const account=sql.startsWith("DELETE")?args[1]:sql.includes("SET is_active=")?args[2]:args[3];
            const index=servers.findIndex(row=>row.id===id&&row.account_id===account);
            if(index<0)return {meta:{changes:0}};
            if(sql.startsWith("DELETE"))servers.splice(index,1);
            else if(sql.includes("SET is_active="))servers[index].is_active=args[0];
            else Object.assign(servers[index],{display_name:args[0],url:args[1]});
            return {meta:{changes:1}};
          }
        }}
      };
    },
  };
}
const call=(db,accountId,method,path="/api/settings/mcps",data)=>handleStudioMcps(
  new Request("https://agentsam.inneranimalmedia.com"+path,{
    method,headers:data?{"content-type":"application/json"}:{},
    ...(data?{body:JSON.stringify(data)}:{}),
  }),{DB:db},accountId);

test("MCP URL validation refuses local and credentialed destinations",()=>{
  for(const url of ["https://localhost/mcp","http://remote.example/mcp","https://user:pass@example.com/mcp","https://10.1.2.3/mcp","https://foo.local/mcp","https://[::1]/mcp","https://example.com/mcp#fragment"])
    assert.equal(validMcpEndpoint(url),false,url);
  assert.equal(validMcpEndpoint("https://public.example/mcp"),true);
});

test("MCPs display platform records without leaking endpoints or other accounts",async()=>{
  const db=fakeDb();
  const res=await call(db,"acct_a","GET");
  assert.equal(res.status,200);
  const data=await res.json();
  assert.deepEqual(data.servers.map(row=>row.name),["Main MCP","Mine"]);
  assert.equal(data.servers[0].readOnly,true);
  assert.equal(data.servers[0].url,null);
  assert.equal(data.servers[1].readOnly,false);
  assert.equal(data.servers[1].url,"https://mine.example/mcp");
});

test("MCP CRUD is account-scoped, and new endpoints are disabled",async()=>{
  const db=fakeDb();
  const created=await call(db,"acct_a","POST","/api/settings/mcps",{name:"Sample MCP",url:"https://example.org/mcp"});
  assert.equal(created.status,201);
  const {server}=await created.json();
  assert.equal(db.servers.find(item=>item.id===server.id)?.is_active,0);
  assert.equal((await call(db,"acct_b","PUT","/api/settings/mcps/"+server.id,{name:"Hijack",url:"https://example.net/mcp"})).status,404);
  assert.equal((await call(db,"acct_a","PUT","/api/settings/mcps/"+server.id,{name:"Renamed",url:"https://example.net/mcp"})).status,200);
  assert.equal((await call(db,"acct_a","PATCH","/api/settings/mcps/"+server.id,{enabled:true})).status,409);
  assert.equal((await call(db,"acct_a","PATCH","/api/settings/mcps/"+server.id,{enabled:false})).status,200);
  assert.equal((await call(db,"acct_a","DELETE","/api/settings/mcps/"+server.id)).status,200);
  assert.equal((await call(db,"acct_a","DELETE","/api/settings/mcps/mcps_platform")).status,404);
});

test("MCP writes require valid JSON, origin, and session",async()=>{
  const db=fakeDb();
  assert.equal((await call(db,null,"GET")).status,401);
  assert.equal((await call(db,"acct_a","POST","/api/settings/mcps",{name:"Bad",url:"http://localhost/mcp"})).status,400);
  const foreign=new Request("https://agentsam.inneranimalmedia.com/api/settings/mcps",{
    method:"POST",headers:{"origin":"https://other.example","content-type":"application/json"},
    body:JSON.stringify({name:"Valid",url:"https://example.org/mcp"}),
  });
  assert.equal((await handleStudioMcps(foreign,{DB:db},"acct_a")).status,403);
});
