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
