type PayloadWithExpectedUpdatedAt = {
  expected_updated_at?: string | null;
};

const HAS_TIMEZONE_RE = /(Z|[+-]\d{2}:\d{2})$/i;

export function normalizeExpectedUpdatedAt<T extends PayloadWithExpectedUpdatedAt>(
  payload: T,
): T {
  const rawValue = payload.expected_updated_at;

  if (!rawValue) {
    return payload;
  }

  const normalizedInput = HAS_TIMEZONE_RE.test(rawValue)
    ? rawValue
    : `${rawValue}Z`;

  const timestamp = Date.parse(normalizedInput);
  if (Number.isNaN(timestamp)) {
    return payload;
  }

  return {
    ...payload,
    expected_updated_at: new Date(timestamp).toISOString(),
  };
}
