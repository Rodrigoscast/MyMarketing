import { getAccessToken, getOrganizationId, clearSession } from "./auth";

export const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

/** Monta os headers de autenticação a partir da sessão local. */
function authHeaders(): HeadersInit {
  const headers: HeadersInit = {};
  const token = getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const organizationId = getOrganizationId();
  if (organizationId) headers["x-organization-id"] = organizationId;
  return headers;
}

/**
 * Redireciona para o login quando a sessão expira e a API responde 401.
 * O endpoint de auth em si não dispara o redirect prematuro.
 */
function handleUnauthorized(path: string) {
  if (typeof window !== "undefined" && path.startsWith("/auth/")) return;
  clearSessionAndRedirect();
}

function clearSessionAndRedirect() {
  clearSession();
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/app")) {
    window.location.href = "/login";
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    if (response.status === 401) handleUnauthorized(path);
    // Tenta extrair a mensagem de erro da API (ex.: fluxo de auth)
    let message = `API request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // sem corpo JSON
    }
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return response.json() as Promise<T>;
}

/**
 * Envia um FormData (upload multipart) autenticado.
 * Não fixamos Content-Type: o browser define o boundary automaticamente.
 */
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: formData
  });

  if (!response.ok) {
    if (response.status === 401) handleUnauthorized(path);
    let message = `Upload failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // sem corpo JSON
    }
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return response.json() as Promise<T>;
}