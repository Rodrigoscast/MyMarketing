import Link from "next/link";
import { ArrowRight, Building2, LockKeyhole, Mail, UserRound } from "lucide-react";
import { Logo } from "@/components/Logo";

export default function CadastroPage() {
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
        <form className="auth-card">
          <h2>Cadastro</h2>
          <label>
            Nome
            <span>
              <UserRound size={18} />
              <input type="text" placeholder="Seu nome" autoComplete="name" />
            </span>
          </label>
          <label>
            Empresa
            <span>
              <Building2 size={18} />
              <input type="text" placeholder="Nome da empresa" autoComplete="organization" />
            </span>
          </label>
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
              <input type="password" placeholder="Crie uma senha" autoComplete="new-password" />
            </span>
          </label>
          <button className="primary-button full-button" type="button">
            Criar conta
            <ArrowRight size={18} />
          </button>
          <p>
            Ja tem conta? <Link href="/login">Entrar</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
