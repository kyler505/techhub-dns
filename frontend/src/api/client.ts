import axios from "axios";

function normalizeApiBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return "/api";

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  if (trimmed.startsWith("/")) return trimmed;

  return `/${trimmed}`;
}

// Use VITE_API_URL if set (for production), otherwise use relative /api path
export const apiClient = axios.create({
  baseURL: normalizeApiBaseUrl(import.meta.env.VITE_API_URL),
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Include cookies for session auth
});

// Response interceptor for handling auth errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Check if we're already on the login page to prevent redirect loop
      if (!window.location.pathname.startsWith('/login')) {
        // Redirect to login, preserving the current path
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
