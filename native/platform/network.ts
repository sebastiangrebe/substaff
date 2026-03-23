import * as SecureStore from "expo-secure-store";
import { ApiError } from "@substaff/app-core/api/client";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3100/api";

export async function nativeRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await SecureStore.getItemAsync("substaff.auth.token");
  const headers = new Headers(init?.headers ?? undefined);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(
      (body as { error?: string } | null)?.error ?? `Request failed: ${res.status}`,
      res.status,
      body,
    );
  }
  return res.json();
}
