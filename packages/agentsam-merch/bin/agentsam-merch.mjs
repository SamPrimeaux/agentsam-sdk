#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { runMerchCli } from "../src/cli.js";

export { runMerchCli };

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  runMerchCli(process.argv.slice(2)).catch((error) => {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  });
}
