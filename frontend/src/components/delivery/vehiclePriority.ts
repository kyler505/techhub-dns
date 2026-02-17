import type { VehicleStatusItem } from "../../api/vehicleCheckouts";

type PriorityTier = "P1" | "P2" | "P3";

export const DELIVERY_RUN_PRIORITY_OPTIONS = [
  { tier: "P1", purpose: "Delivery", label: "Delivery" },
  { tier: "P2", purpose: "Tech Duty", label: "Tech Duty" },
  { tier: "P3", purpose: "Administrative", label: "Administrative" },
] as const;

export const VEHICLE_CHECKOUT_PURPOSE_LABELS = DELIVERY_RUN_PRIORITY_OPTIONS.map(
  (option) => option.purpose
);

export type DeliveryRunPriorityPurpose = (typeof DELIVERY_RUN_PRIORITY_OPTIONS)[number]["purpose"];
export type VehicleCheckoutPurposeLabel = DeliveryRunPriorityPurpose;

export type PriorityActionSelection = {
  buttonLabel: "Start Run" | "Check Out";
  checkoutType: "delivery_run" | "other";
  purpose: DeliveryRunPriorityPurpose;
  createsRun: boolean;
};

const PRIORITY_ACTION_BY_PURPOSE: Record<DeliveryRunPriorityPurpose, PriorityActionSelection> = {
  Delivery: {
    buttonLabel: "Start Run",
    checkoutType: "delivery_run",
    purpose: "Delivery",
    createsRun: true,
  },
  "Tech Duty": {
    buttonLabel: "Check Out",
    checkoutType: "other",
    purpose: "Tech Duty",
    createsRun: false,
  },
  Administrative: {
    buttonLabel: "Check Out",
    checkoutType: "other",
    purpose: "Administrative",
    createsRun: false,
  },
};

export function getPriorityActionSelection(priority: DeliveryRunPriorityPurpose): PriorityActionSelection {
  return PRIORITY_ACTION_BY_PURPOSE[priority];
}

export type PrioritySemantics = {
  tier: PriorityTier;
  label: string;
  dispatchability: "available" | "in_use" | "recallable";
  dispatchabilityLabel: "Available" | "In Use" | "Recallable";
  isRecallable: boolean;
};

const TECH_KEYWORD_PATTERNS = [
  /\btech\b/i,
  /\bservice\b/i,
  /\brepairs?\b/i,
  /\bmaintenance\b/i,
  /\bdiagnostics?\b/i,
  /\bsupport\b/i,
  /\bit\b/i,
  /\binstall(?:ation)?\b/i,
  /\bsetup\b/i,
  /\brma\b/i,
];

function includesTechKeyword(text: string): boolean {
  return TECH_KEYWORD_PATTERNS.some((pattern) => pattern.test(text));
}

export function derivePrioritySemantics(status: VehicleStatusItem): PrioritySemantics {
  if (!status.checked_out && !status.delivery_run_active) {
    return {
      tier: "P3",
      label: "Administrative",
      dispatchability: "available",
      dispatchabilityLabel: "Available",
      isRecallable: false,
    };
  }

  if (status.delivery_run_active || status.checkout_type === "delivery_run") {
    return {
      tier: "P1",
      label: "Delivery",
      dispatchability: "in_use",
      dispatchabilityLabel: "In Use",
      isRecallable: false,
    };
  }

  const purpose = status.purpose?.trim() ?? "";
  if (includesTechKeyword(purpose)) {
    return {
      tier: "P2",
      label: "Tech Duty",
      dispatchability: "in_use",
      dispatchabilityLabel: "In Use",
      isRecallable: false,
    };
  }

  return {
    tier: "P3",
    label: "Administrative",
    dispatchability: "recallable",
    dispatchabilityLabel: "Recallable",
    isRecallable: true,
  };
}

export function formatTimeSince(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return null;

  const elapsedMs = Date.now() - date.getTime();
  if (elapsedMs < 0) return "just now";

  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  if (elapsedMinutes < 1) return "just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays}d ago`;
}
