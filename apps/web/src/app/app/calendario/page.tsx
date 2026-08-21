"use client";

import { useState, useEffect, useCallback } from "react";
import { DayPicker } from "react-day-picker";
import { format, isSameDay, isSameMonth, parseISO, differenceInDays, addDays, addWeeks, subWeeks, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, ChevronLeft, ChevronRight, Plus, MoreHorizontal, Trash2, Edit, Clock, CheckCircle, AlertCircle, Loader2, Video, Grid, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";

type ViewMode = "month" | "week" | "day";

interface VideoItem {
  id: string;
  title: string;
  status: "draft" | "scheduled" | "publishing" | "published" | "failed";
  publish_at: string | null;
  thumbnail_path: string | null;
  social_account_id: string;
  channel_name?: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  status: VideoItem["status"];
  videoId: string;
  channelName?: string;
}

const STATUS_COLORS = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  scheduled: "bg-blue-100 text-blue-700 border-blue-200",
  publishing: "bg-yellow-100 text-yellow-700 border-yellow-200",
  published: "bg-green-100 text-green-700 border-green-200",
  failed: "bg-red-100 text-red-700 border-red-200",
};

const STATUS_LABELS = {
  draft: "Rascunho",
  scheduled: "Agendado",
  publishing: "Publicando",
  published: "Publicado",
  failed: "Falhou",
};

const STATUS_ICONS = {
  draft: Clock,
  scheduled: Calendar,
  publishing: Loader2,
  published: CheckCircle,
  failed: AlertCircle,
};

function StatusBadge({ status }: { status: VideoItem["status"] }) {
  const Icon = STATUS_ICONS[status];
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[status])}>
      <Icon className="w-3 h-3" />
      {STATUS_LABELS[status]}
    </span>
  );
}

function VideoCard({ video, onClick, onDragStart }: { video: VideoItem; onClick: () => void; onDragStart?: (e: React.DragEvent) => void }) {
  const Icon = STATUS_ICONS[video.status];
  return (
    <div
      className={cn("group relative bg-white border rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer", STATUS_COLORS[video.status].replace("bg-", "border-"))}
      onClick={onClick}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <Video className="w-4 h-4 text-gray-400" />
            <h4 className="font-medium text-sm truncate">{video.title}</h4>
          </div>
          {video.channel_name && (
            <p className="text-xs text-gray-500 truncate">{video.channel_name}</p>
          )}
        </div>
        <StatusBadge status={video.status} />
      </div>
      {video.publish_at && (
        <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
          <Calendar className="w-3 h-3" />
          <span>{format(parseISO(video.publish_at), "dd/MM HH:mm")}</span>
        </div>
      )}
    </div>
  );
}

function DayCell({ date, events, onEventClick, onDateClick, isCurrentMonth, isToday, selectedDate, onDragOver, onDrop }: {
  date: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onDateClick: (date: Date) => void;
  isCurrentMonth: boolean;
  isToday: boolean;
  selectedDate?: Date;
  onDragOver: (e: React.DragEvent, date: Date) => void;
  onDrop: (e: React.DragEvent, date: Date) => void;
}) {
  const isSelected = selectedDate && isSameDay(date, selectedDate);

  return (
    <button
      type="button"
      className={cn(
        "relative min-h-[100px] p-2 flex flex-col",
        "border border-gray-100 bg-white hover:bg-gray-50 transition-colors",
        !isCurrentMonth && "bg-gray-50 text-gray-400",
        isToday && "bg-blue-50 border-blue-200",
        isSelected && "ring-2 ring-blue-500"
      )}
      onClick={() => onDateClick(date)}
      onDragOver={(e) => onDragOver(e, date)}
      onDrop={(e) => onDrop(e, date)}
    >
      <span className={cn("text-sm font-medium", isToday && "text-blue-600", !isCurrentMonth && "text-gray-300")}>
        {format(date, "d")}
      </span>
      <div className="flex-1 overflow-y-auto space-y-1 mt-1">
        {events.slice(0, 3).map((event) => (
          <div
            key={event.id}
            className={cn("px-1.5 py-0.5 rounded text-xs truncate cursor-pointer", STATUS_COLORS[event.status])}
            onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
          >
            {event.title}
          </div>
        ))}
        {events.length > 3 && (
          <div className="text-xs text-gray-500 text-center pt-1">
            +{events.length - 3} mais
          </div>
        )}
      </div>
    </button>
  );
}

function WeekCell({ date, events, onEventClick, onDateClick, isCurrentMonth, isToday, selectedDate, onDragOver, onDrop }: {
  date: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onDateClick: (date: Date) => void;
  isCurrentMonth: boolean;
  isToday: boolean;
  selectedDate?: Date;
  onDragOver: (e: React.DragEvent, date: Date) => void;
  onDrop: (e: React.DragEvent, date: Date) => void;
}) {
  const isSelected = selectedDate && isSameDay(date, selectedDate);

  return (
    <button
      type="button"
      className={cn(
        "relative min-h-[120px] p-2 flex flex-col",
        "border border-gray-100 bg-white hover:bg-gray-50 transition-colors",
        !isCurrentMonth && "bg-gray-50 text-gray-400",
        isToday && "bg-blue-50 border-blue-200",
        isSelected && "ring-2 ring-blue-500"
      )}
      onClick={() => onDateClick(date)}
      onDragOver={(e) => onDragOver(e, date)}
      onDrop={(e) => onDrop(e, date)}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={cn("text-sm font-medium", isToday && "text-blue-600", !isCurrentMonth && "text-gray-300")}>
          {format(date, "d")}
        </span>
        <span className="text-xs text-gray-400">{format(date, "EEE")}</span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-1">
        {events.slice(0, 4).map((event) => (
          <div
            key={event.id}
            className={cn("px-1.5 py-0.5 rounded text-xs truncate cursor-pointer", STATUS_COLORS[event.status])}
            onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
          >
            {event.title}
          </div>
        ))}
        {events.length > 4 && (
          <div className="text-xs text-gray-500 text-center pt-1">
            +{events.length - 4} mais
          </div>
        )}
      </div>
    </button>
  );
}

function DayView({ date, events, onEventClick, onDateClick, onDragOver, onDrop }: {
  date: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onDateClick: (date: Date) => void;
  onDragOver: (e: React.DragEvent, date?: Date) => void;
  onDrop: (e: React.DragEvent, date: Date) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="border border-gray-100 bg-white" onDragOver={(e) => onDragOver(e, date)} onDrop={(e) => onDrop(e, date)}>
      <div className="grid grid-cols-[60px_1fr] border-b border-gray-100">
        <div className="p-2 text-right text-sm text-gray-500 border-r border-gray-100">
          <div className="h-12"></div>
        </div>
        <div className="p-2 border-r border-gray-100">
          <h3 className="font-medium">{format(date, "EEEE, dd MMMM yyyy", { locale: ptBR })}</h3>
        </div>
      </div>
      <div className="grid grid-cols-[60px_1fr]">
        <div className="border-r border-gray-100">
          {hours.map((hour) => (
            <div key={hour} className="h-12 border-b border-gray-100 p-1 text-right text-xs text-gray-500">
              {hour.toString().padStart(2, "0")}:00
            </div>
          ))}
        </div>
        <div className="relative">
          {hours.map((hour) => (
            <div key={hour} className="h-12 border-b border-gray-100 border-r border-gray-100 relative">
              {events
                .filter((e) => {
                  const eventHour = new Date(e.date).getHours();
                  return eventHour === hour;
                })
                .map((event, idx) => (
                  <div
                    key={event.id}
                    className={cn("absolute left-1 right-1 px-2 py-1 rounded text-xs cursor-pointer z-10", STATUS_COLORS[event.status])}
                    style={{ top: `${idx * 28 + 4}px` }}
                    onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                  >
                    {format(event.date, "HH:mm")} - {event.title}
                  </div>
                ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CalendarioPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [draggedVideo, setDraggedVideo] = useState<VideoItem | null>(null);
  const [dropTargetDate, setDropTargetDate] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [videosRes, eventsRes] = await Promise.all([
        fetch("/api/videos?status=all"),
        fetch("/api/scheduler/queue"),
      ]);

      const videosData = await videosRes.json();
      const eventsData = await eventsRes.json();

      if (videosData.data) {
        const videoItems: VideoItem[] = videosData.data.map((v: any) => ({
          id: v.id,
          title: v.title,
          status: v.status,
          publish_at: v.publish_at,
          thumbnail_path: v.thumbnail_path,
          social_account_id: v.social_account_id,
          channel_name: v.social_accounts?.[0]?.account_name,
        }));
        setVideos(videoItems);

        const calendarEvents: CalendarEvent[] = videoItems
          .filter(v => v.publish_at && (v.status === "scheduled" || v.status === "published"))
          .map(v => ({
            id: v.id,
            title: v.title,
            date: parseISO(v.publish_at!),
            status: v.status,
            videoId: v.id,
            channelName: v.channel_name,
          }));
        setEvents(calendarEvents);
      }
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const navigate = (amount: number) => {
    if (viewMode === "month") {
      setCurrentDate(addMonths(currentDate, amount));
    } else if (viewMode === "week") {
      setCurrentDate(addWeeks(currentDate, amount));
    } else {
      setCurrentDate(addDays(currentDate, amount));
    }
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setSidebarOpen(true);
  };

  const handleEventClick = (event: CalendarEvent) => {
    // Navegar para o vídeo
    window.location.href = `/app/videos?id=${event.videoId}`;
  };

  const handleDragStart = (e: React.DragEvent, video: VideoItem) => {
    setDraggedVideo(video);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, date?: Date) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (date) setDropTargetDate(date);
  };

  const handleDrop = async (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    if (!draggedVideo) return;

    try {
      const res = await fetch(`/api/videos/${draggedVideo.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledFor: date.toISOString(),
          timezone: "America/Sao_Paulo",
        }),
      });

      if (!res.ok) throw new Error("Falha ao agendar");

      fetchData();
      setDraggedVideo(null);
      setDropTargetDate(null);
    } catch (error) {
      console.error("Erro ao agendar:", error);
      alert("Falha ao agendar vídeo");
    }
  };

  const handleDragEnd = () => {
    setDraggedVideo(null);
    setDropTargetDate(null);
  };

  // Filtrar eventos para o mês/semana atual
  const getEventsForDate = (date: Date) => {
    return events.filter(e => isSameDay(e.date, date));
  };

  const getEventsForWeek = (weekStart: Date) => {
    const weekEnd = addDays(weekStart, 6);
    return events.filter(e => e.date >= weekStart && e.date <= weekEnd);
  };

  // Mês atual
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);

  // Semana atual
  const weekStart = startOfWeek(currentDate);
  const weekEnd = endOfWeek(currentDate);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[calc(100vh-4rem)]">
      {/* Sidebar com vídeos disponíveis */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-80 bg-white border-r border-gray-200 transform transition-transform duration-200 lg:relative lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Vídeos Disponíveis</h2>
            <button
              className="lg:hidden p-1 rounded hover:bg-gray-100"
              onClick={() => setSidebarOpen(false)}
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {videos.filter(v => v.status === "draft" || v.status === "failed").map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                onClick={() => {
                  setSidebarOpen(false);
                  setSelectedDate(currentDate);
                  // Abrir modal de agendamento
                }}
                onDragStart={(e) => handleDragStart(e, video)}
              />
            ))}
            {(videos.filter(v => v.status === "draft" || v.status === "failed").length === 0) && (
              <div className="text-center py-8 text-gray-500">
                <Video className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Nenhum vídeo em rascunho</p>
                <button className="mt-2 text-blue-600 hover:underline text-sm" onClick={() => window.location.href = "/app/videos"}>
                  Criar novo vídeo
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Overlay para mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Conteúdo principal */}
      <main className="flex-1 flex flex-col lg:ml-0 min-w-0">
        {/* Header */}
        <header className="p-4 border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                className="lg:hidden p-2 rounded hover:bg-gray-100"
                onClick={() => setSidebarOpen(true)}
              >
                <LayoutList className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-semibold">Calendário</h1>
                <p className="text-sm text-gray-500">
                  {viewMode === "month" && format(currentDate, "MMMM yyyy", { locale: ptBR })}
                  {viewMode === "week" && `${format(weekStart, "dd MMM", { locale: ptBR })} - ${format(weekEnd, "dd MMM yyyy", { locale: ptBR })}`}
                  {viewMode === "day" && format(currentDate, "EEEE, dd MMMM yyyy", { locale: ptBR })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex bg-gray-100 rounded-lg p-1" role="radiogroup">
                {["month", "week", "day"].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={viewMode === mode}
                    className={cn(
                      "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                      viewMode === mode ? "bg-white text-blue-600 shadow-sm" : "text-gray-600 hover:text-gray-900"
                    )}
                    onClick={() => setViewMode(mode as ViewMode)}
                  >
                    {mode === "month" && "Mês"}
                    {mode === "week" && "Semana"}
                    {mode === "day" && "Dia"}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  onClick={() => navigate(-1)}
                  aria-label="Anterior"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  onClick={() => { setCurrentDate(new Date()); setSelectedDate(new Date()); }}
                >
                  Hoje
                </button>
                <button
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  onClick={() => navigate(1)}
                  aria-label="Próximo"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Calendar Content */}
        <div className="flex-1 overflow-auto p-4">
          {viewMode === "month" && (
            <div className="max-w-6xl mx-auto">
              {/* Cabeçalho dos dias da semana */}
              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
                  <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">
                    {day}
                  </div>
                ))}
              </div>

              {/* Grid do calendário */}
              <div className="grid grid-cols-7 gap-0.5">
                {Array.from({ length: differenceInDays(calendarEnd, calendarStart) + 1 }, (_, i) =>
                  addDays(calendarStart, i)
                ).map((date) => (
                  <DayCell
                    key={date.toISOString()}
                    date={date}
                    events={getEventsForDate(date)}
                    onEventClick={handleEventClick}
                    onDateClick={handleDateClick}
                    isCurrentMonth={isSameMonth(date, currentDate)}
                    isToday={isSameDay(date, new Date())}
                    selectedDate={selectedDate}
                    onDragOver={(e) => handleDragOver(e, date)}
                    onDrop={(e) => handleDrop(e, date)}
                  />
                ))}
              </div>
            </div>
          )}

          {viewMode === "week" && (
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-7 gap-0.5">
                {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((date) => (
                  <WeekCell
                    key={date.toISOString()}
                    date={date}
                    events={getEventsForDate(date)}
                    onEventClick={handleEventClick}
                    onDateClick={handleDateClick}
                    isCurrentMonth={isSameMonth(date, currentDate)}
                    isToday={isSameDay(date, new Date())}
                    selectedDate={selectedDate}
                    onDragOver={(e) => handleDragOver(e, date)}
                    onDrop={(e) => handleDrop(e, date)}
                  />
                ))}
              </div>
            </div>
          )}

          {viewMode === "day" && (
            <div className="max-w-4xl mx-auto">
              <DayView
                date={currentDate}
                events={getEventsForDate(currentDate)}
                onEventClick={handleEventClick}
                onDateClick={handleDateClick}
                onDragOver={(e) => handleDragOver(e, currentDate)}
                onDrop={(e) => handleDrop(e, currentDate)}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}