import { Router, Response } from "express";
import { z } from "zod";
import { getSupabase } from "../../lib/supabase.js";
import { authAndOrg, AuthenticatedRequest } from "../auth/middleware.js";
import { NotFoundError, AppError } from "../../lib/errors.js";
import { collectAnalyticsForOrg, collectAnalyticsForVideo } from "./worker.js";

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
  const result = await collectAnalyticsForOrg(req.organizationId!);
  res.json({ data: result });
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

export default router;