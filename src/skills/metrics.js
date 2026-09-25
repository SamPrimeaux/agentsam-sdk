import { createHash } from 'node:crypto';

/**
 * Metrics are computed from *resolved* content — never authoritative from empty placeholders.
 *
 * @param {string} content
 * @returns {{
 *   byte_size: number,
 *   char_count: number,
 *   line_count: number,
 *   estimated_tokens: number,
 *   estimation_method: 'chars_div_4',
 *   checksum: string,
 * }}
 */
export function computeSkillContentMetrics(content) {
  const text = String(content ?? '');
  const byteSize = Buffer.byteLength(text, 'utf8');
  const charCount = text.length;
  const lineCount = text.length === 0 ? 0 : text.split(/\r?\n/).length;
  const estimatedTokens = Math.ceil(charCount / 4);
  const checksum = `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
  return {
    byte_size: byteSize,
    char_count: charCount,
    line_count: lineCount,
    estimated_tokens: estimatedTokens,
    estimation_method: 'chars_div_4',
    checksum,
  };
}
