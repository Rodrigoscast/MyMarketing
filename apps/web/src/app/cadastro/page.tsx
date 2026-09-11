"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Loader2, LockKeyhole, Mail, UserRound } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useToast } from "@/components/Toast";
import { apiFetch } from "@/lib/api";
import { saveSession, type AuthOrganization, type AuthUser } from "@/lib/auth";

interface RegisterResponse {
  data: {
    requiresEmailConfirmation?: boolean;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number | string | null;
    user?: AuthUser;
    organization?: AuthOrganization | null;
  };
}

export default function CadastroPage() {
  const router = useRouter();
  const { error: showError, success: showSuccess, info: showInfo } = useToast();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    try {
      const response = await apiFetch<RegisterResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, company, email, password }),
      });

      // Projeto com confirmação de email habilitada: sem sessão imediata
      if (response.data.requiresEmailConfirmation || !response.data.accessToken) {
        showSuccess(
          "Conta criada!",
          "Enviamos um link de confirmação para o seu email. Confirme e depois entre."
        );
        router.push("/login");
        return;
      }

      saveSession({
        accessToken: response.data.accessToken,
        user: response.data.user!,
        organization: response.data.organization,
      });

      showSuccess("Bem-vindo!", `Conta de ${company} criada com sucesso.`);
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(next && next.startsWith("/app") ? next : "/app");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível criar a conta";
      showError("Falha no cadastro", message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-shell signup-shell">
      <header className="auth-header">
        <Logo />
      </header>
      <section className="auth-layout">
        <div className="auth-copy">
          <p className="eyebrow">Comece com clareza</p>
          <h1>Crie sua central de marketing em minutos.</h1>
          <p>
            Organize marca, canais sociais e dados de anuncios em uma base pronta para crescer com
            sua operacao.
          </p>
        </div>
        <form className="auth-card" onSubmit={handleSubmit}>
          <h2>Cadastro</h2>
          <label>
            Nome
            <span>
              <UserRound size={18} />
              <input
                type="text"
                placeholder="Seu nome"
                autoComplete="name"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </span>
          </label>
          <label>
            Empresa
            <span>
              <Building2 size={18} />
              <input
                type="text"
                placeholder="Nome da empresa"
                autoComplete="organization"
                required
                minLength={2}
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </span>
          </label>
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
                placeholder="Crie uma senha (mínimo 8 caracteres)"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </span>
          </label>
          <button className="primary-button full-button" type="submit" disabled={submitting}>
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
            {submitting ? "Criando conta..." : "Criar conta"}
          </button>
          <p>
            Ja tem conta? <Link href="/login">Entrar</Link>
          </p>
        </form>
      </section>
    </main>
  );
}