// stdio-json adapter, run via `npx tsx adapter.ts` — no build step.
// See ../../ADAPTER_CONTRACT.md.

interface CallRequest {
  tool: string;
  arguments: { text?: string };
}

let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  try {
    const req: CallRequest = input.trim() ? JSON.parse(input) : { tool: "", arguments: {} };
    const text = req.arguments?.text ?? "";
    console.log(JSON.stringify({ ok: true, result: { text, via: "typescript" } }));
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: `bad json: ${(e as Error).message}` }));
  }
});
