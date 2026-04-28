/**
 * Time utilities — all timestamps are stored as naive UTC in MySQL.
 * Python serializes them without the 'Z' suffix, so JavaScript would
 * treat them as local time. We append 'Z' before parsing to force UTC,
 * then display in America/New_York (ET) — the market timezone.
 */

function toUTC(ts: string): Date {
  // Append 'Z' if the string has no timezone info, so JS parses it as UTC
  const normalized = /[Z+]/.test(ts) ? ts : ts + "Z";
  return new Date(normalized);
}

const ET = "America/New_York";

/** "3:59:00 PM" → ET time only */
export function timeET(ts: string): string {
  return toUTC(ts).toLocaleTimeString("en-US", {
    timeZone: ET,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** "4/28/2026" → ET date only */
export function dateET(ts: string): string {
  return toUTC(ts).toLocaleDateString("en-US", {
    timeZone: ET,
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

/** "4/28/2026, 3:59:00 PM ET" → full date + time */
export function dateTimeET(ts: string): string {
  return (
    toUTC(ts).toLocaleString("en-US", {
      timeZone: ET,
      month: "numeric",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }) + " ET"
  );
}
