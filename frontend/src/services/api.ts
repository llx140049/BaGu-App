import { Platform } from "react-native";

// On phone (Expo Go), use the computer's LAN IP; on web (browser), use localhost.
const HOST = Platform.OS === "web" ? "localhost" : "192.168.2.11";
export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? `http://${HOST}:8000`;

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  // Don't set Content-Type for FormData (let fetch set it with boundary)
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }
  return res.json();
}

export const authApi = {
  register: (email: string, password: string) =>
    request("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
};

export const questionsApi = {
  list: () => request<any[]>("/api/v1/questions/"),
  get: (id: string) => request<any>(`/api/v1/questions/${id}`),
};

export const uploadApi = {
  uploadPdf: async (file: { uri?: string; name: string; bytes: ArrayBuffer }) => {
    const formData = new FormData();
    const blob = new Blob([file.bytes]);
    formData.append("file", blob, file.name);
    return request<any>("/api/v1/upload/pdf", {
      method: "POST",
      body: formData,
    });
  },
  confirm: (data: any) =>
    request("/api/v1/upload/confirm", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

export const progressApi = {
  batchSync: (items: any[]) =>
    request("/api/v1/progress/batch", {
      method: "POST",
      body: JSON.stringify({ items }),
    }),
};

export const statsApi = {
  overview: () => request<any>("/api/v1/stats/overview"),
  calendar: () => request<any[]>("/api/v1/stats/calendar"),
  trend: () => request<any[]>("/api/v1/stats/trend"),
  compare: () => request<any>("/api/v1/stats/compare"),
};

export default { authApi, questionsApi, uploadApi, progressApi, statsApi };
