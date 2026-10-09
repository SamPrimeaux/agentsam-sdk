import { createToolError } from './tool.js';
import { normalizeError } from './normalize.js';
import { redactString, redactErrorValue } from './redaction.js';

const HINTS = Object.freeze({
  input_invalid: { why:'Command syntax or a required argument is invalid.', next:'Run the command with --help.', example:'agentsam machine --help' },
  target_not_found: { why:'The requested target was not found.', next:'Verify the path and current workspace.', example:'pwd' },
  process_spawn_failed: { why:'The executable could not be started.', next:'Install or configure the required tool.', example:'agentsam machine install' },
  process_output_limit: { why:'The result exceeded the safe output limit.', next:'Narrow the scan target or exclude generated data.', example:'agentsam machine inspect . --json' },
  execution_failed: { why:'The child process returned an error.', next:'Inspect its stderr and run a diagnostic.', example:'agentsam machine doctor' },
  upstream_invalid_response: { why:'The child process did not return the expected format.', next:'Retry with an explicit run ID and inspect the output.', example:'agentsam machine inspect . --json' },
});

export function usageError(message, opts = {}) {
  return cliError(message, {...opts,reason:opts.reason||'input_invalid',exitCode:2});
}
export function processError(message, opts = {}) {
  return cliError(message, {...opts,reason:opts.reason||'execution_failed',exitCode:1});
}
function cliError(message, options) {
  const reason=options.reason||'execution_failed';
  const hints={...HINTS[reason],...(options.hints||{})};
  const error=createToolError({
    tool:options.command||'agentsam',
    domain:options.domain||'tool',
    reason,
    message,
    stage:options.stage||'execute',
    remediation:{message:hints.next},
  },{cause:options.cause});
  error.exitCode=options.exitCode;
  error.cliHints=hints;
  error.cliContext={
    command:options.command||'agentsam',
    args:redactErrorValue(options.args||[]),
    cwd:options.cwd?redactString(options.cwd,512):null,
    binary:options.binary||null,
    exit_code:options.nativeExitCode??null,
    stderr_tail:options.stderr_tail?redactString(options.stderr_tail,1200):null,
  };
  return error;
}

export function renderCliError(error,{json=false}={}) {
  const envelope=error?.envelope||normalizeError(error);
  if (json) return JSON.stringify({ ...envelope, cli:error?.cliContext||null, hints:error?.cliHints||null },null,2);
  const hints=error?.cliHints||HINTS[envelope.reason]||{};
  const lines=['✗ '+envelope.message, '  reason: '+envelope.reason];
  if (hints.why) lines.push('  why: '+hints.why);
  if (hints.next) lines.push('  next: '+hints.next);
  if (hints.example) lines.push('  example: '+hints.example);
  // HTTP is a transport concern; keep local command errors human-oriented.
  if (['provider','transport'].includes(envelope.domain) && envelope.http_status) lines.push('  HTTP '+envelope.http_status);
  if (error?.cliContext?.stderr_tail) lines.push('  stderr: '+error.cliContext.stderr_tail);
  return lines.join('\n');
}
