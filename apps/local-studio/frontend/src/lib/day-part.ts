/** Local-time day segment used for the greeting. */
export type DayPart = "late-night" | "morning" | "afternoon" | "evening";

export function dayPartFromHour(hour: number): DayPart {
  if (hour < 5) return "late-night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

const LEAD: Record<DayPart, string> = {
  "late-night": "Late night",
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

/** "Morning, Sam" — or just "Morning" when no name is known. */
export function greetingForDayPart(part: DayPart, name?: string | null): string {
  const who = String(name ?? "").trim();
  return who ? `${LEAD[part]}, ${who}` : LEAD[part];
}

export function greetingNameFromDisplay(displayName?: string | null): string {
  const raw = String(displayName ?? "").trim();
  return raw.split(/\s+/)[0] ?? "";
}
