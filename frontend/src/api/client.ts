import axios from "axios";

// Use VITE_API_URL if set (for production), otherwise use relative /api path
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
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
