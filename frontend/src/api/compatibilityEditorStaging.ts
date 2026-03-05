import { apiClient } from "./client";

export const COMPATIBILITY_STATUS_OPTIONS = ["Compatible", "Incompatible", "Partially Compatible"] as const;
export const COMPATIBILITY_DETAIL_STATUS_OPTIONS = [
  "Functional",
  "Partially Functional",
  "Non-functional",
  "N/A",
] as const;

export const COMPATIBILITY_DETAIL_FIELDS = [
  "display",
  "charging",
  "usbDetection",
  "ethernet",
  "audio",
  "sdCard",
] as const;

export type CompatibilityStatus = (typeof COMPATIBILITY_STATUS_OPTIONS)[number];
export type CompatibilityDetailStatus = (typeof COMPATIBILITY_DETAIL_STATUS_OPTIONS)[number];
export type CompatibilityDetailField = (typeof COMPATIBILITY_DETAIL_FIELDS)[number];

export interface CompatibilityCellData {
  compatibilityStatus?: CompatibilityStatus;
  notes?: string;
  rebootNeeded?: boolean;
  studentEdited?: boolean;
  display?: CompatibilityDetailStatus;
  charging?: CompatibilityDetailStatus;
  usbDetection?: CompatibilityDetailStatus;
  ethernet?: CompatibilityDetailStatus;
  audio?: CompatibilityDetailStatus;
  sdCard?: CompatibilityDetailStatus;
  [key: string]: unknown;
}

export interface CompatibilityDock {
  name: string;
  url?: string;
  hidden?: boolean;
  [key: string]: unknown;
}

export interface CompatibilityComputer {
  name: string;
  url?: string;
  hidden?: boolean;
  compatibilityData?: Record<string, CompatibilityCellData>;
  compatibilityNotes?: Record<string, string>;
  incompatibleWith?: string[];
  partiallyCompatibleWith?: string[];
  [key: string]: unknown;
}

export interface CompatibilityEditorStagingPayload {
  docks: Record<string, CompatibilityDock>;
  computers: Record<string, CompatibilityComputer>;
  [key: string]: unknown;
}

export const compatibilityEditorStagingApi = {
  async getData(): Promise<CompatibilityEditorStagingPayload> {
    const { data } = await apiClient.get<CompatibilityEditorStagingPayload>("/system/compatibility-editor-staging");
    return data;
  },

  async saveData(payload: CompatibilityEditorStagingPayload): Promise<void> {
    await apiClient.put("/system/compatibility-editor-staging", payload);
  },
};
