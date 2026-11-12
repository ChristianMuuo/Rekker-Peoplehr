import { customFetch } from "@workspace/api-client-react";

export async function apiGet<T = any>(path: string): Promise<T> {
  return customFetch<T>(path, { method: "GET" });
}

export async function apiPost<T = any>(path: string, body: unknown = {}): Promise<T> {
  return customFetch<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiPatch<T = any>(path: string, body: unknown = {}): Promise<T> {
  return customFetch<T>(path, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function apiGetText(path: string): Promise<string> {
  return customFetch<string>(path, {
    method: "GET",
    responseType: "text",
  });
}

export async function triggerCsvDownload(path: string, filename: string): Promise<void> {
  const csv = await apiGetText(path);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

