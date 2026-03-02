import { apiClient } from "./client";

export const VETTING_EDITOR_SECTIONS = ["AwaitingApproval", "Approved"] as const;
export const VETTING_EDITOR_CATEGORIES = [
  "ACCESSORIES",
  "MONITORS + DOCKS",
  "LAPTOPS + TABLETS",
  "DESKTOPS",
] as const;

export type VettingEditorSection = (typeof VETTING_EDITOR_SECTIONS)[number];
export type VettingEditorCategory = (typeof VETTING_EDITOR_CATEGORIES)[number];

export interface VettingEditorItem {
  name: string;
  category: VettingEditorCategory;
  url: string;
  vettingUrl?: string;
}

export type VettingEditorPayload = Record<VettingEditorSection, VettingEditorItem[]>;

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
