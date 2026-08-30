/**
 * Conversions between a plain `YYYY-MM-DD` calendar-date string (the format
 * `pricing.ts`'s functions and the DB's `date` columns use) and a JS `Date`
 * for `@react-native-community/datetimepicker`, which works in the device's
 * local calendar. Deliberately local-field-based (not UTC), same semantics
 * as web's native `<input type="date">` value — the user picks a calendar
 * date, not an instant.
 */
export function isoDateToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function localDateToISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
