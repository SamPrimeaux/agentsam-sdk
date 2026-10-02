export function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const seedRand = (seed: number) => mulberry32(seed);

export function genSeries(
  n: number,
  {
    seed = 1,
    base = 100,
    trend = 0.5,
    noise = 0.1,
    season = 0,
  }: {
    seed?: number;
    base?: number;
    trend?: number;
    noise?: number;
    season?: number;
  } = {}
) {
  const r = seedRand(seed);
  const arr: number[] = [];
  for (let i = 0; i < n; i++) {
    const seasonal = season ? Math.sin((i / n) * Math.PI * 4) * season * base : 0;
    const noiseV = (r() - 0.5) * 2 * noise * base;
    const trendV = (i / n) * trend * base;
    arr.push(Math.max(0, base + trendV + seasonal + noiseV));
  }
  return arr;
}

export function fmtNum(
  n: number | null | undefined,
  opts: { compact?: boolean; decimals?: number; prefix?: string; suffix?: string } = {}
) {
  const { compact = false, decimals = 0, prefix = "", suffix = "" } = opts;
  if (n == null || Number.isNaN(n)) return "–";
  let s: string;
  if (compact) {
    const abs = Math.abs(n);
    if (abs >= 1e9) s = (n / 1e9).toFixed(2) + "B";
    else if (abs >= 1e6) s = (n / 1e6).toFixed(2) + "M";
    else if (abs >= 1e3) s = (n / 1e3).toFixed(1) + "K";
    else s = n.toFixed(decimals);
  } else {
    s = n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  return prefix + s + suffix;
}
