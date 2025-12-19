/**
 * Utility functions for timezone conversion
 * Converts UTC timestamps to Central Time (CST/CDT)
 */

import { formatInTimeZone } from "date-fns-tz";

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

  try {
    // Parse the UTC date string
    const utcDate = new Date(utcDateString);

    // Convert to Central Time using date-fns-tz
    // America/Chicago automatically handles CST (UTC-6) and CDT (UTC-5)
    return formatInTimeZone(utcDate, "America/Chicago", formatString);
  } catch (error) {
    console.error("Error formatting date to Central Time:", error);
    return utcDateString; // Return original if parsing fails
  }
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

  try {
    return new Date(utcDateString);
  } catch (error) {
    console.error("Error parsing date:", error);
    return new Date();
  }
}
