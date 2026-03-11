import { describe, expect, it } from "vitest";

import { formatToCentralTime, getCentralTimeDate } from "./timezone";

describe("timezone utilities", () => {
  it("formats winter UTC timestamps in Central time", () => {
    expect(formatToCentralTime("2026-01-15T18:00:00Z")).toBe("Jan 15, 2026 12:00");
  });

  it("formats summer UTC timestamps in Central time", () => {
    expect(formatToCentralTime("2026-07-15T18:00:00Z")).toBe("Jul 15, 2026 13:00");
  });

  it("treats timezone-less ISO datetimes as UTC", () => {
    expect(formatToCentralTime("2026-01-15T18:00:00")).toBe("Jan 15, 2026 12:00");
  });

  it("keeps date-only inputs on the Central calendar day", () => {
    expect(formatToCentralTime("2026-01-15", "MMM d, yyyy")).toBe("Jan 15, 2026");
  });

  it("returns invalid input unchanged", () => {
    expect(formatToCentralTime("not-a-date")).toBe("not-a-date");
  });

  it("returns a stable Date for date-only Central inputs", () => {
    expect(getCentralTimeDate("2026-01-15").toISOString()).toBe("2026-01-15T06:00:00.000Z");
  });
});
