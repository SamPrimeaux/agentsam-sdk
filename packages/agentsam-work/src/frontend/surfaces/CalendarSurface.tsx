import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import type { WorkCalendarEvent } from "../../contracts/index";

const HOURS = Array.from({ length: 14 }, (_, index) => index + 9);

function startOfWeek(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function eventColor(kind: WorkCalendarEvent["kind"]) {
  if (kind === "meeting") return "#188038";
  if (kind === "task") return "#1a73e8";
  if (kind === "focus") return "#8e24aa";
  return "#f9ab00";
}

export function CalendarSurface({ events }: { events: WorkCalendarEvent[] }) {
  const [anchor, setAnchor] = useState(() => new Date());
  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );

  const monthTitle = anchor.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div style={{ minWidth: 760, height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          minHeight: 58,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 16px",
          borderBottom: "1px solid var(--agentsam-work-border)",
        }}
      >
        <button
          type="button"
          className="agentsam-work-toolbar-button"
          onClick={() => setAnchor(new Date())}
        >
          Today
        </button>
        <button
          type="button"
          className="agentsam-work-toolbar-button"
          aria-label="Previous week"
          onClick={() => setAnchor(addDays(anchor, -7))}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          className="agentsam-work-toolbar-button"
          aria-label="Next week"
          onClick={() => setAnchor(addDays(anchor, 7))}
        >
          <ChevronRight size={16} />
        </button>
        <div style={{ flex: 1 }} />
        <strong style={{ fontSize: 13 }}>{monthTitle}</strong>
        <select
          aria-label="Calendar view"
          defaultValue="week"
          className="agentsam-work-toolbar-button"
        >
          <option value="week">Week</option>
          <option value="day">Day</option>
          <option value="month">Month</option>
        </select>
        <button type="button" className="agentsam-work-toolbar-button" aria-label="Refresh">
          <RefreshCw size={15} />
        </button>
      </div>

      <div style={{ minHeight: 0, flex: 1, overflow: "auto" }}>
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 4,
            display: "grid",
            gridTemplateColumns: "64px repeat(7, minmax(112px, 1fr))",
            minWidth: 850,
            background: "var(--agentsam-work-panel-subtle)",
            borderBottom: "1px solid var(--agentsam-work-border)",
          }}
        >
          <div />
          {days.map((day) => {
            const today = day.toDateString() === new Date().toDateString();
            return (
              <div
                key={day.toISOString()}
                style={{
                  minHeight: 82,
                  display: "grid",
                  placeItems: "center",
                  borderLeft: "1px solid var(--agentsam-work-border)",
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: ".12em",
                      color: today ? "var(--agentsam-work-accent)" : "var(--agentsam-work-muted)",
                    }}
                  >
                    {day.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}
                  </div>
                  <div
                    style={{
                      margin: "8px auto 0",
                      width: 38,
                      height: 38,
                      display: "grid",
                      placeItems: "center",
                      borderRadius: "50%",
                      background: today ? "var(--agentsam-work-accent)" : "transparent",
                      color: today ? "#fff" : "var(--agentsam-work-text)",
                      fontSize: 19,
                    }}
                  >
                    {day.getDate()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "64px repeat(7, minmax(112px, 1fr))",
            minWidth: 850,
          }}
        >
          <div>
            {HOURS.map((hour) => (
              <div
                key={hour}
                style={{
                  height: 58,
                  padding: "7px 8px 0 0",
                  color: "var(--agentsam-work-muted)",
                  fontSize: 10,
                  textAlign: "right",
                  borderBottom: "1px solid var(--agentsam-work-border)",
                }}
              >
                {hour > 12 ? hour - 12 : hour} {hour >= 12 ? "PM" : "AM"}
              </div>
            ))}
          </div>
          {days.map((day, dayIndex) => (
            <div
              key={day.toISOString()}
              style={{
                position: "relative",
                borderLeft: "1px solid var(--agentsam-work-border)",
              }}
            >
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  style={{
                    height: 58,
                    borderBottom: "1px solid var(--agentsam-work-border)",
                  }}
                />
              ))}
              {events
                .filter((event) => event.dayOffset === dayIndex)
                .map((event) => {
                  const top = ((event.startMinutes - 9 * 60) / 60) * 58;
                  const height = Math.max(28, (event.durationMinutes / 60) * 58);
                  const color = eventColor(event.kind);
                  return (
                    <div
                      key={event.id}
                      style={{
                        position: "absolute",
                        left: 4,
                        right: 4,
                        top,
                        height,
                        overflow: "hidden",
                        borderRadius: 6,
                        borderLeft: "4px solid " + color,
                        background: "color-mix(in srgb, " + color + " 15%, white)",
                        padding: "6px 7px",
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      {event.title}
                    </div>
                  );
                })}
            </div>
          ))}

          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 64,
              right: 0,
              top: 7.55 * 58,
              height: 2,
              background: "#d93025",
              zIndex: 3,
            }}
          >
            <span
              style={{
                position: "absolute",
                left: -4,
                top: -3,
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#d93025",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
