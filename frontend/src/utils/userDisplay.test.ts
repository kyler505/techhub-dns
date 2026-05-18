import { describe, expect, it } from "vitest";

import { getUserDisplayName } from "./userDisplay";

describe("getUserDisplayName", () => {
  it("prefers display_name", () => {
    expect(
      getUserDisplayName({
        id: "1",
        email: "tech@example.com",
        display_name: "Tech One",
        department: null,
        created_at: "2026-01-01T00:00:00Z",
        last_login_at: "2026-01-01T00:00:00Z",
      }),
    ).toBe("Tech One");
  });

  it("falls back to email", () => {
    expect(
      getUserDisplayName({
        id: "1",
        email: "tech@example.com",
        display_name: null,
        department: null,
        created_at: "2026-01-01T00:00:00Z",
        last_login_at: "2026-01-01T00:00:00Z",
      }),
    ).toBe("tech@example.com");
  });

  it("falls back to provided default", () => {
    expect(getUserDisplayName(null, "Unknown")).toBe("Unknown");
  });
});
