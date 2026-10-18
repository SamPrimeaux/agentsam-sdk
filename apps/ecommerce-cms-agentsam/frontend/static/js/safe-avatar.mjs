export function safeAvatarUrl(value, origin) {
  if (typeof value !== "string" || /[\s<>"']/.test(value)) return "";
  try {
    const url = new URL(value, origin);
    if (value.startsWith("https://") && url.protocol === "https:") return url.href;
    if (value.startsWith("/") && !value.startsWith("//") && url.origin === origin) return url.href;
  } catch (error) {}
  return "";
}
