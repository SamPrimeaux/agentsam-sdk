type NavigateDetail = {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
};

export function navigateApp(detail: NavigateDetail | string) {
  if (typeof window === "undefined") return;
  const payload: NavigateDetail = typeof detail === "string" ? { to: detail } : detail;
  window.dispatchEvent(new CustomEvent<NavigateDetail>("agentsam:navigate", { detail: payload }));
}
