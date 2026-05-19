export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

export const getAuthHeaders = (headers = {}) => {
  const token = localStorage.getItem("token");
  return token ? { ...headers, Authorization: `Bearer ${token}` } : headers;
};
