import {
  ArrowRight,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  LineChart,
  Megaphone,
  Play,
  RadioTower,
  Sparkles,
  Target,
  UsersRound,
} from "lucide-react";
import { Logo } from "@/components/Logo";

const highlights = [
  { label: "Posts planejados", value: "42", detail: "+18% no mês" },
  { label: "Canais conectados", value: "6", detail: "YouTube, Instagram e mais" },
  { label: "Crescimento médio", value: "31%", detail: "nos últimos 30 dias" },
];

const features = [
  {
    icon: CalendarCheck,
    title: "Calendário editorial claro",
    text: "Organize ideias, datas, status e responsáveis sem depender de planilhas soltas.",
  },
  {
    icon: RadioTower,
    title: "Publicação sob controle",
    text: "Acompanhe o que está pronto, o que precisa de ajuste e o que já foi ao ar.",
  },
  {
    icon: LineChart,
    title: "Analytics acionável",
    text: "Veja visualizações, engajamento e crescimento para decidir o próximo conteúdo.",
  },
];

const workflow = [
  "Conecte canais e organize a base da operação.",
  "Planeje conteúdos com datas, prioridades e status.",
  "Publique com consistência e acompanhe os resultados.",
];

export default function HomePage() {
  return (
    <main className="site-shell landing-shell">
      <header className="marketing-nav landing-nav">
        <Logo />
        <nav aria-label="Navegação principal">
          <a href="#produto">Produto</a>
          <a href="#recursos">Recursos</a>
          <a href="#fluxo">Fluxo</a>
          <a href="/app/analytics">Analytics</a>
        </nav>
        <div className="nav-actions">
          <a className="ghost-button" href="/login">
            Entrar
          </a>
          <a className="primary-button" href="/cadastro">
            Começar agora
          </a>
        </div>
      </header>

      <section className="landing-hero" id="produto">
        <div className="hero-content landing-hero-copy">
          <p className="eyebrow">MyMarketing para criadores e times de marketing</p>
          <h1>Controle sua operação de conteúdo do plano ao resultado.</h1>
          <p className="hero-copy">
            Uma plataforma para planejar publicações, acompanhar canais e entender o que realmente
            está gerando crescimento.
          </p>
          <div className="hero-actions">
            <a className="primary-button large-button" href="/cadastro">
              Criar meu workspace <ArrowRight size={18} />
            </a>
            <a className="secondary-button large-button" href="#fluxo">
              <Play size={16} /> Ver o fluxo
            </a>
          </div>
          <div className="landing-proof">
            <Sparkles size={16} />
            <span>Feito para transformar rotina de marketing em execução consistente.</span>
          </div>
        </div>

        <div className="product-preview" aria-label="Prévia do painel MyMarketing">
          <div className="preview-topbar">
            <div>
              <span />
              <span />
              <span />
            </div>
            <strong>Workspace semanal</strong>
          </div>
          <div className="preview-grid">
            <section className="preview-panel preview-calendar">
              <div className="preview-panel-heading">
                <CalendarCheck size={18} />
                <span>Calendário</span>
              </div>
              <div className="calendar-stack">
                <article>
                  <strong>Segunda</strong>
                  <p>Roteiro de campanha</p>
                </article>
                <article>
                  <strong>Quarta</strong>
                  <p>Post de conversão</p>
                </article>
                <article>
                  <strong>Sexta</strong>
                  <p>Vídeo de autoridade</p>
                </article>
              </div>
            </section>

            <section className="preview-panel preview-score">
              <div className="preview-panel-heading">
                <Target size={18} />
                <span>Meta do mês</span>
              </div>
              <strong>78%</strong>
              <p>da cadencia concluida</p>
            </section>

            <section className="preview-panel preview-chart">
              <div className="preview-panel-heading">
                <BarChart3 size={18} />
                <span>Performance</span>
              </div>
              <div className="bars" aria-hidden="true">
                <i style={{ height: "42%" }} />
                <i style={{ height: "66%" }} />
                <i style={{ height: "58%" }} />
                <i style={{ height: "84%" }} />
                <i style={{ height: "72%" }} />
              </div>
            </section>
          </div>
        </div>
      </section>

      <section className="landing-metrics" aria-label="Indicadores do produto">
        {highlights.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <p>{item.detail}</p>
          </article>
        ))}
      </section>

      <section className="section-band landing-section" id="recursos">
        <div className="section-heading">
          <p className="eyebrow">Sistema completo, sem poluição</p>
          <h2>O que seu marketing precisa ver todos os dias.</h2>
        </div>
        <div className="feature-grid">
          {features.map(({ icon: Icon, title, text }) => (
            <article className="feature-card landing-feature-card" key={title}>
              <span className="feature-icon">
                <Icon size={22} />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="workflow-section landing-workflow" id="fluxo">
        <div className="workflow-copy">
          <p className="eyebrow">Do caos ao ritmo</p>
          <h2>Uma rotina visual para decidir, executar e melhorar.</h2>
          <p>
            O MyMarketing aproxima planejamento, calendário e analytics para que cada conteúdo tenha
            contexto, prazo e leitura de resultado.
          </p>
          <a className="primary-button" href="/app">
            Abrir workspace <ArrowRight size={17} />
          </a>
        </div>

        <div className="workflow-board landing-workflow-board">
          {workflow.map((item, index) => (
            <article className="workflow-step" key={item}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{item}</strong>
              {index === 0 && <Megaphone size={20} />}
              {index === 1 && <Clock3 size={20} />}
              {index === 2 && <CheckCircle2 size={20} />}
            </article>
          ))}
        </div>
      </section>

      <section className="landing-final">
        <div>
          <p className="eyebrow">Pronto para operar melhor</p>
          <h2>Troque improviso por clareza semanal.</h2>
          <p>
            Entre no workspace e veja calendário, canais e indicadores trabalhando juntos para o seu
            próximo conteúdo.
          </p>
        </div>
        <a className="primary-button large-button" href="/cadastro">
          Começar agora <UsersRound size={18} />
        </a>
      </section>
    </main>
  );
}
