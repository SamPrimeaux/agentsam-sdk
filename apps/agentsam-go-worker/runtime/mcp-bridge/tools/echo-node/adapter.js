#!/usr/bin/env node
// stdio-json adapter, no deps. See ../../ADAPTER_CONTRACT.md.
let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  try {
    const req = input.trim() ? JSON.parse(input) : {};
    const text = req?.arguments?.text ?? "";
    console.log(JSON.stringify({ ok: true, result: { text, via: "node" } }));
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: `bad json: ${e.message}` }));
  }
});
