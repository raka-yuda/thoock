import { z } from "zod";

export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD format")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Select a valid calendar date");

export function resolveDateRange(
  from?: string,
  to?: string,
  utcOffsetMinutes = 420,
) {
  const configuredOffset = Number.isFinite(utcOffsetMinutes)
    ? Math.min(Math.max(utcOffsetMinutes, -720), 840)
    : 420;
  const offsetMs = configuredOffset * 60 * 1_000;
  const start = from
    ? new Date(Date.parse(`${from}T00:00:00.000Z`) - offsetMs)
    : null;
  const endExclusive = to
    ? new Date(Date.parse(`${to}T00:00:00.000Z`) - offsetMs + 86_400_000)
    : null;
  if (start && endExclusive && start >= endExclusive)
    throw new RangeError("The start date must be on or before the end date.");
  return { start, endExclusive };
}
