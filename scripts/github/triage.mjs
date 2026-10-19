#!/usr/bin/env node
// Reads trusted base-branch policy. PR file paths are treated as data, never executed.
import fs from "node:fs";
import { labelsForIssueOpen, labelsForPullRequest, validateLabelManifest } from "./label-policy.mjs";

validateLabelManifest();
const eventName = process.env.GITHUB_EVENT_NAME;
const eventPath = process.env.GITHUB_EVENT_PATH;
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!eventName || !eventPath || !token || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo ?? "")) {
  throw new Error("github_triage_context_required");
}
const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
const { issue, pull_request: pr } = event;
if (!["issues", "pull_request_target"].includes(eventName)) process.exit(0);
const number = eventName === "issues" ? issue?.number : pr?.number;
if (!Number.isInteger(number) || number <= 0) throw new Error("github_triage_issue_number_invalid");
if (!["opened", "reopened", "synchronize", "ready_for_review"].includes(event.action)) process.exit(0);
const root = `https://api.github.com/repos/${repo}`;
async function request(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`github_triage_http_${response.status}:${method}`);
  return response.json();
}
const existing = (eventName === "issues" ? issue?.labels : pr?.labels) ?? [];
const labels = existing.map((item) => typeof item === "string" ? item : item.name);
let additions = [];
if (eventName === "issues") {
  // No severity or scope guesses. A new issue remains open for human triage.
  additions = event.action === "opened" ? labelsForIssueOpen(labels) : [];
} else {
  const paths = [];
  for (let page = 1;;page++) {
    const files = await request("GET", `${root}/pulls/${number}/files?per_page=100&page=${page}`);
    for (const file of files) paths.push(file.filename);
    if (files.length < 100) break;
    if (page >= 30) throw new Error("github_triage_pr_too_large_for_safe_scope_guess");
  }
  additions = labelsForPullRequest(paths, labels);
}
if (additions.length) {
  // The governance catalog is installed via manual workflow_dispatch. Until
  // that has happened, intake must not fail or create labels implicitly.
  const available = [];
  for (const label of additions) {
    const response = await fetch(`${root}/labels/${encodeURIComponent(label)}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (response.status === 404) {
      console.warn(`GitHub triage: catalog label not installed yet: ${label}`);
      continue;
    }
    if (!response.ok) throw new Error(`github_triage_label_check_http_${response.status}`);
    available.push(label);
  }
  if (available.length) await request("POST", `${root}/issues/${number}/labels`, { labels: available });
}
console.log(`GitHub triage #${number} (${eventName}): ${additions.join(", ") || "no automatic change"}`);
