const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';

export const API_BASE_URL = String(rawApiBaseUrl).trim().replace(/\/+$/, '');

export function apiUrl(path = '') {
  const cleanPath = String(path || '').trim().replace(/^\/+/, '');
  if (!API_BASE_URL) return cleanPath ? `/${cleanPath}` : '';
  return cleanPath ? `${API_BASE_URL}/${cleanPath}` : API_BASE_URL;
}
