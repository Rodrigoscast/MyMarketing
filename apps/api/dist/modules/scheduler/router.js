import { Router } from "express";
import { z } from "zod";
import { getSupabase } from "../../lib/supabase.js";
import { authAndOrg } from "../auth/middleware.js";
import { NotFoundError, AppError } from "../../lib/errors.js";
import { processPublicationQueue } from "./worker.js";
const router = Router();
router.use(...authAndOrg);
// GET /api/scheduler/queue - Ver fila de publicação
router.get("/queue", async (req, res) => {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from("youtube_videos")
        .select("id, title, status, publish_at, created_at, social_account_id")
        .eq("organization_id", req.organizationId)
        .in("status", ["scheduled", "publishing", "published", "failed"])
        .order("publish_at", { ascending: true });
    if (error)
        throw error;
    res.json({ data: data ?? [] });
});
// GET /api/scheduler/next - Próximo vídeo a ser publicado
router.get("/next", async (req, res) => {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from("youtube_videos")
        .select("id, title, status, publish_at, asset_id, social_account_id")
        .eq("organization_id", req.organizationId)
        .eq("status", "scheduled")
        .lte("publish_at", new Date().toISOString())
        .order("publish_at", { ascending: true })
        .limit(1)
        .single();
    if (error) {
        if (error.code === "PGRST116") {
            return res.json({ data: null });
        }
        throw error;
    }
    res.json({ data });
});
// POST /api/scheduler/retry/:id - Reenviar vídeo que falhou
const retrySchema = z.object({});
router.post("/retry/:id", async (req, res) => {
    const supabase = getSupabase();
    const { data: video, error } = await supabase
        .from("youtube_videos")
        .select("id, status")
        .eq("id", req.params.id)
        .eq("organization_id", req.organizationId)
        .single();
    if (error || !video)
        throw new NotFoundError("Vídeo");
    if (video.status !== "failed")
        throw new Error("Só é possível reenviar vídeos com falha");
    const { data: updated, error: updateError } = await supabase
        .from("youtube_videos")
        .update({ status: "publishing", updated_at: new Date().toISOString() })
        .eq("id", req.params.id)
        .select()
        .single();
    if (updateError)
        throw updateError;
    res.json({ data: updated });
});
// POST /api/scheduler/run - Executar worker de publicação manualmente (para testes)
router.post("/run", async (req, res) => {
    const result = await processPublicationQueue();
    res.json({ data: result });
});
// POST /api/scheduler/process-now/:id - Processar um vídeo específico agora
router.post("/process-now/:id", async (req, res) => {
    const supabase = getSupabase();
    // Verificar vídeo
    const { data: video, error } = await supabase
        .from("youtube_videos")
        .select(`
      id, title, description, tags, category_id, privacy_status, publish_at,
      made_for_kids, license, language, recording_date, location_lat, location_lng,
      playlist_id, thumbnail_path, status, social_account_id, asset_id, organization_id,
      scheduled_post_id,
      content_assets!asset_id(storage_path, file_name, mime_type, size_bytes),
      social_accounts!social_account_id(account_name, provider_account_id)
    `)
        .eq("id", req.params.id)
        .eq("organization_id", req.organizationId)
        .single();
    if (error || !video)
        throw new NotFoundError("Vídeo");
    if (!["draft", "scheduled", "failed"].includes(video.status)) {
        throw new AppError(`Não é possível publicar vídeo com status ${video.status}`, 400, "INVALID_STATUS");
    }
    if (!video.asset_id)
        throw new AppError("Vídeo precisa ter arquivo enviado", 400, "MISSING_ASSET");
    const asset = Array.isArray(video.content_assets) ? video.content_assets[0] : video.content_assets;
    const scheduledPostId = video.scheduled_post_id;
    if (!asset)
        throw new NotFoundError("Arquivo de vídeo");
    // Marcar como publishing
    await supabase
        .from("youtube_videos")
        .update({ status: "publishing", updated_at: new Date().toISOString() })
        .eq("id", video.id);
    try {
        // Importar aqui para evitar dependência circular
        const { publishVideoToYouTube } = await import("../videos/youtube-publish.js");
        const metadata = {
            title: video.title,
            description: video.description,
            tags: video.tags,
            categoryId: video.category_id,
            privacyStatus: video.privacy_status,
            publishAt: video.publish_at,
            madeForKids: video.made_for_kids,
            license: video.license,
            language: video.language,
            recordingDate: video.recording_date,
            locationLat: video.location_lat,
            locationLng: video.location_lng,
            playlistId: video.playlist_id,
        };
        const result = await publishVideoToYouTube({
            organizationId: video.organization_id,
            socialAccountId: video.social_account_id,
            videoId: video.id,
            filePath: asset.storage_path,
            metadata,
        });
        await supabase
            .from("youtube_videos")
            .update({
            status: "published",
            youtube_video_id: result.youtubeVideoId,
            published_at: result.publishedAt ?? new Date().toISOString(),
            youtube_error: null,
            updated_at: new Date().toISOString(),
        })
            .eq("id", video.id);
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
        res.json({ data: { message: "Vídeo publicado com sucesso", youtubeVideoId: result.youtubeVideoId } });
    }
    catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
        await supabase
            .from("youtube_videos")
            .update({
            status: "failed",
            youtube_error: errorMsg,
            updated_at: new Date().toISOString(),
        })
            .eq("id", video.id);
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
        throw new AppError(`Falha na publicação: ${errorMsg}`, 500, "PUBLISH_FAILED");
    }
});
export default router;
