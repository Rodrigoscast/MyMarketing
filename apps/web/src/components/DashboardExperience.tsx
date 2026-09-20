"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  CalendarClock,
  CheckCircle,
  Clock,
  FileVideo,
  Loader2,
  Plus,
  RefreshCw,
  Upload,
  Video,
} from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { QuotaWidget } from "@/components/QuotaWidget";
import { apiFetch } from "@/lib/api";

type VideoStatus = "draft" | "scheduled" | "publishing" | "published" | "failed" | "cancelled";

interface YouTubeChannel {
  id: string;
  account_name: string;
  provider_account_id: string;
  status: string;
}

interface VideoItem {
  id: string;
  title: string;
  status: VideoStatus;
  publish_at: string | null;
  privacy_status: "private" | "unlisted" | "public";
  youtube_error: string | null;
  social_accounts?: YouTubeChannel | YouTubeChannel[] | null;
}

interface AnalyticsSummary {
  total_views: number;
  total_watch_time: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  total_subscribers_gained: number;
  videos_published: number;
}

const statusLabel: Record<VideoStatus, string> = {
  draft: "Rascunho",
  scheduled: "Agendado",
  publishing: "Publicando",
  published: "Publicado",
  failed: "Falhou",
  cancelled: "Cancelado",
};

function todayIsoDate() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("pt-BR", { notation: value >= 10000 ? "compact" : "standard" }).format(value);
}

function formatDateTime(value: string | null) {
  if (!value) return "Sem data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data invalida";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isSameLocalDay(value: string | null, day = todayIsoDate()) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10) === day;
}

function getChannelName(value: VideoItem["social_accounts"]) {
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0]?.account_name;
  return value.account_name;
}

export function DashboardExperience() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const loadDashboard = useCallback(async () => {
    setRefreshing(true);
    const today = todayIsoDate();

    const [videosResult, channelsResult, analyticsResult] = await Promise.allSettled([
      apiFetch<{ data: VideoItem[] }>("/api/videos"),
      apiFetch<{ data: YouTubeChannel[] }>("/api/channels"),
      apiFetch<{ data: AnalyticsSummary }>(`/api/analytics/summary?start=${today}&end=${today}`),
    ]);

    const nextErrors: string[] = [];

    if (videosResult.status === "fulfilled") {
      setVideos(videosResult.value.data ?? []);
    } else {
      nextErrors.push("Nao foi possivel carregar os videos.");
    }

    if (channelsResult.status === "fulfilled") {
      setChannels(channelsResult.value.data ?? []);
    } else {
      nextErrors.push("Nao foi possivel carregar os canais.");
    }

    if (analyticsResult.status === "fulfilled") {
      setAnalytics(analyticsResult.value.data);
    } else {
      nextErrors.push("Analytics de hoje indisponivel no momento.");
      setAnalytics(null);
    }

    setErrors(nextErrors);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const today = todayIsoDate();
  const now = useMemo(() => new Date(), []);

  const scheduledToday = videos.filter(
    (video) => ["scheduled", "publishing"].includes(video.status) && isSameLocalDay(video.publish_at, today)
  ).length;
  const publishedToday = videos.filter((video) => video.status === "published" && isSameLocalDay(video.publish_at, today)).length;
  const connectedChannels = channels.filter((channel) => channel.status === "connected").length;
  const engagementToday = analytics ? analytics.total_likes + analytics.total_comments + analytics.total_shares : null;

  const upcomingVideos = videos
    .filter((video) => video.publish_at && ["scheduled", "publishing"].includes(video.status))
    .filter((video) => new Date(video.publish_at!).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.publish_at!).getTime() - new Date(b.publish_at!).getTime())
    .slice(0, 5);

  const pendingVideos = videos
    .filter((video) => ["draft", "failed"].includes(video.status))
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, 5);

  return (
    <main className="app-shell">
      <AppSidebar />

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Painel geral</p>
            <h1>Resumo de hoje</h1>
          </div>
          <div className="workspace-actions">
            <button className="secondary-button compact-button" type="button" onClick={loadDashboard} disabled={refreshing}>
              {refreshing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
              Atualizar
            </button>
            <a className="primary-button compact-button" href="/app/videos">
              <Plus size={16} />
              Adicionar video
            </a>
          </div>
        </header>

        {errors.length > 0 && (
          <div className="dashboard-alert" role="alert">
            <AlertCircle size={18} />
            <span>{errors.join(" ")}</span>
          </div>
        )}

        <section className="metric-grid" id="visao">
          <article className="metric-card">
            <span>Visualizacoes hoje</span>
            <strong>{loading ? "..." : formatNumber(analytics?.total_views)}</strong>
            <small>{analytics ? "Dados do YouTube Analytics" : "Sem dados coletados hoje"}</small>
          </article>
          <article className="metric-card">
            <span>Engajamento hoje</span>
            <strong>{loading ? "..." : formatNumber(engagementToday)}</strong>
            <small>Curtidas, comentarios e compartilhamentos</small>
          </article>
          <article className="metric-card">
            <span>Agendados hoje</span>
            <strong>{loading ? "..." : scheduledToday}</strong>
            <small>{publishedToday} publicados hoje</small>
          </article>
          <article className="metric-card">
            <span>Canais conectados</span>
            <strong>{loading ? "..." : connectedChannels}</strong>
            <small>{channels.length} canais cadastrados</small>
          </article>
        </section>

        <section className="dashboard-grid">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Acoes rapidas</p>
                <h2>Operacao de conteudo</h2>
              </div>
            </div>
            <div className="dashboard-actions-grid">
              <a className="dashboard-action" href="/app/videos">
                <Upload size={18} />
                <span>
                  <strong>Adicionar video</strong>
                  <small>Upload, metadados e agendamento</small>
                </span>
              </a>
              <a className="dashboard-action" href="/app/calendario">
                <CalendarClock size={18} />
                <span>
                  <strong>Ver calendario</strong>
                  <small>Planejar proximas publicacoes</small>
                </span>
              </a>
              <a className="dashboard-action" href="/app/analytics">
                <BarChart3 size={18} />
                <span>
                  <strong>Abrir analytics</strong>
                  <small>Analisar videos e comentarios</small>
                </span>
              </a>
              <a className="dashboard-action" href="/app/canais">
                <Video size={18} />
                <span>
                  <strong>Gerenciar canais</strong>
                  <small>Conectar ou testar YouTube</small>
                </span>
              </a>
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Hoje</p>
                <h2>Saude da conta</h2>
              </div>
              <CheckCircle size={22} />
            </div>
            <div className="dashboard-status-list">
              <div>
                <span>Canais prontos</span>
                <strong>{connectedChannels}/{channels.length}</strong>
              </div>
              <div>
                <span>Videos em rascunho ou falha</span>
                <strong>{videos.filter((video) => ["draft", "failed"].includes(video.status)).length}</strong>
              </div>
              <div>
                <span>Tempo assistido hoje</span>
                <strong>{analytics ? `${formatNumber(analytics.total_watch_time)} min` : "-"}</strong>
              </div>
            </div>
          </article>
        </section>

        <section className="dashboard-grid">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Agenda</p>
                <h2>Proximas publicacoes</h2>
              </div>
              <a className="secondary-button compact-button" href="/app/calendario">
                Ver agenda
              </a>
            </div>
            <div className="dashboard-list">
              {loading ? (
                <div className="dashboard-empty"><Loader2 size={18} className="spin" /> Carregando agenda...</div>
              ) : upcomingVideos.length > 0 ? (
                upcomingVideos.map((video) => (
                  <a className="dashboard-list-item" href={`/app/videos?edit=${video.id}`} key={video.id}>
                    <Clock size={17} />
                    <span>
                      <strong>{video.title}</strong>
                      <small>{formatDateTime(video.publish_at)}{getChannelName(video.social_accounts) ? ` - ${getChannelName(video.social_accounts)}` : ""}</small>
                    </span>
                    <em>{statusLabel[video.status]}</em>
                  </a>
                ))
              ) : (
                <div className="dashboard-empty">
                  <CalendarClock size={20} />
                  Nenhum video agendado.
                  <a href="/app/videos">Adicionar video</a>
                </div>
              )}
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Pendencias</p>
                <h2>Videos para revisar</h2>
              </div>
            </div>
            <div className="dashboard-list">
              {loading ? (
                <div className="dashboard-empty"><Loader2 size={18} className="spin" /> Carregando videos...</div>
              ) : pendingVideos.length > 0 ? (
                pendingVideos.map((video) => (
                  <a className="dashboard-list-item" href={`/app/videos?edit=${video.id}`} key={video.id}>
                    <FileVideo size={17} />
                    <span>
                      <strong>{video.title}</strong>
                      <small>{video.youtube_error || "Pronto para completar metadados e agendar"}</small>
                    </span>
                    <em>{statusLabel[video.status]}</em>
                  </a>
                ))
              ) : (
                <div className="dashboard-empty">
                  <CheckCircle size={20} />
                  Nenhum rascunho ou falha pendente.
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="settings-grid">
          <QuotaWidget />

          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Canais</p>
                <h2>Contas conectadas</h2>
              </div>
              <a className="secondary-button compact-button" href="/app/canais">
                Gerenciar
              </a>
            </div>
            <div className="integration-list">
              {loading ? (
                <div className="dashboard-empty"><Loader2 size={18} className="spin" /> Carregando canais...</div>
              ) : channels.length > 0 ? (
                channels.map((channel) => (
                  <div className="integration-item" key={channel.id}>
                    <span>{channel.account_name}</span>
                    <b>{channel.status}</b>
                  </div>
                ))
              ) : (
                <div className="dashboard-empty">
                  <Video size={20} />
                  Nenhum canal conectado.
                  <a href="/app/canais">Conectar YouTube</a>
                </div>
              )}
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}
