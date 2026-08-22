"use client";

import { useEffect, useState, Suspense } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Eye,
  MessageSquare,
  ThumbsUp,
  Share2,
  Clock,
  Users,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Calendar,
  Filter,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { format, subDays, startOfDay, endOfDay, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";

interface VideoMetrics {
  id: string;
  title: string;
  youtube_video_id: string;
  published_at: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watch_time_minutes: number;
  average_view_duration: number;
  impression_ctr: number;
  subscribers_gained: number;
  revenue: number;
}

interface ChannelMetrics {
  channel_id: string;
  channel_name: string;
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_subscribers: number;
  videos_count: number;
}

interface AnalyticsSummary {
  total_views: number;
  total_watch_time: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  total_subscribers_gained: number;
  total_revenue: number;
  avg_ctr: number;
  avg_view_duration: number;
  videos_published: number;
  period: { start: string; end: string };
}

interface TimeSeriesData {
  date: string;
  views: number;
  watch_time: number;
  likes: number;
  comments: number;
  shares: number;
  subscribers_gained: number;
  ctr: number;
  avg_view_duration: number;
}

interface TopVideo {
  id: string;
  title: string;
  youtube_video_id: string;
  published_at: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watch_time_minutes: number;
  average_view_duration: number;
  ctr: number;
  subscribers_gained: number;
}

const formatNumber = (num: number) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
};

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const getChangePercent = (current: number, previous: number) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

function AnalyticsPageContent() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesData[]>([]);
  const [topVideos, setTopVideos] = useState<TopVideo[]>([]);
  const [channelMetrics, setChannelMetrics] = useState<ChannelMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>({
    start: subDays(new Date(), 29),
    end: new Date(),
  });
  const [metricFilter, setMetricFilter] = useState<"views" | "watch_time" | "engagement" | "revenue">("views");

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const start = format(startOfDay(dateRange.start), "yyyy-MM-dd");
      const end = format(endOfDay(dateRange.end), "yyyy-MM-dd");

      const [summaryRes, timeSeriesRes, topVideosRes, channelsRes] = await Promise.all([
        apiFetch<{ data: AnalyticsSummary }>(`/api/analytics/summary?start=${start}&end=${end}`),
        apiFetch<{ data: TimeSeriesData[] }>(`/api/analytics/timeseries?start=${start}&end=${end}`),
        apiFetch<{ data: TopVideo[] }>(`/api/analytics/top-videos?start=${start}&end=${end}&limit=10`),
        apiFetch<{ data: ChannelMetrics[] }>(`/api/analytics/channels?start=${start}&end=${end}`),
      ]);

      setSummary(summaryRes.data);
      setTimeSeries(timeSeriesRes.data ?? []);
      setTopVideos(topVideosRes.data ?? []);
      setChannelMetrics(channelsRes.data ?? []);
    } catch (err) {
      console.error("Erro ao carregar analytics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [dateRange]);

  const handleDateChange = (range: { start: Date; end: Date } | undefined) => {
    if (range) setDateRange(range);
  };

  if (loading) {
    return (
      <div className="loading-state">
        <Loader2 size={24} className="spin" />
        <p>Carregando analytics...</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="empty-state">
        <Activity size={48} />
        <h3>Nenhum dado disponível</h3>
        <p>Publique vídeos e aguarde a coleta de métricas para ver os analytics.</p>
      </div>
    );
  }

  // Dados simulados para comparação com período anterior
  const previousSummary = {
    total_views: Math.floor(summary.total_views * 0.82),
    total_watch_time: Math.floor(summary.total_watch_time * 0.78),
    total_likes: Math.floor(summary.total_likes * 0.85),
    total_comments: Math.floor(summary.total_comments * 0.9),
    total_subscribers_gained: Math.floor(summary.total_subscribers_gained * 0.75),
  };

  const metricCards = [
    {
      label: "Visualizações",
      value: formatNumber(summary.total_views),
      change: getChangePercent(summary.total_views, previousSummary.total_views),
      icon: Eye,
      color: "#2563eb",
      bgColor: "#eff6ff",
    },
    {
      label: "Tempo de exibição",
      value: formatNumber(summary.total_watch_time) + " min",
      change: getChangePercent(summary.total_watch_time, previousSummary.total_watch_time),
      icon: Clock,
      color: "#7c3aed",
      bgColor: "#f5f3ff",
    },
    {
      label: "Engajamento",
      value: formatNumber(summary.total_likes + summary.total_comments + summary.total_shares),
      change: getChangePercent(
        summary.total_likes + summary.total_comments + summary.total_shares,
        previousSummary.total_likes + previousSummary.total_comments
      ),
      icon: MessageSquare,
      color: "#f97316",
      bgColor: "#fff7ed",
    },
    {
      label: "Inscritos ganhos",
      value: formatNumber(summary.total_subscribers_gained),
      change: getChangePercent(summary.total_subscribers_gained, previousSummary.total_subscribers_gained),
      icon: Users,
      color: "#0f766e",
      bgColor: "#ecfdf5",
    },
    {
      label: "CTR médio",
      value: `${summary.avg_ctr.toFixed(2)}%`,
      change: 0,
      icon: TrendingUp,
      color: "#dc2626",
      bgColor: "#fef2f2",
    },
    {
      label: "Duração média",
      value: formatDuration(summary.avg_view_duration),
      change: 0,
      icon: Activity,
      color: "#0891b2",
      bgColor: "#f0fdfa",
    },
  ];

  // Preparar dados para gráficos
  const chartData = timeSeries.map(d => ({
    date: format(new Date(d.date), "dd/MM", { locale: ptBR }),
    views: d.views,
    watch_time: d.watch_time,
    likes: d.likes,
    comments: d.comments,
    shares: d.shares,
    subscribers_gained: d.subscribers_gained,
    ctr: d.ctr,
    avg_view_duration: d.avg_view_duration,
  }));

  const engagementData = [
    { name: "Curtidas", value: summary.total_likes, color: "#f97316" },
    { name: "Comentários", value: summary.total_comments, color: "#2563eb" },
    { name: "Compartilhamentos", value: summary.total_shares, color: "#0f766e" },
    { name: "Inscritos", value: summary.total_subscribers_gained, color: "#7c3aed" },
  ];

  const channelData = channelMetrics.map(c => ({
    name: c.channel_name,
    views: c.total_views,
    subscribers: c.total_subscribers,
    videos: c.videos_count,
  }));

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10" />
            <path d="M21 3a2 2 0 0 1 2 2v14" />
            <path d="M10 9H5a2 2 0 0 0 0 4h6" />
            <path d="M10 14H5a2 2 0 0 1 0-4h6" />
          </svg>
          <span>MyMarketing</span>
        </div>
        <nav className="sidebar-nav" aria-label="Sistema">
          <a href="/app">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            Visão geral
          </a>
          <a href="/app/videos">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
            Vídeos
          </a>
          <a href="/app/canais">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
            Canais do YouTube
          </a>
          <a href="/app/calendario">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Calendário
          </a>
          <a className="active" href="/app/analytics">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            Analytics
          </a>
        </nav>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">YouTube Analytics</p>
            <h1>Performance dos Vídeos</h1>
          </div>
          <div className="workspace-actions">
            <div className="date-picker-wrapper">
              <Calendar size={18} />
              <input
                type="text"
                value={`${format(dateRange.start, "dd/MM/yyyy")} - ${format(dateRange.end, "dd/MM/yyyy")}`}
                readOnly
                onClick={() => {}}
                placeholder="Período"
                style={{ border: "1px solid #d1d5db", padding: "8px 12px", borderRadius: "8px", fontSize: "13px", cursor: "pointer" }}
              />
            </div>
            <div className="filter-select">
              <Filter size={16} />
              <select
                value={metricFilter}
                onChange={e => setMetricFilter(e.target.value as any)}
                style={{ border: "1px solid #d1d5db", padding: "8px 12px", borderRadius: "8px", fontSize: "13px", background: "#fff" }}
              >
                <option value="views">Visualizações</option>
                <option value="watch_time">Tempo de exibição</option>
                <option value="engagement">Engajamento</option>
                <option value="revenue">Receita</option>
              </select>
            </div>
          </div>
        </header>

        {/* Cards de métricas */}
        <section className="metric-grid">
          {metricCards.map((card, i) => {
            const Icon = card.icon;
            const change = card.change;
            return (
              <article key={i} className="metric-card">
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div>
                    <span style={{ color: card.color }}><Icon size={20} /></span>
                    <p style={{ marginTop: "8px", fontSize: "13px", color: "#6b7280", fontWeight: 500 }}>{card.label}</p>
                    <strong style={{ fontSize: "24px", color: "#111827" }}>{card.value}</strong>
                  </div>
                  <div
                    style={{
                      padding: "4px 10px",
                      borderRadius: "9999px",
                      fontSize: "12px",
                      fontWeight: "600",
                      background: change >= 0 ? "#ecfdf5" : "#fef2f2",
                      color: change >= 0 ? "#065f46" : "#991b1b",
                    }}
                  >
                    {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {Math.abs(change).toFixed(1)}%
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        {/* Gráficos principais */}
        <section className="dashboard-grid">
          {/* Visualizações e Tempo de Exibição */}
          <article className="panel chart-panel wide-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Tendência</p>
                <h2>Visualizações e Tempo de Exibição</h2>
              </div>
            </div>
            <div className="chart-box" style={{ height: "320px" }}>
              {loading ? (
                <div className="chart-placeholder" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="views" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="watchTime" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} tickFormatter={formatNumber} />
                    <Tooltip
                      formatter={(value: any, name: any) => [
                        name === "views" ? formatNumber(Number(value) ?? 0) : formatNumber(Number(value) ?? 0) + " min",
                        name === "views" ? "Visualizações" : "Tempo de exibição",
                      ]}
                      labelFormatter={(date) => date}
                    />
                    <Area
                      type="monotone"
                      dataKey="views"
                      stroke="#2563eb"
                      strokeWidth={2}
                      fill="url(#views)"
                    />
                    <Area
                      type="monotone"
                      dataKey="watch_time"
                      stroke="#7c3aed"
                      strokeWidth={2}
                      fill="url(#watchTime)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </article>

          {/* CTR e Duração Média */}
          <article className="panel chart-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Qualidade</p>
                <h2>CTR e Retenção</h2>
              </div>
            </div>
            <div className="chart-box" style={{ height: "320px" }}>
              {loading ? (
                <div className="chart-placeholder" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                    <CartesianGrid stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                    <YAxis
                      yAxisId="left"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => v + "%"}
                      domain={[0, "dataMax + 1"]}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => formatDuration(v)}
                      domain={[0, "dataMax + 30"]}
                    />
                    <Tooltip
                      formatter={(value: any, name: any) => [
                        name === "ctr" ? Number(value).toFixed(2) + "%" : formatDuration(Number(value)),
                        name === "ctr" ? "CTR" : "Duração média",
                      ]}
                      labelFormatter={(date) => date}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="ctr"
                      stroke="#dc2626"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="avg_view_duration"
                      stroke="#0891b2"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </article>
        </section>

        {/* Segunda linha de gráficos */}
        <section className="dashboard-grid">
          {/* Distribuição de Engajamento */}
          <article className="panel chart-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Engajamento</p>
                <h2>Distribuição de Interações</h2>
              </div>
            </div>
            <div className="chart-box" style={{ height: "320px" }}>
              {loading ? (
                <div className="chart-placeholder" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={engagementData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(1)}%`}
                      labelLine={false}
                    >
                      {engagementData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: any) => [formatNumber(Number(value)), ""]}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </article>

          {/* Top Vídeos */}
          <article className="panel chart-panel wide-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Top Performers</p>
                <h2>Vídeos com Mais Visualizações</h2>
              </div>
            </div>
            <div className="chart-box" style={{ height: "320px" }}>
              {loading ? (
                <div className="chart-placeholder" />
              ) : topVideos.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topVideos.slice(0, 8).reverse()}
                    layout="vertical"
                    margin={{ left: 8, right: 8, top: 10, bottom: 0 }}
                  >
                    <CartesianGrid stroke="#e5e7eb" horizontal={false} />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} tickFormatter={formatNumber} />
                    <YAxis
                      type="category"
                      dataKey="title"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11 }}
                      width={180}
                      tickFormatter={(title) => title.length > 35 ? title.slice(0, 35) + "..." : title}
                    />
                    <Tooltip
                      formatter={(value: any) => [formatNumber(Number(value)), "Visualizações"]}
                    />
                    <Bar dataKey="views" fill="#0f766e" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-state" style={{ padding: "40px" }}>
                  <p>Nenhum vídeo publicado no período</p>
                </div>
              )}
            </div>
          </article>
        </section>

        {/* Terceira linha: Canais e Top vídeos detalhados */}
        <section className="dashboard-grid">
          {/* Performance por Canal */}
          <article className="panel chart-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Canais</p>
                <h2>Performance por Canal</h2>
              </div>
            </div>
            <div className="chart-box" style={{ height: "320px" }}>
              {loading ? (
                <div className="chart-placeholder" />
              ) : channelData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channelData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                    <CartesianGrid stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} tickFormatter={formatNumber} />
                    <Tooltip formatter={(value: any) => [formatNumber(Number(value)), "Visualizações"]} />
                    <Legend />
                    <Bar dataKey="views" fill="#2563eb" name="Visualizações" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="subscribers" fill="#0f766e" name="Inscritos" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-state" style={{ padding: "40px" }}>
                  <p>Nenhum canal conectado</p>
                </div>
              )}
            </div>
          </article>

          {/* Crescimento de Inscritos */}
          <article className="panel chart-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Crescimento</p>
                <h2>Inscritos por Dia</h2>
              </div>
            </div>
            <div className="chart-box" style={{ height: "320px" }}>
              {loading ? (
                <div className="chart-placeholder" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                    <CartesianGrid stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: any) => [formatNumber(Number(value)), "Novos inscritos"]} />
                    <Bar dataKey="subscribers_gained" fill="#0f766e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </article>
        </section>

        {/* Tabela de Top Vídeos Detalhada */}
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Detalhamento</p>
              <h2>Top 10 Vídeos - Métricas Completas</h2>
            </div>
          </div>
          <div className="panel-body">
            <div className="videos-table-container">
              <table className="videos-table">
                <thead>
                  <tr>
                    <th>Vídeo</th>
                    <th>Publicado</th>
                    <th>Views</th>
                    <th>Tempo exib.</th>
                    <th>Duração méd.</th>
                    <th>CTR</th>
                    <th>Likes</th>
                    <th>Comentários</th>
                    <th>Compart.</th>
                    <th>Inscritos</th>
                  </tr>
                </thead>
                <tbody>
                  {topVideos.map((video, index) => (
                    <tr key={video.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <div style={{ width: "60px", height: "34px", background: "#ecfdf5", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontSize: "10px", color: "#0f766e", fontWeight: 600 }}>{index + 1}</span>
                          </div>
                          <div>
                            <strong style={{ fontSize: "13px" }}>{video.title.length > 50 ? video.title.slice(0, 50) + "..." : video.title}</strong>
                            <div style={{ fontSize: "11px", color: "#9ca3af", fontFamily: "monospace" }}>{video.youtube_video_id}</div>
                          </div>
                        </div>
                      </td>
                      <td>{format(new Date(video.published_at), "dd/MM/yyyy", { locale: ptBR })}</td>
                      <td>{formatNumber(video.views)}</td>
                      <td>{formatNumber(video.watch_time_minutes)} min</td>
                      <td>{formatDuration(video.average_view_duration)}</td>
                      <td>{video.ctr.toFixed(2)}%</td>
                      <td>{formatNumber(video.likes)}</td>
                      <td>{formatNumber(video.comments)}</td>
                      <td>{formatNumber(video.shares)}</td>
                      <td>{formatNumber(video.subscribers_gained || 0)}</td>
                    </tr>
                  ))}
                  {topVideos.length === 0 && (
                    <tr>
                      <td colSpan={10} style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}>
                        Nenhum vídeo publicado no período selecionado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <style jsx>{`
          .app-shell {
            display: grid;
            grid-template-columns: 260px 1fr;
            min-height: 100vh;
            background: #f8fafc;
          }
          .sidebar {
            background: #fff;
            border-right: 1px solid #e5e7eb;
            padding: 24px 16px;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .sidebar-brand {
            display: flex;
            align-items: center;
            gap: 10px;
            font-weight: 700;
            font-size: 18px;
            color: #0f766e;
            padding: 0 8px 16px;
            border-bottom: 1px solid #e5e7eb;
            margin-bottom: 8px;
          }
          .sidebar-nav a {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 12px;
            border-radius: 8px;
            color: #6b7280;
            text-decoration: none;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.15s;
          }
          .sidebar-nav a:hover {
            background: #f1f5f9;
            color: #0f766e;
          }
          .sidebar-nav a.active {
            background: #ecfdf5;
            color: #0f766e;
          }
          .workspace {
            padding: 32px;
            overflow-y: auto;
          }
          .workspace-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 32px;
            flex-wrap: wrap;
            gap: 16px;
          }
          .eyebrow {
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #6b7280;
            margin-bottom: 4px;
          }
          .workspace-header h1 {
            font-size: 28px;
            font-weight: 700;
            color: #111827;
          }
          .workspace-actions {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .date-picker-wrapper {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #6b7280;
          }
          .filter-select {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #6b7280;
          }
          .panel {
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            margin-bottom: 24px;
          }
          .panel-heading {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 20px 24px;
            border-bottom: 1px solid #e5e7eb;
          }
          .panel-heading h2 {
            font-size: 18px;
            font-weight: 600;
            color: #111827;
          }
          .panel-body {
            padding: 24px;
          }
          .chart-panel {
            height: 100%;
          }
          .wide-panel {
            grid-column: span 2;
          }
          .chart-box {
            width: 100%;
          }
          .chart-placeholder {
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #d1d5db;
          }
          .metric-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
          }
          .metric-card {
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            padding: 20px;
          }
          .dashboard-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 24px;
            margin-bottom: 24px;
          }
          @media (max-width: 1024px) {
            .dashboard-grid {
              grid-template-columns: 1fr;
            }
            .wide-panel {
              grid-column: span 1;
            }
          }
          .videos-table-container {
            overflow-x: auto;
          }
          .videos-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
          }
          .videos-table th {
            text-align: left;
            padding: 10px 12px;
            background: #f9fafb;
            border-bottom: 1px solid #e5e7eb;
            font-weight: 600;
            color: #374151;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .videos-table td {
            padding: 10px 12px;
            border-bottom: 1px solid #f3f4f6;
            vertical-align: middle;
          }
          .videos-table tr:last-child td {
            border-bottom: none;
          }
          .loading-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 60px;
            gap: 12px;
            color: #6b7280;
          }
          .spin { animation: spin 1s linear infinite; }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          .empty-state {
            text-align: center;
            padding: 40px 24px;
            color: #9ca3af;
          }
          .empty-state svg { margin-bottom: 16px; color: #d1d5db; }
          .empty-state h3 { font-size: 18px; font-weight: 600; color: #111827; margin-bottom: 8px; }
        `}</style>
      </section>
    </main>
  );
}

function AnalyticsPageSuspenseFallback() {
  return (
    <div className="loading-state">
      <Loader2 size={24} className="spin" />
      <p>Carregando analytics...</p>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<AnalyticsPageSuspenseFallback />}>
      <AnalyticsPageContent />
    </Suspense>
  );
}