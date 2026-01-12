import axios from "axios";

// Use VITE_API_URL if set (for production), otherwise use relative /api path
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

export default apiClient;
