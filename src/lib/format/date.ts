export type AppDateValue = Date | string | number | null | undefined;

const appDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "medium",
});

export function formatAppDateTime(value?: AppDateValue) {
  if (value === null || value === undefined || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return appDateTimeFormatter.format(date);
}
