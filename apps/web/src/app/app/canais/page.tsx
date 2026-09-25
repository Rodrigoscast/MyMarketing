"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Video,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Trash2,
  ExternalLink,
  Shield,
  Info,
} from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { LoadingState } from "@/components/LoadingState";
import { apiFetch } from "@/lib/api";

interface YouTubeChannel {
  id: string;
  account_name: string;
  provider_account_id: string;
  status: string;
  connected_at: string;
  updated_at: string;
}

interface ChannelStatus {
  connected: boolean;
  channelId?: string;
  title?: string;
  accountName?: string;
  error?: string;
}

interface CanaisPageContentProps {
  initialConnected: string | null;
  initialError: string | null;
}

function CanaisPageContent({ initialConnected, initialError }: CanaisPageContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Verificar parâmetros de URL (callback do OAuth) - apenas na primeira renderização
  useEffect(() => {
    if (initialConnected) {
      setMessage({ type: "success", text: `Canal "${initialConnected}" conectado com sucesso!` });
      router.replace("/app/canais");
    } else if (initialError) {
      setMessage({ type: "error", text: `Erro ao conectar: ${initialError}` });
      router.replace("/app/canais");
    }
  }, [initialConnected, initialError, router]);

  // Carregar canais conectados
  const loadChannels = async () => {
    try {
      const response = await apiFetch<{ data: YouTubeChannel[] }>("/api/channels");
      setChannels(response.data ?? []);
    } catch (err) {
      console.error("Erro ao carregar canais:", err);
      setMessage({ type: "error", text: "Falha ao carregar canais conectados" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChannels();
  }, []);

  // Iniciar fluxo OAuth
  const handleConnect = async () => {
    setConnecting(true);
    try {
      const response = await apiFetch<{ data: { authUrl: string } }>("/api/channels/youtube/connect");
      // Redirecionar para URL do Google OAuth
      window.location.href = response.data.authUrl;
    } catch (err) {
      console.error("Erro ao iniciar conexão:", err);
      setMessage({ type: "error", text: "Falha ao iniciar conexão com YouTube" });
      setConnecting(false);
    }
  };

  // Testar conexão (renovar token)
  const handleTest = async (channel: YouTubeChannel) => {
    setTestingId(channel.id);
    try {
      const response = await apiFetch<{ data: ChannelStatus }>(`/api/channels/${channel.id}/test`, {
        method: "POST",
      });

      if (response.data.connected) {
        setMessage({ type: "success", text: `Conexão ativa: ${response.data.title}` });
        // Atualizar lista para refletir status
        loadChannels();
      } else {
        setMessage({ type: "error", text: response.data.error ?? "Token expirado. Reconecte o canal." });
        loadChannels();
      }
    } catch (err) {
      console.error("Erro ao testar conexão:", err);
      setMessage({ type: "error", text: "Falha ao testar conexão" });
    } finally {
      setTestingId(null);
    }
  };

  // Desconectar canal
  const handleDelete = async (channel: YouTubeChannel) => {
    if (!confirm(`Desconectar o canal "${channel.account_name}"? Esta ação não pode ser desfeita.`)) {
      return;
    }

    setDeletingId(channel.id);
    try {
      await apiFetch(`/api/channels/${channel.id}`, { method: "DELETE" });
      setMessage({ type: "success", text: `Canal "${channel.account_name}" desconectado` });
      setChannels((prev) => prev.filter((c) => c.id !== channel.id));
    } catch (err) {
      console.error("Erro ao desconectar:", err);
      setMessage({ type: "error", text: "Falha ao desconectar canal" });
    } finally {
      setDeletingId(null);
    }
  };

  // Abrir canal no YouTube
  const openChannel = (channelId: string) => {
    window.open(`https://www.youtube.com/channel/${channelId}`, "_blank");
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "connected":
        return { label: "Conectado", className: "status-connected" };
      case "expired":
        return { label: "Expirado", className: "status-expired" };
      case "pending":
        return { label: "Pendente", className: "status-pending" };
      case "disabled":
        return { label: "Desativado", className: "status-disabled" };
      default:
        return { label: status, className: "status-unknown" };
    }
  };

  return (
    <main className="app-shell">
      <AppSidebar />

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Configurações</p>
            <h1>Canais do YouTube</h1>
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

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Integração YouTube</p>
              <h2>Canais conectados</h2>
            </div>
            <button
              className="primary-button"
              onClick={handleConnect}
              disabled={connecting || loading}
            >
              {connecting ? (
                <>
                  <Loader2 size={17} className="spin" />
                  Conectando...
                </>
              ) : (
                <>
                  <Video size={17} />
                  Conectar canal do YouTube
                </>
              )}
            </button>
          </div>

          <div className="panel-body">
            {loading ? (
              <LoadingState label="Carregando canais..." />
            ) : channels.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <Video size={48} />
                </div>
                <h3>Nenhum canal conectado</h3>
                <p>
                  Conecte seu canal do YouTube para agendar e publicar vídeos diretamente pelo MyMarketing.
                  Usamos OAuth 2.0 seguro — você autoriza uma vez e nós cuidamos da renovação dos tokens.
                </p>
                <div className="empty-features">
                  <div className="feature">
                    <Shield size={20} />
                    <span>Tokens criptografados (AES-256-GCM)</span>
                  </div>
                  <div className="feature">
                    <RefreshCw size={20} />
                    <span>Renovação automática de access token</span>
                  </div>
                  <div className="feature">
                    <Info size={20} />
                    <span>Escopos: upload, gerenciamento, analytics, comentários</span>
                  </div>
                </div>
                <button className="primary-button" onClick={handleConnect} disabled={connecting}>
                  <Video size={17} />
                  Conectar meu canal do YouTube
                </button>
              </div>
            ) : (
              <div className="channels-grid">
                {channels.map((channel) => {
                  const status = getStatusBadge(channel.status);
                  return (
                    <article key={channel.id} className="channel-card">
                      <div className="channel-header">
                        <div className="channel-avatar">
                          <Video size={28} />
                        </div>
                        <div className="channel-info">
                          <h3>{channel.account_name}</h3>
                          <p className="channel-id">ID: {channel.provider_account_id}</p>
                        </div>
                        <span className={`status-badge ${status.className}`}>
                          {status.label}
                        </span>
                      </div>

                      <div className="channel-meta">
                        <div className="meta-item">
                          <span className="meta-label">Conectado em</span>
                          <span className="meta-value">{formatDate(channel.connected_at)}</span>
                        </div>
                        <div className="meta-item">
                          <span className="meta-label">Última atualização</span>
                          <span className="meta-value">{formatDate(channel.updated_at)}</span>
                        </div>
                      </div>

                      <div className="channel-actions">
                        <button
                          className="icon-button secondary"
                          onClick={() => handleTest(channel)}
                          disabled={testingId === channel.id}
                          title="Testar conexão"
                        >
                          {testingId === channel.id ? (
                            <Loader2 size={18} className="spin" />
                          ) : (
                            <RefreshCw size={18} />
                          )}
                        </button>
                        <button
                          className="icon-button secondary"
                          onClick={() => openChannel(channel.provider_account_id)}
                          title="Abrir no YouTube"
                        >
                          <ExternalLink size={18} />
                        </button>
                        <button
                          className="icon-button danger"
                          onClick={() => handleDelete(channel)}
                          disabled={deletingId === channel.id}
                          title="Desconectar canal"
                        >
                          {deletingId === channel.id ? (
                            <Loader2 size={18} className="spin" />
                          ) : (
                            <Trash2 size={18} />
                          )}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="panel info-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Como funciona</p>
              <h2>Integração com YouTube Data API v3</h2>
            </div>
          </div>
          <div className="info-grid">
            <div className="info-item">
              <h4>O que fazemos</h4>
              <ul>
                <li>Upload de vídeos via API resumível (suporta arquivos grandes)</li>
                <li>Agendamento nativo com <code>publishAt</code> (YouTube publica na hora exata)</li>
                <li>Metadados completos: título, descrição, tags, categoria, thumbnail, playlist, localização</li>
                <li>Coleta automática de métricas: views, likes, comentários, watch time, retenção</li>
                <li>Gerenciamento de comentários (ler, responder, moderar)</li>
              </ul>
            </div>
            <div className="info-item">
              <h4>Segurança</h4>
              <ul>
                <li>Refresh tokens criptografados com AES-256-GCM no banco</li>
                <li>Access tokens renovados automaticamente antes de cada uso</li>
                <li>Nenhum token salvo no frontend</li>
                <li>Service Role Key apenas no backend</li>
              </ul>
            </div>
            <div className="info-item">
              <h4>Limites da API</h4>
              <ul>
                <li>Cota padrão: 10.000 unidades/dia</li>
                <li>Upload de vídeo: ~1.600 unidades (~6 uploads/dia)</li>
                <li>Leitura de métricas: 1 unidade por vídeo</li>
                <li>Recomendamos solicitar aumento de cota no Google Cloud Console</li>
              </ul>
            </div>
          </div>
        </section>
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
        .info-panel {
          background: #f8fafc;
          border-color: #e2e8f0;
        }
        .info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 24px;
          padding: 24px;
        }
        .info-item h4 {
          font-size: 14px;
          font-weight: 600;
          color: #374151;
          margin-bottom: 12px;
        }
        .info-item ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .info-item li {
          font-size: 13px;
          color: #6b7280;
          padding: 6px 0;
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }
        .info-item li::before {
          content: "•";
          color: #0f766e;
          font-weight: bold;
        }
        .info-item code {
          background: #e5e7eb;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 12px;
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
        .primary-button:hover:not(:disabled) {
          background: #0d6d65;
        }
        .primary-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
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
        .icon-button.secondary {
          background: #f3f4f6;
          color: #374151;
        }
        .icon-button.secondary:hover:not(:disabled) {
          background: #e5e7eb;
        }
        .icon-button.danger {
          background: #fef2f2;
          color: #dc2626;
        }
        .icon-button.danger:hover:not(:disabled) {
          background: #fee2e2;
        }
        .icon-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Empty state */
        .empty-state {
          text-align: center;
          padding: 60px 24px;
        }
        .empty-icon {
          color: #d1d5db;
          margin-bottom: 16px;
        }
        .empty-state h3 {
          font-size: 20px;
          font-weight: 600;
          color: #111827;
          margin-bottom: 8px;
        }
        .empty-state p {
          color: #6b7280;
          max-width: 400px;
          margin: 0 auto 24px;
          line-height: 1.6;
        }
        .empty-features {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 24px;
          text-align: left;
          max-width: 360px;
          margin-left: auto;
          margin-right: auto;
        }
        .feature {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          font-size: 13px;
          color: #374151;
        }
        .feature svg {
          color: #0f766e;
          flex-shrink: 0;
        }

        /* Channels grid */
        .channels-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px;
        }
        .channel-card {
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 20px;
          background: #fff;
          transition: box-shadow 0.15s;
        }
        .channel-card:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        }
        .channel-header {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 16px;
        }
        .channel-avatar {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: #ecfdf5;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #0f766e;
          flex-shrink: 0;
        }
        .channel-info h3 {
          font-size: 16px;
          font-weight: 600;
          color: #111827;
          margin: 0 0 4px;
        }
        .channel-id {
          font-size: 12px;
          color: #9ca3af;
          margin: 0;
          font-family: monospace;
        }
        .status-badge {
          margin-left: auto;
          padding: 4px 10px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        .status-connected { background: #ecfdf5; color: #065f46; }
        .status-expired { background: #fef3c7; color: #92400e; }
        .status-pending { background: #e0e7ff; color: #3730a3; }
        .status-disabled { background: #f3f4f6; color: #6b7280; }
        .status-unknown { background: #f3f4f6; color: #6b7280; }

        .channel-meta {
          display: flex;
          gap: 24px;
          padding-bottom: 16px;
          border-bottom: 1px solid #f3f4f6;
          margin-bottom: 16px;
        }
        .meta-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .meta-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #9ca3af;
        }
        .meta-value {
          font-size: 13px;
          color: #374151;
        }

        .channel-actions {
          display: flex;
          gap: 8px;
        }

      `}</style>
    </main>
  );
}

// Wrapper component with Suspense boundary
import { Suspense } from "react";

function CanaisPageSuspenseFallback() {
  return <LoadingState label="Carregando canais..." variant="page" />;
}

function CanaisPageInner() {
  const searchParams = useSearchParams();
  const initialConnected = searchParams.get("connected");
  const initialError = searchParams.get("error");

  return (
    <CanaisPageContent initialConnected={initialConnected} initialError={initialError} />
  );
}

export default function CanaisPage() {
  return (
    <Suspense fallback={<CanaisPageSuspenseFallback />}>
      <CanaisPageInner />
    </Suspense>
  );
}
