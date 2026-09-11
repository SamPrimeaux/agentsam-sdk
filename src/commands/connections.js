/**
 * Operator diagnostics for AgentSam connections (Cloudflare account grant).
 * Identity (who is this user?) is separate from the Cloudflare connector.
 */
import {
  CLOUDFLARE_CALLBACK_PATH,
  CLOUDFLARE_FIXTURE_CLIENT_ID,
  cloudflareConnectionSafeStatus,
  resolveCloudflareOAuthClient,
} from '../../packages/connectors/cloudflare/src/index.js';
import { resolveIamIssuer } from '../../packages/identity/src/contracts/auth-config.js';

const PRODUCTION_CALLBACK = `https://agentsam.inneranimalmedia.com${CLOUDFLARE_CALLBACK_PATH}`;

function doctor(env = process.env) {
  const iam = {
    issuer: resolveIamIssuer(env),
    clientId: Boolean(String(env.IAM_CLIENT_ID || '').trim()),
    serverSecret: Boolean(String(env.IAM_CLIENT_SECRET || '').trim()),
    originAlias: Boolean(String(env.IAM_ORIGIN || '').trim()),
  };
  const cf = cloudflareConnectionSafeStatus(env);
  const client = resolveCloudflareOAuthClient(env);
  return { identity: iam, cloudflare: cf, client };
}

function printSetup(env = process.env) {
  const client = resolveCloudflareOAuthClient(env);
  console.log('Cloudflare connector setup');
  console.log('');
  console.log(`  callback: ${PRODUCTION_CALLBACK}`);
  console.log('  authorize: https://dash.cloudflare.com/oauth2/auth');
  console.log('  token:     https://dash.cloudflare.com/oauth2/token');
  console.log('  revoke:    https://dash.cloudflare.com/oauth2/revoke');
  console.log('');
  console.log('This CLI does not mint a real Cloudflare OAuth client.');
  console.log('Fixture client id ' + CLOUDFLARE_FIXTURE_CLIENT_ID + ' is local-only and must never be installed on production.');
  if (client.fixture) {
    console.log('STOP: fixture credentials are loaded. OAuth start will return 503.');
  } else if (client.status === 'not_configured') {
    console.log('status: not_configured — production may deploy; connector stays optional.');
  } else {
    console.log(`status: ${client.status}`);
  }
  return 0;
}

export async function runConnections(args = []) {
  const argv = args.filter((a) => a !== '--json');
  const jsonMode = args.includes('--json');
  const env = process.env;
  if (argv[0] === 'cloudflare' && argv[1] === 'setup') {
    if (jsonMode) {
      console.log(JSON.stringify({
        callback: PRODUCTION_CALLBACK,
        authorize: 'https://dash.cloudflare.com/oauth2/auth',
        token: 'https://dash.cloudflare.com/oauth2/token',
        revoke: 'https://dash.cloudflare.com/oauth2/revoke',
        mintsRealClient: false,
        client: resolveCloudflareOAuthClient(env),
      }, null, 2));
      return 0;
    }
    return printSetup(env);
  }
  const report = doctor(env);
  if (jsonMode) {
    console.log(JSON.stringify({ identity: report.identity, cloudflare: report.cloudflare }, null, 2));
    return 0;
  }
  const iam = report.identity;
  const cf = report.cloudflare;
  const client = report.client;
  console.log('AgentSam Identity');
  console.log('');
  console.log('IAM client');
  console.log(`  ${iam.clientId ? '✓' : '•'} client id`);
  console.log(`  ✓ issuer ${iam.issuer}`);
  console.log(`  ${iam.serverSecret ? '✓' : '•'} server secret configured`);
  if (iam.originAlias) console.log('Compatibility\n  IAM_ORIGIN -> deprecated alias');
  console.log('');
  console.log('Cloudflare connection');
  console.log('');
  console.log('OAuth client');
  console.log(`  client id: ${cf.clientId}`);
  console.log(`  secret: ${cf.secret}`);
  console.log(`  status: ${client.status}`);
  if (client.fixture) {
    console.log('  OAuth client fixture configured');
    console.log('  real Cloudflare OAuth client still required');
  }
  return 0;
}
