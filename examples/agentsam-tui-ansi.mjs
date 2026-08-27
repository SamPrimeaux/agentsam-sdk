#!/usr/bin/env node
/**
 * Zero-dependency ANSI companion to the Agent Sam SDK TUI.
 * Use this from Agent Sam PTY / Node scripts when you do not want Python+Rich.
 *
 *   node scripts/demo_agentsam_ansi.mjs
 *   node scripts/demo_agentsam_ansi.mjs --scene sprite
 *   node scripts/demo_agentsam_ansi.mjs --check
 */

const HIDE = "\x1b[?25l";
const SHOW = "\x1b[?25h";
const CLEAR_LINE = "\x1b[2K";
const MAGENTA = "\x1b[38;2;211;54;130m";
const CYAN = "\x1b[38;2;45;212;191m";
const MUTED = "\x1b[38;2;122;154;170m";
const GREEN = "\x1b[38;2;163;184;0m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

const WALKER = [
  ["  ·     ", "  ○     ", "  │╲    ", "  │ ○   ", "  ○ ░   ", "  ░     "],
  ["   ·    ", "   ○    ", "   │╲   ", "  ○  ○  ", "   ░    ", "  ░     "],
  ["    ·   ", "    ○   ", "    │╲  ", "   ○ │  ", "    ○   ", "   ░    "],
  ["     ·  ", "    ○   ", "    ╱│  ", "   ○ │  ", "    ○   ", "    ░   "],
  ["    ·   ", "   ○    ", "   ╱│   ", "  ○  │  ", "   ○ ░  ", "    ░   "],
  ["   ·    ", "  ○     ", "  ╱│    ", " ○  │   ", "  ○ ░   ", "  ░     "],
  ["  ·     ", "  ○     ", "  │╲    ", " ○  ○   ", "  ○ ░   ", "  ░     "],
  [" ·      ", "  ○     ", "  │╲    ", "  │ ○   ", "  ○ ░   ", " ░      "],
];

const BRAILLE = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function paint(lines) {
  const payload = lines.map((line) => `${CLEAR_LINE}${line}`).join("\n");
  process.stdout.write(`${payload}\n`);
  return lines.length;
}

function moveUp(n) {
  if (n > 0) process.stdout.write(`\x1b[${n}A`);
}

function box(title, bodyLines, width = 42) {
  const inner = width - 2;
  const top = `${MAGENTA}╭${"─".repeat(inner)}╮${RESET}`;
  const label = ` ${title} `;
  const titled = `${MAGENTA}╭${RESET}${BOLD}${CYAN}${label}${RESET}${MAGENTA}${"─".repeat(Math.max(0, inner - label.length))}╮${RESET}`;
  const mid = bodyLines.map((line) => {
    const visible = line.replace(/\x1b\[[0-9;]*m/g, "");
    const pad = Math.max(0, inner - 2 - visible.length);
    return `${MAGENTA}│${RESET} ${line}${" ".repeat(pad)} ${MAGENTA}│${RESET}`;
  });
  const bot = `${MAGENTA}╰${"─".repeat(inner)}╯${RESET}`;
  return [titled.length ? titled : top, ...mid, bot];
}

async function sceneSprite({ ticks, delay }) {
  let used = 0;
  for (let i = 0; i < ticks; i += 1) {
    const frame = WALKER[i % WALKER.length];
    const caption = `${MUTED}Agent Sam is walking · frame ${String(i + 1).padStart(2, "0")}${RESET}`;
    const lines = box("agent activity", [...frame.map((row) => `${CYAN}${BOLD}${row}${RESET}`), "", caption], 34);
    if (used) moveUp(used);
    used = paint(lines);
    await sleep(delay);
  }
  return used;
}

async function sceneDashboard({ ticks, delay }) {
  const total = 2320;
  let used = 0;
  const started = Date.now();
  for (let i = 0; i < ticks; i += 1) {
    const done = Math.min(total, Math.round(((i + 1) / ticks) * total));
    const symbols = Math.round(done * 2.76);
    const elapsed = Math.round((Date.now() - started) / 1000);
    const spin = BRAILLE[i % BRAILLE.length];
    const walker = WALKER[i % WALKER.length];
    const pct = Math.round((done / total) * 100);
    const barFilled = Math.round(pct / 5);
    const bar = `${CYAN}${"█".repeat(barFilled)}${MUTED}${"░".repeat(20 - barFilled)}${RESET}`;
    const body = [
      `${MUTED}stage${RESET}     ${CYAN}${BOLD}parse_chunks${RESET}  ${spin}`,
      `${MUTED}files${RESET}     ${done.toLocaleString()} / ${total.toLocaleString()}`,
      `${MUTED}symbols${RESET}   ${symbols.toLocaleString()}`,
      `${MUTED}errors${RESET}    ${GREEN}0${RESET}`,
      `${MUTED}elapsed${RESET}   ${elapsed}s`,
      `${bar} ${pct}%`,
      "",
      ...walker.map((row) => `${CYAN}${row}${RESET}`),
    ];
    const lines = box("◉  Code Index", body, 46);
    if (used) moveUp(used);
    used = paint(lines);
    await sleep(delay);
  }
  return used;
}

async function sceneLogs({ delay }) {
  const rows = [
    ["INFO", "Connected to Hyperdrive", "471 ms"],
    ["WORK", "Parsing batch", "24 files"],
    ["OK", "Checkpoint committed", "durable"],
  ];
  const styles = { INFO: "\x1b[38;2;58;159;232m", WORK: "\x1b[38;2;230;172;0m", OK: GREEN };
  for (const [level, message, detail] of rows) {
    const now = new Date().toISOString().slice(11, 19);
    process.stdout.write(
      `${DIM}${now}${RESET} ${styles[level]}${level.padStart(4)}${RESET} ${message} ${DIM}· ${detail}${RESET}\n`,
    );
    await sleep(delay);
  }
  return 0;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const check = args.has("--check");
  const scene = [...args].find((a) => !a.startsWith("--")) || (args.has("--scene") ? null : "all");
  const sceneFlagIdx = process.argv.indexOf("--scene");
  const named = sceneFlagIdx >= 0 ? process.argv[sceneFlagIdx + 1] : scene;
  const which = named && named !== "all" && !named.startsWith("--") ? named : "all";
  const delay = check ? 0 : 90;
  const ticks = check ? 4 : 32;

  process.stdout.write(HIDE);
  try {
    if (which === "sprite" || which === "all") await sceneSprite({ ticks, delay });
    if (which === "dashboard" || which === "all") await sceneDashboard({ ticks, delay });
    if (which === "logs" || which === "all") await sceneLogs({ delay: check ? 0 : 120 });
    process.stdout.write(`\n${GREEN}${BOLD}Done.${RESET}  Use the Python agentsam tui command for Rich layouts.\n`);
  } finally {
    process.stdout.write(SHOW);
  }
}

main().catch((err) => {
  process.stdout.write(SHOW);
  console.error(err);
  process.exit(1);
});
