/**
 * An HTML artifact often imports project-relative CSS and JS. srcdoc has no
 * virtual filesystem: inline only those dependencies that exist in this
 * project, and leave remote references to the sandbox's own policy.
 *
 * This helper does not publish anything or execute generated code. Rendering
 * remains isolated in a sandboxed, opaque-origin iframe.
 */
export function buildWorkspacePreview(
  file: { path: string; content: string },
  projectFiles: Array<{ path: string; content: string }>,
): string {
  const byPath = new Map(projectFiles.map((entry) => [entry.path.replace(/^\/+/, ""), entry.content]));

  const relativeFile = (reference: string): { path: string; content: string } | null => {
    if (!reference || reference.startsWith("/") || reference.startsWith("//") ||
        reference.startsWith("#") || reference.startsWith("?") ||
        /^[a-z][a-z0-9+.-]*:/i.test(reference)) return null;
    const segments = file.path.split("/").slice(0, -1);
    for (const part of reference.split(/[?#]/, 1)[0]!.split("/")) {
      if (part === "." || !part) continue;
      if (part === "..") {
        if (!segments.length) return null;
        segments.pop();
      } else {
        segments.push(part);
      }
    }
    const path = segments.join("/");
    const content = byPath.get(path);
    return typeof content === "string" ? { path, content } : null;
  };

  const attribute = (tag: string, key: string) => {
    for (const match of tag.matchAll(/\s([a-z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      if (match[1]?.toLowerCase() === key.toLowerCase()) return match[2] ?? match[3] ?? "";
    }
    return "";
  };

  let html = file.content.replace(/<link\b[^>]*>/gi, (tag) => {
    const rel = attribute(tag, "rel").toLowerCase().split(/\s+/);
    if (!rel.includes("stylesheet")) return tag;
    const source = relativeFile(attribute(tag, "href"));
    if (!source) return tag;
    return "<style data-agentsam-source=" + JSON.stringify(source.path) + ">" +
      source.content.replace(/<\/style/gi, "<\\/style") + "</style>";
  });
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, (tag) => {
    const source = relativeFile(attribute(tag, "src"));
    if (!source) return tag;
    return "<script data-agentsam-source=" + JSON.stringify(source.path) + ">" +
      source.content.replace(/<\/script/gi, "<\\/script") + "</script>";
  });
  return html;
}
