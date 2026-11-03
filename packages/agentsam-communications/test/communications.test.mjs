import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  createCommunications, createGmailMcpEmailAdapter, createResendEmailAdapter,
  createCallbackEmailAdapter, createNotificationOutboxStore,
} from '../src/index.js';

function store() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../../../migrations/runtime/0010_agentsam_notifications.sql', import.meta.url), 'utf8'));
  const db = {
    prepare(sql) {
      return { bind(...args) {
        const statement = sqlite.prepare(sql);
        return { run: () => ({ meta: { changes: statement.run(...args).changes } }),
          first: () => statement.get(...args) || null };
      } };
    },
  };
  return { db, sqlite };
}
const context = { accountId: 'account-one', actorId: 'actor-one', principal: { id: 'actor-one' } };
const message = { to: 'user@example.com', subject: 'Meeting', text: 'Join the meeting.' };

test('Gmail MCP invokes only host-bound authorized connection and returns receipt', async () => {
  let calls = 0;
  const gmail = createGmailMcpEmailAdapter({
    sendMessage: async ({ context: ctx, message: email }) => {
      calls++;
      assert.equal(ctx.accountId, 'account-one');
      assert.equal(email.from, 'owner@example.com');
      return { messageId: 'gmail-42' };
    },
  });
  const resend = createResendEmailAdapter({ getApiKey: () => 'not-used',
    fetchImpl: () => { throw Error('Resend must not be selected'); } });
  const service = createCommunications({
    providers: [gmail, resend],
    authorize: ({context:ctx,providerId}) => ctx.principal.id === 'actor-one' && providerId === 'gmail-mcp',
    resolveSender: () => ({ from: 'owner@example.com' }),
    selectProvider: ({requestedProvider}) => requestedProvider,
  });
  const response = await service.sendEmail({context, providerId:'gmail-mcp', ...message});
  assert.equal(response.ok,true);
  assert.equal(response.id,'gmail-42');
  assert.equal(response.provider,'gmail-mcp');
  assert.equal(calls,1);
  const denied = await service.sendEmail({context,providerId:'resend',...message});
  assert.equal(denied.code,'send_not_authorized');
  assert.equal(calls,1);
});

test('Resend gets current account secret and verified sender from host', async () => {
  const seen = [];
  const resend = createResendEmailAdapter({
    getApiKey: async ({context:ctx}) => ctx.accountId === 'account-one' ? 'account-secret' : null,
    fetchImpl: async (_url, init) => {
      seen.push({auth:init.headers.authorization, body:JSON.parse(init.body)});
      return new Response(JSON.stringify({id:'resend-001'}),{status:200});
    },
  });
  const service = createCommunications({providers:[resend],authorize:()=>true,
    resolveSender:()=>({from:'Brand <brand@example.com>',replyTo:'support@example.com'}),
  });
  const sent = await service.sendEmail({context, ...message});
  assert.equal(sent.ok,true);
  assert.equal(sent.id,'resend-001');
  assert.equal(seen[0].auth,'Bearer account-secret');
  assert.equal(seen[0].body.from,'Brand <brand@example.com>');
  assert.equal(seen[0].body.reply_to,'support@example.com');
  assert.equal(seen[0].body.text,'Join the meeting.');
});

test('provider selection does not silently switch on failure', async () => {
  let fallbackCalls = 0;
  const failing = createCallbackEmailAdapter({id:'postmark',send:()=>({ok:false})});
  const fallback = createCallbackEmailAdapter({id:'smtp',send:()=>{fallbackCalls++;return{id:'smtp-1'};}});
  const service = createCommunications({providers:[failing,fallback],authorize:()=>true,
    resolveSender:()=>({from:'sender@example.com'}),
    selectProvider:({requestedProvider})=>requestedProvider,
  });
  const failed = await service.sendEmail({context,providerId:'postmark',...message});
  assert.equal(failed.code,'provider_rejected');
  assert.equal(fallbackCalls,0);
});

test('provider rejection cannot be misreported as accepted even when it contains an ID', async () => {
  const adapter = createCallbackEmailAdapter({id:'ses',send:()=>({ok:false,id:'partial',code:'permission_denied'})});
  const service = createCommunications({providers:[adapter],authorize:()=>true,
    resolveSender:()=>({from:'sender@example.com'})});
  const response = await service.sendEmail({context,...message});
  assert.equal(response.ok,false);
  assert.equal(response.code,'permission_denied');
});

test('authorization is mandatory and unknown transport never sends', async () => {
  assert.throws(()=>createCommunications({providers:[]}),/authorize_callback_required/);
  const service = createCommunications({providers:[],authorize:()=>true,resolveSender:()=>({from:'x@example.com'})});
  const response = await service.sendEmail({context,providerId:'not-installed',...message});
  assert.equal(response.code,'provider_not_configured');
  const rejected = createCommunications({
    providers:[createCallbackEmailAdapter({id:'smtp',send:()=>{throw Error('cannot call');}})],
    authorize:()=>false,resolveSender:()=>({from:'x@example.com'}),
  });
  assert.equal((await rejected.sendEmail({context,...message})).code,'send_not_authorized');
});

test('template rendering uses host brand with no embedded brand or domain', async () => {
  const service = createCommunications({
    providers:[createCallbackEmailAdapter({id:'ses',send:({message:email})=>{
      assert.equal(email.subject,'Hello from Business 123');
      return {id:'ses-accepted'};
    }})],
    authorize:()=>true,
    resolveSender:({context:ctx})=>({from:'Business 123 <mail@business123.example>',brand:{name:'Business 123',accountId:ctx.accountId}}),
    renderTemplate:({data,brand})=>({subject:'Hello from '+brand.name,text:data.greeting}),
  });
  const response = await service.sendEmail({context,to:'client@example.org',templateId:'welcome',data:{greeting:'Welcome'}});
  assert.equal(response.ok,true);
});

test('outbox uses existing schema, stores per-account send receipt and rejects cross-account reads', async () => {
  const {db,sqlite} = store();
  try {
    const outbox = createNotificationOutboxStore(db,{newId:()=> 'nox_test_1'});
    const service = createCommunications({
      providers:[createCallbackEmailAdapter({id:'smtp',send:()=>({id:'smtp-id-1'})})],
      authorize:()=>true,resolveSender:()=>({from:'sender@example.com'}),outbox,
    });
    const response = await service.sendEmail({context,...message,purpose:'meet.invited'});
    assert.equal(response.ok,true);
    assert.equal(response.outboxId,'nox_test_1');
    const record = await outbox.get({id:'nox_test_1',accountId:'account-one'});
    assert.equal(record.status,'sent');
    assert.equal(record.attempts,1);
    assert.equal(await outbox.get({id:'nox_test_1',accountId:'other-account'}),null);
    const payload = JSON.parse(sqlite.prepare('SELECT payload_json FROM notification_outbox WHERE id=?').get('nox_test_1').payload_json);
    assert.equal(payload.provider_message_id,'smtp-id-1');
  } finally { sqlite.close(); }
});

test('no false-positive delivery receipt if provider response is missing ID', async () => {
  const {db,sqlite} = store();
  try {
    const service = createCommunications({
      providers:[createCallbackEmailAdapter({id:'ses',send:()=>({})})],
      authorize:()=>true,resolveSender:()=>({from:'sender@example.com'}),
      outbox:createNotificationOutboxStore(db,{newId:()=> 'nox_test_2'}),
    });
    const response = await service.sendEmail({context,...message});
    assert.equal(response.ok,false);
    const row = sqlite.prepare('SELECT status, last_error FROM notification_outbox WHERE id=?').get('nox_test_2');
    assert.equal(row.status,'failed');
    assert.equal(row.last_error,'provider_delivery_unconfirmed');
  } finally {sqlite.close();}
});

test('provider accepted mail remains accepted if outbox receipt persistence fails', async () => {
  const service = createCommunications({
    providers:[createCallbackEmailAdapter({id:'ses',send:()=>({id:'accepted-ses-id'})})],
    authorize:()=>true, resolveSender:()=>({from:'sender@example.com'}),
    outbox: {
      enqueue:async()=> 'nox_fail',
      start:async()=>true,
      complete:async()=>{throw new Error('database offline');},
    },
  });
  const response = await service.sendEmail({context,...message});
  assert.equal(response.ok,true);
  assert.equal(response.id,'accepted-ses-id');
  assert.equal(response.receiptPersisted,false);
  assert.equal(response.ledgerError,'outbox_completion_failed');
});

test('database adapter prevents completing a different account outbox row', async () => {
  const {db,sqlite} = store();
  try {
    const outbox = createNotificationOutboxStore(db,{newId:()=> 'nox_test_3'});
    const meta = {accountId:'owner-a',recipientAccountId:null,providerId:'smtp',purpose:'test',sourceId:null,createdBy:'actor'};
    const id = await outbox.enqueue({meta,message:{...message,to:['user@example.com']}});
    assert.equal(await outbox.start({id,accountId:'owner-b'}),false);
    assert.equal(await outbox.start({id,accountId:'owner-a'}),true);
    await assert.rejects(outbox.complete({id,accountId:'owner-b',ok:true,providerMessageId:'bad'}),/outbox_state_transition_failed/);
    assert.equal((await outbox.get({id,accountId:'owner-a'})).status,'queued');
  } finally {sqlite.close();}
});
