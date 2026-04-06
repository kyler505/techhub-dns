import { apiClient } from "./client";

export const VETTING_EDITOR_SECTIONS = [
  "UnderConsideration",
  "Vetting",
  "AwaitingApproval",
  "ComingSoon",
] as const;
export const VETTING_EDITOR_LEGACY_SECTION_ORDER = [...VETTING_EDITOR_SECTIONS] as const;
export const VETTING_EDITOR_VETTING_URL_SECTIONS = ["Vetting", "AwaitingApproval"] as const;
export const VETTING_EDITOR_CATEGORIES = [
  "ACCESSORIES",
  "MONITORS + DOCKS",
  "LAPTOPS + TABLETS",
  "DESKTOPS",
] as const;

export type VettingEditorSection = (typeof VETTING_EDITOR_SECTIONS)[number];
export type VettingEditorCategory = (typeof VETTING_EDITOR_CATEGORIES)[number];

const VETTING_EDITOR_SECTION_BY_NORMALIZED_NAME: Record<string, VettingEditorSection> = Object.fromEntries(
  VETTING_EDITOR_SECTIONS.map((section) => [section.trim().toLowerCase(), section])
) as Record<string, VettingEditorSection>;
VETTING_EDITOR_SECTION_BY_NORMALIZED_NAME.underconsideration = "UnderConsideration";

export const normalizeVettingEditorSection = (section: string): VettingEditorSection | null => {
  const canonical = VETTING_EDITOR_SECTION_BY_NORMALIZED_NAME[section.trim().toLowerCase()];
  return canonical ?? null;
};

export interface VettingEditorItem {
  name: string;
  category: VettingEditorCategory;
  url: string;
  vettingUrl?: string;
}

export type VettingEditorPayload = Partial<Record<VettingEditorSection, VettingEditorItem[]>>;

export const vettingEditorApi = {
  async getData(): Promise<VettingEditorPayload> {
    const response = await apiClient.get("/system/vetting-editor");
    return response.data;
  },

  async saveData(payload: VettingEditorPayload): Promise<{ success: boolean }> {
    const response = await apiClient.put("/system/vetting-editor", payload);
    return response.data;
  },
};
