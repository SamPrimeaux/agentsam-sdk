/** Tiny bounded arithmetic parser for the packaged calculator. Never evaluates JavaScript. */
export function evaluateCalculatorExpression(expression: string): string {
  if (typeof expression !== 'string' || expression.length > 128 || !expression.trim()) throw new Error('calculation_invalid');
  const source = expression.replace(/×/g, '*').replace(/÷/g, '/');
  const tokens: string[] = [];
  let index = 0;
  while (index < source.length) {
    if (/\s/.test(source[index])) { index++; continue; }
    const match = /^(?:\d+(?:\.\d*)?|\.\d+|[()+*/%\-])/.exec(source.slice(index));
    if (!match) throw new Error('calculation_invalid');
    if (match[0].length > 24 || tokens.length > 100) throw new Error('calculation_invalid');
    tokens.push(match[0]); index += match[0].length;
  }
  let at = 0;
  let depth = 0;
  const finite = (value: number) => {
    if (!Number.isFinite(value) || Math.abs(value) > 1e13) throw new Error('calculation_overflow');
    return value;
  };
  const primary = (): number => {
    if (++depth > 24) throw new Error('calculation_too_deep');
    try {
      const token = tokens[at++];
      if (token === '-' || token === '+') return finite((token === '-' ? -1 : 1) * primary());
      if (token === '(') {
        const result = sum();
        if (tokens[at++] !== ')') throw new Error('calculation_invalid');
        return result;
      }
      if (token && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) return finite(Number(token));
      throw new Error('calculation_invalid');
    } finally { depth--; }
  };
  const product = (): number => {
    let value = primary();
    while (['*','/','%'].includes(tokens[at])) {
      const op = tokens[at++];
      const right = primary();
      if ((op === '/' || op === '%') && right === 0) throw new Error('calculation_divide_by_zero');
      value = finite(op === '*' ? value * right : op === '/' ? value / right : value % right);
    }
    return value;
  };
  const sum = (): number => {
    let value = product();
    while (tokens[at] === '+' || tokens[at] === '-') {
      const op = tokens[at++];
      const right = product();
      value = finite(op === '+' ? value + right : value - right);
    }
    return value;
  };
  const value = sum();
  if (at !== tokens.length) throw new Error('calculation_invalid');
  const rounded = Number(value.toPrecision(12));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}
