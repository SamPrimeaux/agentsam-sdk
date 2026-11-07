/** Source-owned formatting for the installed Clock widget. No sample clock data. */
export const CLOCK_TIMEZONES = Object.freeze([
  { label: 'Local', value: '' },
  { label: 'UTC', value: 'UTC' },
  { label: 'New York', value: 'America/New_York' },
  { label: 'Los Angeles', value: 'America/Los_Angeles' },
  { label: 'London', value: 'Europe/London' },
  { label: 'Tokyo', value: 'Asia/Tokyo' },
  { label: 'Sydney', value: 'Australia/Sydney' },
] as const);

export function validClockTimeZone(value: string): string {
  return CLOCK_TIMEZONES.some(zone => zone.value === value) ? value : '';
}
export function formatClockTime(date: Date, timeZone = '', hour12 = false, showSeconds = true): string {
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(hour12 ? 'en-US' : 'en-GB', {
    ...(timeZone ? { timeZone: validClockTimeZone(timeZone) || undefined } : {}),
    hour: '2-digit', minute: '2-digit',
    ...(showSeconds ? { second: '2-digit' } : {}),
    hourCycle: hour12 ? 'h12' : 'h23',
  }).format(date);
}
export function formatClockDate(date: Date, timeZone = ''): string {
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    ...(timeZone ? { timeZone: validClockTimeZone(timeZone) || undefined } : {}),
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  }).format(date);
}
export function clockUtcOffset(date: Date, timeZone = ''): string {
  if (Number.isNaN(date.getTime())) return 'UTC';
  if (!timeZone) {
    const minutes = -date.getTimezoneOffset();
    const sign = minutes >= 0 ? '+' : '-';
    const abs = Math.abs(minutes);
    return 'UTC' + sign + String(Math.floor(abs / 60)).padStart(2, '0') + ':' + String(abs % 60).padStart(2, '0');
  }
  const zone = validClockTimeZone(timeZone);
  const raw = new Intl.DateTimeFormat('en-US', {
    ...(zone ? { timeZone: zone } : {}),
    timeZoneName: 'shortOffset',
  }).formatToParts(date).find(part => part.type === 'timeZoneName')?.value || 'GMT';
  const match = /^(?:GMT|UTC)([+-])(\d{1,2})(?::(\d{2}))?$/.exec(raw);
  return match ? 'UTC' + match[1] + match[2].padStart(2, '0') + ':' + (match[3] || '00') : 'UTC+00:00';
}
export function clockDayPeriod(date: Date, timeZone = ''): 'day' | 'night' {
  const localHour = new Intl.DateTimeFormat('en-GB', {
    ...(timeZone ? {timeZone: validClockTimeZone(timeZone) || undefined} : {}),
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).find(part => part.type === 'hour')?.value;
  const hour = Number(localHour);
  return hour >= 6 && hour < 18 ? 'day' : 'night';
}
