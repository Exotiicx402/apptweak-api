import { format, subDays, addDays, parse } from "date-fns";

interface RollingRangeOptions {
  points: number;
  endOffsetDays?: number; // Default 1 = yesterday
}

interface RollingRangeResult {
  startDate: string;
  endDate: string;
  dates: string[]; // All dates in range, inclusive
}

/**
 * Computes a rolling date range ending N days ago (default: yesterday).
 * Returns startDate, endDate, and an array of all dates in the range.
 */
export function getRollingRange({ points, endOffsetDays = 1 }: RollingRangeOptions): RollingRangeResult {
  const today = new Date();
  const end = subDays(today, endOffsetDays);
  const start = subDays(end, points - 1);

  const endDate = format(end, "yyyy-MM-dd");
  const startDate = format(start, "yyyy-MM-dd");

  // Build list of all dates in range
  const dates: string[] = [];
  let current = start;
  while (current <= end) {
    dates.push(format(current, "yyyy-MM-dd"));
    current = addDays(current, 1);
  }

  return { startDate, endDate, dates };
}
