/**
 * Formats a Date object as YYYY-MM-DD in the user's LOCAL timezone.
 * Use this instead of toISOString() which converts to UTC.
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Gets today's date as YYYY-MM-DD in local timezone.
 */
export function getLocalToday(): string {
  return formatLocalDate(new Date());
}

/**
 * Gets yesterday's date as YYYY-MM-DD in local timezone.
 */
export function getLocalYesterday(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return formatLocalDate(yesterday);
}

/**
 * Gets a date N days ago as YYYY-MM-DD in local timezone.
 */
export function getLocalDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return formatLocalDate(date);
}
