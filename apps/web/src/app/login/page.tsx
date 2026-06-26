import Link from "next/link";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
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
        <form className="auth-card">
          <h2>Login</h2>
          <label>
            Email
            <span>
              <Mail size={18} />
              <input type="email" placeholder="voce@empresa.com" autoComplete="email" />
            </span>
          </label>
          <label>
            Senha
            <span>
              <LockKeyhole size={18} />
              <input type="password" placeholder="Sua senha" autoComplete="current-password" />
            </span>
          </label>
          <button className="primary-button full-button" type="button">
            Entrar
            <ArrowRight size={18} />
          </button>
          <p>
            Ainda nao tem conta? <Link href="/cadastro">Criar cadastro</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
