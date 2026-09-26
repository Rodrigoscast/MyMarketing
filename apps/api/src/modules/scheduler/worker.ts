import { getSupabase } from "../../lib/supabase.js";
import { publishVideoToYouTube } from "../videos/youtube-publish.js";
import { startAnalyticsJob } from "../../jobs/analyticsJobs.js";
import { NotFoundError, AppError } from "../../lib/errors.js";
import { promises as fs } from "node:fs";
import { checkQuotaForUpload, logQuotaUsage } from "../analytics/quota.js";

/**
 * Worker de publicação - processa vídeos agendados e publica no YouTube
 * Executado pelo agendador em processo e também pode ser chamado pela API.
 */
type PublicationQueueResult = {
  processed: number;
  succeeded: number;
  failed: number;
  errors: string[];
};

let activeQueueRun: Promise<PublicationQueueResult> | null = null;

export function processPublicationQueue(): Promise<PublicationQueueResult> {
  if (!activeQueueRun) {
    activeQueueRun = processPublicationQueueInternal().finally(() => {
      activeQueueRun = null;
    });
  }
  return activeQueueRun;
}

async function processPublicationQueueInternal(): Promise<PublicationQueueResult> {
  const supabase = getSupabase();
  const errors: string[] = [];
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const successfulOrganizationIds = new Set<string>();

  // Buscar vídeos prontos para publicação (status=scheduled e publish_at <= agora)
  // Ou vídeos com status=publishing (retry)
  const now = new Date().toISOString();

  const { data: videos, error } = await supabase
    .from("youtube_videos")
    .select(`
      id,
      title,
      description,
      tags,
      category_id,
      privacy_status,
      publish_at,
      made_for_kids,
      license,
      language,
      recording_date,
      location_lat,
      location_lng,
      playlist_id,
      thumbnail_path,
      status,
      social_account_id,
      asset_id,
      organization_id,
      scheduled_post_id,
      content_assets!asset_id(storage_path, file_name, mime_type, size_bytes),
      social_accounts!social_account_id(account_name, provider_account_id)
    `)
    .in("status", ["scheduled", "publishing"])
    .lte("publish_at", now)
    .order("publish_at", { ascending: true })
    .limit(10); // Processar em lotes de 10 para não estourar cota

  if (error) {
    console.error("[Scheduler] Erro ao buscar fila:", error);
    throw new AppError("Falha ao buscar fila de publicação", 500, "QUEUE_FETCH_FAILED");
  }

  if (!videos || videos.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, errors: [] };
  }

  console.log(`[Scheduler] Processando ${videos.length} vídeo(s) da fila`);

  for (const video of videos) {
    processed++;
    const videoId = video.id;
    const asset = Array.isArray(video.content_assets) ? video.content_assets[0] : video.content_assets;
    const scheduledPostId = video.scheduled_post_id;

    try {
      // Verificar se tem arquivo
      if (!asset) {
        throw new AppError("Vídeo sem arquivo associado", 400, "MISSING_ASSET");
      }

      // Verificar se arquivo existe
      await fs.access(asset.storage_path);

      // Verificar quota antes de publicar
      const quotaCheck = await checkQuotaForUpload(video.organization_id);
      if (!quotaCheck.canUpload) {
        throw new AppError(quotaCheck.error ?? "Quota insuficiente para upload", 429, "QUOTA_EXCEEDED");
      }

      // Marcar como publishing
      await supabase
        .from("youtube_videos")
        .update({ status: "publishing", updated_at: new Date().toISOString() })
        .eq("id", videoId);

      // Preparar metadados
      const metadata = {
        title: video.title,
        description: video.description,
        tags: video.tags,
        categoryId: video.category_id,
        privacyStatus: video.privacy_status as "private" | "unlisted" | "public",
        publishAt: video.publish_at,
        madeForKids: video.made_for_kids,
        license: video.license as "youtube" | "creativeCommon",
        language: video.language,
        recordingDate: video.recording_date,
        locationLat: video.location_lat,
        locationLng: video.location_lng,
        playlistId: video.playlist_id,
      };

      // Publicar no YouTube
      const result = await publishVideoToYouTube({
        organizationId: video.organization_id,
        socialAccountId: video.social_account_id,
        videoId: videoId,
        filePath: asset.storage_path,
        metadata,
      });

      // Registrar uso de quota
      await logQuotaUsage(video.organization_id, "VIDEOS_INSERT", { videoId, youtubeVideoId: result.youtubeVideoId });

      // Atualizar vídeo com sucesso
      await supabase
        .from("youtube_videos")
        .update({
          status: "published",
          youtube_video_id: result.youtubeVideoId,
          published_at: result.publishedAt ?? new Date().toISOString(),
          youtube_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", videoId);

      // Atualizar scheduled_post se existir
      if (scheduledPostId) {
        await supabase
          .from("scheduled_posts")
          .update({ status: "published", published_at: result.publishedAt })
          .eq("id", scheduledPostId);

        await supabase
          .from("scheduled_post_targets")
          .update({ platform_status: "published", platform_post_id: result.youtubeVideoId })
          .eq("scheduled_post_id", scheduledPostId)
          .eq("platform_id", "youtube");
      }

      succeeded++;
      successfulOrganizationIds.add(video.organization_id);
      console.log(`[Scheduler] Vídeo ${videoId} publicado com sucesso: ${result.youtubeVideoId}`);
    } catch (err) {
      failed++;
      const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
      errors.push(`Vídeo ${videoId}: ${errorMsg}`);

      console.error(`[Scheduler] Falha ao publicar vídeo ${videoId}:`, err);

      // Marcar como failed
      await supabase
        .from("youtube_videos")
        .update({
          status: "failed",
          youtube_error: errorMsg,
          updated_at: new Date().toISOString(),
        })
        .eq("id", videoId);

      // Atualizar scheduled_post se existir
      if (scheduledPostId) {
        await supabase
          .from("scheduled_posts")
          .update({ status: "failed", error_message: errorMsg })
          .eq("id", scheduledPostId);

        await supabase
          .from("scheduled_post_targets")
          .update({ platform_status: "failed", platform_error: errorMsg })
          .eq("scheduled_post_id", scheduledPostId)
          .eq("platform_id", "youtube");
      }
    }
  }

  for (const organizationId of successfulOrganizationIds) {
    startAnalyticsJob(organizationId);
  }

  return { processed, succeeded, failed, errors };
}

/**
 * Verificar e sincronizar status de vídeos publicados
 * Útil para corrigir inconsistências
 */
export async function syncPublishedVideos(): Promise<{ synced: number; errors: string[] }> {
  const supabase = getSupabase();
  const errors: string[] = [];
  let synced = 0;

  // Buscar vídeos marcados como published mas sem youtube_video_id
  const { data: videos, error } = await supabase
    .from("youtube_videos")
    .select("id, organization_id, social_account_id, youtube_video_id")
    .eq("status", "published")
    .is("youtube_video_id", null)
    .limit(20);

  if (error) throw error;

  for (const video of videos ?? []) {
    try {
      // Tentar buscar pelo título/data no canal (fallback)
      // Por enquanto apenas log
      console.warn(`[Scheduler] Vídeo ${video.id} marcado como published mas sem youtube_video_id`);
      errors.push(`Vídeo ${video.id}: publicado sem ID do YouTube`);
    } catch (err) {
      errors.push(`Vídeo ${video.id}: ${err instanceof Error ? err.message : "Erro"}`);
    }
  }

  return { synced, errors };
}

/**
 * Função principal para rodar como cron job
 */
export async function runScheduler(): Promise<void> {
  console.log(`[Scheduler] Iniciando execução ${new Date().toISOString()}`);

  try {
    const result = await processPublicationQueue();
    console.log(
      `[Scheduler] Concluído: ${result.processed} processados, ${result.succeeded} sucessos, ${result.failed} falhas`
    );
    if (result.errors.length > 0) {
      console.error("[Scheduler] Erros:", result.errors);
    }
  } catch (err) {
    console.error("[Scheduler] Erro crítico:", err);
  }
}

// Permitir execução direta: `tsx src/modules/scheduler/worker.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  runScheduler().then(() => process.exit(0)).catch(() => process.exit(1));
}
