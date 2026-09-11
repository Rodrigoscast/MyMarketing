"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, LockKeyhole, Mail } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useToast } from "@/components/Toast";
import { apiFetch } from "@/lib/api";
import { saveSession, type AuthOrganization, type AuthUser } from "@/lib/auth";

interface LoginResponse {
  data: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number | string | null;
    user: AuthUser;
    organization?: AuthOrganization | null;
  };
}

export default function LoginPage() {
  const router = useRouter();
  const { error: showError } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    try {
      const response = await apiFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      saveSession({
        accessToken: response.data.accessToken,
        user: response.data.user,
        organization: response.data.organization,
      });

      // Continua para a página que o usuário tentava acessar, se houver
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(next && next.startsWith("/app") ? next : "/app");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível entrar";
      showError("Falha no login", message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-shell">
      <header className="auth-header">
        <Logo />
      </header>
      <section className="auth-layout">
        <div className="auth-copy">
          <p className="eyebrow">Bem-vindo de volta</p>
          <h1>Entre para acompanhar suas campanhas.</h1>
          <p>
            Acesse sua agenda de publicacoes, as integracoes de anuncios e os indicadores do seu
            time em poucos segundos.
          </p>
        </div>
        <form className="auth-card" onSubmit={handleSubmit}>
          <h2>Login</h2>
          <label>
            Email
            <span>
              <Mail size={18} />
              <input
                type="email"
                placeholder="voce@empresa.com"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </span>
          </label>
          <label>
            Senha
            <span>
              <LockKeyhole size={18} />
              <input
                type="password"
                placeholder="Sua senha"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </span>
          </label>
          <button className="primary-button full-button" type="submit" disabled={submitting}>
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
            {submitting ? "Entrando..." : "Entrar"}
          </button>
          <p>
            Ainda nao tem conta? <Link href="/cadastro">Criar cadastro</Link>
          </p>
        </form>
      </section>
    </main>
  );
}