// Normalizes to a UTC-midnight Date so it round-trips cleanly through Postgres @db.Date columns
// regardless of server timezone.
export function utcDateOnly(date: Date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
