import path from 'node:path';

const DEFINITIONS = [
  { id: 'javascript', label: 'JavaScript', kind: 'code', extensions: ['.js', '.mjs', '.cjs', '.jsx'], knowledge: true, ast: true },
  { id: 'typescript', label: 'TypeScript', kind: 'code', extensions: ['.ts', '.tsx'], knowledge: true, ast: true },
  { id: 'rust', label: 'Rust', kind: 'code', extensions: ['.rs'], knowledge: true },
  { id: 'python', label: 'Python', kind: 'code', extensions: ['.py'], knowledge: true },
  { id: 'go', label: 'Go', kind: 'code', extensions: ['.go'], knowledge: true },
  { id: 'java', label: 'Java', kind: 'code', extensions: ['.java'] },
  { id: 'kotlin', label: 'Kotlin', kind: 'code', extensions: ['.kt'] },
  { id: 'swift', label: 'Swift', kind: 'code', extensions: ['.swift'] },
  { id: 'c', label: 'C', kind: 'code', extensions: ['.c', '.h'] },
  { id: 'cpp', label: 'C++', kind: 'code', extensions: ['.cc', '.cpp', '.cxx', '.hpp'] },
  { id: 'csharp', label: 'C#', kind: 'code', extensions: ['.cs'] },
  { id: 'ruby', label: 'Ruby', kind: 'code', extensions: ['.rb'] },
  { id: 'php', label: 'PHP', kind: 'code', extensions: ['.php'] },
  { id: 'sql', label: 'SQL', kind: 'code', extensions: ['.sql'], knowledge: true },
  { id: 'shell', label: 'Shell', kind: 'code', extensions: ['.sh', '.bash', '.zsh'] },
  { id: 'yaml', label: 'YAML', kind: 'code', extensions: ['.yaml', '.yml'] },
  { id: 'toml', label: 'TOML', kind: 'code', extensions: ['.toml'] },
  { id: 'vue', label: 'Vue', kind: 'code', extensions: ['.vue'] },
  { id: 'svelte', label: 'Svelte', kind: 'code', extensions: ['.svelte'] },
  { id: 'markdown', label: 'Markdown', kind: 'document', extensions: ['.md', '.mdx'], knowledge: true },
  { id: 'json', label: 'JSON', kind: 'document', extensions: ['.json'], knowledge: true },
  { id: 'html', label: 'HTML', kind: 'document', extensions: ['.html', '.htm'] },
  { id: 'css', label: 'CSS', kind: 'document', extensions: ['.css', '.scss'] },
  { id: 'text', label: 'Text', kind: 'document', extensions: ['.txt'] },
  { id: 'xml', label: 'XML', kind: 'document', extensions: ['.xml'] },
  { id: 'csv', label: 'CSV', kind: 'document', extensions: ['.csv'] },
];

export const SOURCE_TYPES = Object.freeze(
  DEFINITIONS.map((definition) => Object.freeze({
    ...definition,
    extensions: Object.freeze([...definition.extensions]),
  })),
);

const BY_EXTENSION = new Map(
  SOURCE_TYPES.flatMap((definition) => definition.extensions.map((extension) => [extension, definition])),
);

export function normalizeSourceExtension(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.startsWith('.') ? raw : '.' + raw;
}

export function sourceTypeForExtension(value) {
  return BY_EXTENSION.get(normalizeSourceExtension(value)) || null;
}

export function sourceTypeForPath(filePath) {
  const lower = String(filePath || '').toLowerCase();
  if (lower.endsWith('.d.ts')) return sourceTypeForExtension('.ts');
  return sourceTypeForExtension(path.posix.extname(lower));
}

export function sourceLanguageForExtension(value) {
  return sourceTypeForExtension(value)?.label || null;
}

export function sourceLanguageIdForExtension(value) {
  return sourceTypeForExtension(value)?.id || null;
}

export function isCodeSourceExtension(value) {
  return sourceTypeForExtension(value)?.kind === 'code';
}

export function isDocumentSourceExtension(value) {
  return sourceTypeForExtension(value)?.kind === 'document';
}

export function isKnowledgeSourceExtension(value) {
  return sourceTypeForExtension(value)?.knowledge === true;
}

export function isKnowledgeSourcePath(filePath) {
  return sourceTypeForPath(filePath)?.knowledge === true;
}

export function isAstSourceExtension(value) {
  return sourceTypeForExtension(value)?.ast === true;
}
