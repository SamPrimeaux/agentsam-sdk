/** File preview classification shared by the Monaco, media and Docker source hosts. */
export type PreviewableKind = 'image' | 'video' | 'audio' | 'pdf';
const byExtension:Record<string,PreviewableKind> = Object.freeze({
  png:'image',jpg:'image',jpeg:'image',webp:'image',gif:'image',svg:'image',
  avif:'image',bmp:'image',ico:'image',
  mp4:'video',webm:'video',mov:'video',m4v:'video',avi:'video',mkv:'video',
  mp3:'audio',wav:'audio',m4a:'audio',aac:'audio',oga:'audio',ogg:'audio',flac:'audio',
  pdf:'pdf',
});
export function mediaKindForPath(path:string):PreviewableKind|null {
  const ext=path.split(/[?#]/,1)[0]?.split('.').at(-1)?.toLowerCase()||'';
  return byExtension[ext]||null;
}
export function isMarkdownPath(path:string):boolean {
  return /\.(md|markdown|mdx)$/i.test(path);
}
export function isHtmlPath(path:string):boolean {
  return /\.(html|htm)$/i.test(path);
}
export const MAX_EDITOR_TEXT_CHARS=500_000;
