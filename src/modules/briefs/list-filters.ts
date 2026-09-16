import { gte, lt, type SQL } from "drizzle-orm";
import { commercialBriefs } from "@/db/schema";
import type { resolveDateRange } from "@/lib/domain/date-range";

export function buildBriefUpdatedAtConditions(
  dateRange: ReturnType<typeof resolveDateRange>,
) {
  return [
    dateRange.start
      ? gte(commercialBriefs.updatedAt, dateRange.start)
      : undefined,
    dateRange.endExclusive
      ? lt(commercialBriefs.updatedAt, dateRange.endExclusive)
      : undefined,
  ].filter((condition): condition is SQL => Boolean(condition));
}
