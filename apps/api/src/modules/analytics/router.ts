import { Router, Response } from "express";
import { z } from "zod";
import { getSupabase } from "../../lib/supabase.js";
import { authAndOrg, AuthenticatedRequest } from "../auth/middleware.js";
import { NotFoundError, AppError } from "../../lib/errors.js";
import { collectAnalyticsForVideo } from "./worker.js";
import { getAuthenticatedYouTubeClient, syncYouTubeChannelVideos } from "../channels/youtube.js";
import { getAnalyticsJob, startAnalyticsJob } from "../../jobs/analyticsJobs.js";
import { subDays, format } from "date-fns";

function dateBoundaries(start: string, end: string) {
  return {
    startDate: new Date(`${start}T00:00:00.000Z`),
    endDate: new Date(`${end}T23:59:59.999Z`),
  };
}

async function fetchYouTubePeriodSummary(organizationId: string, start: string, end: string) {
  const supabase = getSupabase();
  const { data: channels, error } = await supabase
    .from("social_accounts")
    .select("id, account_name, provider_account_id")
    .eq("organization_id", organizationId)
    .eq("platform_id", "youtube")
    .eq("status", "connected");

  if (error) throw error;
  if (!channels || channels.length === 0) {
    return {
      total_views: 0,
      total_watch_time: 0,
      total_likes: 0,
      total_comments: 0,
      total_shares: 0,
      total_subscribers_gained: 0,
      total_revenue: 0,
      avg_ctr: 0,
      avg_view_duration: 0,
      videos_published: 0,
      period: { start, end },
    };
  }

  let totalViews = 0;
  let totalWatchTime = 0;
  let totalLikes = 0;
  let totalComments = 0;
  let totalShares = 0;
  let totalSubscribersGained = 0;
  let weightedDuration = 0;
  let durationWeight = 0;
  const errors: string[] = [];

  for (const channel of channels) {
    const channelId = channel.provider_account_id;
    if (!channelId) continue;

    try {
      const { youtubeAnalytics } = await getAuthenticatedYouTubeClient(organizationId, channel.id);
      const response = await youtubeAnalytics.reports.query({
        ids: `channel==${channelId}`,
        startDate: start,
        endDate: end,
        metrics: [
          "views",
          "likes",
          "comments",
          "shares",
          "estimatedMinutesWatched",
          "averageViewDuration",
          "subscribersGained",
        ].join(","),
      });

      const row = response.data.rows?.[0] ?? [];
      const views = Number(row[0] ?? 0);
      const avgViewDuration = Number(row[5] ?? 0);

      totalViews += views;
      totalLikes += Number(row[1] ?? 0);
      totalComments += Number(row[2] ?? 0);
      totalShares += Number(row[3] ?? 0);
      totalWatchTime += Number(row[4] ?? 0);
      totalSubscribersGained += Number(row[6] ?? 0);
      if (views > 0 && avgViewDuration > 0) {
        weightedDuration += avgViewDuration * views;
        durationWeight += views;
      }
    } catch (err) {
      errors.push(`${channel.account_name}: ${err instanceof Error ? err.message : "erro ao consultar YouTube Analytics"}`);
    }
  }

  if (errors.length === channels.length) {
    throw new AppError(`Falha ao consultar YouTube Analytics: ${errors.join(" | ")}`, 502, "YOUTUBE_ANALYTICS_FAILED");
  }

  const { count: videosPublished, error: videosError } = await supabase
    .from("youtube_videos")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", "published")
    .gte("published_at", `${start}T00:00:00.000Z`)
    .lte("published_at", `${end}T23:59:59.999Z`);

  if (videosError) throw videosError;

  return {
    total_views: totalViews,
    total_watch_time: totalWatchTime,
    total_likes: totalLikes,
    total_comments: totalComments,
    total_shares: totalShares,
    total_subscribers_gained: totalSubscribersGained,
    total_revenue: 0,
    avg_ctr: 0,
    avg_view_duration: durationWeight > 0 ? weightedDuration / durationWeight : 0,
    videos_published: videosPublished ?? 0,
    period: { start, end },
  };
}

type MetricsSnapshot = {
  youtube_video_id: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watch_time_min: number;
  avg_view_duration: number | null;
  subscribers_gained: number;
  captured_at: string;
  youtube_videos?: { id: string; title?: string; published_at?: string | null; youtube_video_id?: string | null };
};

function subtractMetrics(current: MetricsSnapshot, baseline?: MetricsSnapshot) {
  const previous = baseline ?? {
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    watch_time_min: 0,
    subscribers_gained: 0,
  };
  return {
    views: Math.max(0, (current.views ?? 0) - (previous.views ?? 0)),
    likes: Math.max(0, (current.likes ?? 0) - (previous.likes ?? 0)),
    comments: Math.max(0, (current.comments ?? 0) - (previous.comments ?? 0)),
    shares: Math.max(0, (current.shares ?? 0) - (previous.shares ?? 0)),
    watch_time_min: Math.max(0, (current.watch_time_min ?? 0) - (previous.watch_time_min ?? 0)),
    subscribers_gained: Math.max(0, (current.subscribers_gained ?? 0) - (previous.subscribers_gained ?? 0)),
    avg_view_duration: current.avg_view_duration ?? 0,
  };
}

interface VideoRef {
  id: string;
  title: string;
  status: string;
  organization_id: string;
  published_at: string | null;
}

interface SnapshotWithVideo {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watch_time_min: number;
  captured_at: string;
  youtube_videos: VideoRef;
}

const router = Router();
router.use(...authAndOrg);

// GET /api/analytics/overview - Visão geral de engajamento da org
router.get("/overview", async (req: AuthenticatedRequest, res: Response) => {
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
    .eq("youtube_videos.organization_id", req.organizationId!)
    .gte("captured_at", since.toISOString())
    .order("captured_at", { ascending: false });

  if (totalsError) throw totalsError;

  // Último snapshot por vídeo (para cards de resumo)
  const { data: latestSnapshots, error: latestError } = await supabase
    .from("video_metrics_snapshots")
    .select(`
      views, likes, comments, shares, watch_time_min, captured_at,
      youtube_videos!inner(id, title, status, organization_id, published_at)
    `)
    .eq("youtube_videos.organization_id", req.organizationId!)
    .eq("youtube_videos.status", "published")
    .order("captured_at", { ascending: false })
    .limit(50);

  if (latestError) throw latestError;

  // Agregar por vídeo (pegar o mais recente de cada)
  const byVideo = new Map();
  for (const snap of (latestSnapshots as unknown as SnapshotWithVideo[]) ?? []) {
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
router.get("/video/:videoId", async (req: AuthenticatedRequest, res: Response) => {
  const supabase = getSupabase();

  // Verificar se o vídeo pertence à org
  const { data: video, error: videoError } = await supabase
    .from("youtube_videos")
    .select("id, title, status, published_at, social_account_id")
    .eq("id", req.params.videoId)
    .eq("organization_id", req.organizationId!)
    .single();

  if (videoError || !video) throw new NotFoundError("Vídeo");

  // Snapshots históricos (últimos 90 dias)
  const since = new Date();
  since.setDate(since.getDate() - 90);

  const { data: snapshots, error: snapError } = await supabase
    .from("video_metrics_snapshots")
    .select("*")
    .eq("youtube_video_id", req.params.videoId)
    .gte("captured_at", since.toISOString())
    .order("captured_at", { ascending: true });

  if (snapError) throw snapError;

  // Comentários recentes
  const { data: comments, error: commentsError } = await supabase
    .from("video_comments")
    .select("*")
    .eq("youtube_video_id", req.params.videoId)
    .order("published_at", { ascending: false })
    .limit(100);

  if (commentsError) throw commentsError;

  res.json({
    data: {
      video,
      snapshots: snapshots ?? [],
      comments: comments ?? [],
    },
  });
});

// GET /api/analytics/comments - Comentários principais dos vídeos publicados
router.get("/comments", async (req: AuthenticatedRequest, res: Response) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 50);
  const supabase = getSupabase();
  const start = typeof req.query.start === "string" ? req.query.start : undefined;
  const end = typeof req.query.end === "string" ? req.query.end : undefined;

  let commentsQuery = supabase
    .from("video_comments")
    .select(`
      id, youtube_video_id, author_name, author_avatar_url, text,
      like_count, reply_count, published_at,
      youtube_videos!inner(title, organization_id, status)
    `)
    .eq("youtube_videos.organization_id", req.organizationId!)
    .eq("youtube_videos.status", "published")
    .eq("is_reply", false)
    .order("like_count", { ascending: false })
    .order("published_at", { ascending: false });

  if (start && end) {
    const boundaries = dateBoundaries(start, end);
    commentsQuery = commentsQuery
      .gte("published_at", boundaries.startDate.toISOString())
      .lte("published_at", boundaries.endDate.toISOString());
  }

  const { data, error } = await commentsQuery.limit(limit);

  if (error) throw error;

  res.json({
    data: (data ?? []).map((comment: any) => ({
      id: comment.id,
      video_id: comment.youtube_video_id,
      video_title: comment.youtube_videos?.title ?? "Vídeo publicado",
      author_name: comment.author_name,
      author_avatar_url: comment.author_avatar_url,
      text: comment.text,
      like_count: comment.like_count ?? 0,
      reply_count: comment.reply_count ?? 0,
      published_at: comment.published_at,
    })),
  });
});

// GET /api/analytics/comparison - Comparar vídeos
const comparisonSchema = z.object({
  videoIds: z.array(z.string().uuid()).min(2).max(10),
  days: z.coerce.number().min(1).max(365).default(30),
});

interface ComparisonVideoRef {
  id: string;
  title: string;
  organization_id: string;
}

interface ComparisonSnapshot {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watch_time_min: number;
  captured_at: string;
  youtube_videos: ComparisonVideoRef;
}

router.get("/comparison", async (req: AuthenticatedRequest, res: Response) => {
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
    .eq("youtube_videos.organization_id", req.organizationId!)
    .gte("captured_at", since.toISOString())
    .order("captured_at", { ascending: true });

  if (error) throw error;

  // Agrupar por vídeo
  const grouped = new Map<string, ComparisonSnapshot[]>();
  for (const row of (data as unknown as ComparisonSnapshot[]) ?? []) {
    const vid = row.youtube_videos.id;
    if (!grouped.has(vid)) grouped.set(vid, []);
    grouped.get(vid)!.push(row);
  }

  res.json({
    data: Object.fromEntries(grouped),
  });
});

// POST /api/analytics/collect - Coletar métricas e comentários para toda a org
router.post("/collect", async (req: AuthenticatedRequest, res: Response) => {
  const job = startAnalyticsJob(req.organizationId!);
  res.status(202).json({ data: { jobId: job.id, status: job.status } });
});

// GET /api/analytics/collect/:jobId - Consultar uma coleta em segundo plano
router.get("/collect/:jobId", async (req: AuthenticatedRequest, res: Response) => {
  const job = getAnalyticsJob(req.params.jobId, req.organizationId!);
  if (!job) {
    res.status(404).json({ error: "Coleta não encontrada" });
    return;
  }

  res.json({
    data: {
      status: job.status,
      result: job.result,
      error: job.error,
    },
  });
});

// POST /api/analytics/sync - Sincronizar catálogo do YouTube sem coletar métricas
router.post("/sync", async (req: AuthenticatedRequest, res: Response) => {
  const supabase = getSupabase();
  const { data: channels, error } = await supabase
    .from("social_accounts")
    .select("id, account_name")
    .eq("organization_id", req.organizationId!)
    .eq("platform_id", "youtube")
    .eq("status", "connected");
  if (error) throw error;

  const results = [] as Array<{ channel: string; discovered: number; created: number; removed: number }>;
  const errors = [] as string[];
  for (const channel of channels ?? []) {
    try {
      const result = await syncYouTubeChannelVideos(req.organizationId!, channel.id);
      results.push({ channel: channel.account_name, ...result });
    } catch (err) {
      errors.push(`${channel.account_name}: ${err instanceof Error ? err.message : "Erro"}`);
    }
  }
  res.json({ data: { results, errors } });
});

// POST /api/analytics/collect/:videoId - Coletar métricas para um vídeo específico
const collectVideoSchema = z.object({
  socialAccountId: z.string().uuid(),
});

router.post("/collect/:videoId", async (req: AuthenticatedRequest, res: Response) => {
  const { socialAccountId } = collectVideoSchema.parse(req.body);
  const videoId = Array.isArray(req.params.videoId) ? req.params.videoId[0] : req.params.videoId;
  const result = await collectAnalyticsForVideo(req.organizationId!, socialAccountId, videoId);
  res.json({ data: result });
});

// GET /api/analytics/summary - Resumo agregado do período
const summarySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

router.get("/summary", async (req: AuthenticatedRequest, res: Response) => {
  const { start, end } = summarySchema.parse(req.query);
  const summary = await fetchYouTubePeriodSummary(req.organizationId!, start, end);
  res.json({ data: summary });
  return;

  const supabase = getSupabase();

  const { startDate, endDate } = dateBoundaries(start, end);

  // Buscar o último snapshot até o fim do período e subtrair a base anterior ao início.
  const { data: snapshots, error } = await supabase
    .from("video_metrics_snapshots")
    .select(`
      views, likes, comments, shares, watch_time_min, avg_view_duration,
      subscribers_gained, captured_at,
      youtube_videos!inner(id, title, status, organization_id, published_at, youtube_video_id)
    `)
    .eq("youtube_videos.organization_id", req.organizationId!)
    .eq("youtube_videos.status", "published")
    .lte("captured_at", endDate.toISOString())
    .order("captured_at", { ascending: false });

  if (error) throw error;

  const { data: previousSnapshots, error: previousError } = await supabase
    .from("video_metrics_snapshots")
    .select(`
      views, likes, comments, shares, watch_time_min, avg_view_duration,
      subscribers_gained, captured_at,
      youtube_videos!inner(id, title, status, organization_id, published_at, youtube_video_id)
    `)
    .eq("youtube_videos.organization_id", req.organizationId!)
    .eq("youtube_videos.status", "published")
    .lt("captured_at", startDate.toISOString())
    .order("captured_at", { ascending: false });

  if (previousError) throw previousError;

  const previousByVideo = new Map<string, MetricsSnapshot>();
  for (const snap of (previousSnapshots ?? []) as unknown as MetricsSnapshot[]) {
    const videoId = snap.youtube_videos?.id ?? snap.youtube_video_id;
    if (!previousByVideo.has(videoId)) previousByVideo.set(videoId, snap);
  }

  // Agregar por vídeo, usando apenas a variação acumulada no período.
  const byVideo = new Map<string, { latest: ReturnType<typeof subtractMetrics>; publishedAt: string | null }>();
  for (const snap of (snapshots ?? []) as any[]) {
    const vid = snap.youtube_videos.id as string;
    if (!byVideo.has(vid)) {
      byVideo.set(vid, {
        latest: subtractMetrics(snap, new Date(snap.youtube_videos.published_at ?? 0) >= startDate ? undefined : previousByVideo.get(vid)),
        publishedAt: snap.youtube_videos.published_at,
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
    // CTR e receita ainda não possuem colunas no schema atual.
    if (snap.avg_view_duration != null) {
      durationSum += snap.avg_view_duration;
      durationCount++;
    }
  }

  const avgCtr = ctrCount > 0 ? ctrSum / ctrCount : 0;
  const avgDuration = durationCount > 0 ? durationSum / durationCount : 0;
  const activeVideos = Array.from(byVideo.values()).filter(({ latest }) =>
    latest.views > 0 || latest.likes > 0 || latest.comments > 0 || latest.shares > 0 || latest.subscribers_gained > 0
  );

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
      videos_published: activeVideos.length,
      period: { start, end },
    },
  });
});

// GET /api/analytics/timeseries - Série temporal diária
const timeSeriesSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

router.get("/timeseries", async (req: AuthenticatedRequest, res: Response) => {
  const { start, end } = timeSeriesSchema.parse(req.query);
  const supabase = getSupabase();

  const { startDate, endDate } = dateBoundaries(start, end);

  const { data: snapshots, error } = await supabase
    .from("video_metrics_snapshots")
    .select(`
      views, likes, comments, shares, watch_time_min, avg_view_duration,
      subscribers_gained, captured_at,
      youtube_videos!inner(id, organization_id, published_at)
    `)
    .eq("youtube_videos.organization_id", req.organizationId!)
    .gte("captured_at", startDate.toISOString())
    .lte("captured_at", endDate.toISOString())
    .order("captured_at", { ascending: true });

  if (error) throw error;

  const { data: previousSnapshots, error: previousError } = await supabase
    .from("video_metrics_snapshots")
    .select(`
      views, likes, comments, shares, watch_time_min, avg_view_duration,
      subscribers_gained, captured_at,
      youtube_videos!inner(id, organization_id, published_at)
    `)
    .eq("youtube_videos.organization_id", req.organizationId!)
    .lt("captured_at", startDate.toISOString())
    .order("captured_at", { ascending: false });

  if (previousError) throw previousError;

  const previousByVideo = new Map<string, MetricsSnapshot>();
  for (const snap of (previousSnapshots ?? []) as unknown as MetricsSnapshot[]) {
    const videoId = snap.youtube_videos?.id ?? snap.youtube_video_id;
    if (!previousByVideo.has(videoId)) previousByVideo.set(videoId, snap);
  }
  const lastByVideo = new Map(previousByVideo);

  // Agregar por dia
  const dailyMap = new Map<string, any>();

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

  for (const snap of (snapshots ?? []) as any[]) {
    const dayKey = format(new Date(snap.captured_at), "yyyy-MM-dd");
    const dayData = dailyMap.get(dayKey);
    if (dayData) {
      const videoId = snap.youtube_videos.id as string;
      const baseline = new Date(snap.youtube_videos.published_at ?? 0) >= startDate
        ? undefined
        : lastByVideo.get(videoId);
      const delta = subtractMetrics(snap, baseline);
      dayData.views += delta.views;
      dayData.watch_time += delta.watch_time_min;
      dayData.likes += delta.likes;
      dayData.comments += delta.comments;
      dayData.shares += delta.shares;
      dayData.subscribers_gained += delta.subscribers_gained;
      lastByVideo.set(videoId, snap);
      // CTR ainda não possui coluna no schema atual.
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

router.get("/top-videos", async (req: AuthenticatedRequest, res: Response) => {
  const { start, end, limit } = topVideosSchema.parse(req.query);
  const supabase = getSupabase();

  const { startDate, endDate } = dateBoundaries(start, end);

  const { data: publishedVideos, error: publishedVideosError } = await supabase
    .from("youtube_videos")
    .select("id, title, youtube_video_id, published_at")
    .eq("organization_id", req.organizationId!)
    .eq("status", "published")
    .not("youtube_video_id", "is", null);

  if (publishedVideosError) throw publishedVideosError;

  const { data: snapshots, error } = await supabase
    .from("video_metrics_snapshots")
    .select(`
      views, likes, comments, shares, watch_time_min, avg_view_duration,
      subscribers_gained, captured_at,
      youtube_videos!inner(id, title, status, organization_id, published_at, youtube_video_id)
    `)
    .eq("youtube_videos.organization_id", req.organizationId!)
    .eq("youtube_videos.status", "published")
    .lte("captured_at", endDate.toISOString())
    .order("captured_at", { ascending: false });

  if (error) throw error;

  const { data: previousSnapshots, error: previousError } = await supabase
    .from("video_metrics_snapshots")
    .select(`
      views, likes, comments, shares, watch_time_min, avg_view_duration,
      subscribers_gained, captured_at,
      youtube_videos!inner(id, title, status, organization_id, published_at, youtube_video_id)
    `)
    .eq("youtube_videos.organization_id", req.organizationId!)
    .eq("youtube_videos.status", "published")
    .lt("captured_at", startDate.toISOString())
    .order("captured_at", { ascending: false });

  if (previousError) throw previousError;
  const previousByVideo = new Map<string, MetricsSnapshot>();
  for (const snap of (previousSnapshots ?? []) as unknown as MetricsSnapshot[]) {
    const videoId = snap.youtube_videos?.id ?? snap.youtube_video_id;
    if (!previousByVideo.has(videoId)) previousByVideo.set(videoId, snap);
  }

  // Começar pelos vídeos publicados para que vídeos sem coleta ainda apareçam.
  const byVideo = new Map<string, any>();
  for (const video of publishedVideos ?? []) {
    byVideo.set(video.id, {
      id: video.id,
      title: video.title,
      youtube_video_id: video.youtube_video_id,
      published_at: video.published_at,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      watch_time_minutes: 0,
      average_view_duration: 0,
      ctr: 0,
      subscribers_gained: 0,
    });
  }

  // Substituir pelos dados do último snapshot de cada vídeo quando existirem.
  for (const snap of (snapshots ?? []) as any[]) {
    const vid = snap.youtube_videos.id;
    if (!byVideo.has(vid) || byVideo.get(vid)?.views === 0) {
      byVideo.set(vid, {
        id: vid,
        title: snap.youtube_videos.title,
        youtube_video_id: snap.youtube_videos.youtube_video_id,
        published_at: snap.youtube_videos.published_at,
        views: subtractMetrics(snap, new Date(snap.youtube_videos.published_at ?? 0) >= startDate ? undefined : previousByVideo.get(vid)).views,
        likes: subtractMetrics(snap, new Date(snap.youtube_videos.published_at ?? 0) >= startDate ? undefined : previousByVideo.get(vid)).likes,
        comments: subtractMetrics(snap, new Date(snap.youtube_videos.published_at ?? 0) >= startDate ? undefined : previousByVideo.get(vid)).comments,
        shares: subtractMetrics(snap, new Date(snap.youtube_videos.published_at ?? 0) >= startDate ? undefined : previousByVideo.get(vid)).shares,
        watch_time_minutes: subtractMetrics(snap, new Date(snap.youtube_videos.published_at ?? 0) >= startDate ? undefined : previousByVideo.get(vid)).watch_time_min,
        average_view_duration: snap.avg_view_duration ?? 0,
        ctr: 0,
        subscribers_gained: subtractMetrics(snap, new Date(snap.youtube_videos.published_at ?? 0) >= startDate ? undefined : previousByVideo.get(vid)).subscribers_gained,
      });
    }
  }

  // Ordenar por views e limitar
  const topVideos = Array.from(byVideo.values())
    .filter((video) => video.views > 0 || video.likes > 0 || video.comments > 0 || video.shares > 0 || video.subscribers_gained > 0)
    .sort((a, b) => b.views - a.views)
    .slice(0, limit);

  res.json({ data: topVideos });
});

// GET /api/analytics/channels - Métricas por canal
const channelsSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

router.get("/channels", async (req: AuthenticatedRequest, res: Response) => {
  const { start, end } = channelsSchema.parse(req.query);
  const supabase = getSupabase();

  const { startDate, endDate } = dateBoundaries(start, end);

  // Buscar canais da org
  const { data: channels, error: channelsError } = await supabase
    .from("social_accounts")
    .select("id, account_name")
    .eq("organization_id", req.organizationId!)
    .eq("platform_id", "youtube")
    .eq("status", "connected");

  if (channelsError) throw channelsError;

  // Para cada canal, buscar métricas
  const channelMetrics = await Promise.all(
    (channels ?? []).map(async (channel) => {
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
          views, likes, comments, shares, watch_time_min, subscribers_gained, captured_at,
          youtube_videos!inner(id, social_account_id, published_at)
        `)
        .in("youtube_videos.id", videoIds)
        .lte("captured_at", endDate.toISOString())
        .order("captured_at", { ascending: false });

      const { data: previousSnapshots } = await supabase
        .from("video_metrics_snapshots")
        .select(`
          views, likes, comments, shares, watch_time_min, subscribers_gained, captured_at,
          youtube_videos!inner(id, social_account_id, published_at)
        `)
        .in("youtube_videos.id", videoIds)
        .lt("captured_at", startDate.toISOString())
        .order("captured_at", { ascending: false });

      const previousByVideo = new Map<string, MetricsSnapshot>();
      for (const snap of (previousSnapshots ?? []) as unknown as MetricsSnapshot[]) {
        const videoId = snap.youtube_videos?.id ?? snap.youtube_video_id;
        if (!previousByVideo.has(videoId)) previousByVideo.set(videoId, snap);
      }

      // Pegar último snapshot de cada vídeo
      const byVideo = new Map();
      for (const snap of (snapshots ?? []) as any[]) {
        const vid = snap.youtube_videos.id;
        if (!byVideo.has(vid)) {
          byVideo.set(vid, subtractMetrics(
            snap,
            new Date(snap.youtube_videos.published_at ?? 0) >= startDate ? undefined : previousByVideo.get(vid)
          ));
        }
      }

      let totalViews = 0;
      let totalLikes = 0;
      let totalComments = 0;
      let totalSubscribers = 0;

      for (const [, snap] of byVideo) {
        if (snap.views <= 0 && snap.likes <= 0 && snap.comments <= 0 && snap.shares <= 0 && snap.subscribers_gained <= 0) {
          continue;
        }
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
        videos_count: Array.from(byVideo.values()).filter((snap: any) =>
          snap.views > 0 || snap.likes > 0 || snap.comments > 0 || snap.shares > 0 || snap.subscribers_gained > 0
        ).length,
      };
    })
  );

  res.json({ data: channelMetrics });
});

export default router;
