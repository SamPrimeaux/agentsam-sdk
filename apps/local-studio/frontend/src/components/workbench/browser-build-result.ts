/** A browser Build result is only a preview when the model actually produced a complete HTML page. */
export function extractRunnableHtml(message: string): string | null {
  const candidates = [...message.matchAll(/```(?:html|htm)?\s*\n([\s\S]*?)```/gi)].map(match => match[1].trim());
  if (/^\s*(?:<!doctype\s+html|<html\b)/i.test(message)) candidates.push(message.trim());
  const source = candidates.find(candidate => /(?:<!doctype\s+html|<html\b)/i.test(candidate) && /<body\b/i.test(candidate) && /<\/html\s*>/i.test(candidate));
  return source && source.length <= 350_000 ? source : null;
}
export function buildBrowserInstruction(prompt: string, previousHtml?: string | null): string {
  const task = prompt.trim().slice(0,10_000);
  const continuation = previousHtml ? '\nYou are editing this current browser preview. Preserve working functionality and regenerate a COMPLETE replacement page:\n```html\n' + previousHtml.slice(0,16_000) + '\n```\n' : '';
  return [
    'Build a functioning interactive webpage in the AgentSam Browser for this request:', task, continuation,
    'Return exactly one complete self-contained runnable HTML document inside a ```html code fence.',
    'Include semantic structure, responsive styling and working client-side interactions where appropriate. Do not output commentary instead of the document.',
    'Do not include private account information, passwords, API tokens, untrusted remote scripts or remote dependencies.',
  ].filter(Boolean).join('\n\n');
}
