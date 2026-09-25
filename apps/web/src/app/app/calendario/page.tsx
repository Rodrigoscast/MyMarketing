"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileVideo,
  Grid3X3,
  ListChecks,
  Loader2,
  Lock,
  Menu,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Video,
  X,
} from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { LoadingState } from "@/components/LoadingState";
import { apiFetch } from "@/lib/api";

type ViewMode = "month" | "week" | "day";
type VideoStatus = "draft" | "scheduled" | "publishing" | "published" | "failed" | "cancelled";
type StatusFilter = "all" | VideoStatus;

interface VideoItem {
  id: string;
  title: string;
  status: VideoStatus;
  publish_at: string | null;
  privacy_status: "private" | "unlisted" | "public";
  thumbnail_path: string | null;
  social_account_id: string;
  channel_name?: string;
  asset_id: string | null;
  youtube_error: string | null;
}

interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  status: VideoStatus;
  videoId: string;
  channelName?: string;
  privacyStatus: VideoItem["privacy_status"];
}

const STATUS_META: Record<VideoStatus, { label: string; className: string; icon: typeof Clock }> = {
  draft: { label: "Rascunho", className: "status-draft", icon: Clock },
  scheduled: { label: "Agendado", className: "status-scheduled", icon: Calendar },
  publishing: { label: "Publicando", className: "status-publishing", icon: Loader2 },
  published: { label: "Publicado", className: "status-published", icon: CheckCircle },
  failed: { label: "Falhou", className: "status-failed", icon: AlertCircle },
  cancelled: { label: "Cancelado", className: "status-cancelled", icon: X },
};

const FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "draft", label: "Rascunhos" },
  { value: "scheduled", label: "Agendados" },
  { value: "published", label: "Publicados" },
  { value: "failed", label: "Falhas" },
];

function getChannelName(value: unknown) {
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0]?.account_name;
  if (typeof value === "object" && "account_name" in value) {
    return String((value as { account_name?: string }).account_name ?? "");
  }
  return undefined;
}

function formatRangeLabel(date: Date, viewMode: ViewMode) {
  if (viewMode === "month") return format(date, "MMMM yyyy", { locale: ptBR });
  if (viewMode === "week") {
    const weekStart = startOfWeek(date);
    const weekEnd = endOfWeek(date);
    return `${format(weekStart, "dd MMM", { locale: ptBR })} - ${format(weekEnd, "dd MMM yyyy", { locale: ptBR })}`;
  }
  return format(date, "EEEE, dd MMMM yyyy", { locale: ptBR });
}

function scheduledAtForDrop(targetDate: Date, video: VideoItem) {
  const next = new Date(targetDate);
  const source = video.publish_at ? new Date(video.publish_at) : null;
  const hasSource = source && !Number.isNaN(source.getTime());
  next.setHours(hasSource ? source.getHours() : 10);
  next.setMinutes(hasSource ? source.getMinutes() : 0);
  next.setSeconds(0, 0);
  return next.toISOString();
}

function StatusBadge({ status }: { status: VideoStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className={`status-badge ${meta.className}`}>
      <Icon size={13} className={status === "publishing" ? "spin" : ""} />
      {meta.label}
    </span>
  );
}

function PrivacyIcon({ status }: { status: VideoItem["privacy_status"] }) {
  if (status === "public") return <Eye size={14} />;
  if (status === "unlisted") return <ListChecks size={14} />;
  return <Lock size={14} />;
}

function VideoRow({
  video,
  compact = false,
  onOpen,
  onDragStart,
}: {
  video: VideoItem;
  compact?: boolean;
  onOpen: () => void;
  onDragStart?: (event: React.DragEvent) => void;
}) {
  return (
    <button
      type="button"
      className={`video-row ${compact ? "compact" : ""}`}
      onClick={onOpen}
      draggable={Boolean(onDragStart)}
      onDragStart={onDragStart}
    >
      <span className="video-row-icon">
        <Video size={16} />
      </span>
      <span className="video-row-main">
        <strong>{video.title}</strong>
        <small>
          {video.publish_at ? format(parseISO(video.publish_at), "dd/MM HH:mm") : "Sem data"}
          {video.channel_name ? ` - ${video.channel_name}` : ""}
        </small>
      </span>
      <span className="row-actions">
        <PrivacyIcon status={video.privacy_status} />
        <StatusBadge status={video.status} />
      </span>
    </button>
  );
}

function CalendarEventPill({ event, onClick }: { event: CalendarEvent; onClick: () => void }) {
  return (
    <button type="button" className={`event-pill ${STATUS_META[event.status].className}`} onClick={onClick}>
      <span>{format(event.date, "HH:mm")}</span>
      <strong>{event.title}</strong>
    </button>
  );
}

function MonthCell({
  date,
  events,
  currentDate,
  selectedDate,
  dropTargetDate,
  onSelect,
  onEventClick,
  onDragOver,
  onDrop,
}: {
  date: Date;
  events: CalendarEvent[];
  currentDate: Date;
  selectedDate: Date;
  dropTargetDate: Date | null;
  onSelect: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
  onDragOver: (event: React.DragEvent, date: Date) => void;
  onDrop: (event: React.DragEvent, date: Date) => void;
}) {
  const isToday = isSameDay(date, new Date());
  const isSelected = isSameDay(date, selectedDate);
  const isDropTarget = dropTargetDate && isSameDay(date, dropTargetDate);

  return (
    <div
      className={[
        "calendar-cell",
        !isSameMonth(date, currentDate) ? "muted" : "",
        isToday ? "today" : "",
        isSelected ? "selected" : "",
        isDropTarget ? "drop-target" : "",
      ].join(" ")}
      onDragOver={(event) => onDragOver(event, date)}
      onDrop={(event) => onDrop(event, date)}
    >
      <button type="button" className="date-button" onClick={() => onSelect(date)}>
        <span>{format(date, "d")}</span>
        {events.length > 0 && <em>{events.length}</em>}
      </button>
      <div className="cell-events">
        {events.slice(0, 3).map((event) => (
          <CalendarEventPill key={event.id} event={event} onClick={() => onEventClick(event)} />
        ))}
        {events.length > 3 && <span className="more-events">+{events.length - 3} mais</span>}
      </div>
    </div>
  );
}

export default function CalendarioPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draggedVideo, setDraggedVideo] = useState<VideoItem | null>(null);
  const [dropTargetDate, setDropTargetDate] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await apiFetch<{ data: any[] }>("/api/videos");
      const nextVideos = (response.data ?? []).map((video) => ({
        id: video.id,
        title: video.title,
        status: video.status,
        publish_at: video.publish_at,
        privacy_status: video.privacy_status,
        thumbnail_path: video.thumbnail_path,
        social_account_id: video.social_account_id,
        channel_name: getChannelName(video.social_accounts),
        asset_id: video.asset_id,
        youtube_error: video.youtube_error,
      })) as VideoItem[];
      setVideos(nextVideos);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      setErrorMessage(error instanceof Error ? error.message : "Falha ao carregar calendario");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const events = useMemo<CalendarEvent[]>(() => {
    return videos
      .filter((video) => video.publish_at)
      .map((video) => ({
        id: video.id,
        title: video.title,
        date: parseISO(video.publish_at!),
        status: video.status,
        videoId: video.id,
        channelName: video.channel_name,
        privacyStatus: video.privacy_status,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [videos]);

  const filteredVideos = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return videos.filter((video) => {
      const matchesStatus = statusFilter === "all" || video.status === statusFilter;
      const matchesQuery =
        !normalizedQuery ||
        video.title.toLowerCase().includes(normalizedQuery) ||
        video.channel_name?.toLowerCase().includes(normalizedQuery);
      return matchesStatus && matchesQuery;
    });
  }, [query, statusFilter, videos]);

  const unscheduledVideos = useMemo(() => {
    return filteredVideos.filter((video) => !video.publish_at && ["draft", "failed"].includes(video.status));
  }, [filteredVideos]);

  const selectedEvents = useMemo(() => {
    return events.filter((event) => isSameDay(event.date, selectedDate));
  }, [events, selectedDate]);

  const counts = useMemo(() => {
    return {
      total: videos.length,
      scheduled: videos.filter((video) => video.status === "scheduled").length,
      published: videos.filter((video) => video.status === "published").length,
      drafts: videos.filter((video) => video.status === "draft").length,
      failed: videos.filter((video) => video.status === "failed").length,
    };
  }, [videos]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);
    return Array.from({ length: differenceInDays(calendarEnd, calendarStart) + 1 }, (_, index) =>
      addDays(calendarStart, index)
    );
  }, [currentDate]);

  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(currentDate);
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }, [currentDate]);

  const visibleDays = viewMode === "month" ? calendarDays : viewMode === "week" ? weekDays : [currentDate];

  const navigate = (direction: number) => {
    if (viewMode === "month") setCurrentDate(direction > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    if (viewMode === "week") setCurrentDate(direction > 0 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    if (viewMode === "day") setCurrentDate(addDays(currentDate, direction));
  };

  const openVideo = (videoId: string) => {
    window.location.href = `/app/videos?edit=${videoId}`;
  };

  const handleDragStart = (event: React.DragEvent, video: VideoItem) => {
    setDraggedVideo(video);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (event: React.DragEvent, date: Date) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetDate(date);
  };

  const handleDrop = async (event: React.DragEvent, date: Date) => {
    event.preventDefault();
    if (!draggedVideo) return;

    try {
      await apiFetch(`/api/videos/${draggedVideo.id}/schedule`, {
        method: "POST",
        body: JSON.stringify({
          scheduledFor: scheduledAtForDrop(date, draggedVideo),
          timezone: "America/Sao_Paulo",
        }),
      });
      await fetchData();
    } catch (error) {
      console.error("Erro ao agendar:", error);
      setErrorMessage(error instanceof Error ? error.message : "Falha ao agendar video");
    } finally {
      setDraggedVideo(null);
      setDropTargetDate(null);
    }
  };

  const eventsForDate = (date: Date) => events.filter((event) => isSameDay(event.date, date));

  return (
    <main className="app-shell">
      <AppSidebar />

      <section className="workspace calendar-workspace">
        <header className="workspace-header calendar-header">
          <div>
            <p className="eyebrow">Planejamento YouTube</p>
            <h1>Calendario editorial</h1>
            <p className="header-copy">Organize rascunhos, agendamentos e publicacoes em uma visao unica.</p>
          </div>
          <div className="workspace-actions">
            <button className="secondary-button compact-button" type="button" onClick={fetchData} disabled={loading}>
              {loading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
              Atualizar
            </button>
            <a className="primary-button compact-button" href="/app/videos">
              <Plus size={16} /> Novo video
            </a>
          </div>
        </header>

        <section className="calendar-stats" aria-label="Resumo do calendario">
          <article>
            <span>Total</span>
            <strong>{counts.total}</strong>
          </article>
          <article>
            <span>Agendados</span>
            <strong>{counts.scheduled}</strong>
          </article>
          <article>
            <span>Publicados</span>
            <strong>{counts.published}</strong>
          </article>
          <article>
            <span>Rascunhos</span>
            <strong>{counts.drafts}</strong>
          </article>
          <article>
            <span>Falhas</span>
            <strong>{counts.failed}</strong>
          </article>
        </section>

        {errorMessage && (
          <div className="calendar-alert">
            <AlertCircle size={18} />
            <span>{errorMessage}</span>
            <button type="button" onClick={() => setErrorMessage(null)} aria-label="Fechar aviso">
              <X size={16} />
            </button>
          </div>
        )}

        <section className="calendar-layout">
          <aside className={`planner-panel ${drawerOpen ? "open" : ""}`}>
            <div className="panel-heading compact-heading">
              <div>
                <p className="eyebrow">Fila de conteudo</p>
                <h2>Videos</h2>
              </div>
              <button className="icon-button drawer-close" type="button" onClick={() => setDrawerOpen(false)} aria-label="Fechar painel">
                <X size={16} />
              </button>
            </div>

            <label className="calendar-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar video ou canal"
              />
            </label>

            <div className="filter-row" role="tablist" aria-label="Filtrar videos">
              {FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={statusFilter === filter.value ? "active" : ""}
                  onClick={() => setStatusFilter(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="unscheduled-box">
              <div className="mini-panel-heading">
                <strong>Arraste para agendar</strong>
                <span>{unscheduledVideos.length}</span>
              </div>
              <div className="video-list">
                {loading ? (
                  <LoadingState label="Carregando vídeos..." variant="inline" />
                ) : unscheduledVideos.length > 0 ? (
                  unscheduledVideos.map((video) => (
                    <VideoRow
                      key={video.id}
                      video={video}
                      onOpen={() => openVideo(video.id)}
                      onDragStart={(event) => handleDragStart(event, video)}
                    />
                  ))
                ) : (
                  <div className="empty-state">
                    <FileVideo size={28} />
                    <p>Nenhum rascunho disponivel</p>
                    <a href="/app/videos">Criar video</a>
                  </div>
                )}
              </div>
            </div>

            <div className="today-box">
              <div className="mini-panel-heading">
                <strong>{format(selectedDate, "dd MMM", { locale: ptBR })}</strong>
                <span>{selectedEvents.length}</span>
              </div>
              <div className="video-list">
                {selectedEvents.length > 0 ? (
                  selectedEvents.map((event) => {
                    const video = videos.find((item) => item.id === event.videoId);
                    if (!video) return null;
                    return <VideoRow key={event.id} video={video} compact onOpen={() => openVideo(video.id)} />;
                  })
                ) : (
                  <div className="empty-state compact">
                    <Clock size={24} />
                    <p>Nada planejado nesse dia</p>
                  </div>
                )}
              </div>
            </div>
          </aside>

          <section className="calendar-main panel">
            <div className="calendar-toolbar">
              <button className="secondary-button compact-button mobile-menu" type="button" onClick={() => setDrawerOpen(true)}>
                <Menu size={16} /> Fila
              </button>
              <div className="range-controls">
                <button className="icon-button" type="button" onClick={() => navigate(-1)} aria-label="Periodo anterior">
                  <ChevronLeft size={18} />
                </button>
                <button
                  className="secondary-button compact-button"
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    setCurrentDate(now);
                    setSelectedDate(now);
                  }}
                >
                  Hoje
                </button>
                <button className="icon-button" type="button" onClick={() => navigate(1)} aria-label="Proximo periodo">
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className="calendar-title">
                <p className="eyebrow">Periodo</p>
                <h2>{formatRangeLabel(currentDate, viewMode)}</h2>
              </div>
              <div className="view-switch" role="tablist" aria-label="Modo de visualizacao">
                {(["month", "week", "day"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={viewMode === mode ? "active" : ""}
                    onClick={() => setViewMode(mode)}
                  >
                    {mode === "month" && <Grid3X3 size={15} />}
                    {mode === "week" && <ListChecks size={15} />}
                    {mode === "day" && <PlayCircle size={15} />}
                    {mode === "month" ? "Mes" : mode === "week" ? "Semana" : "Dia"}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <LoadingState label="Carregando calendário..." />
            ) : (
              <>
                {viewMode !== "day" && (
                  <div className={`calendar-grid ${viewMode}`}>
                    {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map((day) => (
                      <span key={day} className="weekday">
                        {day}
                      </span>
                    ))}
                    {visibleDays.map((date) => (
                      <MonthCell
                        key={date.toISOString()}
                        date={date}
                        events={eventsForDate(date)}
                        currentDate={currentDate}
                        selectedDate={selectedDate}
                        dropTargetDate={dropTargetDate}
                        onSelect={(nextDate) => {
                          setSelectedDate(nextDate);
                          setCurrentDate(nextDate);
                        }}
                        onEventClick={(event) => openVideo(event.videoId)}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                      />
                    ))}
                  </div>
                )}

                {viewMode === "day" && (
                  <div className="day-board" onDragOver={(event) => handleDragOver(event, currentDate)} onDrop={(event) => handleDrop(event, currentDate)}>
                    {Array.from({ length: 14 }, (_, index) => index + 7).map((hour) => {
                      const hourEvents = eventsForDate(currentDate).filter((event) => event.date.getHours() === hour);
                      return (
                        <div className="hour-row" key={hour}>
                          <time>{String(hour).padStart(2, "0")}:00</time>
                          <div className="hour-lane">
                            {hourEvents.map((event) => (
                              <CalendarEventPill key={event.id} event={event} onClick={() => openVideo(event.videoId)} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        </section>
      </section>

      <style jsx global>{`
        .sidebar-brand {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-size: 20px;
          font-weight: 850;
        }

        .calendar-workspace {
          max-width: 1520px;
          background:
            radial-gradient(circle at 86% 0%, rgba(15, 118, 110, 0.08), transparent 23rem),
            transparent;
        }

        .calendar-header {
          align-items: flex-start;
          padding-bottom: 4px;
        }

        .calendar-header h1 {
          margin: 8px 0 0;
          color: #102a43;
          font-size: clamp(30px, 3vw, 42px);
          letter-spacing: -0.03em;
        }

        .header-copy {
          margin: 8px 0 0;
          color: var(--muted);
        }

        .calendar-stats {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 14px;
        }

        .calendar-stats article {
          position: relative;
          overflow: hidden;
          min-height: 96px;
          padding: 16px;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.88);
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
        }

        .calendar-stats article::after {
          position: absolute;
          right: -18px;
          bottom: -26px;
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: #e6f7f2;
          content: "";
        }

        .calendar-stats article:nth-child(2)::after {
          background: #e8efff;
        }

        .calendar-stats article:nth-child(3)::after {
          background: #fff1dc;
        }

        .calendar-stats article:nth-child(4)::after {
          background: #f0f4f8;
        }

        .calendar-stats article:nth-child(5)::after {
          background: #ffe8e8;
        }

        .calendar-stats span,
        .video-row small,
        .mini-panel-heading span {
          color: var(--muted);
          font-size: 13px;
        }

        .calendar-stats strong {
          display: block;
          margin-top: 10px;
          color: #102a43;
          font-size: 28px;
          line-height: 1;
        }

        .calendar-alert {
          display: grid;
          grid-template-columns: 20px 1fr 32px;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
          padding: 12px;
          color: #991b1b;
          border: 1px solid #fecaca;
          border-radius: 8px;
          background: #fff1f2;
        }

        .calendar-alert button {
          display: grid;
          width: 32px;
          height: 32px;
          place-items: center;
          color: inherit;
          border: 0;
          background: transparent;
        }

        .calendar-layout {
          display: grid;
          grid-template-columns: 360px minmax(0, 1fr);
          gap: 14px;
          align-items: start;
        }

        .planner-panel {
          position: sticky;
          top: 18px;
          display: grid;
          gap: 14px;
          max-height: calc(100vh - 36px);
          overflow: auto;
          padding: 18px;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.92);
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
        }

        .compact-heading {
          margin-bottom: 0;
          padding-bottom: 4px;
          border-bottom: 1px solid #edf2f7;
        }

        .drawer-close,
        .mobile-menu {
          display: none;
        }

        .calendar-search {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 42px;
          padding: 0 12px;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: #f8fafc;
        }

        .calendar-search input {
          width: 100%;
          border: 0;
          outline: 0;
          background: transparent;
        }

        .filter-row,
        .view-switch {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .filter-row {
          padding-bottom: 4px;
        }

        .filter-row button,
        .view-switch button {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: 34px;
          padding: 0 10px;
          color: #475569;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: white;
          font-size: 13px;
          font-weight: 800;
        }

        .filter-row button.active,
        .view-switch button.active {
          color: var(--teal-dark);
          border-color: #8ddbd0;
          background: var(--soft-teal);
        }

        .unscheduled-box,
        .today-box {
          display: grid;
          gap: 10px;
          padding: 14px;
          border: 1px solid #e5edf3;
          border-radius: 8px;
          background: #fbfdfd;
        }

        .today-box {
          background: #f7fbff;
          border-color: #dce9f7;
        }

        .unscheduled-box,
        .today-box {
          padding-top: 4px;
        }

        .mini-panel-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .mini-panel-heading strong {
          font-size: 14px;
        }

        .video-list {
          display: grid;
          gap: 10px;
        }

        .video-row {
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr) auto;
          align-items: center;
          gap: 10px;
          width: 100%;
          min-height: 68px;
          padding: 10px;
          text-align: left;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: white;
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.035);
          transition:
            transform 160ms ease,
            border-color 160ms ease,
            box-shadow 160ms ease;
        }

        .video-row:hover {
          transform: translateY(-1px);
          border-color: #8ddbd0;
          background: #f0fdfa;
          box-shadow: 0 8px 18px rgba(15, 118, 110, 0.1);
        }

        .video-row.compact {
          min-height: 58px;
        }

        .video-row-icon {
          display: grid;
          width: 34px;
          height: 34px;
          place-items: center;
          color: var(--teal-dark);
          border-radius: 8px;
          background: var(--soft-teal);
        }

        .video-row-main {
          min-width: 0;
        }

        .video-row-main strong,
        .event-pill strong {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .row-actions {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #64748b;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          min-height: 26px;
          padding: 0 8px;
          border: 1px solid transparent;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 850;
          white-space: nowrap;
        }

        .status-draft {
          color: #475569;
          border-color: #dbe3ef;
          background: #f1f5f9;
        }

        .status-scheduled {
          color: #1d4ed8;
          border-color: #bfdbfe;
          background: #eff6ff;
        }

        .status-publishing {
          color: #92400e;
          border-color: #fde68a;
          background: #fffbeb;
        }

        .status-published {
          color: #065f46;
          border-color: #a7f3d0;
          background: #ecfdf5;
        }

        .status-failed,
        .status-cancelled {
          color: #991b1b;
          border-color: #fecaca;
          background: #fff1f2;
        }

        .empty-state {
          display: grid;
          min-height: 140px;
          place-items: center;
          gap: 8px;
          padding: 18px;
          color: var(--muted);
          text-align: center;
          border: 1px dashed #cbd5e1;
          border-radius: 8px;
          background: #f8fafc;
        }

        .empty-state.compact {
          min-height: 92px;
        }

        .empty-state p {
          margin: 0;
        }

        .empty-state a {
          color: var(--teal-dark);
          font-weight: 850;
        }

        .calendar-main {
          min-width: 0;
          padding: 18px;
          border-color: #d7e3ec;
          background: rgba(255, 255, 255, 0.94);
          box-shadow: 0 16px 38px rgba(15, 23, 42, 0.07);
        }

        .calendar-toolbar {
          display: grid;
          grid-template-columns: auto minmax(220px, 1fr) auto;
          align-items: center;
          gap: 14px;
          margin-bottom: 18px;
          padding-bottom: 16px;
          border-bottom: 1px solid #e8eef3;
        }

        .range-controls {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .calendar-title h2 {
          margin: 4px 0 0;
          color: #102a43;
          font-size: 26px;
          letter-spacing: -0.02em;
          text-transform: capitalize;
        }

        .calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 1px;
          overflow: hidden;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: #dbe5ed;
          box-shadow: 0 8px 22px rgba(15, 23, 42, 0.04);
        }

        .calendar-grid.week .calendar-cell {
          min-height: 440px;
        }

        .weekday {
          min-height: 38px;
          display: grid;
          place-items: center;
          color: #587083;
          background: #f1f6f8;
          font-size: 12px;
          font-weight: 850;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .calendar-cell {
          min-height: 142px;
          padding: 10px;
          background: white;
          transition:
            background 160ms ease,
            box-shadow 160ms ease;
        }

        .calendar-cell.muted {
          color: #94a3b8;
          background: #f6f9fa;
        }

        .calendar-cell.today {
          background: #f2fbf9;
        }

        .calendar-cell.selected {
          box-shadow: inset 0 0 0 2px var(--teal);
        }

        .calendar-cell.drop-target {
          background: #ecfdf5;
          box-shadow: inset 0 0 0 2px var(--teal);
        }

        .calendar-cell > .date-button {
          display: flex;
          flex: 0 0 auto;
          width: 100%;
          min-width: 0;
          min-height: 30px;
          align-items: center;
          justify-content: space-between;
          margin: 0;
          padding: 0;
          color: #29465b;
          border: 0;
          background: transparent;
          appearance: none;
          font-weight: 850;
          text-align: left;
          transition:
            color 140ms ease,
            background 140ms ease;
        }

        .calendar-cell > .date-button:hover {
          color: var(--teal-dark);
        }

        .calendar-cell > .date-button > span {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 28px;
          height: 28px;
          border-radius: 8px;
        }

        .calendar-cell.today > .date-button > span {
          color: white;
          background: var(--teal);
          box-shadow: 0 4px 10px rgba(15, 118, 110, 0.22);
        }

        .calendar-cell > .date-button em {
          min-width: 22px;
          height: 22px;
          display: grid;
          place-items: center;
          color: white;
          border-radius: 999px;
          background: var(--ink);
          font-size: 12px;
          font-style: normal;
        }

        .calendar-cell > .cell-events {
          display: grid;
          gap: 5px;
          margin-top: 8px;
        }

        .calendar-cell .event-pill,
        .hour-lane .event-pill {
          display: grid;
          grid-template-columns: 38px minmax(0, 1fr);
          align-items: center;
          gap: 6px;
          width: 100%;
          min-width: 0;
          min-height: 27px;
          margin: 0;
          padding: 0 7px;
          text-align: left;
          border-radius: 8px;
          border: 1px solid transparent;
          font-size: 12px;
          appearance: none;
          transition:
            transform 140ms ease,
            filter 140ms ease;
        }

        .calendar-cell .event-pill:hover,
        .hour-lane .event-pill:hover {
          transform: translateX(2px);
          filter: saturate(1.12);
        }

        .calendar-cell .event-pill > span,
        .hour-lane .event-pill > span {
          font-variant-numeric: tabular-nums;
          font-weight: 850;
        }

        .more-events {
          color: var(--muted);
          font-size: 12px;
          font-weight: 800;
        }

        .day-board {
          overflow: hidden;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: white;
        }

        .hour-row {
          display: grid;
          grid-template-columns: 78px minmax(0, 1fr);
          min-height: 58px;
          border-bottom: 1px solid var(--line);
        }

        .hour-row:last-child {
          border-bottom: 0;
        }

        .hour-row time {
          padding: 12px;
          color: var(--muted);
          text-align: right;
          border-right: 1px solid var(--line);
          font-size: 13px;
          font-weight: 800;
        }

        .hour-lane {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          padding: 9px;
          background: #f8fafc;
        }

        .hour-lane .event-pill {
          width: min(320px, 100%);
        }

        .spin {
          animation: spin 900ms linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 1180px) {
          .calendar-stats {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .calendar-layout {
            grid-template-columns: 1fr;
          }

          .planner-panel {
            position: fixed;
            inset: 0 auto 0 0;
            z-index: 30;
            width: min(380px, 92vw);
            max-height: none;
            border-radius: 0;
            transform: translateX(-105%);
            transition: transform 180ms ease;
          }

          .planner-panel.open {
            transform: translateX(0);
          }

          .drawer-close,
          .mobile-menu {
            display: inline-flex;
          }

          .calendar-toolbar {
            grid-template-columns: auto auto 1fr;
          }

          .view-switch {
            grid-column: 1 / -1;
          }
        }

        @media (max-width: 760px) {
          .calendar-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .calendar-toolbar {
            grid-template-columns: 1fr;
            align-items: stretch;
          }

          .range-controls,
          .view-switch {
            justify-content: space-between;
          }

          .calendar-grid {
            min-width: 760px;
          }

          .calendar-main {
            overflow-x: auto;
          }
        }
      `}</style>
    </main>
  );
}
