#!/usr/bin/env node
/** Fail the app tools gate if any advertised handler is missing or a name is ambiguous. */
import { CORE_EXECUTABLE_TOOL_KEYS } from "../agentsam/core-tools.js";
import { inspectRegistry, listToolDescriptors } from "./registry.ts";

const errors = inspectRegistry(CORE_EXECUTABLE_TOOL_KEYS);
if (errors.length) {
  for (const error of errors) console.error("TOOL REGISTRY ERROR:", error);
  process.exitCode = 1;
} else {
  console.log("Tool registry OK:", listToolDescriptors().length, "merchant operations;",
    listToolDescriptors("operator").length - listToolDescriptors().length, "operator operation(s)");
}
