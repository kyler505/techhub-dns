export const parseChartDate = (value: string | number): Date | null => {
  if (typeof value === "string") {
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatChartDateLabel = (
  value: string | number,
  options: Intl.DateTimeFormatOptions,
): string => {
  const parsed = parseChartDate(value);
  return parsed ? parsed.toLocaleDateString("en-US", options) : String(value);
};
