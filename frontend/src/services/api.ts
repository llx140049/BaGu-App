import { Platform } from "react-native";

// On phone (Expo Go), use the computer's LAN IP; on web (browser), use localhost.
// Keep this in sync with the current LAN address when testing on a physical phone.
const HOST = Platform.OS === "web" ? "localhost" : "192.168.2.21";
export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? `http://${HOST}:8001`;
let activeAuthToken = "";

export function setApiAuthToken(token: string) {
  activeAuthToken = token;
}

async function getApiAuthToken() {
  if (activeAuthToken) return activeAuthToken;
  try {
    const webToken = globalThis.localStorage?.getItem("bagu_sync_token");
    if (webToken) {
      activeAuthToken = webToken;
      return webToken;
    }
  } catch {}
  if (Platform.OS !== "web") {
    try {
      const { getDb } = await import("../data/db");
      const database = await getDb();
      const setting = await database.getFirstAsync("SELECT value FROM app_settings WHERE key = ?", ["auth_token"]);
      activeAuthToken = setting?.value || "";
    } catch {}
  }
  return activeAuthToken;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  const token = await getApiAuthToken();
  if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
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

export const documentsApi = {
  getOriginalFileRequest: async (documentId: string) => {
    const token = await getApiAuthToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    return { url: `${API_BASE}/api/v1/documents/${documentId}/original-file`, headers };
  },
};

// Supabase bucket enforces a MIME whitelist; Android pickers often report
// octet-stream for .md files, so derive an accurate type from the extension.
const uploadMimeType = (file: { name: string; mimeType?: string }) => {
  const ext = file.name.toLowerCase().split(".").pop() || "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "md" || ext === "markdown") return "text/markdown";
  if (ext === "txt" || ext === "text") return "text/plain";
  return file.mimeType || "application/octet-stream";
};

export const uploadApi = {
  uploadPdf: async (
    file: { uri: string; name: string; bytes?: ArrayBuffer; mimeType?: string },
    generateQuestions = true,
    onProgress?: (progress: string) => void
  ) => {
    const payload = Platform.OS === "web"
      ? new Blob([file.bytes!], { type: file.mimeType || "application/octet-stream" })
      : await (await fetch(file.uri)).blob();
    const upload = await request<any>("/api/v1/upload/direct-url", {
      method: "POST",
      body: JSON.stringify({ filename: file.name, size: payload.size }),
    });
    onProgress?.("上传原文件");
    const storageResponse = await fetch(upload.upload_url, {
      method: "PUT",
      headers: {
        "Content-Type": uploadMimeType(file),
        "x-upsert": "true",
      },
      body: payload,
    });
    if (!storageResponse.ok) {
      throw new Error(`Storage upload error ${storageResponse.status}: ${await storageResponse.text()}`);
    }
    const started = await request<any>("/api/v1/upload/process-direct", {
      method: "POST",
      body: JSON.stringify({
        filename: file.name,
        object_key: upload.object_key,
        mime_type: uploadMimeType(file),
        generate_questions: generateQuestions,
        async: true,
      }),
    });
    // 大 PDF 的解析在后端后台执行并轮询，避免长请求被代理约 100 秒超时掐断
    if (!started.job_token) return started; // 兼容未升级的后端（同步返回）
    const startedAt = Date.now();
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      if (Date.now() - startedAt > 30 * 60 * 1000) throw new Error("解析超时，请重试");
      onProgress?.(`解析 ${Math.round((Date.now() - startedAt) / 1000)} 秒`);
      const job = await request<any>("/api/v1/upload/process-status", {
        method: "POST",
        body: JSON.stringify({ job_token: started.job_token }),
      });
      if (job.processing_status === "done") return job.preview;
      if (job.processing_status === "failed") throw new Error(job.detail || "解析失败，请重试");
    }
  },
  uploadPdfViaApi: async (
    file: { uri: string; name: string; bytes?: ArrayBuffer; mimeType?: string },
    generateQuestions = true
  ) => {
    const formData = new FormData();
    if (Platform.OS === "web") {
      formData.append("file", new Blob([file.bytes!]), file.name);
    } else {
      formData.append("file", {
        uri: file.uri,
        name: file.name,
        type: file.mimeType || "application/octet-stream",
      } as any);
    }
    formData.append("generate_questions", String(generateQuestions));
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
  generateQuestions: (previewToken: string) =>
    request<any>("/api/v1/upload/generate", {
      method: "POST",
      body: JSON.stringify({ preview_token: previewToken }),
    }),
  generateQuestionsAsync: (previewToken: string, instructions?: string, density?: string) =>
    request<any>("/api/v1/upload/generate", {
      method: "POST",
      body: JSON.stringify({ preview_token: previewToken, async: true, instructions: instructions || undefined, density: density || undefined }),
    }),
  generateStatus: (previewToken: string) =>
    request<any>("/api/v1/upload/generate-status", {
      method: "POST",
      body: JSON.stringify({ preview_token: previewToken }),
    }),
};

export const progressApi = {
  batchSync: (items: any[]) =>
    request("/api/v1/progress/batch", {
      method: "POST",
      body: JSON.stringify({ items }),
    }),
};

export const syncApi = {
  deleteDocuments: (documentIds: string[], deleteRelatedQuestions: boolean) =>
    request("/api/v1/sync/delete-documents", {
      method: "POST",
      body: JSON.stringify({
        document_ids: documentIds,
        delete_related_questions: deleteRelatedQuestions,
      }),
    }),
  deleteQuestions: (questionIds: string[]) =>
    request("/api/v1/sync/delete-questions", {
      method: "POST",
      body: JSON.stringify({ question_ids: questionIds }),
    }),
  updateDocumentCategory: (documentId: string, category: string) =>
    request("/api/v1/sync/update-document-category", {
      method: "POST",
      body: JSON.stringify({ document_id: documentId, category }),
    }),
};

export const statsApi = {
  overview: () => request<any>("/api/v1/stats/overview"),
  calendar: () => request<any[]>("/api/v1/stats/calendar"),
  trend: () => request<any[]>("/api/v1/stats/trend"),
  compare: () => request<any>("/api/v1/stats/compare"),
};

export default { authApi, questionsApi, documentsApi, uploadApi, progressApi, syncApi, statsApi };
