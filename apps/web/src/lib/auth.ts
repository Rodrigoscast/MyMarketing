const SESSION_KEY = "mp_session";
const COOKIE_NAME = "mp_session";

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
}

export interface AuthOrganization {
  id: string;
  name: string;
  plan: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number | string | null;
  user: AuthUser;
  organization?: AuthOrganization | null;
}

// ── helpers de payload ──────────────────────────────────────────────

interface AuthPayload {
  accessToken: string;
  user: AuthUser;
  organization?: AuthOrganization | null;
}

function toPayload(raw: string): AuthPayload | null {
  try {
    const parsed: AuthSession = JSON.parse(raw);
    if (!parsed.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ── cookie helpers (lido pelo middleware no servidor) ───────────────

function setCookie(name: string, value: string, maxAgeSec: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSec}; SameSite=Lax`;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

// ── API pública ────────────────────────────────────────────────────

/** Recupera a sessão do localStorage (ou null). */
export function getSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  const payload = toPayload(raw);
  if (!payload) {
    localStorage.removeItem(SESSION_KEY);
    deleteCookie(COOKIE_NAME);
    return null;
  }
  return payload as AuthSession;
}

/** Salva a sessão no localStorage e seta o cookie lido pelo middleware. */
export function saveSession(session: AuthPayload) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  // max-age de 7200s (2h) dá margem ao token padrão do Supabase para renovação.
  setCookie(COOKIE_NAME, session.accessToken, 7200);
}

/** Limpa sessão local e cookie — suficiente para "logout" neste estágio. */
export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  deleteCookie(COOKIE_NAME);
}

/** Retorna o access_token (ou null). */
export function getAccessToken(): string | null {
  return getSession()?.accessToken ?? null;
}

/** Retorna o id da organização selecionada (ou null). */
export function getOrganizationId(): string | null {
  return getSession()?.organization?.id ?? null;
}