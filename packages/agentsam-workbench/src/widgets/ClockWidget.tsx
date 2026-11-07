import { useEffect, useState } from 'react';
import { CLOCK_TIMEZONES, clockDayPeriod, clockUtcOffset, formatClockDate, formatClockTime, validClockTimeZone } from './clock';

export interface ClockWidgetProps {
  compact?: boolean;
  defaultTimeZone?: string;
}

/** Installed world-clock widget. All displayed times derive from the device clock and Intl. */
export function ClockWidget({ compact = false, defaultTimeZone = '' }: ClockWidgetProps) {
  const [timeZone, setTimeZone] = useState(() => validClockTimeZone(defaultTimeZone));
  const [hour12, setHour12] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') update();
    }, 1000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  const glance = [
    {label: 'UTC', value: 'UTC'},
    {label: 'London', value: 'Europe/London'},
    {label: 'Tokyo', value: 'Asia/Tokyo'},
  ] as const;

  return (
    <div className="agentsam-clock" data-compact={compact} aria-label="World clock">
      <div className="agentsam-clock__toolbar">
        <label className="agentsam-clock__zone-label">
          <span>Timezone</span>
          <select aria-label="Clock timezone" className="agentsam-clock__zone"
            value={timeZone} onChange={event => setTimeZone(validClockTimeZone(event.target.value))}>
            {CLOCK_TIMEZONES.map(zone => <option key={zone.value} value={zone.value}>{zone.label}</option>)}
          </select>
        </label>
        <button type="button" className="agentsam-widget-button" aria-label="Switch between 12 and 24 hour format"
          aria-pressed={hour12} onClick={() => setHour12(value => !value)}>
          {hour12 ? '12h' : '24h'}
        </button>
      </div>
      <div className="agentsam-clock__face" role="timer" aria-live="off">
        <time className="agentsam-clock__time" suppressHydrationWarning>
          {now ? formatClockTime(now, timeZone, hour12) : '--:--:--'}
        </time>
        <span className="agentsam-clock__date">{now ? formatClockDate(now, timeZone) : 'Reading device clock'}</span>
        <span className="agentsam-clock__period">{now ? clockUtcOffset(now, timeZone) + ' · ' + (clockDayPeriod(now, timeZone) === 'day' ? 'Daytime' : 'Nighttime') : ''}</span>
      </div>
      <div className="agentsam-clock__glance" aria-label="World times">
        {glance.map(zone => (
          <div className="agentsam-clock__glance-item" key={zone.value}>
            <span>{zone.label}</span>
            <time>{now ? formatClockTime(now, zone.value, false, false) : '--:--'}</time>
          </div>
        ))}
      </div>
    </div>
  );
}
