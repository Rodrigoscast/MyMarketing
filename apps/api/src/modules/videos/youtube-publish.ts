import { google, youtube_v3 } from "googleapis";
import { getSupabase } from "../../lib/supabase.js";
import { getAuthenticatedYouTubeClient } from "../channels/youtube.js";
import { NotFoundError, AppError } from "../../lib/errors.js";
import { promises as fs } from "node:fs";

/**
 * Upload de vídeo para o YouTube usando upload resumível
 * Suporta arquivos grandes (até 2GB) e agendamento nativo com publishAt
 */
export async function publishVideoToYouTube(params: {
  organizationId: string;
  socialAccountId: string;
  videoId: string; // youtube_videos.id
  filePath: string;
  metadata: {
    title: string;
    description: string;
    tags: string[];
    categoryId: string;
    privacyStatus: "private" | "unlisted" | "public";
    publishAt?: string; // ISO 8601 para agendamento nativo
    madeForKids: boolean;
    license: "youtube" | "creativeCommon";
    language: string;
    recordingDate?: string;
    locationLat?: number;
    locationLng?: number;
    playlistId?: string;
  };
}): Promise<{ youtubeVideoId: string; publishedAt?: string }> {
  const supabase = getSupabase();

  // Obter cliente autenticado
  const { youtube, channelId } = await getAuthenticatedYouTubeClient(
    params.organizationId,
    params.socialAccountId
  );

  // Preparar metadados para a API do YouTube
  const videoMetadata: youtube_v3.Schema$Video = {
    snippet: {
      title: params.metadata.title,
      description: params.metadata.description,
      tags: params.metadata.tags,
      categoryId: params.metadata.categoryId,
      defaultLanguage: params.metadata.language,
      defaultAudioLanguage: params.metadata.language,
    },
    status: {
      privacyStatus: params.metadata.privacyStatus,
      publishAt: params.metadata.publishAt, // YouTube agenda nativamente se privacyStatus=private e publishAt futuro
      madeForKids: params.metadata.madeForKids,
      license: params.metadata.license,
      selfDeclaredMadeForKids: params.metadata.madeForKids,
    },
    recordingDetails: params.metadata.recordingDate
      ? {
          recordingDate: params.metadata.recordingDate,
          location: params.metadata.locationLat && params.metadata.locationLng
            ? {
                latitude: params.metadata.locationLat,
                longitude: params.metadata.locationLng,
              }
            : undefined,
        }
      : undefined,
  };

  // Upload resumível
  const media = {
    body: await fs.open(params.filePath, "r").then((fh) => fh.createReadStream()),
    mimeType: "video/*",
  };

  try {
    console.log(`[YouTube] Iniciando upload do vídeo ${params.videoId} para canal ${channelId}`);

    const response = await youtube.videos.insert({
      part: ["snippet", "status", "recordingDetails"],
      requestBody: videoMetadata,
      media: media,
      // Upload resumível automático para arquivos grandes
    });

    const youtubeVideoId = response.data.id!;
    console.log(`[YouTube] Upload concluído: ${youtubeVideoId}`);

    // Adicionar à playlist se especificado
    if (params.metadata.playlistId) {
      await youtube.playlistItems.insert({
        part: ["snippet"],
        requestBody: {
          snippet: {
            playlistId: params.metadata.playlistId,
            resourceId: {
              kind: "youtube#video",
              videoId: youtubeVideoId,
            },
          },
        },
      });
      console.log(`[YouTube] Vídeo adicionado à playlist ${params.metadata.playlistId}`);
    }

    // Determinar quando foi publicado (ou será publicado)
    let publishedAt: string | undefined;
    if (params.metadata.privacyStatus === "public" && !params.metadata.publishAt) {
      publishedAt = new Date().toISOString();
    } else if (params.metadata.publishAt) {
      publishedAt = params.metadata.publishAt;
    }

    return { youtubeVideoId, publishedAt };
  } catch (err) {
    console.error(`[YouTube] Erro no upload:`, err);
    throw new AppError(
      `Falha no upload para YouTube: ${err instanceof Error ? err.message : "Erro desconhecido"}`,
      500,
      "YOUTUBE_UPLOAD_FAILED"
    );
  }
}

/**
 * Atualizar metadados de vídeo já publicado no YouTube
 */
export async function updateYouTubeVideoMetadata(params: {
  organizationId: string;
  socialAccountId: string;
  youtubeVideoId: string;
  metadata: {
    title?: string;
    description?: string;
    tags?: string[];
    categoryId?: string;
    privacyStatus?: "private" | "unlisted" | "public";
    madeForKids?: boolean;
    license?: "youtube" | "creativeCommon";
    language?: string;
    recordingDate?: string;
    locationLat?: number;
    locationLng?: number;
  };
}): Promise<void> {
  const { youtube } = await getAuthenticatedYouTubeClient(
    params.organizationId,
    params.socialAccountId
  );

  // Buscar vídeo atual para preservar campos não enviados
  const current = await youtube.videos.list({
    part: ["snippet", "status", "recordingDetails"],
    id: [params.youtubeVideoId],
  });

  const existing = current.data.items?.[0];
  if (!existing) throw new NotFoundError("Vídeo no YouTube");

  const updated: youtube_v3.Schema$Video = {
    id: params.youtubeVideoId,
    snippet: {
      title: params.metadata.title ?? existing.snippet?.title,
      description: params.metadata.description ?? existing.snippet?.description,
      tags: params.metadata.tags ?? existing.snippet?.tags,
      categoryId: params.metadata.categoryId ?? existing.snippet?.categoryId,
      defaultLanguage: params.metadata.language ?? existing.snippet?.defaultLanguage,
      defaultAudioLanguage: params.metadata.language ?? existing.snippet?.defaultAudioLanguage,
    },
    status: {
      privacyStatus: params.metadata.privacyStatus ?? existing.status?.privacyStatus,
      madeForKids: params.metadata.madeForKids ?? existing.status?.madeForKids,
      license: params.metadata.license ?? existing.status?.license,
      selfDeclaredMadeForKids: params.metadata.madeForKids ?? existing.status?.selfDeclaredMadeForKids,
    },
    recordingDetails:
      params.metadata.recordingDate || params.metadata.locationLat || params.metadata.locationLng
        ? {
            recordingDate: params.metadata.recordingDate ?? existing.recordingDetails?.recordingDate,
            location:
              params.metadata.locationLat && params.metadata.locationLng
                ? {
                    latitude: params.metadata.locationLat,
                    longitude: params.metadata.locationLng,
                  }
                : existing.recordingDetails?.location,
          }
        : existing.recordingDetails,
  };

  await youtube.videos.update({
    part: ["snippet", "status", "recordingDetails"],
    requestBody: updated,
  });

  console.log(`[YouTube] Metadados atualizados para ${params.youtubeVideoId}`);
}

/**
 * Excluir vídeo do YouTube
 */
export async function deleteYouTubeVideo(params: {
  organizationId: string;
  socialAccountId: string;
  youtubeVideoId: string;
}): Promise<void> {
  const { youtube } = await getAuthenticatedYouTubeClient(
    params.organizationId,
    params.socialAccountId
  );

  await youtube.videos.delete({
    id: params.youtubeVideoId,
  });

  console.log(`[YouTube] Vídeo ${params.youtubeVideoId} excluído`);
}

/**
 * Obter detalhes de vídeo do YouTube (para sincronizar métricas/status)
 */
export async function getYouTubeVideoDetails(params: {
  organizationId: string;
  socialAccountId: string;
  youtubeVideoId: string;
}): Promise<youtube_v3.Schema$Video> {
  const { youtube } = await getAuthenticatedYouTubeClient(
    params.organizationId,
    params.socialAccountId
  );

  const response = await youtube.videos.list({
    part: ["snippet", "status", "statistics", "contentDetails", "recordingDetails"],
    id: [params.youtubeVideoId],
  });

  const video = response.data.items?.[0];
  if (!video) throw new NotFoundError("Vídeo no YouTube");

  return video;
}