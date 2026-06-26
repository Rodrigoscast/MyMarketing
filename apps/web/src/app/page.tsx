import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  CalendarClock,
  Camera,
  Check,
  Megaphone,
  MessageCircle,
  Play,
  TrendingUp,
  Video
} from "lucide-react";
import { Logo } from "@/components/Logo";

const channels = [
  { name: "LinkedIn", icon: Briefcase },
  { name: "Facebook", icon: MessageCircle },
  { name: "Instagram", icon: Camera },
  { name: "TikTok", icon: Play },
  { name: "YouTube", icon: Video }
];

const featureBlocks = [
  {
    icon: CalendarClock,
    title: "Agenda multicanal",
    text: "Planeje textos e videos, escolha canais e publique no horario ideal para cada campanha."
  },
  {
    icon: Megaphone,
    title: "Anuncios conectados",
    text: "Centralize Google Ads e Meta Ads para comparar investimento, cliques, views e retorno."
  },
  {
    icon: TrendingUp,
    title: "Analises executivas",
    text: "Acompanhe graficos claros de receita, CTR, conversoes e desempenho por plataforma."
  }
];

export default function LandingPage() {
  return (
    <main className="site-shell">
      <header className="marketing-nav">
        <Logo />
        <nav aria-label="Principal">
          <a href="#produto">Produto</a>
          <a href="#canais">Canais</a>
          <a href="#analytics">Analytics</a>
        </nav>
        <div className="nav-actions">
          <Link href="/login" className="ghost-button">
            Entrar
          </Link>
          <Link href="/cadastro" className="primary-button">
            Comecar
          </Link>
        </div>
      </header>

      <section className="hero-section">
        <div className="hero-stage" aria-hidden="true">
          <div className="hero-dashboard">
            <div className="hero-window-bar">
              <span />
              <span />
              <span />
            </div>
            <div className="hero-dashboard-grid">
              <div className="hero-panel hero-panel-large">
                <div className="mini-heading">Campanha Q2</div>
                <div className="hero-chart">
                  <i style={{ height: "42%" }} />
                  <i style={{ height: "64%" }} />
                  <i style={{ height: "55%" }} />
                  <i style={{ height: "78%" }} />
                  <i style={{ height: "69%" }} />
                  <i style={{ height: "88%" }} />
                </div>
              </div>
              <div className="hero-panel">
                <div className="mini-heading">ROI</div>
                <strong>4.8x</strong>
                <small>+21% este mes</small>
              </div>
              <div className="hero-panel">
                <div className="mini-heading">Posts</div>
                <strong>32</strong>
                <small>agendados</small>
              </div>
              <div className="hero-panel hero-panel-wide">
                <div className="mini-heading">Proximas publicacoes</div>
                <div className="timeline-row">
                  <span>09:00</span>
                  <b>Video institucional</b>
                </div>
                <div className="timeline-row">
                  <span>14:30</span>
                  <b>Oferta Meta Ads</b>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="hero-content">
          <p className="eyebrow">Software de marketing para empresas em crescimento</p>
          <h1>MyMarketing</h1>
          <p className="hero-copy">
            Uma plataforma elegante para agendar conteudos, conectar canais sociais e enxergar o
            retorno real dos seus anuncios sem abrir dez abas diferentes.
          </p>
          <div className="hero-actions">
            <Link href="/cadastro" className="primary-button large-button">
              Criar minha conta
              <ArrowRight size={18} />
            </Link>
            <Link href="/app" className="secondary-button large-button">
              Ver painel
            </Link>
          </div>
          <div className="channel-strip" id="canais" aria-label="Canais suportados">
            {channels.map((channel) => {
              const Icon = channel.icon;
              return (
                <span key={channel.name}>
                  <Icon size={18} />
                  {channel.name}
                </span>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section-band" id="produto">
        <div className="section-heading">
          <p className="eyebrow">Operacao centralizada</p>
          <h2>Do planejamento ao lucro, tudo em um fluxo unico.</h2>
        </div>
        <div className="feature-grid">
          {featureBlocks.map((feature) => {
            const Icon = feature.icon;
            return (
              <article className="feature-card" key={feature.title}>
                <Icon size={24} />
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="workflow-section">
        <div className="workflow-copy">
          <p className="eyebrow">Publicacao inteligente</p>
          <h2>Suba um video, escolha os canais e deixe a agenda trabalhar.</h2>
          <p>
            O MyMarketing prepara campanhas para LinkedIn, Facebook, Instagram, TikTok e YouTube,
            com status por plataforma e historico para o time acompanhar.
          </p>
        </div>
        <div className="workflow-board" aria-label="Fluxo de campanha">
          {["Briefing", "Conteudo", "Aprovacao", "Publicado"].map((step, index) => (
            <div className="workflow-step" key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <b>{step}</b>
              <Check size={18} />
            </div>
          ))}
        </div>
      </section>

      <section className="analytics-section" id="analytics">
        <div className="analytics-copy">
          <p className="eyebrow">Analytics de midia paga</p>
          <h2>Veja onde o dinheiro vira resultado.</h2>
          <p>
            Conecte Google Ads e Meta Ads para acompanhar investimento, receita, impressoes,
            cliques, views, conversoes e ROI em paineis de leitura rapida.
          </p>
          <Link href="/cadastro" className="primary-button">
            Comecar agora
          </Link>
        </div>
        <div className="analytics-preview" aria-hidden="true">
          <div className="metric-tile">
            <span>Receita atribuida</span>
            <strong>R$ 184.2k</strong>
          </div>
          <div className="metric-tile">
            <span>CTR medio</span>
            <strong>3.9%</strong>
          </div>
          <div className="line-visual">
            <i />
            <i />
            <i />
          </div>
        </div>
      </section>
    </main>
  );
}
