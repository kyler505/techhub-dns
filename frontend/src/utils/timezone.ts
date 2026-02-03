/**
 * Utility functions for timezone conversion
 * Converts UTC timestamps to Central Time (CST/CDT)
 */

import { formatInTimeZone, zonedTimeToUtc } from "date-fns-tz";

const CENTRAL_TIMEZONE = "America/Chicago";
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_NO_TZ_RE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?$/;
const TIMEZONE_SUFFIX_RE = /([zZ]|[+-]\d{2}:\d{2}|[+-]\d{4})$/;

function parseUtcishDateString(input: string): Date | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (DATE_ONLY_RE.test(trimmed)) {
    // Interpret YYYY-MM-DD as midnight in Central Time (not UTC midnight).
    return zonedTimeToUtc(`${trimmed}T00:00:00`, CENTRAL_TIMEZONE);
  }

  const looksLikeIsoDateTime = ISO_DATETIME_NO_TZ_RE.test(trimmed);
  const hasTimezoneSuffix = TIMEZONE_SUFFIX_RE.test(trimmed);
  const normalized = looksLikeIsoDateTime && !hasTimezoneSuffix ? `${trimmed}Z` : trimmed;

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

/**
 * Convert a UTC date string to Central Time
 * @param utcDateString - ISO 8601 date string in UTC
 * @param formatString - Optional format string (default: "MMM d, yyyy HH:mm")
 * @returns Formatted date string in Central Time
 */
export function formatToCentralTime(
  utcDateString: string,
  formatString: string = "MMM d, yyyy HH:mm"
): string {
  if (!utcDateString) return "N/A";

  const utcDate = parseUtcishDateString(utcDateString);
  if (!utcDate) return utcDateString;

  // Convert to Central Time using date-fns-tz
  // America/Chicago automatically handles CST (UTC-6) and CDT (UTC-5)
  return formatInTimeZone(utcDate, CENTRAL_TIMEZONE, formatString);
}

/**
 * Get a Date object representing the Central Time equivalent
 * Note: JavaScript Date objects are always in UTC internally,
 * this function is mainly for compatibility
 * @param utcDateString - ISO 8601 date string in UTC
 * @returns Date object (still UTC internally, but can be formatted as Central Time)
 */
export function getCentralTimeDate(utcDateString: string): Date {
  if (!utcDateString) return new Date();

  return parseUtcishDateString(utcDateString) ?? new Date();
}
