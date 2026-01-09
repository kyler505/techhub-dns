import api from "./client";

export interface SharePointStatus {
    enabled: boolean;
    site_url: string | null;
    folder_path: string;
    authenticated: boolean;
    error?: string;
}

export interface SharePointAuthResponse {
    success: boolean;
    message?: string;
    error?: string;
    site_id?: string;
    drive_id?: string;
}

export interface SharePointTestResponse {
    success: boolean;
    message?: string;
    url?: string;
    filename?: string;
    error?: string;
}

export const sharepointApi = {
    getStatus: async (): Promise<SharePointStatus> => {
        const response = await api.get("/sharepoint/status");
        return response.data;
    },

    authenticate: async (): Promise<SharePointAuthResponse> => {
        const response = await api.post("/sharepoint/authenticate");
        return response.data;
    },

    testUpload: async (): Promise<SharePointTestResponse> => {
        const response = await api.post("/sharepoint/test-upload");
        return response.data;
    },
};
