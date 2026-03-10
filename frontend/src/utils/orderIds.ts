const ORDER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidOrderId(value: unknown): value is string {
  return typeof value === "string" && ORDER_ID_RE.test(value.trim());
}
