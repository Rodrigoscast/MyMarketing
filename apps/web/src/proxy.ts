import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "mp_session";
const AUTH_PAGES = ["/login", "/cadastro"];

/**
 * Decodifica o payload (claim "exp") do JWT sem verificar assinatura.
 * A verificação real da assinatura é feita pela API em cada request;
 * aqui apenas bloqueamos acesso a /app sem sessão ou com token expirado.
 */
function isTokenUsable(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;

    // base64url → base64 (+ padding) → atob → TextDecoder
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) base64 += "=";

    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as { exp?: number };

    if (typeof payload.exp !== "number") return true; // sem exp, deixa a API decidir
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const authenticated = Boolean(token) && isTokenUsable(token ?? "");

  // /app/* exige sessão válida
  if (pathname.startsWith("/app") && !authenticated) {
    const login = new URL("/login", req.url);
    if (pathname !== "/app") login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  // Já logado não precisa ver login/cadastro de novo
  if (AUTH_PAGES.includes(pathname) && authenticated) {
    return NextResponse.redirect(new URL("/app", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/login", "/cadastro"],
};