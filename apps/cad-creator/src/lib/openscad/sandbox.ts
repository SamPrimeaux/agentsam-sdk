export interface OpenScadValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const FORBIDDEN_PATTERNS = [
  { pattern: /\binclude\s*<([^>]+)>/i, message: 'External file includes (<...>) are disabled for sandboxed execution.' },
  { pattern: /\buse\s*<([^>]+)>/i, message: 'External module usage (<...>) is disabled for sandboxed execution.' },
  { pattern: /\.\.[\/\\]/, message: 'Path traversal sequences (..) are strictly prohibited.' },
  { pattern: /\b(eval|exec|system|child_process|spawn|fork)\b/i, message: 'System command invocation keywords are disallowed.' },
  { pattern: /\bimport\s*\(/i, message: 'Dynamic external imports are prohibited in sandboxed source.' },
  { pattern: /\/etc\/|\/var\/|\/tmp\/|\/bin\/|\/usr\/|C:\\|D:\\/i, message: 'Hardcoded absolute filesystem paths are prohibited.' },
];

export function validateOpenScadSource(source: string): OpenScadValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!source || typeof source !== 'string') {
    return { valid: false, errors: ['Source code must be a non-empty string'], warnings: [] };
  }

  // Maximum source size check (500 KB limit)
  if (source.length > 500000) {
    errors.push('Source code exceeds the maximum allowed length (500KB).');
  }

  // Check forbidden security patterns
  for (const rule of FORBIDDEN_PATTERNS) {
    if (rule.pattern.test(source)) {
      errors.push(rule.message);
    }
  }

  // Check balanced braces / parenthesis basic structural checks
  let openBraces = 0;
  let openParens = 0;
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];

    if (!inString && !inBlockComment && char === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (inLineComment && (char === '\n' || char === '\r')) {
      inLineComment = false;
      continue;
    }
    if (!inString && !inLineComment && char === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (inBlockComment && char === '*' && next === '/') {
      inBlockComment = false;
      i++;
      continue;
    }
    if (inLineComment || inBlockComment) continue;

    if (char === '"' && source[i - 1] !== '\\') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') openBraces++;
    if (char === '}') openBraces--;
    if (char === '(') openParens++;
    if (char === ')') openParens--;
  }

  if (openBraces !== 0) {
    errors.push(`Mismatched curly braces: open count is ${openBraces > 0 ? '+' : ''}${openBraces}`);
  }
  if (openParens !== 0) {
    errors.push(`Mismatched parentheses: open count is ${openParens > 0 ? '+' : ''}${openParens}`);
  }

  // Suggest optimization warning if $fn is dangerously high (> 120)
  const fnMatch = source.match(/\$fn\s*=\s*(\d+)/);
  if (fnMatch && parseInt(fnMatch[1], 10) > 120) {
    warnings.push(`High facet count ($fn = ${fnMatch[1]}) may slow down compilation. Recommended: $fn <= 64.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
