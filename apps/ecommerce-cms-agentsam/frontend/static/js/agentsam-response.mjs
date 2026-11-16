/** The embedded editor may receive an HTML login or gateway response. */
export async function readAgentSamReply(response) {
  if (response.status === 401 || response.status === 403) {
    throw new Error("AgentSam could not access this workspace. Check your sign-in and workspace access, then retry.");
  }
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json().catch(() => null) : null;
  if (!response.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : `AgentSam request failed (${response.status}). Try again.`);
  }
  if (typeof data?.reply !== "string" || !data.reply.trim()) {
    throw new Error("AgentSam returned an invalid response. Your message is ready to retry.");
  }
  return data;
}
