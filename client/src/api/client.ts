/**
 * Base URL for API requests.
 * Set VITE_API_URL at build time to point the client at a separate API server.
 * Defaults to "" (same origin) for combined deployments.
 */
export const API_BASE = __API_URL__.replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const params: RequestInit = {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  };

  const response = await fetch(url, params);

  if (!response.ok) {
    let errorMsg = "API request failed";
    try {
      const errorData = await response.json();
      errorMsg = errorData.error || errorMsg;
    } catch {
      // ignore JSON parse error
    }
    throw new ApiError(response.status, errorMsg);
  }

  // Not all successful requests have JSON bodies (like Logout)
  try {
    return await response.json();
  } catch {
    return {} as T;
  }
}
