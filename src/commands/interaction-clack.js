/**
 * Present AgentSamInteraction via Clack (or plain write fallback).
 * Hosts (shell, Local Studio, Tauri) can swap the prompt impls.
 */

import { confirm, isCancel, select, text } from '@clack/prompts';

/**
 * @param {import('../skills/interaction.js').AgentSamInteraction} interaction
 * @param {{
 *   write?: (s: string) => void,
 *   interactive?: boolean,
 *   selectImpl?: typeof select,
 *   confirmImpl?: typeof confirm,
 *   textImpl?: typeof text,
 * }} [options]
 * @returns {Promise<{ action: string|null, value: string|null, cancelled: boolean }>}
 */
export async function presentAgentSamInteraction(interaction, options = {}) {
  const write = options.write || ((s) => process.stdout.write(s));
  const interactive =
    options.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const prompt = interaction?.prompt;

  if (!prompt?.message) {
    return { action: null, value: null, cancelled: false };
  }

  for (const line of String(prompt.message).split('\n')) {
    write(`  ${line}\n`);
  }

  if (!interactive) {
    return { action: null, value: null, cancelled: false };
  }

  const status = interaction.status;

  if (status === 'needs_input' && prompt.kind === 'select' && Array.isArray(prompt.options) && prompt.options.length) {
    const answer = await (options.selectImpl || select)({
      message: prompt.title || 'Choose',
      options: prompt.options.map((opt) => ({
        value: opt.value,
        label: opt.label,
        hint: opt.description,
      })),
    });
    if (isCancel(answer)) return { action: null, value: null, cancelled: true };
    return { action: String(answer), value: String(answer), cancelled: false };
  }

  if (status === 'needs_input' && prompt.kind === 'text') {
    const answer = await (options.textImpl || text)({
      message: prompt.title || prompt.message,
    });
    if (isCancel(answer)) return { action: null, value: null, cancelled: true };
    return { action: 'text', value: String(answer), cancelled: false };
  }

  if (status === 'needs_approval' || (status === 'needs_input' && prompt.kind === 'confirm')) {
    const answer = await (options.confirmImpl || confirm)({
      message: prompt.title || prompt.message,
    });
    if (isCancel(answer)) return { action: null, value: null, cancelled: true };
    return { action: answer ? 'confirm' : 'cancel', value: answer ? 'yes' : 'no', cancelled: false };
  }

  if (
    (status === 'blocked' || status === 'needs_input') &&
    Array.isArray(prompt.actions) &&
    prompt.actions.length
  ) {
    const answer = await (options.selectImpl || select)({
      message: prompt.title || 'Next',
      options: prompt.actions.map((a) => ({ value: a.id, label: a.label })),
    });
    if (isCancel(answer)) return { action: null, value: null, cancelled: true };
    return { action: String(answer), value: String(answer), cancelled: false };
  }

  return { action: null, value: null, cancelled: false };
}

/**
 * Map shell skill interaction choices to follow-up CLI actions.
 */
export async function handleSkillInteractionChoice(choice, state = {}) {
  const write = state.write || ((s) => process.stdout.write(s));
  const { runSkill } = await import('./skill.js');
  if (!choice || choice.cancelled) return null;
  if (choice.action === 'create' || choice.value === 'create') {
    const id = 'my-first-skill';
    write(`\n  Running: agentsam skill create ${id}\n\n`);
    return runSkill(['create', id], { write, home: state.home, env: state.env });
  }
  if (typeof choice.value === 'string' && choice.value.startsWith('create:')) {
    const id = choice.value.slice('create:'.length) || 'my-first-skill';
    write(`\n  Running: agentsam skill create ${id}\n\n`);
    return runSkill(['create', id], { write, home: state.home, env: state.env });
  }
  if (typeof choice.action === 'string' && choice.action.startsWith('create:')) {
    const id = choice.action.slice('create:'.length) || 'my-first-skill';
    write(`\n  Running: agentsam skill create ${id}\n\n`);
    return runSkill(['create', id], { write, home: state.home, env: state.env });
  }
  if (choice.action === 'install' || choice.value === 'install') {
    write('\n  Next: agentsam skill install ./path-to-skill  (or @scope/pkg)\n\n');
    return null;
  }
  if (choice.action === 'list' || choice.value === 'list') {
    return runSkill(['list'], { write, home: state.home, env: state.env });
  }
  // create with prefilled id handled above
  return null;
}
