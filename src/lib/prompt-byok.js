/**
 * Optional BYOK key paste during SDK init → CORE user_api_keys.
 */
import { getJson, postJson } from './core-client.js';

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
];

/**
 * @param {string} token SDK bearer
 * @param {{ ask: (q: string) => Promise<string> } | null} prompt
 */
export async function promptOptionalByokKeys(token, prompt) {
  if (!token || !prompt) return;

  let ctx;
  try {
    ctx = await getJson('/api/sdk/context', token);
  } catch {
    console.log('\n  ⚠ Could not load BYOK status — skip key paste or add keys in Dashboard → Settings → Keys\n');
    return;
  }

  const byok = ctx?.byok || {};
  console.log('\n  Provider keys (BYOK — optional, stored in YOUR IAM account):\n');

  for (const p of PROVIDERS) {
    const slot = byok[p.id];
    if (slot?.configured) {
      console.log(`    ${p.label.padEnd(12)} ✓ connected ${slot.masked || ''}`);
      continue;
    }

    const ans = await prompt.ask(`    ${p.label} API key (Enter to skip): `);
    const key = ans.trim();
    if (!key) continue;

    try {
      await postJson(
        '/api/sdk/keys',
        {
          provider: p.id,
          api_key: key,
          label: `${p.label} (SDK init)`,
          validate: true,
        },
        token,
      );
      console.log(`    ${p.label.padEnd(12)} ✓ saved to IAM BYOK`);
    } catch (e) {
      console.log(`    ${p.label.padEnd(12)} ✗ ${e?.message || 'save failed'}`);
    }
  }
  console.log('');
}
