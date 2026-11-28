import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { zipSync, unzipSync } from 'fflate';
import { ensureProjectDirectory, readProjectFile, sha256, writeJsonAtomic } from './paths.js';

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
}

function markdownToXhtml(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const output = [];
  let paragraph = [];
  let list = false;
  const flushParagraph = () => { if (paragraph.length) { output.push(`<p>${paragraph.join(' ')}</p>`); paragraph = []; } };
  const closeList = () => { if (list) { output.push('</ul>'); list = false; } };
  const inline = value => escapeXml(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/`(.+?)`/g, '<code>$1</code>');
  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    const item = line.match(/^\s*[-*+]\s+(.+)$/);
    if (heading) { flushParagraph(); closeList(); const level = heading[1].length; output.push(`<h${level}>${inline(heading[2])}</h${level}>`); }
    else if (item) { flushParagraph(); if (!list) { output.push('<ul>'); list = true; } output.push(`<li>${inline(item[1])}</li>`); }
    else if (!line.trim()) { flushParagraph(); closeList(); }
    else { closeList(); paragraph.push(inline(line.trim())); }
  }
  flushParagraph(); closeList();
  return output.join('\n');
}

function validateBook(book) {
  if (!book || typeof book !== 'object') throw new Error('ebook_book_object_required');
  if (typeof book.title !== 'string' || !book.title.trim() || book.title.length > 200) throw new Error('ebook_title_invalid');
  if (typeof book.author !== 'string' || !book.author.trim() || book.author.length > 120) throw new Error('ebook_author_invalid');
  if (typeof (book.language || 'en') !== 'string' || !/^[a-z]{2,3}(-[A-Z]{2})?$/.test(book.language || 'en')) throw new Error('ebook_language_invalid');
  if (!Array.isArray(book.chapters) || !book.chapters.length || book.chapters.length > 200) throw new Error('ebook_chapters_invalid');
  for (const chapter of book.chapters) {
    if (typeof chapter.title !== 'string' || !chapter.title.trim() || typeof chapter.contentMarkdown !== 'string' || !chapter.contentMarkdown.trim()) throw new Error('ebook_chapter_content_required');
  }
}

export async function buildEpubPackage({ projectRoot, sourcePath, outputDir = '.agentsam/primetech/editorial/epub' } = {}) {
  const source = await readProjectFile(projectRoot, sourcePath, 32 * 1024 * 1024);
  let book;
  try { book = JSON.parse(source.bytes.toString('utf8')); } catch { throw new Error('ebook_source_json_invalid'); }
  validateBook(book);
  const language = book.language || 'en';
  const identifier = book.identifier || `urn:uuid:${crypto.randomUUID()}`;
  const chapters = book.chapters.map((chapter, index) => ({
    id: `chapter-${index + 1}`,
    file: `chapter-${String(index + 1).padStart(3, '0')}.xhtml`,
    title: chapter.title,
    content: markdownToXhtml(chapter.contentMarkdown),
  }));
  const files = {
    mimetype: new TextEncoder().encode('application/epub+zip'),
    'META-INF/container.xml': `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    'EPUB/styles.css': 'body{font-family:serif;line-height:1.55;margin:5%;}h1,h2,h3{line-height:1.2;}p{orphans:2;widows:2;}code{font-family:monospace;}nav ol{list-style:none;}',
  };
  const navItems = chapters.map(chapter => `<li><a href="${chapter.file}">${escapeXml(chapter.title)}</a></li>`).join('');
  files['EPUB/nav.xhtml'] = `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${language}" lang="${language}"><head><title>Contents</title><link rel="stylesheet" type="text/css" href="styles.css"/></head><body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${navItems}</ol></nav></body></html>`;
  for (const chapter of chapters) {
    files[`EPUB/${chapter.file}`] = `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${language}" lang="${language}"><head><title>${escapeXml(chapter.title)}</title><link rel="stylesheet" type="text/css" href="styles.css"/></head><body><section epub:type="chapter"><h1>${escapeXml(chapter.title)}</h1>${chapter.content}</section></body></html>`;
  }
  const manifestItems = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="css" href="styles.css" media-type="text/css"/>',
    ...chapters.map(chapter => `<item id="${chapter.id}" href="${chapter.file}" media-type="application/xhtml+xml"/>`),
  ].join('');
  const spine = chapters.map(chapter => `<itemref idref="${chapter.id}"/>`).join('');
  files['EPUB/package.opf'] = `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${language}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">${escapeXml(identifier)}</dc:identifier><dc:title>${escapeXml(book.title)}</dc:title><dc:creator>${escapeXml(book.author)}</dc:creator><dc:language>${escapeXml(language)}</dc:language>${book.rights ? `<dc:rights>${escapeXml(book.rights)}</dc:rights>` : ''}</metadata><manifest>${manifestItems}</manifest><spine>${spine}</spine></package>`;
  const zipEntries = Object.fromEntries(Object.entries(files).map(([name, value]) => [name, typeof value === 'string' ? new TextEncoder().encode(value) : value]));
  const zipBytes = zipSync(zipEntries, { level: 0 });
  const unpacked = unzipSync(zipBytes);
  if (Object.keys(unpacked)[0] !== 'mimetype' || new TextDecoder().decode(unpacked.mimetype) !== 'application/epub+zip' || !unpacked['EPUB/package.opf'] || !unpacked['EPUB/nav.xhtml']) throw new Error('ebook_epub_package_validation_failed');
  const root = await ensureProjectDirectory(projectRoot, outputDir);
  const slug = book.slug || book.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'book';
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) throw new Error('ebook_slug_invalid');
  const epubPath = path.join(root, `${slug}.epub`);
  const previewPath = path.join(root, 'preview.html');
  await fs.writeFile(epubPath, zipBytes, { mode: 0o600 });
  const preview = `<!doctype html><html lang="${language}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeXml(book.title)}</title><style>body{max-width:760px;margin:48px auto;padding:0 24px;font:18px/1.65 Georgia,serif;color:#222}h1{line-height:1.2}</style><h1>${escapeXml(book.title)}</h1><p>By ${escapeXml(book.author)}</p>${chapters.map(chapter => `<section><h2>${escapeXml(chapter.title)}</h2>${chapter.content}</section>`).join('')}</html>`;
  await fs.writeFile(previewPath, preview, { mode: 0o600 });
  const manifest = { schema: 'agentsam.ebook-package.v1', format: 'epub-3', title: book.title, author: book.author, language, identifier, source: { path: sourcePath, sha256: sha256(source.bytes), preserved: true }, chapters: chapters.length, epub: { path: path.basename(epubPath), bytes: zipBytes.length, sha256: sha256(zipBytes), validated: true }, preview: path.basename(previewPath), pdf: 'not-generated' };
  const manifestPath = path.join(root, 'manifest.json');
  await writeJsonAtomic(manifestPath, manifest);
  return { ok: true, format: 'epub-3', title: book.title, author: book.author, chapterCount: chapters.length, epubPath: path.relative(projectRoot, epubPath), epubBytes: zipBytes.length, epubSha256: sha256(zipBytes), previewPath: path.relative(projectRoot, previewPath), manifestPath: path.relative(projectRoot, manifestPath), validation: { mimetype: true, container: Boolean(unpacked['META-INF/container.xml']), packageDocument: true, navigation: true } };
}
