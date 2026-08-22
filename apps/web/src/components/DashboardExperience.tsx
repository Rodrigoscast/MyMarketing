"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  Bell,
  CalendarClock,
  Check,
  FileVideo,
  Gauge,
  Megaphone,
  Plus,
  Save,
  Search,
  Settings,
  Sparkles,
  Upload,
  Video
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { QuotaWidget, QuotaBadge } from "@/components/QuotaWidget";

const revenueData = [
  { day: "Seg", receita: 32000, investimento: 8400 },
  { day: "Ter", receita: 41000, investimento: 9300 },
  { day: "Qua", receita: 38000, investimento: 8700 },
  { day: "Qui", receita: 52000, investimento: 10400 },
  { day: "Sex", receita: 61000, investimento: 12100 },
  { day: "Sab", receita: 58000, investimento: 11800 },
  { day: "Dom", receita: 74000, investimento: 13200 }
];

const channelData = [
  { name: "Google", cliques: 18400, views: 76000 },
  { name: "Meta", cliques: 14100, views: 68000 },
  { name: "LinkedIn", cliques: 6200, views: 28000 },
  { name: "TikTok", cliques: 9900, views: 91000 }
];

export function DashboardExperience() {
  const [chartsReady, setChartsReady] = useState(false);

  useEffect(() => {
    setChartsReady(true);
  }, []);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Logo />
        <nav className="sidebar-nav" aria-label="Sistema">
          <a href="/app">
            <Gauge size={18} />
            Visão geral
          </a>
          <a href="/app/videos">
            <FileVideo size={18} />
            Vídeos
          </a>
          <a href="/app/canais">
            <Video size={18} />
            Canais do YouTube
          </a>
          <a href="/app/calendario">
            <CalendarClock size={18} />
            Calendário
          </a>
          <a href="/app/analytics">
            <Megaphone size={18} />
            Analytics
          </a>
          <a href="/app/config">
            <Settings size={18} />
            Configurações
          </a>
        </nav>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Painel MyMarketing</p>
            <h1>Centro de crescimento</h1>
          </div>
          <div className="workspace-actions">
            <label className="search-box">
              <Search size={18} />
              <input placeholder="Buscar campanhas" />
            </label>
            <button className="icon-button" aria-label="Notificacoes">
              <Bell size={19} />
            </button>
          </div>
        </header>

        <section className="metric-grid" id="visao">
          <article className="metric-card">
            <span>Receita atribuida</span>
            <strong>R$ 184.200</strong>
            <small>+21% vs. periodo anterior</small>
          </article>
          <article className="metric-card">
            <span>Cliques</span>
            <strong>48.600</strong>
            <small>CTR medio de 3,9%</small>
          </article>
          <article className="metric-card">
            <span>Views</span>
            <strong>263.000</strong>
            <small>Videos e anuncios conectados</small>
          </article>
          <article className="metric-card">
            <span>ROI</span>
            <strong>4.8x</strong>
            <small>Google Ads e Meta Ads</small>
          </article>
          <article className="metric-card">
            <QuotaBadge />
          </article>
        </section>

        <section className="dashboard-grid">
          <article className="panel composer-panel" id="agenda">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Publicação YouTube</p>
                <h2>Criar novo vídeo</h2>
              </div>
              <a href="/app/videos" className="primary-button compact-button">
                <Plus size={17} />
                Novo vídeo
              </a>
            </div>

            <div className="upload-zone">
              <FileVideo size={28} />
              <div>
                <b>Envie seu arquivo de vídeo</b>
                <span>MP4, MOV, AVI, MKV, WebM — até 2GB</span>
              </div>
              <a href="/app/videos" className="icon-button" aria-label="Criar vídeo">
                <Upload size={19} />
              </a>
            </div>

            <p style={{ color: "#6b7280", fontSize: "14px", marginTop: "8px" }}>
              Gerencie uploads, metadados completos (título, descrição, tags, thumbnail, playlist, agendamento nativo)
              e acompanhe o engajamento no <a href="/app/analytics" style={{ color: "#0f766e" }}>Analytics</a>.
            </p>
          </article>

          <article className="panel calendar-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Agenda de publicação</p>
                <h2>Próximos vídeos</h2>
              </div>
              <CalendarClock size={22} />
            </div>
            <div className="post-list">
              <div className="post-item empty">
                <p>Nenhum vídeo agendado ainda.</p>
                <a href="/app/videos" className="primary-button compact-button" style={{ marginTop: "8px" }}>
                  <Plus size={15} />
                  Criar primeiro vídeo
                </a>
              </div>
            </div>
          </article>
        </section>

        <section className="dashboard-grid analytics-grid" id="anuncios">
          <article className="panel chart-panel wide-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Performance paga</p>
                <h2>Receita x investimento</h2>
              </div>
              <button className="secondary-button compact-button">
                <Sparkles size={17} />
                Otimizar
              </button>
            </div>
            <div className="chart-box">
              {chartsReady ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="receita" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0f766e" stopOpacity={0.32} />
                        <stop offset="95%" stopColor="#0f766e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="receita"
                      stroke="#0f766e"
                      strokeWidth={3}
                      fill="url(#receita)"
                    />
                    <Area
                      type="monotone"
                      dataKey="investimento"
                      stroke="#f97316"
                      strokeWidth={3}
                      fill="transparent"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-placeholder" />
              )}
            </div>
          </article>

          <article className="panel chart-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Canais</p>
                <h2>Views e cliques</h2>
              </div>
            </div>
            <div className="chart-box small-chart">
              {chartsReady ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channelData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Bar dataKey="views" fill="#2563eb" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="cliques" fill="#f97316" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-placeholder compact" />
              )}
            </div>
          </article>
        </section>

        <section className="settings-grid" id="config">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Configuracoes gerais</p>
                <h2>Marca e operacao</h2>
              </div>
              <button className="icon-button" aria-label="Salvar configuracoes">
                <Save size={19} />
              </button>
            </div>
            <div className="settings-form">
              <label className="field">
                Nome da empresa
                <input defaultValue="Meraki Inc" />
              </label>
              <label className="field">
                Timezone
                <select defaultValue="America/Sao_Paulo">
                  <option value="America/Sao_Paulo">America/Sao_Paulo</option>
                  <option value="America/New_York">America/New_York</option>
                  <option value="Europe/Lisbon">Europe/Lisbon</option>
                </select>
              </label>
              <label className="field">
                Tom de voz
                <select defaultValue="elegante">
                  <option value="elegante">Elegante e direto</option>
                  <option value="consultivo">Consultivo</option>
                  <option value="ousado">Ousado</option>
                </select>
              </label>
              <label className="toggle-row">
                <input type="checkbox" defaultChecked />
                Exigir aprovacao antes de publicar
              </label>
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Integracoes</p>
                <h2>Contas conectadas</h2>
              </div>
            </div>
            <div className="integration-list">
              {["Google Ads", "Meta Ads", "LinkedIn", "TikTok", "Instagram"].map((name, index) => (
                <div className="integration-item" key={name}>
                  <span>{name}</span>
                  <b>{index < 2 ? "Conectado" : "Pendente"}</b>
                </div>
              ))}
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}
