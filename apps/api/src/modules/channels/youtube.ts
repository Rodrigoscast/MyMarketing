import { google, youtube_v3, youtubeAnalytics_v2 } from "googleapis";
import { decrypt, encrypt } from "../../lib/crypto.js";
import { getSupabase } from "../../lib/supabase.js";
import { env } from "../../config/index.js";
import { NotFoundError, AppError } from "../../lib/errors.js";

// Escopos necessários para o YouTube
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

/**
 * Cria cliente OAuth2 configurado
 */
export function createOAuth2Client() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
    throw new AppError("Configuração OAuth do Google incompleta", 500, "OAUTH_CONFIG_MISSING");
  }

  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI
  );
}

/**
 * Gera URL de autorização para conectar canal
 */
export function getAuthUrl(state?: string): string {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline", // necessário para receber refresh_token
    prompt: "consent", // força tela de consentimento para garantir refresh_token
    scope: YOUTUBE_SCOPES,
    state: state ?? "youtube_connect",
    include_granted_scopes: true,
  });
}

/**
 * Troca código de autorização por tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<{
  refresh_token: string;
  access_token?: string;
  expiry_date?: number;
}> {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    throw new AppError(
      "Refresh token não recebido. Reautorize com prompt=consent.",
      400,
      "NO_REFRESH_TOKEN"
    );
  }

  return {
    refresh_token: tokens.refresh_token!,
    access_token: tokens.access_token ?? undefined,
    expiry_date: tokens.expiry_date ?? undefined,
  };
}

/**
 * Obtém informações do canal autenticado
 */
export async function getChannelInfo(accessToken: string): Promise<{
  channelId: string;
  title: string;
  thumbnails?: youtube_v3.Schema$ThumbnailDetails;
}> {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  const response = await youtube.channels.list({
    part: ["snippet", "contentDetails", "statistics"],
    mine: true,
  });

  const channel = response.data.items?.[0];
  if (!channel) throw new NotFoundError("Canal do YouTube");

  return {
    channelId: channel.id!,
    title: channel.snippet?.title ?? "Canal sem nome",
    thumbnails: channel.snippet?.thumbnails,
  };
}

/**
 * Renova access token usando refresh token criptografado
 */
export async function refreshAccessToken(encryptedRefreshToken: string): Promise<string> {
  const refreshToken = decrypt(encryptedRefreshToken);
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  let credentials;
  try {
    ({ credentials } = await oauth2Client.refreshAccessToken());
  } catch (err) {
    if (isInvalidGrantError(err)) {
      throw new AppError(
        "A conexão com o YouTube expirou ou foi revogada. Reconecte o canal em Canais.",
        401,
        "YOUTUBE_TOKEN_EXPIRED"
      );
    }
    throw err;
  }

  if (!credentials.access_token) {
    throw new AppError("Falha ao renovar access token", 500, "TOKEN_REFRESH_FAILED");
  }

  return credentials.access_token;
}

function isInvalidGrantError(error: unknown): boolean {
  const maybeError = error as {
    message?: unknown;
    response?: { data?: { error?: unknown } };
  };

  return (
    maybeError.message === "invalid_grant" ||
    maybeError.response?.data?.error === "invalid_grant"
  );
}

/**
 * Cria cliente YouTube autenticado para um canal da organização
 */
export async function getAuthenticatedYouTubeClient(
  organizationId: string,
  socialAccountId: string
): Promise<{ youtube: youtube_v3.Youtube; youtubeAnalytics: youtubeAnalytics_v2.Youtubeanalytics; channelId: string }> {
  const supabase = getSupabase();

  const { data: account, error } = await supabase
    .from("social_accounts")
    .select("id, provider_account_id, token_reference")
    .eq("id", socialAccountId)
    .eq("organization_id", organizationId)
    .eq("platform_id", "youtube")
    .single();

  if (error || !account) throw new NotFoundError("Canal do YouTube");
  if (!account.token_reference) throw new AppError("Canal sem token de acesso", 400, "NO_TOKEN");

  let accessToken: string;
  try {
    accessToken = await refreshAccessToken(account.token_reference);
  } catch (err) {
    if (err instanceof AppError && err.code === "YOUTUBE_TOKEN_EXPIRED") {
      await supabase
        .from("social_accounts")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", account.id);
    }
    throw err;
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  return {
    youtube: google.youtube({ version: "v3", auth: oauth2Client }),
    youtubeAnalytics: google.youtubeAnalytics({ version: "v2", auth: oauth2Client }),
    channelId: account.provider_account_id,
  };
}

export async function syncYouTubeChannelVideos(
  organizationId: string,
  socialAccountId: string
): Promise<{ discovered: number; created: number; removed: number }> {
  const supabase = getSupabase();
  const { youtube, channelId } = await getAuthenticatedYouTubeClient(organizationId, socialAccountId);
  const channelResponse = await youtube.channels.list({
    part: ["contentDetails"],
    id: [channelId],
  });
  const uploadsPlaylistId = channelResponse.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) throw new AppError("Playlist de vídeos do canal não encontrada", 502, "YOUTUBE_UPLOADS_PLAYLIST_MISSING");

  const discoveredIds = new Set<string>();
  let pageToken: string | undefined;
  do {
    const page = await youtube.playlistItems.list({
      part: ["snippet", "contentDetails"],
      playlistId: uploadsPlaylistId,
      maxResults: 50,
      pageToken,
    });
    for (const item of page.data.items ?? []) {
      const videoId = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
      if (videoId) discoveredIds.add(videoId);
    }
    pageToken = page.data.nextPageToken ?? undefined;
  } while (pageToken);

  const videos = [] as youtube_v3.Schema$Video[];
  for (const ids of Array.from(discoveredIds).reduce<string[][]>((groups, id, index) => {
    const groupIndex = Math.floor(index / 50);
    groups[groupIndex] ??= [];
    groups[groupIndex].push(id);
    return groups;
  }, [])) {
    const response = await youtube.videos.list({
      part: ["snippet", "status"],
      id: ids,
      maxResults: 50,
    });
    videos.push(...(response.data.items ?? []));
  }

  const { data: localVideos, error: localError } = await supabase
    .from("youtube_videos")
    .select("id, youtube_video_id")
    .eq("organization_id", organizationId)
    .eq("social_account_id", socialAccountId)
    .not("youtube_video_id", "is", null);
  if (localError) throw localError;

  const existingByProviderId = new Map((localVideos ?? []).map((video) => [video.youtube_video_id!, video.id]));
  let created = 0;
  for (const video of videos) {
    if (!video.id || !video.snippet) continue;
    const payload = {
      title: video.snippet.title ?? "Vídeo sem título",
      description: video.snippet.description ?? "",
      tags: video.snippet.tags ?? [],
      category_id: video.snippet.categoryId ?? "22",
      privacy_status: video.status?.privacyStatus ?? "public",
      status: "published" as const,
      youtube_video_id: video.id,
      published_at: video.snippet.publishedAt ?? null,
      updated_at: new Date().toISOString(),
    };
    const localId = existingByProviderId.get(video.id);
    const query = localId
      ? supabase.from("youtube_videos").update(payload).eq("id", localId)
      : supabase.from("youtube_videos").insert({
          organization_id: organizationId,
          social_account_id: socialAccountId,
          language: video.snippet.defaultLanguage ?? "pt",
          ...payload,
        });
    const { error } = await query;
    if (error) throw error;
    if (!localId) created++;
  }

  const staleIds = (localVideos ?? [])
    .filter((video) => video.youtube_video_id && !discoveredIds.has(video.youtube_video_id))
    .map((video) => video.id);
  if (staleIds.length > 0) {
    const { error } = await supabase.from("youtube_videos").delete().in("id", staleIds);
    if (error) throw error;
  }

  return { discovered: videos.length, created, removed: staleIds.length };
}

/**
 * Salva/atualiza canal conectado no banco
 */
export async function saveConnectedChannel(
  organizationId: string,
  userId: string | undefined,
  channelInfo: { channelId: string; title: string },
  tokens: { refresh_token: string; access_token?: string; expiry_date?: number }
) {
  const supabase = getSupabase();
  const encryptedRefreshToken = encrypt(tokens.refresh_token);

  const { data, error } = await supabase
    .from("social_accounts")
    .upsert(
      {
        organization_id: organizationId,
        platform_id: "youtube",
        account_name: channelInfo.title,
        provider_account_id: channelInfo.channelId,
        token_reference: encryptedRefreshToken,
        status: "connected",
        connected_at: new Date().toISOString(),
      },
      {
        onConflict: "organization_id,platform_id,provider_account_id",
        ignoreDuplicates: false,
      }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}
