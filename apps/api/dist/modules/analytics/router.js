import { Router } from "express";
import { z } from "zod";
import { getSupabase } from "../../lib/supabase.js";
import { authAndOrg } from "../auth/middleware.js";
import { NotFoundError } from "../../lib/errors.js";
import { collectAnalyticsForOrg, collectAnalyticsForVideo } from "./worker.js";
import { startOfDay, endOfDay, format } from "date-fns";
const router = Router();
router.use(...authAndOrg);
// GET /api/analytics/overview - Visão geral de engajamento da org
router.get("/overview", async (req, res) => {
    const supabase = getSupabase();
    // Totais agregados dos últimos 30 dias
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const { data: totals, error: totalsError } = await supabase
        .from("video_metrics_snapshots")
        .select(`
      views, likes, comments, shares, watch_time_min, avg_view_duration,
      youtube_videos!inner(organization_id)
    `)
        .eq("youtube_videos.organization_id", req.organizationId)
        .gte("captured_at", since.toISOString())
        .order("captured_at", { ascending: false });
    if (totalsError)
        throw totalsError;
    // Último snapshot por vídeo (para cards de resumo)
    const { data: latestSnapshots, error: latestError } = await supabase
        .from("video_metrics_snapshots")
        .select(`
      views, likes, comments, shares, watch_time_min, captured_at,
      youtube_videos!inner(id, title, status, organization_id, published_at)
    `)
        .eq("youtube_videos.organization_id", req.organizationId)
        .eq("youtube_videos.status", "published")
        .order("captured_at", { ascending: false })
        .limit(50);
    if (latestError)
        throw latestError;
    // Agregar por vídeo (pegar o mais recente de cada)
    const byVideo = new Map();
    for (const snap of latestSnapshots ?? []) {
        const vid = snap.youtube_videos.id;
        if (!byVideo.has(vid)) {
            byVideo.set(vid, {
                videoId: vid,
                title: snap.youtube_videos.title,
                publishedAt: snap.youtube_videos.published_at,
                latest: snap,
            });
        }
    }
    // Calcular totais
    const aggregated = {
        totalViews: 0,
        totalLikes: 0,
        totalComments: 0,
        totalShares: 0,
        totalWatchTimeMin: 0,
        videosCount: byVideo.size,
    };
    for (const snap of totals ?? []) {
        aggregated.totalViews += snap.views ?? 0;
        aggregated.totalLikes += snap.likes ?? 0;
        aggregated.totalComments += snap.comments ?? 0;
        aggregated.totalShares += snap.shares ?? 0;
        aggregated.totalWatchTimeMin += snap.watch_time_min ?? 0;
    }
    res.json({
        data: {
            overview: aggregated,
            recentVideos: Array.from(byVideo.values()),
        },
    });
});
// GET /api/analytics/video/:videoId - Métricas detalhadas de um vídeo
router.get("/video/:videoId", async (req, res) => {
    const supabase = getSupabase();
    // Verificar se o vídeo pertence à org
    const { data: video, error: videoError } = await supabase
        .from("youtube_videos")
        .select("id, title, status, published_at, social_account_id")
        .eq("id", req.params.videoId)
        .eq("organization_id", req.organizationId)
        .single();
    if (videoError || !video)
        throw new NotFoundError("Vídeo");
    // Snapshots históricos (últimos 90 dias)
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const { data: snapshots, error: snapError } = await supabase
        .from("video_metrics_snapshots")
        .select("*")
        .eq("youtube_video_id", req.params.videoId)
        .gte("captured_at", since.toISOString())
        .order("captured_at", { ascending: true });
    if (snapError)
        throw snapError;
    // Comentários recentes
    const { data: comments, error: commentsError } = await supabase
        .from("video_comments")
        .select("*")
        .eq("youtube_video_id", req.params.videoId)
        .order("published_at", { ascending: false })
        .limit(100);
    if (commentsError)
        throw commentsError;
    res.json({
        data: {
            video,
            snapshots: snapshots ?? [],
            comments: comments ?? [],
        },
    });
});
// GET /api/analytics/comparison - Comparar vídeos
const comparisonSchema = z.object({
    videoIds: z.array(z.string().uuid()).min(2).max(10),
    days: z.coerce.number().min(1).max(365).default(30),
});
router.get("/comparison", async (req, res) => {
    const { videoIds, days } = comparisonSchema.parse(req.query);
    const supabase = getSupabase();
    const since = new Date();
    since.setDate(since.getDate() - days);
    const { data, error } = await supabase
        .from("video_metrics_snapshots")
        .select(`
      views, likes, comments, shares, watch_time_min, captured_at,
      youtube_videos!inner(id, title, organization_id)
    `)
        .in("youtube_videos.id", videoIds)
        .eq("youtube_videos.organization_id", req.organizationId)
        .gte("captured_at", since.toISOString())
        .order("captured_at", { ascending: true });
    if (error)
        throw error;
    // Agrupar por vídeo
    const grouped = new Map();
    for (const row of data ?? []) {
        const vid = row.youtube_videos.id;
        if (!grouped.has(vid))
            grouped.set(vid, []);
        grouped.get(vid).push(row);
    }
    res.json({
        data: Object.fromEntries(grouped),
    });
});
// POST /api/analytics/collect - Coletar métricas e comentários para toda a org
router.post("/collect", async (req, res) => {
    const result = await collectAnalyticsForOrg(req.organizationId);
    res.json({ data: result });
});
// POST /api/analytics/collect/:videoId - Coletar métricas para um vídeo específico
const collectVideoSchema = z.object({
    socialAccountId: z.string().uuid(),
});
router.post("/collect/:videoId", async (req, res) => {
    const { socialAccountId } = collectVideoSchema.parse(req.body);
    const videoId = Array.isArray(req.params.videoId) ? req.params.videoId[0] : req.params.videoId;
    const result = await collectAnalyticsForVideo(req.organizationId, socialAccountId, videoId);
    res.json({ data: result });
});
// GET /api/analytics/summary - Resumo agregado do período
const summarySchema = z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
router.get("/summary", async (req, res) => {
    const { start, end } = summarySchema.parse(req.query);
    const supabase = getSupabase();
    const startDate = startOfDay(new Date(start));
    const endDate = endOfDay(new Date(end));
    // Buscar snapshots do período
    const { data: snapshots, error } = await supabase
        .from("video_metrics_snapshots")
        .select(`
      views, likes, comments, shares, watch_time_min, avg_view_duration, impression_ctr,
      subscribers_gained, estimated_revenue, captured_at,
      youtube_videos!inner(id, title, status, organization_id, published_at, youtube_video_id)
    `)
        .eq("youtube_videos.organization_id", req.organizationId)
        .eq("youtube_videos.status", "published")
        .gte("captured_at", startDate.toISOString())
        .lte("captured_at", endDate.toISOString())
        .order("captured_at", { ascending: false });
    if (error)
        throw error;
    // Agregar por vídeo (pegar o mais recente de cada no período)
    const byVideo = new Map();
    for (const snap of (snapshots ?? [])) {
        const vid = snap.youtube_videos.id;
        if (!byVideo.has(vid)) {
            byVideo.set(vid, {
                videoId: vid,
                title: snap.youtube_videos.title,
                publishedAt: snap.youtube_videos.published_at,
                youtubeVideoId: snap.youtube_videos.youtube_video_id,
                latest: snap,
            });
        }
    }
    // Calcular totais usando os últimos snapshots de cada vídeo
    let totalViews = 0;
    let totalWatchTime = 0;
    let totalLikes = 0;
    let totalComments = 0;
    let totalShares = 0;
    let totalSubscribersGained = 0;
    let totalRevenue = 0;
    let ctrSum = 0;
    let durationSum = 0;
    let ctrCount = 0;
    let durationCount = 0;
    for (const [, data] of byVideo) {
        const snap = data.latest;
        totalViews += snap.views ?? 0;
        totalWatchTime += snap.watch_time_min ?? 0;
        totalLikes += snap.likes ?? 0;
        totalComments += snap.comments ?? 0;
        totalShares += snap.shares ?? 0;
        totalSubscribersGained += snap.subscribers_gained ?? 0;
        totalRevenue += snap.estimated_revenue ?? 0;
        if (snap.impression_ctr != null) {
            ctrSum += snap.impression_ctr;
            ctrCount++;
        }
        if (snap.avg_view_duration != null) {
            durationSum += snap.avg_view_duration;
            durationCount++;
        }
    }
    const avgCtr = ctrCount > 0 ? ctrSum / ctrCount : 0;
    const avgDuration = durationCount > 0 ? durationSum / durationCount : 0;
    res.json({
        data: {
            total_views: totalViews,
            total_watch_time: totalWatchTime,
            total_likes: totalLikes,
            total_comments: totalComments,
            total_shares: totalShares,
            total_subscribers_gained: totalSubscribersGained,
            total_revenue: totalRevenue,
            avg_ctr: avgCtr,
            avg_view_duration: avgDuration,
            videos_published: byVideo.size,
            period: { start, end },
        },
    });
});
// GET /api/analytics/timeseries - Série temporal diária
const timeSeriesSchema = z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
router.get("/timeseries", async (req, res) => {
    const { start, end } = timeSeriesSchema.parse(req.query);
    const supabase = getSupabase();
    const startDate = startOfDay(new Date(start));
    const endDate = endOfDay(new Date(end));
    const { data: snapshots, error } = await supabase
        .from("video_metrics_snapshots")
        .select(`
      views, likes, comments, shares, watch_time_min, avg_view_duration, impression_ctr,
      subscribers_gained, estimated_revenue, captured_at,
      youtube_videos!inner(id, organization_id)
    `)
        .eq("youtube_videos.organization_id", req.organizationId)
        .gte("captured_at", startDate.toISOString())
        .lte("captured_at", endDate.toISOString())
        .order("captured_at", { ascending: true });
    if (error)
        throw error;
    // Agregar por dia
    const dailyMap = new Map();
    // Inicializar todos os dias do período
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
        const dayKey = format(currentDate, "yyyy-MM-dd");
        dailyMap.set(dayKey, {
            date: dayKey,
            views: 0,
            watch_time: 0,
            likes: 0,
            comments: 0,
            shares: 0,
            subscribers_gained: 0,
            ctr: 0,
            ctrCount: 0,
            avg_view_duration: 0,
            durationCount: 0,
        });
        currentDate.setDate(currentDate.getDate() + 1);
    }
    for (const snap of (snapshots ?? [])) {
        const dayKey = format(new Date(snap.captured_at), "yyyy-MM-dd");
        const dayData = dailyMap.get(dayKey);
        if (dayData) {
            dayData.views += snap.views ?? 0;
            dayData.watch_time += snap.watch_time_min ?? 0;
            dayData.likes += snap.likes ?? 0;
            dayData.comments += snap.comments ?? 0;
            dayData.shares += snap.shares ?? 0;
            dayData.subscribers_gained += snap.subscribers_gained ?? 0;
            if (snap.impression_ctr != null) {
                dayData.ctr += snap.impression_ctr;
                dayData.ctrCount++;
            }
            if (snap.avg_view_duration != null) {
                dayData.avg_view_duration += snap.avg_view_duration;
                dayData.durationCount++;
            }
        }
    }
    const timeSeries = Array.from(dailyMap.values()).map(d => ({
        date: d.date,
        views: d.views,
        watch_time: d.watch_time,
        likes: d.likes,
        comments: d.comments,
        shares: d.shares,
        subscribers_gained: d.subscribers_gained,
        ctr: d.ctrCount > 0 ? d.ctr / d.ctrCount : 0,
        avg_view_duration: d.durationCount > 0 ? d.avg_view_duration / d.durationCount : 0,
    }));
    res.json({ data: timeSeries });
});
// GET /api/analytics/top-videos - Top vídeos do período
const topVideosSchema = z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    limit: z.coerce.number().min(1).max(50).default(10),
});
router.get("/top-videos", async (req, res) => {
    const { start, end, limit } = topVideosSchema.parse(req.query);
    const supabase = getSupabase();
    const startDate = startOfDay(new Date(start));
    const endDate = endOfDay(new Date(end));
    const { data: snapshots, error } = await supabase
        .from("video_metrics_snapshots")
        .select(`
      views, likes, comments, shares, watch_time_min, avg_view_duration, impression_ctr,
      subscribers_gained, captured_at,
      youtube_videos!inner(id, title, status, organization_id, published_at, youtube_video_id)
    `)
        .eq("youtube_videos.organization_id", req.organizationId)
        .eq("youtube_videos.status", "published")
        .gte("captured_at", startDate.toISOString())
        .lte("captured_at", endDate.toISOString())
        .order("captured_at", { ascending: false });
    if (error)
        throw error;
    // Pegar o último snapshot de cada vídeo
    const byVideo = new Map();
    for (const snap of (snapshots ?? [])) {
        const vid = snap.youtube_videos.id;
        if (!byVideo.has(vid)) {
            byVideo.set(vid, {
                id: vid,
                title: snap.youtube_videos.title,
                youtube_video_id: snap.youtube_videos.youtube_video_id,
                published_at: snap.youtube_videos.published_at,
                views: snap.views ?? 0,
                likes: snap.likes ?? 0,
                comments: snap.comments ?? 0,
                shares: snap.shares ?? 0,
                watch_time_minutes: snap.watch_time_min ?? 0,
                average_view_duration: snap.avg_view_duration ?? 0,
                ctr: snap.impression_ctr ?? 0,
                subscribers_gained: snap.subscribers_gained ?? 0,
            });
        }
    }
    // Ordenar por views e limitar
    const topVideos = Array.from(byVideo.values())
        .sort((a, b) => b.views - a.views)
        .slice(0, limit);
    res.json({ data: topVideos });
});
// GET /api/analytics/channels - Métricas por canal
const channelsSchema = z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
router.get("/channels", async (req, res) => {
    const { start, end } = channelsSchema.parse(req.query);
    const supabase = getSupabase();
    const startDate = startOfDay(new Date(start));
    const endDate = endOfDay(new Date(end));
    // Buscar canais da org
    const { data: channels, error: channelsError } = await supabase
        .from("social_accounts")
        .select("id, account_name")
        .eq("organization_id", req.organizationId)
        .eq("platform_id", "youtube")
        .eq("status", "active");
    if (channelsError)
        throw channelsError;
    // Para cada canal, buscar métricas
    const channelMetrics = await Promise.all((channels ?? []).map(async (channel) => {
        const { data: videos } = await supabase
            .from("youtube_videos")
            .select("id")
            .eq("social_account_id", channel.id)
            .eq("status", "published");
        const videoIds = (videos ?? []).map(v => v.id);
        if (videoIds.length === 0) {
            return {
                channel_id: channel.id,
                channel_name: channel.account_name,
                total_views: 0,
                total_likes: 0,
                total_comments: 0,
                total_subscribers: 0,
                videos_count: 0,
            };
        }
        const { data: snapshots } = await supabase
            .from("video_metrics_snapshots")
            .select(`
          views, likes, comments, shares, watch_time_min, subscribers_gained,
          youtube_videos!inner(id, social_account_id)
        `)
            .in("youtube_videos.id", videoIds)
            .gte("captured_at", startDate.toISOString())
            .lte("captured_at", endDate.toISOString())
            .order("captured_at", { ascending: false });
        // Pegar último snapshot de cada vídeo
        const byVideo = new Map();
        for (const snap of (snapshots ?? [])) {
            const vid = snap.youtube_videos.id;
            if (!byVideo.has(vid)) {
                byVideo.set(vid, snap);
            }
        }
        let totalViews = 0;
        let totalLikes = 0;
        let totalComments = 0;
        let totalSubscribers = 0;
        for (const [, snap] of byVideo) {
            totalViews += snap.views ?? 0;
            totalLikes += snap.likes ?? 0;
            totalComments += snap.comments ?? 0;
            totalSubscribers += snap.subscribers_gained ?? 0;
        }
        return {
            channel_id: channel.id,
            channel_name: channel.account_name,
            total_views: totalViews,
            total_likes: totalLikes,
            total_comments: totalComments,
            total_subscribers: totalSubscribers,
            videos_count: videoIds.length,
        };
    }));
    res.json({ data: channelMetrics });
});
export default router;
