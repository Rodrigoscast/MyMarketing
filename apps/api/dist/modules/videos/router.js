import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSupabase } from "../../lib/supabase.js";
import { authAndOrg } from "../auth/middleware.js";
import { env } from "../../config/index.js";
import { ValidationError, NotFoundError, ConflictError } from "../../lib/errors.js";
const router = Router();
router.use(...authAndOrg);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(__dirname, "../../../../public/uploads/videos");
// Garantir que o diretório existe
await fs.mkdir(UPLOAD_DIR, { recursive: true });
// Configuração do multer para upload de arquivos grandes
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, "_");
        const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        cb(null, `${name}-${unique}${ext}`);
    },
});
const upload = multer({
    storage,
    limits: { fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska", "video/webm"];
        if (allowed.includes(file.mimetype))
            cb(null, true);
        else
            cb(new ValidationError("Tipo de arquivo não suportado. Use MP4, MOV, AVI, MKV ou WebM"));
    },
});
// Esquemas de validação
const videoMetadataSchema = z.object({
    title: z.string().min(1).max(100),
    description: z.string().max(5000).default(""),
    tags: z.array(z.string().max(50)).max(50).default([]),
    categoryId: z.string().default("22"), // People & Blogs
    privacyStatus: z.enum(["private", "unlisted", "public"]).default("private"),
    publishAt: z.string().datetime().optional(), // ISO 8601 para agendamento nativo
    madeForKids: z.boolean().default(false),
    license: z.enum(["youtube", "creativeCommon"]).default("youtube"),
    language: z.string().default("pt"),
    recordingDate: z.string().datetime().optional(),
    locationLat: z.number().min(-90).max(90).optional(),
    locationLng: z.number().min(-180).max(180).optional(),
    playlistId: z.string().optional(),
    thumbnailFileName: z.string().optional(), // arquivo já salvo localmente
});
const createVideoSchema = z.object({
    organizationId: z.string().uuid(),
    socialAccountId: z.string().uuid(), // canal do YouTube
    metadata: videoMetadataSchema,
    assetId: z.string().uuid().optional(), // se já fez upload do arquivo
});
const updateVideoSchema = videoMetadataSchema.partial();
// GET /api/videos - Listar vídeos da organização
router.get("/", async (req, res) => {
    const supabase = getSupabase();
    const status = req.query.status;
    let query = supabase
        .from("youtube_videos")
        .select(`
      *,
      content_assets!asset_id(file_name, storage_path, mime_type, size_bytes),
      social_accounts!social_account_id(account_name, provider_account_id)
    `)
        .eq("organization_id", req.organizationId)
        .order("created_at", { ascending: false });
    if (status)
        query = query.eq("status", status);
    const { data, error } = await query;
    if (error)
        throw error;
    res.json({ data: data ?? [] });
});
// GET /api/videos/:id - Detalhes do vídeo
router.get("/:id", async (req, res) => {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from("youtube_videos")
        .select(`
      *,
      content_assets!asset_id(*),
      social_accounts!social_account_id(account_name, provider_account_id)
    `)
        .eq("id", req.params.id)
        .eq("organization_id", req.organizationId)
        .single();
    if (error || !data)
        throw new NotFoundError("Vídeo");
    res.json({ data });
});
// POST /api/videos/upload - Upload do arquivo de vídeo (multipart/form-data)
// Retorna asset_id para usar na criação do vídeo
router.post("/upload", upload.single("video"), async (req, res) => {
    if (!req.file)
        throw new ValidationError("Arquivo de vídeo obrigatório");
    const supabase = getSupabase();
    // Salvar no content_assets
    const { data: asset, error } = await supabase
        .from("content_assets")
        .insert({
        organization_id: req.organizationId,
        uploaded_by: req.userId,
        storage_path: req.file.path,
        file_name: req.file.originalname,
        mime_type: req.file.mimetype,
        size_bytes: req.file.size,
    })
        .select()
        .single();
    if (error) {
        // Limpar arquivo órfão
        await fs.unlink(req.file.path).catch(() => { });
        throw error;
    }
    res.status(201).json({ data: { asset_id: asset.id, file_name: asset.file_name, size_bytes: asset.size_bytes } });
});
// POST /api/videos - Criar vídeo (metadados + asset já feito upload)
router.post("/", async (req, res) => {
    const payload = createVideoSchema.parse(req.body);
    const supabase = getSupabase();
    // Verificar se o canal pertence à org
    const { data: channel } = await supabase
        .from("social_accounts")
        .select("id")
        .eq("id", payload.socialAccountId)
        .eq("organization_id", req.organizationId)
        .eq("platform_id", "youtube")
        .single();
    if (!channel)
        throw new NotFoundError("Canal do YouTube");
    // Verificar asset se fornecido
    if (payload.assetId) {
        const { data: asset } = await supabase
            .from("content_assets")
            .select("id")
            .eq("id", payload.assetId)
            .eq("organization_id", req.organizationId)
            .single();
        if (!asset)
            throw new NotFoundError("Arquivo de vídeo");
    }
    // Inserir vídeo com status 'draft'
    const { data: video, error } = await supabase
        .from("youtube_videos")
        .insert({
        organization_id: req.organizationId,
        social_account_id: payload.socialAccountId,
        asset_id: payload.assetId ?? null,
        title: payload.metadata.title,
        description: payload.metadata.description,
        tags: payload.metadata.tags,
        category_id: payload.metadata.categoryId,
        privacy_status: payload.metadata.privacyStatus,
        publish_at: payload.metadata.publishAt ?? null,
        made_for_kids: payload.metadata.madeForKids,
        license: payload.metadata.license,
        language: payload.metadata.language,
        recording_date: payload.metadata.recordingDate ?? null,
        location_lat: payload.metadata.locationLat ?? null,
        location_lng: payload.metadata.locationLng ?? null,
        playlist_id: payload.metadata.playlistId ?? null,
        thumbnail_path: payload.metadata.thumbnailFileName ?? null,
        status: "draft",
    })
        .select()
        .single();
    if (error)
        throw error;
    res.status(201).json({ data: video });
});
// PATCH /api/videos/:id - Atualizar metadados
router.patch("/:id", async (req, res) => {
    const payload = updateVideoSchema.parse(req.body);
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from("youtube_videos")
        .update({
        title: payload.title,
        description: payload.description,
        tags: payload.tags,
        category_id: payload.categoryId,
        privacy_status: payload.privacyStatus,
        publish_at: payload.publishAt ?? null,
        made_for_kids: payload.madeForKids,
        license: payload.license,
        language: payload.language,
        recording_date: payload.recordingDate ?? null,
        location_lat: payload.locationLat ?? null,
        location_lng: payload.locationLng ?? null,
        playlist_id: payload.playlistId ?? null,
        thumbnail_path: payload.thumbnailFileName ?? null,
        updated_at: new Date().toISOString(),
    })
        .eq("id", req.params.id)
        .eq("organization_id", req.organizationId)
        .select()
        .single();
    if (error)
        throw error;
    if (!data)
        throw new NotFoundError("Vídeo");
    res.json({ data });
});
// POST /api/videos/:id/schedule - Agendar publicação
// Move status para 'scheduled' e cria entrada em scheduled_posts (compatibilidade)
const scheduleSchema = z.object({
    scheduledFor: z.string().datetime(),
    timezone: z.string().default("America/Sao_Paulo"),
});
router.post("/:id/schedule", async (req, res) => {
    const payload = scheduleSchema.parse(req.body);
    const supabase = getSupabase();
    // Verificar vídeo
    const { data: video, error: videoError } = await supabase
        .from("youtube_videos")
        .select("id, status, asset_id, social_account_id, title, description, tags, category_id, privacy_status, publish_at, made_for_kids, license, language, recording_date, location_lat, location_lng, playlist_id, thumbnail_path")
        .eq("id", req.params.id)
        .eq("organization_id", req.organizationId)
        .single();
    if (videoError || !video)
        throw new NotFoundError("Vídeo");
    if (video.status !== "draft")
        throw new ConflictError("Só é possível agendar vídeos em rascunho");
    if (!video.asset_id)
        throw new ConflictError("Vídeo precisa ter arquivo enviado antes de agendar");
    // Atualizar vídeo para scheduled
    const { data: updatedVideo, error: updateError } = await supabase
        .from("youtube_videos")
        .update({
        status: "scheduled",
        publish_at: payload.scheduledFor,
        updated_at: new Date().toISOString(),
    })
        .eq("id", req.params.id)
        .select()
        .single();
    if (updateError)
        throw updateError;
    // Criar entrada em scheduled_posts para compatibilidade com dashboard existente
    const { data: scheduledPost, error: postError } = await supabase
        .from("scheduled_posts")
        .insert({
        organization_id: req.organizationId,
        author_id: req.userId,
        asset_id: video.asset_id,
        title: video.title,
        caption: video.description,
        media_url: null, // o arquivo está local
        media_type: "video",
        status: "scheduled",
        scheduled_for: payload.scheduledFor,
        timezone: payload.timezone,
    })
        .select()
        .single();
    if (postError)
        throw postError;
    // Target para YouTube
    await supabase.from("scheduled_post_targets").insert({
        scheduled_post_id: scheduledPost.id,
        platform_id: "youtube",
        social_account_id: video.social_account_id,
        platform_status: "queued",
    });
    res.json({ data: { video: updatedVideo, scheduledPost } });
});
// POST /api/videos/:id/publish-now - Publicar imediatamente
router.post("/:id/publish-now", async (req, res) => {
    const supabase = getSupabase();
    const { data: video, error } = await supabase
        .from("youtube_videos")
        .update({ status: "publishing", updated_at: new Date().toISOString() })
        .eq("id", req.params.id)
        .eq("organization_id", req.organizationId)
        .select()
        .single();
    if (error || !video)
        throw new NotFoundError("Vídeo");
    // O job de publicação vai pegar este vídeo (status=publishing)
    // Por enquanto retorna sucesso; a publicação real é assíncrona
    res.json({ data: { message: "Vídeo enviado para fila de publicação", video } });
});
// DELETE /api/videos/:id - Excluir vídeo (apenas se draft)
router.delete("/:id", async (req, res) => {
    const supabase = getSupabase();
    const { data: video } = await supabase
        .from("youtube_videos")
        .select("status, asset_id")
        .eq("id", req.params.id)
        .eq("organization_id", req.organizationId)
        .single();
    if (!video)
        throw new NotFoundError("Vídeo");
    if (video.status !== "draft")
        throw new ConflictError("Só é possível excluir vídeos em rascunho");
    // Excluir asset se existir
    if (video.asset_id) {
        const { data: asset } = await supabase
            .from("content_assets")
            .select("storage_path")
            .eq("id", video.asset_id)
            .single();
        if (asset) {
            await fs.unlink(asset.storage_path).catch(() => { });
        }
        await supabase.from("content_assets").delete().eq("id", video.asset_id);
    }
    await supabase.from("youtube_videos").delete().eq("id", req.params.id);
    res.status(204).send();
});
export default router;
