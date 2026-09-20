import { getSupabase } from "../../lib/supabase.js";
import { getAuthenticatedYouTubeClient } from "../channels/youtube.js";
import { syncYouTubeChannelVideos } from "../channels/youtube.js";
import { AppError } from "../../lib/errors.js";
function describeExternalError(err) {
    if (err instanceof Error && err.message)
        return err.message;
    if (typeof err === "string")
        return err;
    const maybeError = err;
    const apiError = maybeError?.response?.data?.error ?? maybeError?.errors?.[0] ?? maybeError?.error;
    if (apiError) {
        if (typeof apiError === "string")
            return apiError;
        const reason = apiError.reason ?? apiError.errors?.[0]?.reason;
        const message = apiError.message ?? apiError.errors?.[0]?.message;
        if (reason && message)
            return `${message} (${reason})`;
        if (message)
            return message;
        if (reason)
            return reason;
    }
    try {
        return JSON.stringify(err);
    }
    catch {
        return "Erro desconhecido";
    }
}
function isCommentsUnavailableError(err) {
    const errorText = describeExternalError(err);
    return /disabled comments|comments.*disabled|commentsDisabled|commentThreadForbidden|coment[aá]rios desativados/i.test(errorText);
}
/**
 * Coleta métricas de um vídeo via YouTube Analytics API
 */
async function fetchVideoMetrics(youtubeAnalytics, channelId, videoId) {
    const metrics = [
        "views",
        "likes",
        "dislikes",
        "comments",
        "shares",
        "estimatedMinutesWatched",
        "averageViewDuration",
        "averageViewPercentage",
        "subscribersGained",
        "subscribersLost",
    ].join(",");
    // Métricas básicas
    const basicResponse = await youtubeAnalytics.reports.query({
        ids: `channel==${channelId}`,
        startDate: "2005-04-01", // Data mínima do YouTube
        endDate: new Date().toISOString().split("T")[0],
        metrics,
        filters: `video==${videoId}`,
    });
    const row = basicResponse.data.rows?.[0] ?? [];
    // Fontes de tráfego
    let trafficSources = {};
    try {
        const trafficResponse = await youtubeAnalytics.reports.query({
            ids: `channel==${channelId}`,
            startDate: "2005-04-01",
            endDate: new Date().toISOString().split("T")[0],
            metrics: "views",
            dimensions: "insightTrafficSourceType",
            filters: `video==${videoId}`,
            sort: "-views",
        });
        trafficSources = Object.fromEntries((trafficResponse.data.rows ?? []).map((r) => [r[0], Number(r[1])]));
    }
    catch {
        // Ignorar erro de fontes de tráfego
    }
    // Geografia
    let geography = {};
    try {
        const geoResponse = await youtubeAnalytics.reports.query({
            ids: `channel==${channelId}`,
            startDate: "2005-04-01",
            endDate: new Date().toISOString().split("T")[0],
            metrics: "views",
            dimensions: "country",
            filters: `video==${videoId}`,
            sort: "-views",
            maxResults: 20,
        });
        geography = Object.fromEntries((geoResponse.data.rows ?? []).map((r) => [r[0], Number(r[1])]));
    }
    catch {
        // Ignorar erro de geografia
    }
    // Tipos de dispositivo
    let deviceTypes = {};
    try {
        const deviceResponse = await youtubeAnalytics.reports.query({
            ids: `channel==${channelId}`,
            startDate: "2005-04-01",
            endDate: new Date().toISOString().split("T")[0],
            metrics: "views",
            dimensions: "deviceType",
            filters: `video==${videoId}`,
            sort: "-views",
        });
        deviceTypes = Object.fromEntries((deviceResponse.data.rows ?? []).map((r) => [r[0], Number(r[1])]));
    }
    catch {
        // Ignorar erro de dispositivos
    }
    return {
        views: Number(row[0] ?? 0),
        likes: Number(row[1] ?? 0),
        comments: Number(row[3] ?? 0),
        shares: Number(row[4] ?? 0),
        watchTimeMin: Number(row[5] ?? 0),
        avgViewDuration: Number(row[6] ?? 0),
        avgPercentageViewed: Number(row[7] ?? 0),
        subscribersGained: Number(row[8] ?? 0),
        subscribersLost: Number(row[9] ?? 0),
        trafficSources,
        geography,
        deviceTypes,
    };
}
async function fetchVideoStatistics(youtube, videoId) {
    const response = await youtube.videos.list({
        part: ["statistics"],
        id: [videoId],
    });
    const statistics = response.data.items?.[0]?.statistics;
    return {
        views: Number(statistics?.viewCount ?? 0),
        likes: Number(statistics?.likeCount ?? 0),
        comments: Number(statistics?.commentCount ?? 0),
    };
}
/**
 * Coleta comentários de um vídeo via YouTube Data API
 */
async function fetchVideoComments(youtube, videoId, pageToken) {
    const response = await youtube.commentThreads.list({
        part: ["snippet", "replies"],
        videoId,
        maxResults: 100,
        order: "time",
        pageToken,
        textFormat: "plainText",
    });
    const comments = (response.data.items ?? [])
        .filter((item) => !!item.snippet?.topLevelComment?.snippet)
        .map((item) => {
        const topComment = item.snippet.topLevelComment.snippet;
        const topCommentId = item.snippet.topLevelComment.id;
        const replies = item.replies?.comments
            ?.filter((reply) => !!reply.snippet && !!reply.id) ?? [];
        return {
            provider_comment_id: topCommentId,
            author_channel_id: topComment.authorChannelId?.value,
            author_name: topComment.authorDisplayName,
            author_avatar_url: topComment.authorProfileImageUrl,
            text: topComment.textDisplay,
            like_count: topComment.likeCount ?? 0,
            reply_count: item.snippet.totalReplyCount ?? 0,
            is_reply: false,
            can_reply: item.snippet.canReply ?? true,
            is_public: true,
            moderation_status: "published",
            published_at: topComment.publishedAt,
            updated_at: topComment.updatedAt,
            replies: replies.map((reply) => {
                const replySnippet = reply.snippet;
                return {
                    provider_comment_id: reply.id,
                    author_channel_id: replySnippet.authorChannelId?.value,
                    author_name: replySnippet.authorDisplayName,
                    author_avatar_url: replySnippet.authorProfileImageUrl,
                    text: replySnippet.textDisplay,
                    like_count: replySnippet.likeCount ?? 0,
                    is_reply: true,
                    parent_comment_id: topCommentId,
                    published_at: replySnippet.publishedAt,
                    updated_at: replySnippet.updatedAt,
                };
            }),
        };
    });
    return {
        comments,
        nextPageToken: response.data.nextPageToken ?? undefined,
    };
}
/**
 * Salva snapshot de métricas no banco
 */
async function saveMetricsSnapshot(supabase, youtubeVideoId, metrics) {
    const { error } = await supabase.from("video_metrics_snapshots").upsert({
        youtube_video_id: youtubeVideoId,
        views: metrics.views,
        likes: metrics.likes,
        comments: metrics.comments,
        shares: metrics.shares,
        watch_time_min: metrics.watchTimeMin,
        avg_view_duration: metrics.avgViewDuration,
        avg_percentage_viewed: metrics.avgPercentageViewed,
        subscribers_gained: metrics.subscribersGained,
        subscribers_lost: metrics.subscribersLost,
        traffic_sources: metrics.trafficSources,
        geography: metrics.geography,
        device_types: metrics.deviceTypes,
        captured_at: new Date().toISOString(),
        source: "api",
    }, {
        onConflict: "youtube_video_id,captured_at",
        ignoreDuplicates: false,
    });
    if (error)
        throw error;
}
/**
 * Salva comentários no banco
 */
async function saveComments(supabase, youtubeVideoId, comments) {
    for (const comment of comments) {
        // Salvar comentário principal
        const { data: parentComment, error: parentError } = await supabase
            .from("video_comments")
            .upsert({
            youtube_video_id: youtubeVideoId,
            provider_comment_id: comment.provider_comment_id,
            author_channel_id: comment.author_channel_id,
            author_name: comment.author_name,
            author_avatar_url: comment.author_avatar_url,
            text: comment.text,
            like_count: comment.like_count,
            reply_count: comment.reply_count,
            is_reply: comment.is_reply,
            can_reply: comment.can_reply,
            is_public: comment.is_public,
            moderation_status: comment.moderation_status,
            published_at: comment.published_at,
            updated_at: comment.updated_at,
        }, {
            onConflict: "youtube_video_id,provider_comment_id",
            ignoreDuplicates: false,
        })
            .select()
            .single();
        if (parentError)
            throw parentError;
        // Salvar respostas se houver
        if (comment.replies && comment.replies.length > 0) {
            const repliesWithParent = comment.replies.map((reply) => ({
                ...reply,
                youtube_video_id: youtubeVideoId,
                reply_count: 0,
                parent_comment_id: parentComment.id,
            }));
            const { error: repliesError } = await supabase
                .from("video_comments")
                .upsert(repliesWithParent, {
                onConflict: "youtube_video_id,provider_comment_id",
                ignoreDuplicates: false,
            });
            if (repliesError)
                throw repliesError;
        }
    }
}
/**
 * Processa métricas e comentários para todos os vídeos publicados da organização
 */
export async function collectAnalyticsForOrg(organizationId) {
    const supabase = getSupabase();
    const errors = [];
    let videosProcessed = 0;
    let metricsCollected = 0;
    let commentsCollected = 0;
    const { data: channels, error: channelsError } = await supabase
        .from("social_accounts")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("platform_id", "youtube")
        .eq("status", "connected");
    if (channelsError)
        throw channelsError;
    for (const channel of channels ?? []) {
        try {
            await syncYouTubeChannelVideos(organizationId, channel.id);
        }
        catch (err) {
            errors.push(`Sincronização do canal ${channel.id} falhou: ${describeExternalError(err)}`);
        }
    }
    // Buscar todos os vídeos publicados, incluindo os importados do canal.
    const { data: videos, error } = await supabase
        .from("youtube_videos")
        .select(`
      id,
      youtube_video_id,
      social_account_id,
      social_accounts!social_account_id(provider_account_id, token_reference)
    `)
        .eq("organization_id", organizationId)
        .eq("status", "published")
        .not("youtube_video_id", "is", null);
    if (error) {
        throw new AppError("Falha ao buscar vídeos para analytics", 500, "ANALYTICS_FETCH_FAILED");
    }
    if (!videos || videos.length === 0) {
        return { videosProcessed: 0, metricsCollected: 0, commentsCollected: 0, errors: [] };
    }
    console.log(`[Analytics] Coletando métricas para ${videos.length} vídeo(s) da org ${organizationId}`);
    for (const video of videos) {
        videosProcessed++;
        const youtubeVideoId = video.youtube_video_id;
        // social_accounts vem como array do Supabase
        const socialAccount = Array.isArray(video.social_accounts) ? video.social_accounts[0] : video.social_accounts;
        const channelId = socialAccount?.provider_account_id;
        const tokenRef = socialAccount?.token_reference;
        if (!channelId || !tokenRef) {
            errors.push(`Vídeo ${video.id}: canal ou token não encontrado`);
            continue;
        }
        try {
            // Obter cliente autenticado
            const { youtube, youtubeAnalytics } = await getAuthenticatedYouTubeClient(organizationId, video.social_account_id);
            // 1. Coletar métricas
            try {
                const metrics = await fetchVideoMetrics(youtubeAnalytics, channelId, youtubeVideoId);
                const statistics = await fetchVideoStatistics(youtube, youtubeVideoId);
                await saveMetricsSnapshot(supabase, video.id, { ...metrics, ...statistics });
                metricsCollected++;
                console.log(`[Analytics] Métricas coletadas para ${youtubeVideoId}`);
            }
            catch (err) {
                const msg = `Métricas falharam para ${youtubeVideoId}: ${describeExternalError(err)}`;
                errors.push(msg);
                console.error(`[Analytics] ${msg}`);
            }
            // 2. Coletar comentários (paginar até 500)
            try {
                let pageToken;
                let totalComments = 0;
                do {
                    const result = await fetchVideoComments(youtube, youtubeVideoId, pageToken);
                    if (result.comments.length > 0) {
                        await saveComments(supabase, video.id, result.comments);
                        totalComments += result.comments.length;
                    }
                    pageToken = result.nextPageToken;
                } while (pageToken && totalComments < 500);
                commentsCollected += totalComments;
                console.log(`[Analytics] ${totalComments} comentários coletados para ${youtubeVideoId}`);
            }
            catch (err) {
                if (isCommentsUnavailableError(err)) {
                    console.info(`[Analytics] Comentários desativados para ${youtubeVideoId}`);
                }
                else {
                    const errorText = describeExternalError(err);
                    const msg = `Comentários falharam para ${youtubeVideoId}: ${errorText}`;
                    errors.push(msg);
                    console.error(`[Analytics] ${msg}`);
                }
            }
        }
        catch (err) {
            const msg = `Erro geral para vídeo ${video.id}: ${describeExternalError(err)}`;
            errors.push(msg);
            console.error(`[Analytics] ${msg}`);
        }
    }
    return { videosProcessed, metricsCollected, commentsCollected, errors };
}
/**
 * Coleta métricas para um vídeo específico (para atualização manual)
 */
export async function collectAnalyticsForVideo(organizationId, socialAccountId, videoDbId) {
    const supabase = getSupabase();
    const errors = [];
    let metricsCollected = false;
    let commentsCollected = 0;
    const { data: video, error } = await supabase
        .from("youtube_videos")
        .select(`
      id,
      youtube_video_id,
      social_accounts!social_account_id(provider_account_id)
    `)
        .eq("id", videoDbId)
        .eq("organization_id", organizationId)
        .eq("social_account_id", socialAccountId)
        .eq("status", "published")
        .not("youtube_video_id", "is", null)
        .single();
    if (error || !video) {
        throw new AppError("Vídeo não encontrado ou não publicado", 404, "VIDEO_NOT_FOUND");
    }
    const youtubeVideoId = video.youtube_video_id;
    // social_accounts vem como array do Supabase
    const socialAccount = Array.isArray(video.social_accounts) ? video.social_accounts[0] : video.social_accounts;
    const channelId = socialAccount?.provider_account_id;
    if (!channelId) {
        throw new AppError("Canal não encontrado", 404, "CHANNEL_NOT_FOUND");
    }
    try {
        const { youtube, youtubeAnalytics } = await getAuthenticatedYouTubeClient(organizationId, socialAccountId);
        // Métricas
        try {
            const metrics = await fetchVideoMetrics(youtubeAnalytics, channelId, youtubeVideoId);
            const statistics = await fetchVideoStatistics(youtube, youtubeVideoId);
            await saveMetricsSnapshot(supabase, video.id, { ...metrics, ...statistics });
            metricsCollected = true;
        }
        catch (err) {
            errors.push(`Métricas: ${describeExternalError(err)}`);
        }
        // Comentários
        try {
            let pageToken;
            do {
                const result = await fetchVideoComments(youtube, youtubeVideoId, pageToken);
                if (result.comments.length > 0) {
                    await saveComments(supabase, video.id, result.comments);
                    commentsCollected += result.comments.length;
                }
                pageToken = result.nextPageToken;
            } while (pageToken && commentsCollected < 500);
        }
        catch (err) {
            if (isCommentsUnavailableError(err)) {
                console.info(`[Analytics] Comentários desativados para ${youtubeVideoId}`);
            }
            else {
                errors.push(`Comentários: ${describeExternalError(err)}`);
            }
        }
    }
    catch (err) {
        errors.push(`Geral: ${describeExternalError(err)}`);
    }
    return { metricsCollected, commentsCollected, errors };
}
/**
 * Função principal para rodar como cron job multi-org
 */
export async function runAnalyticsCollection() {
    console.log(`[Analytics] Iniciando coleta ${new Date().toISOString()}`);
    const supabase = getSupabase();
    // Buscar todas as organizações que têm vídeos publicados
    const { data: orgs, error } = await supabase
        .from("youtube_videos")
        .select("organization_id")
        .eq("status", "published")
        .not("youtube_video_id", "is", null);
    if (error) {
        console.error("[Analytics] Erro ao buscar orgs:", error);
        return;
    }
    const orgIds = [...new Set((orgs ?? []).map((o) => o.organization_id))];
    for (const orgId of orgIds) {
        try {
            const result = await collectAnalyticsForOrg(orgId);
            console.log(`[Analytics] Org ${orgId}: ${result.videosProcessed} vídeos, ${result.metricsCollected} métricas, ${result.commentsCollected} comentários`);
            if (result.errors.length > 0) {
                console.error(`[Analytics] Org ${orgId} erros:`, result.errors);
            }
        }
        catch (err) {
            console.error(`[Analytics] Erro crítico na org ${orgId}:`, err);
        }
    }
    console.log(`[Analytics] Coleta concluída ${new Date().toISOString()}`);
}
// Permitir execução direta: `tsx src/modules/analytics/worker.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
    runAnalyticsCollection().then(() => process.exit(0)).catch(() => process.exit(1));
}
