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
    s = n.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  return prefix + s + suffix;
}
