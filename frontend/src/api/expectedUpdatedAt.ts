type PayloadWithExpectedUpdatedAt = {
  expected_updated_at?: string | null;
};

export function normalizeExpectedUpdatedAt<T extends PayloadWithExpectedUpdatedAt>(
  payload: T,
): T {
  const rawValue = payload.expected_updated_at;

  if (!rawValue) {
    return payload;
  }

  const timestamp = Date.parse(rawValue);
  if (Number.isNaN(timestamp)) {
    return payload;
  }

  return {
    ...payload,
    expected_updated_at: new Date(timestamp).toISOString(),
  };
}
