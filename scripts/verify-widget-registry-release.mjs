import fs from "node:fs";
import { execFileSync } from "node:child_process";

const pkg = JSON.parse(
  fs.readFileSync("packages/agentsam-workbench/package.json", "utf8"),
);

const name = pkg.name;
const version = pkg.version;

const npmView = (args) =>
  execFileSync("npm", ["view", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const published = npmView([`${name}@${version}`, "version"]);

if (published !== version) {
  throw new Error(`Registry mismatch: local=${version}, npm=${published}`);
}

const exportsMap = JSON.parse(
  npmView([`${name}@${version}`, "exports", "--json"]),
);

if (!exportsMap["./widgets"]) {
  throw new Error("Registry package does not expose ./widgets");
}

if (!exportsMap["./widgets/widgets.css"]) {
  throw new Error("Registry package does not expose ./widgets/widgets.css");
}

console.log(
  `PASS: ${name}@${version} exists on npm with widget exports`,
);
