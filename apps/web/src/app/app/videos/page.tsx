"use client";

import { useEffect, useState, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Video,
  Upload,
  FileVideo,
  Calendar,
  Clock,
  Tag,
  Globe,
  Eye,
  Lock,
  Users,
  Image,
  Save,
  Send,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  Trash2,
  Edit,
  ExternalLink,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Copy,
  CheckSquare,
  Square,
  Menu,
} from "lucide-react";
import { apiFetch, apiUpload } from "@/lib/api";

interface YouTubeChannel {
  id: string;
  account_name: string;
  provider_account_id: string;
  status: string;
}

interface VideoAsset {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
}

interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  tags: string[];
  category_id: string;
  privacy_status: "private" | "unlisted" | "public";
  publish_at: string | null;
  made_for_kids: boolean;
  license: "youtube" | "creativeCommon";
  language: string;
  recording_date: string | null;
  location_lat: number | null;
  location_lng: number | null;
  playlist_id: string | null;
  thumbnail_path: string | null;
  status: "draft" | "scheduled" | "publishing" | "published" | "failed" | "cancelled";
  youtube_video_id: string | null;
  youtube_error: string | null;
  social_account_id: string;
  asset_id: string | null;
  scheduled_post_id: string | null;
  created_at: string;
  updated_at: string;
  content_assets?: VideoAsset;
  social_accounts?: YouTubeChannel;
}

interface VideoFormData {
  title: string;
  description: string;
  tags: string;
  categoryId: string;
  privacyStatus: "private" | "unlisted" | "public";
  publishAt: string;
  madeForKids: boolean;
  license: "youtube" | "creativeCommon";
  language: string;
  recordingDate: string;
  locationLat: string;
  locationLng: string;
  playlistId: string;
  thumbnailFileName: string;
}

const CATEGORIES = [
  { id: "1", name: "Filme e Animação" },
  { id: "2", name: "Autos e Veículos" },
  { id: "10", name: "Música" },
  { id: "15", name: "Animais" },
  { id: "17", name: "Esportes" },
  { id: "18", name: "Curta-metragens" },
  { id: "19", name: "Viagens e Eventos" },
  { id: "20", name: "Games" },
  { id: "21", name: "Videoblog" },
  { id: "22", name: "Pessoas e Blogs" },
  { id: "23", name: "Comédia" },
  { id: "24", name: "Entretenimento" },
  { id: "25", name: "Notícias e Política" },
  { id: "26", name: "Como Fazer e Estilo" },
  { id: "27", name: "Educação" },
  { id: "28", name: "Ciência e Tecnologia" },
  { id: "29", name: "Organizações sem fins lucrativos" },
];

const initialFormData: VideoFormData = {
  title: "",
  description: "",
  tags: "",
  categoryId: "22",
  privacyStatus: "private",
  publishAt: "",
  madeForKids: false,
  license: "youtube",
  language: "pt",
  recordingDate: "",
  locationLat: "",
  locationLng: "",
  playlistId: "",
  thumbnailFileName: "",
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case "draft":
      return { label: "Rascunho", className: "status-draft" };
    case "scheduled":
      return { label: "Agendado", className: "status-scheduled" };
    case "publishing":
      return { label: "Publicando...", className: "status-publishing" };
    case "published":
      return { label: "Publicado", className: "status-published" };
    case "failed":
      return { label: "Falhou", className: "status-failed" };
    case "cancelled":
      return { label: "Cancelado", className: "status-cancelled" };
    default:
      return { label: status, className: "status-unknown" };
  }
};

function VideosPageContent({ initialVideoId }: { initialVideoId: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<VideoFormData>(initialFormData);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedThumbnail, setSelectedThumbnail] = useState<File | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionOpen, setBulkActionOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const loadVideos = async () => {
    try {
      const response = await apiFetch<{ data: YouTubeVideo[] }>("/api/videos");
      setVideos(response.data ?? []);
    } catch (err) {
      console.error("Erro ao carregar vídeos:", err);
      setMessage({ type: "error", text: "Falha ao carregar vídeos" });
    } finally {
      setLoading(false);
    }
  };

  const loadChannels = async () => {
    try {
      const response = await apiFetch<{ data: YouTubeChannel[] }>("/api/channels");
      setChannels(response.data ?? []);
    } catch (err) {
      console.error("Erro ao carregar canais:", err);
    }
  };

  useEffect(() => {
    loadVideos();
    loadChannels();
  }, []);

  useEffect(() => {
    if (initialVideoId) {
      setEditingId(initialVideoId);
      const video = videos.find(v => v.id === initialVideoId);
      if (video) {
        setFormData({
          title: video.title,
          description: video.description,
          tags: video.tags.join(", "),
          categoryId: video.category_id,
          privacyStatus: video.privacy_status,
          publishAt: video.publish_at ? new Date(video.publish_at).toISOString().slice(0, 16) : "",
          madeForKids: video.made_for_kids,
          license: video.license,
          language: video.language,
          recordingDate: video.recording_date ? new Date(video.recording_date).toISOString().slice(0, 16) : "",
          locationLat: video.location_lat?.toString() ?? "",
          locationLng: video.location_lng?.toString() ?? "",
          playlistId: video.playlist_id ?? "",
          thumbnailFileName: video.thumbnail_path ?? "",
        });
      }
    }
  }, [initialVideoId, videos]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleThumbnailSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedThumbnail(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage({ type: "error", text: "Selecione um arquivo de vídeo" });
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("video", selectedFile);

      const result = await apiUpload<{ data: { file_name: string } }>("/api/videos/upload", formData);
      setMessage({ type: "success", text: `Upload concluído: ${result.data.file_name}` });
      setFormData(prev => ({ ...prev, thumbnailFileName: "" }));
      setSelectedFile(null);
      setSelectedThumbnail(null);
      loadVideos();
    } catch (err) {
      console.error("Erro no upload:", err);
      setMessage({ type: "error", text: "Falha no upload do vídeo" });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleThumbnailUpload = async () => {
    if (!selectedThumbnail) return;

    try {
      const formData = new FormData();
      formData.append("thumbnail", selectedThumbnail);

      const result = await apiUpload<{ data: { file_path: string } }>("/api/videos/upload-thumbnail", formData);
      setFormData(prev => ({ ...prev, thumbnailFileName: result.data.file_path }));
      setMessage({ type: "success", text: "Thumbnail enviado!" });
      setSelectedThumbnail(null);
    } catch (err) {
      console.error("Erro no upload do thumbnail:", err);
      setMessage({ type: "error", text: "Falha no upload do thumbnail" });
    }
  };

  const handleSave = async (isNew = false) => {
    if (!formData.title.trim()) {
      setMessage({ type: "error", text: "Título é obrigatório" });
      return;
    }
    if (!channels.length) {
      setMessage({ type: "error", text: "Conecte um canal do YouTube primeiro" });
      return;
    }
    if (!selectedFile && !editingId && !formData.thumbnailFileName) {
      setMessage({ type: "error", text: "Envie um arquivo de vídeo antes de salvar" });
      return;
    }

    setSaving(true);
    try {
      let assetId = editingId ? videos.find(v => v.id === editingId)?.asset_id : undefined;

      // Se tem arquivo novo, fazer upload primeiro
      if (selectedFile) {
        const formDataUpload = new FormData();
        formDataUpload.append("video", selectedFile);
        const uploadResult = await apiUpload<{ data: { asset_id: string } }>("/api/videos/upload", formDataUpload);
        assetId = uploadResult.data.asset_id;
      }

      const payload = {
        organizationId: channels[0].id.split(":")[0] || "", // Será preenchido pelo backend via auth
        socialAccountId: channels[0].id, // Simplificação: usar primeiro canal
        metadata: {
          title: formData.title,
          description: formData.description,
          tags: formData.tags.split(",").map(t => t.trim()).filter(Boolean),
          categoryId: formData.categoryId,
          privacyStatus: formData.privacyStatus,
          publishAt: formData.publishAt || undefined,
          madeForKids: formData.madeForKids,
          license: formData.license,
          language: formData.language,
          recordingDate: formData.recordingDate || undefined,
          locationLat: formData.locationLat ? parseFloat(formData.locationLat) : undefined,
          locationLng: formData.locationLng ? parseFloat(formData.locationLng) : undefined,
          playlistId: formData.playlistId || undefined,
          thumbnailFileName: formData.thumbnailFileName || undefined,
        },
        assetId,
      };

      if (editingId) {
        await apiFetch(`/api/videos/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload.metadata),
        });
        setMessage({ type: "success", text: "Vídeo atualizado com sucesso!" });
      } else {
        await apiFetch("/api/videos", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setMessage({ type: "success", text: "Vídeo criado com sucesso!" });
      }

      setEditingId(null);
      setFormData(initialFormData);
      setSelectedFile(null);
      setSelectedThumbnail(null);
      loadVideos();
    } catch (err) {
      console.error("Erro ao salvar:", err);
      setMessage({ type: "error", text: "Falha ao salvar vídeo" });
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormData(initialFormData);
    setSelectedFile(null);
    setSelectedThumbnail(null);
    router.replace("/app/videos");
  };

  const handleEdit = (video: YouTubeVideo) => {
    setEditingId(video.id);
    setFormData({
      title: video.title,
      description: video.description,
      tags: video.tags.join(", "),
      categoryId: video.category_id,
      privacyStatus: video.privacy_status,
      publishAt: video.publish_at ? new Date(video.publish_at).toISOString().slice(0, 16) : "",
      madeForKids: video.made_for_kids,
      license: video.license,
      language: video.language,
      recordingDate: video.recording_date ? new Date(video.recording_date).toISOString().slice(0, 16) : "",
      locationLat: video.location_lat?.toString() ?? "",
      locationLng: video.location_lng?.toString() ?? "",
      playlistId: video.playlist_id ?? "",
      thumbnailFileName: video.thumbnail_path ?? "",
    });
    router.push(`/app/videos?edit=${video.id}`);
  };

  const handleSchedule = async (video: YouTubeVideo) => {
    if (!video.publish_at) {
      setMessage({ type: "error", text: "Defina data/hora de publicação primeiro" });
      return;
    }

    try {
      await apiFetch(`/api/videos/${video.id}/schedule`, {
        method: "POST",
        body: JSON.stringify({
          scheduledFor: video.publish_at,
          timezone: "America/Sao_Paulo",
        }),
      });
      setMessage({ type: "success", text: "Vídeo agendado com sucesso!" });
      loadVideos();
    } catch (err) {
      console.error("Erro ao agendar:", err);
      setMessage({ type: "error", text: "Falha ao agendar vídeo" });
    }
  };

  const handlePublishNow = async (video: YouTubeVideo) => {
    if (!confirm("Publicar este vídeo agora no YouTube?")) return;

    setPublishingId(video.id);
    try {
      const result = await apiFetch<{ data: { youtubeVideoId: string } }>(`/api/videos/${video.id}/publish-now`, {
        method: "POST",
      });
      setMessage({ type: "success", text: `Publicado! ID: ${result.data.youtubeVideoId}` });
      loadVideos();
    } catch (err) {
      console.error("Erro ao publicar:", err);
      setMessage({ type: "error", text: "Falha na publicação" });
    } finally {
      setPublishingId(null);
    }
  };

  const handleDelete = async (video: YouTubeVideo) => {
    if (!confirm(`Excluir o vídeo "${video.title}"? Esta ação não pode ser desfeita.`)) return;

    setDeletingId(video.id);
    try {
      await apiFetch(`/api/videos/${video.id}`, { method: "DELETE" });
      setMessage({ type: "success", text: "Vídeo excluído" });
      loadVideos();
    } catch (err) {
      console.error("Erro ao excluir:", err);
      setMessage({ type: "error", text: "Falha ao excluir vídeo" });
    } finally {
      setDeletingId(null);
    }
  };

  const handleClone = async (video: YouTubeVideo) => {
    const newTitle = prompt(`Título para a cópia:`, `Cópia de ${video.title}`);
    if (!newTitle) return;

    const copyAsset = confirm("Deseja copiar o arquivo de vídeo também? (Isso criará um novo upload)");

    try {
      await apiFetch(`/api/videos/${video.id}/clone`, {
        method: "POST",
        body: JSON.stringify({
          title: newTitle,
          copyAsset,
          resetStatus: true,
        }),
      });
      setMessage({ type: "success", text: "Vídeo duplicado com sucesso!" });
      loadVideos();
    } catch (err) {
      console.error("Erro ao duplicar:", err);
      setMessage({ type: "error", text: "Falha ao duplicar vídeo" });
    }
  };

  const handleOpenYouTube = (videoId: string) => {
    window.open(`https://www.youtube.com/watch?v=${videoId}`, "_blank");
  };

  const handleSelectAll = () => {
    if (selectedIds.size === videos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(videos.map(v => v.id)));
    }
  };

  // Atualizar indeterminate state via ref
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedIds.size > 0 && selectedIds.size < videos.length;
    }
  }, [selectedIds, videos.length]);

  const handleSelectOne = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleBulkAction = async (operation: string, extraData?: any) => {
    if (selectedIds.size === 0) return;

    setBulkLoading(true);
    try {
      const response = await apiFetch<{ data: { results: any[]; summary: any } }>("/api/videos/bulk", {
        method: "POST",
        body: JSON.stringify({
          videoIds: Array.from(selectedIds),
          operation,
          ...extraData,
        }),
      });

      const { results, summary } = response.data;
      const failed = results.filter(r => !r.success);

      if (failed.length > 0) {
        setMessage({ type: "error", text: `${failed.length} de ${summary.total} falharam. Verifique a lista.` });
      } else {
        setMessage({ type: "success", text: `${summary.success} vídeo(s) processados com sucesso!` });
      }

      setSelectedIds(new Set());
      setBulkActionOpen(false);
      loadVideos();
    } catch (err) {
      console.error("Erro na operação em lote:", err);
      setMessage({ type: "error", text: "Falha na operação em lote" });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkSchedule = () => {
    const date = prompt("Data/hora para agendar (YYYY-MM-DDTHH:MM):");
    if (!date) return;
    handleBulkAction("schedule", { scheduledFor: date, timezone: "America/Sao_Paulo" });
  };

  const handleBulkPublish = () => {
    if (!confirm(`Publicar ${selectedIds.size} vídeo(s) agora no YouTube?`)) return;
    handleBulkAction("publish");
  };

  const handleBulkDelete = () => {
    if (!confirm(`Excluir ${selectedIds.size} vídeo(s) em rascunho? Esta ação não pode ser desfeita.`)) return;
    handleBulkAction("delete");
  };

  const handleBulkChangePrivacy = (privacyStatus: "private" | "unlisted" | "public") => {
    handleBulkAction("change_privacy", { privacyStatus });
  };

  const handleBulkChangeCategory = () => {
    const catId = prompt("ID da categoria (ex: 22 para Pessoas e Blogs):");
    if (!catId) return;
    handleBulkAction("change_category", { categoryId: catId });
  };

  const handleBulkChangePlaylist = () => {
    const playlistId = prompt("Playlist ID (deixe vazio para remover):");
    handleBulkAction("change_playlist", { playlistId: playlistId || undefined });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

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
          <a className="active" href="/app/videos">
            <FileVideo size={18} />
            Vídeos
          </a>
          <a href="/app/canais">
            <Video size={18} />
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
          <a href="/app/analytics">
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
            <p className="eyebrow">YouTube</p>
            <h1>Gerenciador de Vídeos</h1>
          </div>
        </header>

        {message && (
          <div
            className={`alert ${message.type}`}
            role="alert"
            style={{
              padding: "12px 16px",
              borderRadius: "8px",
              marginBottom: "24px",
              background: message.type === "success" ? "#ecfdf5" : "#fef2f2",
              border: message.type === "success" ? "1px solid #a7f3d0" : "1px solid #fecaca",
              color: message.type === "success" ? "#065f46" : "#991b1b",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {message.type === "success" ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
            {message.text}
            <button
              onClick={() => setMessage(null)}
              style={{
                marginLeft: "auto",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "inherit",
                opacity: 0.6,
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Formulário de Upload/Edição */}
        <section className="panel" style={{ marginBottom: "24px" }}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{editingId ? "Editar vídeo" : "Novo vídeo"}</p>
              <h2>{editingId ? "Edição de metadados" : "Upload e configuração"}</h2>
            </div>
          </div>
          <div className="panel-body">
            {/* Upload de arquivo */}
            <div className="upload-section">
              <div className="upload-zone" onClick={() => document.getElementById("video-file")?.click()}>
                <input
                  id="video-file"
                  type="file"
                  accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm"
                  onChange={handleFileSelect}
                  style={{ display: "none" }}
                />
                <FileVideo size={48} />
                <div>
                  <b>{selectedFile ? selectedFile.name : "Clique ou arraste para enviar vídeo"}</b>
                  <span>{selectedFile ? formatFileSize(selectedFile.size) : "MP4, MOV, AVI, MKV, WebM — até 2GB"}</span>
                </div>
                {uploading && (
                  <div className="upload-progress">
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
                    </div>
                    <span>{uploadProgress}%</span>
                  </div>
                )}
                {!selectedFile && !uploading && <Upload size={24} />}
              </div>

              {/* Thumbnail */}
              <div className="thumbnail-section">
                <label className="thumbnail-upload" onClick={() => document.getElementById("thumb-file")?.click()}>
                  <input
                    id="thumb-file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleThumbnailSelect}
                    style={{ display: "none" }}
                  />
                  {formData.thumbnailFileName ? (
                    <img src={`/uploads/${formData.thumbnailFileName}`} alt="Thumbnail" style={{ width: "120px", height: "68px", objectFit: "cover", borderRadius: "8px" }} />
                  ) : (
                    <div className="thumbnail-placeholder">
                      <Image size={24} />
                      <span>Thumbnail</span>
                    </div>
                  )}
                </label>
                {selectedThumbnail && (
                  <button className="primary-button" onClick={handleThumbnailUpload} disabled={uploading}>
                    <Upload size={16} /> Enviar Thumbnail
                  </button>
                )}
                {formData.thumbnailFileName && !selectedThumbnail && (
                  <button className="icon-button secondary" onClick={() => setFormData(prev => ({ ...prev, thumbnailFileName: "" }))} title="Remover thumbnail">
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Metadados básicos */}
            <div className="form-grid">
              <div className="form-field full-width">
                <label>Título do vídeo <span className="required">*</span></label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Título do seu vídeo (máx. 100 caracteres)"
                  maxLength={100}
                  disabled={saving}
                />
                <small>{formData.title.length}/100</small>
              </div>

              <div className="form-field full-width">
                <label>Descrição</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Descreva seu vídeo..."
                  rows={4}
                  maxLength={5000}
                  disabled={saving}
                />
                <small>{formData.description.length}/5000</small>
              </div>

              <div className="form-field full-width">
                <label>Tags (separadas por vírgula)</label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={e => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder="tag1, tag2, tag3"
                  disabled={saving}
                />
                <small>Máx. 50 tags, 50 caracteres cada</small>
              </div>

              <div className="form-field">
                <label>Categoria</label>
                <select
                  value={formData.categoryId}
                  onChange={e => setFormData(prev => ({ ...prev, categoryId: e.target.value }))}
                  disabled={saving}
                >
                  {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="form-field">
                <label>Privacidade</label>
                <select
                  value={formData.privacyStatus}
                  onChange={e => setFormData(prev => ({ ...prev, privacyStatus: e.target.value as any }))}
                  disabled={saving}
                >
                  <option value="private">Privado</option>
                  <option value="unlisted">Não listado</option>
                  <option value="public">Público</option>
                </select>
              </div>

              <div className="form-field">
                <label>Licença</label>
                <select
                  value={formData.license}
                  onChange={e => setFormData(prev => ({ ...prev, license: e.target.value as any }))}
                  disabled={saving}
                >
                  <option value="youtube">YouTube Padrão</option>
                  <option value="creativeCommon">Creative Commons</option>
                </select>
              </div>

              {/* Campos avançados */}
              {showAdvanced && (
                <>
                  <div className="form-field">
                    <label>Idioma</label>
                    <input
                      type="text"
                      value={formData.language}
                      onChange={e => setFormData(prev => ({ ...prev, language: e.target.value }))}
                      disabled={saving}
                    />
                  </div>

                  <div className="form-field">
                    <label>Data de gravação</label>
                    <input
                      type="datetime-local"
                      value={formData.recordingDate}
                      onChange={e => setFormData(prev => ({ ...prev, recordingDate: e.target.value }))}
                      disabled={saving}
                    />
                  </div>

                  <div className="form-field">
                    <label>Latitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      min="-90"
                      max="90"
                      value={formData.locationLat}
                      onChange={e => setFormData(prev => ({ ...prev, locationLat: e.target.value }))}
                      placeholder="-23.5505"
                      disabled={saving}
                    />
                  </div>

                  <div className="form-field">
                    <label>Longitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      min="-180"
                      max="180"
                      value={formData.locationLng}
                      onChange={e => setFormData(prev => ({ ...prev, locationLng: e.target.value }))}
                      placeholder="-46.6333"
                      disabled={saving}
                    />
                  </div>

                  <div className="form-field">
                    <label>Playlist ID (opcional)</label>
                    <input
                      type="text"
                      value={formData.playlistId}
                      onChange={e => setFormData(prev => ({ ...prev, playlistId: e.target.value }))}
                      placeholder="PLxxxxxxxxxxxx"
                      disabled={saving}
                    />
                  </div>

                  <div className="form-field checkbox-field">
                    <label>
                      <input
                        type="checkbox"
                        checked={formData.madeForKids}
                        onChange={e => setFormData(prev => ({ ...prev, madeForKids: e.target.checked }))}
                        disabled={saving}
                      />
                      Feito para crianças
                    </label>
                  </div>
                </>
              )}

              {/* Agendamento */}
              <div className="form-field">
                <label>Agendar para <span className="optional">(opcional)</span></label>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    type="datetime-local"
                    value={formData.publishAt}
                    onChange={e => setFormData(prev => ({ ...prev, publishAt: e.target.value }))}
                    style={{ flex: 1 }}
                    disabled={saving}
                  />
                  {formData.publishAt && (
                    <button type="button" className="icon-button secondary" onClick={() => setFormData(prev => ({ ...prev, publishAt: "" }))} title="Remover agendamento">
                      <X size={16} />
                    </button>
                  )}
                </div>
                <small>Deixe vazio para publicar imediatamente ou salvar como rascunho</small>
              </div>
            </div>

            {/* Ações */}
            <div className="form-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={handleCancelEdit}
                disabled={saving}
              >
                <X size={16} /> Cancelar
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                disabled={saving}
              >
                {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />} Opções avançadas
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => handleSave(!editingId)}
                disabled={saving || uploading}
              >
                {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                {editingId ? "Salvar alterações" : "Criar vídeo"}
              </button>
            </div>
          </div>
        </section>

        {/* Lista de vídeos */}
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Biblioteca</p>
              <h2>Seus vídeos</h2>
            </div>
          </div>
          <div className="panel-body">
            {loading ? (
              <div className="loading-state">
                <Loader2 size={24} className="spin" />
                <p>Carregando vídeos...</p>
              </div>
            ) : videos.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon"><FileVideo size={48} /></div>
                <h3>Nenhum vídeo ainda</h3>
                <p>Faça upload do seu primeiro vídeo e configure os metadados para publicar no YouTube.</p>
              </div>
            ) : (
              <>
                {/* Barra de ações em lote quando itens selecionados */}
                {selectedIds.size > 0 && (
                  <div className="bulk-actions-bar" style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 16px",
                    background: "#f0fdfa",
                    border: "1px solid #a7f3d0",
                    borderRadius: "8px",
                    marginBottom: "16px",
                    flexWrap: "wrap",
                  }}>
                    <span style={{ fontWeight: 500, color: "#065f46" }}>
                      {selectedIds.size} vídeo(s) selecionado(s)
                    </span>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button className="secondary-button" onClick={handleBulkSchedule} disabled={bulkLoading} title="Agendar selecionados">
                        <Calendar size={14} /> Agendar
                      </button>
                      <button className="primary-button" onClick={handleBulkPublish} disabled={bulkLoading} title="Publicar agora">
                        <Send size={14} /> Publicar agora
                      </button>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span style={{ fontSize: "12px", color: "#6b7280" }}>Privacidade:</span>
                        <button className="icon-button secondary" onClick={() => handleBulkChangePrivacy("private")} disabled={bulkLoading} title="Privado">
                          <Lock size={14} />
                        </button>
                        <button className="icon-button secondary" onClick={() => handleBulkChangePrivacy("unlisted")} disabled={bulkLoading} title="Não listado">
                          <Eye size={14} />
                        </button>
                        <button className="icon-button secondary" onClick={() => handleBulkChangePrivacy("public")} disabled={bulkLoading} title="Público">
                          <Globe size={14} />
                        </button>
                      </div>
                      <button className="secondary-button" onClick={handleBulkChangeCategory} disabled={bulkLoading} title="Alterar categoria">
                        <Tag size={14} /> Categoria
                      </button>
                      <button className="secondary-button" onClick={handleBulkChangePlaylist} disabled={bulkLoading} title="Alterar playlist">
                        <Menu size={14} /> Playlist
                      </button>
                      <button className="icon-button danger" onClick={handleBulkDelete} disabled={bulkLoading} title="Excluir selecionados">
                        <Trash2 size={14} />
                      </button>
                      <button className="icon-button secondary" onClick={() => setSelectedIds(new Set())} disabled={bulkLoading} title="Limpar seleção">
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                )}

                <div className="videos-table-container">
                  <table className="videos-table">
                    <thead>
                      <tr>
                        <th style={{ width: "48px" }}>
                          <input
                            ref={selectAllRef}
                            type="checkbox"
                            checked={selectedIds.size === videos.length && videos.length > 0}
                            onChange={handleSelectAll}
                            aria-label="Selecionar todos"
                          />
                        </th>
                        <th>Vídeo</th>
                        <th>Título</th>
                        <th>Canal</th>
                        <th>Status</th>
                        <th>Agendado para</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {videos.map(video => {
                      const status = getStatusBadge(video.status);
                      const isEditing = editingId === video.id;
                      const isSelected = selectedIds.has(video.id);
                      return (
                        <tr key={video.id} className={`${isEditing ? "editing" : ""} ${isSelected ? "selected" : ""}`}>
                          <td style={{ textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleSelectOne(video.id)}
                              aria-label={`Selecionar ${video.title}`}
                            />
                          </td>
                          <td>
                            {video.content_assets && (
                              <div className="video-thumb" style={{ width: "80px", height: "45px", background: "#ecfdf5", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <FileVideo size={20} color="#0f766e" />
                              </div>
                            )}
                          </td>
                          <td>
                            <strong>{video.title}</strong>
                            {video.youtube_video_id && <span className="video-id">ID: {video.youtube_video_id}</span>}
                            {video.youtube_error && <span className="video-error">{video.youtube_error}</span>}
                          </td>
                          <td>{video.social_accounts?.account_name ?? video.social_account_id}</td>
                          <td>
                            <span className={`status-badge ${status.className}`}>{status.label}</span>
                          </td>
                          <td>{formatDate(video.publish_at)}</td>
                          <td>
                            <div className="action-buttons">
                              {isEditing ? (
                                <>
                                  <button className="icon-button success" onClick={() => handleSave(false)} disabled={saving} title="Salvar">
                                    <CheckCircle size={16} />
                                  </button>
                                  <button className="icon-button secondary" onClick={handleCancelEdit} disabled={saving} title="Cancelar">
                                    <X size={16} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  {video.status === "draft" && (
                                    <>
                                      <button className="icon-button secondary" onClick={() => handleEdit(video)} title="Editar">
                                        <Edit size={16} />
                                      </button>
                                      {video.asset_id && video.publish_at && (
                                        <button className="icon-button secondary" onClick={() => handleSchedule(video)} title="Agendar">
                                          <Calendar size={16} />
                                        </button>
                                      )}
                                      {video.asset_id && (
                                        <button className="icon-button primary" onClick={() => handlePublishNow(video)} disabled={publishingId === video.id} title="Publicar agora">
                                          {publishingId === video.id ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                                        </button>
                                      )}
                                    </>
                                  )}
                                  {video.status === "scheduled" && (
                                    <>
                                      <button className="icon-button secondary" onClick={() => handleEdit(video)} title="Editar agendamento">
                                        <Edit size={16} />
                                      </button>
                                      <button className="icon-button warning" onClick={() => handlePublishNow(video)} disabled={publishingId === video.id} title="Publicar agora">
                                        {publishingId === video.id ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                                      </button>
                                    </>
                                  )}
                                  {video.status === "published" && video.youtube_video_id && (
                                    <button className="icon-button secondary" onClick={() => handleOpenYouTube(video.youtube_video_id!)} title="Abrir no YouTube">
                                      <ExternalLink size={16} />
                                    </button>
                                  )}
                                  {video.status === "failed" && (
                                    <>
                                      <button className="icon-button secondary" onClick={() => handleEdit(video)} title="Corrigir e tentar novamente">
                                        <Edit size={16} />
                                      </button>
                                      <button className="icon-button warning" onClick={() => handlePublishNow(video)} disabled={publishingId === video.id} title="Tentar publicar novamente">
                                        {publishingId === video.id ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                                      </button>
                                    </>
                                  )}
                                  {(video.status === "draft" || video.status === "failed") && (
                                    <button className="icon-button danger" onClick={() => handleDelete(video)} disabled={deletingId === video.id} title="Excluir">
                                      {deletingId === video.id ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                                    </button>
                                  )}
                                  {/* Botão duplicar - disponível para todos os status exceto publishing */}
                                  {video.status !== "publishing" && (
                                    <button className="icon-button secondary" onClick={() => handleClone(video)} title="Duplicar vídeo">
                                      <Copy size={16} />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>)}
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
            margin-bottom: 32px;
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

          .required { color: #dc2626; }
          .optional { color: #9ca3af; font-weight: normal; font-size: 12px; }

          /* Upload section */
          .upload-section {
            display: grid;
            grid-template-columns: 1fr 200px;
            gap: 16px;
            margin-bottom: 24px;
            padding-bottom: 24px;
            border-bottom: 1px solid #f3f4f6;
          }
          .upload-zone {
            border: 2px dashed #d1d5db;
            border-radius: 12px;
            padding: 32px;
            text-align: center;
            cursor: pointer;
            transition: all 0.15s;
            position: relative;
          }
          .upload-zone:hover {
            border-color: #0f766e;
            background: #f0fdfa;
          }
          .upload-zone b {
            display: block;
            color: #111827;
            margin-bottom: 4px;
          }
          .upload-zone span {
            display: block;
            color: #6b7280;
            font-size: 13px;
          }
          .upload-progress {
            margin-top: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .progress-bar {
            flex: 1;
            height: 6px;
            background: #e5e7eb;
            border-radius: 3px;
            overflow: hidden;
          }
          .progress-fill {
            height: 100%;
            background: #0f766e;
            transition: width 0.3s;
          }

          .thumbnail-section {
            display: flex;
            flex-direction: column;
            gap: 12px;
            align-items: center;
          }
          .thumbnail-upload {
            width: 120px;
            height: 68px;
            border: 2px dashed #d1d5db;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            overflow: hidden;
            transition: all 0.15s;
          }
          .thumbnail-upload:hover {
            border-color: #0f766e;
          }
          .thumbnail-placeholder {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            color: #9ca3af;
            font-size: 12px;
          }
          .thumbnail-placeholder svg { color: #d1d5db; }

          /* Form grid */
          .form-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 16px;
            margin-bottom: 16px;
          }
          .form-field {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
          .form-field.full-width {
            grid-column: 1 / -1;
          }
          .form-field label {
            font-size: 13px;
            font-weight: 500;
            color: #374151;
          }
          .form-field input,
          .form-field select,
          .form-field textarea {
            padding: 10px 12px;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            font-size: 14px;
            font-family: inherit;
            transition: border-color 0.15s;
          }
          .form-field input:focus,
          .form-field select:focus,
          .form-field textarea:focus {
            outline: none;
            border-color: #0f766e;
            box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.1);
          }
          .form-field input:disabled,
          .form-field select:disabled,
          .form-field textarea:disabled {
            background: #f9fafb;
            color: #9ca3af;
          }
          .form-field small {
            font-size: 11px;
            color: #9ca3af;
          }
          .checkbox-field {
            flex-direction: row;
            align-items: center;
            gap: 8px;
          }
          .checkbox-field label {
            font-size: 13px;
            color: #374151;
            cursor: pointer;
          }

          .form-actions {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            padding-top: 16px;
            border-top: 1px solid #f3f4f6;
          }

          /* Buttons */
          .primary-button {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 18px;
            background: #0f766e;
            color: #fff;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.15s;
          }
          .primary-button:hover:not(:disabled) { background: #0d6d65; }
          .primary-button:disabled { opacity: 0.6; cursor: not-allowed; }

          .secondary-button {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 18px;
            background: #fff;
            color: #374151;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s;
          }
          .secondary-button:hover:not(:disabled) { background: #f3f4f6; border-color: #9ca3af; }
          .secondary-button:disabled { opacity: 0.6; cursor: not-allowed; }

          .icon-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            border-radius: 8px;
            border: none;
            cursor: pointer;
            transition: all 0.15s;
          }
          .icon-button.secondary { background: #f3f4f6; color: #374151; }
          .icon-button.secondary:hover:not(:disabled) { background: #e5e7eb; }
          .icon-button.primary { background: #0f766e; color: #fff; }
          .icon-button.primary:hover:not(:disabled) { background: #0d6d65; }
          .icon-button.danger { background: #fef2f2; color: #dc2626; }
          .icon-button.danger:hover:not(:disabled) { background: #fee2e2; }
          .icon-button.warning { background: #fffbeb; color: #f59e0b; }
          .icon-button.warning:hover:not(:disabled) { background: #fef3c7; }
          .icon-button.success { background: #ecfdf5; color: #0f766e; }
          .icon-button.success:hover:not(:disabled) { background: #d1fae5; }
          .icon-button:disabled { opacity: 0.5; cursor: not-allowed; }

          .spin { animation: spin 1s linear infinite; }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

          /* Table */
          .videos-table-container { overflow-x: auto; }
          .videos-table { width: 100%; border-collapse: collapse; font-size: 13px; }
          .videos-table th {
            text-align: left;
            padding: 12px 16px;
            background: #f9fafb;
            border-bottom: 1px solid #e5e7eb;
            font-weight: 600;
            color: #374151;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .videos-table td {
            padding: 12px 16px;
            border-bottom: 1px solid #f3f4f6;
            vertical-align: middle;
          }
          .videos-table tr:last-child td { border-bottom: none; }
          .videos-table tr.editing { background: #f0fdfa; }
          .videos-table tr.selected { background: #e6fdf8; }
          .videos-table tr.selected:hover { background: #d1fae5; }
          .video-id { display: block; font-size: 11px; color: #9ca3af; font-family: monospace; margin-top: 2px; }
          .video-error { display: block; font-size: 11px; color: #dc2626; margin-top: 2px; }

          .status-badge {
            padding: 4px 10px;
            border-radius: 9999px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.02em;
          }
          .status-draft { background: #f3f4f6; color: #6b7280; }
          .status-scheduled { background: #e0e7ff; color: #3730a3; }
          .status-publishing { background: #fffbeb; color: #92400e; }
          .status-published { background: #ecfdf5; color: #065f46; }
          .status-failed { background: #fef2f2; color: #991b1b; }
          .status-cancelled { background: #f3f4f6; color: #6b7280; }
          .status-unknown { background: #f3f4f6; color: #6b7280; }

          .action-buttons { display: flex; gap: 4px; }

          .empty-state {
            text-align: center;
            padding: 60px 24px;
          }
          .empty-icon { color: #d1d5db; margin-bottom: 16px; }
          .empty-state h3 { font-size: 20px; font-weight: 600; color: #111827; margin-bottom: 8px; }
          .empty-state p { color: #6b7280; max-width: 400px; margin: 0 auto; line-height: 1.6; }

          .loading-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 60px;
            gap: 12px;
            color: #6b7280;
          }
        `}</style>
      </section>
    </main>
  );
}

function VideosPageSuspenseFallback() {
  return (
    <div className="loading-state">
      <Loader2 size={24} className="spin" />
      <p>Carregando página de vídeos...</p>
    </div>
  );
}

function VideosPageInner() {
  const searchParams = useSearchParams();
  const initialVideoId = searchParams.get("edit");
  return <VideosPageContent initialVideoId={initialVideoId} />;
}

export default function VideosPage() {
  return (
    <Suspense fallback={<VideosPageSuspenseFallback />}>
      <VideosPageInner />
    </Suspense>
  );
}