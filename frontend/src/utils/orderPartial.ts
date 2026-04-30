import type { Order, PickStatus, PickStatusItem } from "../types/order";

type PartialOrderSource = Pick<
  Order,
  "pick_status" | "inflow_data" | "has_remainder" | "remainder_order_id" | "parent_order_id"
>;

export interface PartialOrderInfo {
  isPartial: boolean;
  totalOrdered: number;
  totalPicked: number;
  missingItems: PickStatusItem[];
  hasRemainder: boolean;
  remainderOrderId?: string;
  parentOrderId?: string;
  shortfall: number;
}

const isTruthyFlag = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["y", "yes", "true", "1"].includes(normalized);
  }
  return Boolean(value);
};

const toQuantity = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getLineQuantity = (line: unknown): number => {
  if (!line || typeof line !== "object") return 0;

  const quantity = (line as Record<string, unknown>).quantity;
  if (quantity && typeof quantity === "object") {
    return toQuantity((quantity as Record<string, unknown>).standardQuantity);
  }

  return toQuantity(quantity);
};

const getLineProductId = (line: unknown): string | null => {
  if (!line || typeof line !== "object") return null;

  const productId = (line as Record<string, unknown>).productId;
  return productId == null ? null : String(productId);
};

const getLineProductName = (line: unknown, fallback: string): string => {
  if (!line || typeof line !== "object") return fallback;

  const record = line as Record<string, unknown>;
  const product = record.product;
  if (product && typeof product === "object") {
    const name = (product as Record<string, unknown>).name;
    if (typeof name === "string" && name.trim()) {
      return name;
    }
  }

  const description = record.description;
  if (typeof description === "string" && description.trim()) {
    return description;
  }

  const productName = record.productName;
  if (typeof productName === "string" && productName.trim()) {
    return productName;
  }

  return fallback;
};

const normalizePickStatus = (value: unknown): PickStatus | null => {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;
  const isFullyPicked = Boolean(candidate.is_fully_picked);
  const totalOrdered = toQuantity(candidate.total_ordered);
  const totalPicked = toQuantity(candidate.total_picked);
  const missingItems = Array.isArray(candidate.missing_items)
    ? (candidate.missing_items as PickStatusItem[])
    : [];

  return {
    is_fully_picked: isFullyPicked,
    total_ordered: totalOrdered,
    total_picked: totalPicked,
    missing_items: missingItems,
  };
};

const derivePickStatusFromInflow = (inflowData: unknown): PickStatus | null => {
  if (!inflowData || typeof inflowData !== "object") return null;

  const inflow = inflowData as Record<string, unknown>;
  const lines = Array.isArray(inflow.lines) ? inflow.lines : [];
  const pickLines = Array.isArray(inflow.pickLines) ? inflow.pickLines : [];

  const required = new Map<string, number>();
  const picked = new Map<string, number>();
  const productNames = new Map<string, string>();

  for (const rawLine of lines) {
    const productId = getLineProductId(rawLine);
    const quantity = getLineQuantity(rawLine);
    if (!productId || quantity <= 0) continue;

    required.set(productId, (required.get(productId) ?? 0) + quantity);
    if (!productNames.has(productId)) {
      productNames.set(productId, getLineProductName(rawLine, productId));
    }
  }

  for (const rawLine of pickLines) {
    const productId = getLineProductId(rawLine);
    const quantity = getLineQuantity(rawLine);
    if (!productId || quantity <= 0) continue;

    picked.set(productId, (picked.get(productId) ?? 0) + quantity);
    if (!productNames.has(productId)) {
      productNames.set(productId, getLineProductName(rawLine, productId));
    }
  }

  const totalOrdered = Array.from(required.values()).reduce((sum, quantity) => sum + quantity, 0);
  const missingItems: PickStatusItem[] = [];
  let totalPicked = 0;

  for (const [productId, ordered] of required.entries()) {
    const pickedQuantity = Math.min(picked.get(productId) ?? 0, ordered);
    totalPicked += pickedQuantity;

    if (pickedQuantity < ordered) {
      missingItems.push({
        product_id: productId,
        product_name: productNames.get(productId) ?? productId,
        ordered,
        picked: pickedQuantity,
      });
    }
  }

  return {
    is_fully_picked: totalOrdered > 0 && totalPicked >= totalOrdered && missingItems.length === 0,
    total_ordered: totalOrdered,
    total_picked: totalPicked,
    missing_items: missingItems,
  };
};

export const getPartialOrderInfo = (order: PartialOrderSource): PartialOrderInfo => {
  const pickStatus = normalizePickStatus(order.pick_status) ?? derivePickStatusFromInflow(order.inflow_data);
  const totalOrdered = pickStatus?.total_ordered ?? 0;
  const totalPicked = pickStatus?.total_picked ?? 0;
  const missingItems = pickStatus?.missing_items ?? [];
  const isPartial = Boolean(pickStatus && totalOrdered > 0 && totalPicked > 0 && totalPicked < totalOrdered);
  const hasRemainder = isTruthyFlag(order.has_remainder) || Boolean(order.remainder_order_id);

  return {
    isPartial,
    totalOrdered,
    totalPicked,
    missingItems,
    hasRemainder,
    remainderOrderId: order.remainder_order_id ?? undefined,
    parentOrderId: order.parent_order_id ?? undefined,
    shortfall: Math.max(totalOrdered - totalPicked, 0),
  };
};

export const isPartialOrder = (order: PartialOrderSource): boolean => getPartialOrderInfo(order).isPartial;
