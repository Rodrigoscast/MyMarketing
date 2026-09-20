import { Router, Response } from "express";
import { z } from "zod";
import multer from "multer";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSupabase } from "../../lib/supabase.js";
import { authAndOrg, AuthenticatedRequest } from "../auth/middleware.js";
import { env } from "../../config/index.js";
import { ValidationError, NotFoundError, ConflictError, AppError } from "../../lib/errors.js";
import { publishVideoToYouTube } from "./youtube-publish.js";
import { checkQuotaForUpload, logQuotaUsage, QUOTA_COSTS } from "../analytics/quota.js";

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
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new ValidationError("Tipo de arquivo não suportado. Use MP4, MOV, AVI, MKV ou WebM"));
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
router.get("/", async (req: AuthenticatedRequest, res: Response) => {
  const supabase = getSupabase();
  const status = req.query.status as string | undefined;

  let query = supabase
    .from("youtube_videos")
    .select(`
      *,
      content_assets!asset_id(file_name, storage_path, mime_type, size_bytes),
      social_accounts!social_account_id(account_name, provider_account_id)
    `)
    .eq("organization_id", req.organizationId!)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;
  res.json({ data: data ?? [] });
});

// GET /api/videos/:id - Detalhes do vídeo
router.get("/:id", async (req: AuthenticatedRequest, res: Response) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("youtube_videos")
    .select(`
      *,
      content_assets!asset_id(*),
      social_accounts!social_account_id(account_name, provider_account_id)
    `)
    .eq("id", req.params.id)
    .eq("organization_id", req.organizationId!)
    .single();

  if (error || !data) throw new NotFoundError("Vídeo");
  res.json({ data });
});

// POST /api/videos/upload - Upload do arquivo de vídeo (multipart/form-data)
// Retorna asset_id para usar na criação do vídeo
router.post("/upload", upload.single("video"), async (req: AuthenticatedRequest, res: Response) => {
  if (!req.file) throw new ValidationError("Arquivo de vídeo obrigatório");

  const supabase = getSupabase();

  // Salvar no content_assets
  const { data: asset, error } = await supabase
    .from("content_assets")
    .insert({
      organization_id: req.organizationId!,
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
    await fs.unlink(req.file.path).catch(() => {});
    throw error;
  }

  res.status(201).json({ data: { asset_id: asset.id, file_name: asset.file_name, size_bytes: asset.size_bytes } });
});

// POST /api/videos/upload-thumbnail - Upload de thumbnail
const thumbnailStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, "_");
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    cb(null, `thumb-${name}-${unique}${ext}`);
  },
});

const thumbnailUpload = multer({
  storage: thumbnailStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new ValidationError("Tipo de arquivo não suportado. Use JPEG, PNG, WebP ou GIF"));
  },
});

router.post("/upload-thumbnail", thumbnailUpload.single("thumbnail"), async (req: AuthenticatedRequest, res: Response) => {
  if (!req.file) throw new ValidationError("Arquivo de thumbnail obrigatório");

  const supabase = getSupabase();

  const { data: asset, error } = await supabase
    .from("content_assets")
    .insert({
      organization_id: req.organizationId!,
      uploaded_by: req.userId,
      storage_path: req.file.path,
      file_name: req.file.originalname,
      mime_type: req.file.mimetype,
      size_bytes: req.file.size,
    })
    .select()
    .single();

  if (error) {
    await fs.unlink(req.file.path).catch(() => {});
    throw error;
  }

  res.status(201).json({ data: { asset_id: asset.id, file_name: asset.file_name, file_path: req.file.filename } });
});

// POST /api/videos - Criar vídeo (metadados + asset já feito upload)
router.post("/", async (req: AuthenticatedRequest, res: Response) => {
  const payload = createVideoSchema.parse(req.body);
  const supabase = getSupabase();

  // Verificar se o canal pertence à org
  const { data: channel } = await supabase
    .from("social_accounts")
    .select("id")
    .eq("id", payload.socialAccountId)
    .eq("organization_id", req.organizationId!)
    .eq("platform_id", "youtube")
    .single();

  if (!channel) throw new NotFoundError("Canal do YouTube");

  // Verificar asset se fornecido
  if (payload.assetId) {
    const { data: asset } = await supabase
      .from("content_assets")
      .select("id")
      .eq("id", payload.assetId)
      .eq("organization_id", req.organizationId!)
      .single();
    if (!asset) throw new NotFoundError("Arquivo de vídeo");
  }

  // Inserir vídeo com status 'draft'
  const { data: video, error } = await supabase
    .from("youtube_videos")
    .insert({
      organization_id: req.organizationId!,
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

  if (error) throw error;
  res.status(201).json({ data: video });
});

// PATCH /api/videos/:id - Atualizar metadados
router.patch("/:id", async (req: AuthenticatedRequest, res: Response) => {
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
    .eq("organization_id", req.organizationId!)
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new NotFoundError("Vídeo");
  res.json({ data });
});

// POST /api/videos/:id/schedule - Agendar publicação
// Move status para 'scheduled' e cria entrada em scheduled_posts (compatibilidade)
const scheduleSchema = z.object({
  scheduledFor: z.string().datetime(),
  timezone: z.string().default("America/Sao_Paulo"),
});

router.post("/:id/schedule", async (req: AuthenticatedRequest, res: Response) => {
  const payload = scheduleSchema.parse(req.body);
  const supabase = getSupabase();

  // Verificar vídeo
  const { data: video, error: videoError } = await supabase
    .from("youtube_videos")
    .select("id, status, asset_id, social_account_id, title, description, tags, category_id, privacy_status, publish_at, made_for_kids, license, language, recording_date, location_lat, location_lng, playlist_id, thumbnail_path")
    .eq("id", req.params.id)
    .eq("organization_id", req.organizationId!)
    .single();

  if (videoError || !video) throw new NotFoundError("Vídeo");
  if (video.status !== "draft") throw new ConflictError("Só é possível agendar vídeos em rascunho");
  if (!video.asset_id) throw new ConflictError("Vídeo precisa ter arquivo enviado antes de agendar");

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

  if (updateError) throw updateError;

  // Criar entrada em scheduled_posts para compatibilidade com dashboard existente
  const { data: scheduledPost, error: postError } = await supabase
    .from("scheduled_posts")
    .insert({
      organization_id: req.organizationId!,
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

  if (postError) throw postError;

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
router.post("/:id/publish-now", async (req: AuthenticatedRequest, res: Response) => {
  const supabase = getSupabase();

  // Buscar vídeo completo com asset
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
    .eq("organization_id", req.organizationId!)
    .single();

  if (error || !video) throw new NotFoundError("Vídeo");
  if (!["draft", "scheduled", "failed"].includes(video.status)) {
    throw new AppError(`Não é possível publicar vídeo com status ${video.status}`, 400, "INVALID_STATUS");
  }
  if (!video.asset_id) throw new AppError("Vídeo precisa ter arquivo enviado antes de publicar", 400, "MISSING_ASSET");

  // Verificar quota antes de publicar
  const quotaCheck = await checkQuotaForUpload(video.organization_id);
  if (!quotaCheck.canUpload) {
    throw new AppError(quotaCheck.error ?? "Quota insuficiente para upload", 429, "QUOTA_EXCEEDED");
  }

  const asset = Array.isArray(video.content_assets) ? video.content_assets[0] : video.content_assets;
  const scheduledPostId: string | null = video.scheduled_post_id;
  if (!asset) throw new NotFoundError("Arquivo de vídeo");

  // Marcar como publishing
  await supabase
    .from("youtube_videos")
    .update({ status: "publishing", updated_at: new Date().toISOString() })
    .eq("id", video.id);

  try {
    const metadata = {
      title: video.title,
      description: video.description,
      tags: video.tags,
      categoryId: video.category_id,
      privacyStatus: "public" as const,
      madeForKids: video.made_for_kids,
      license: video.license as "youtube" | "creativeCommon",
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

    // Registrar uso de quota
    await logQuotaUsage(video.organization_id, "VIDEOS_INSERT", { videoId: video.id, youtubeVideoId: result.youtubeVideoId });

    await supabase
      .from("youtube_videos")
      .update({
        status: "published",
        publish_at: null,
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

    res.json({ data: { message: "Vídeo publicado com sucesso", youtubeVideoId: result.youtubeVideoId, video } });
  } catch (err) {
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

// POST /api/videos/:id/clone - Duplicar vídeo (criar template ou cópia)
const cloneVideoSchema = z.object({
  title: z.string().min(1).max(100).optional(), // Se não fornecido, usa "Cópia de {original title}"
  copyAsset: z.boolean().default(false), // Se true, copia o arquivo de vídeo; se false, usa o mesmo asset
  resetStatus: z.boolean().default(true), // Se true, novo vídeo fica como draft; se false, mantém status original
  socialAccountId: z.string().uuid().optional(), // Opcional: publicar em outro canal
});

router.post("/:id/clone", async (req: AuthenticatedRequest, res: Response) => {
  const payload = cloneVideoSchema.parse(req.body);
  const supabase = getSupabase();

  // Buscar vídeo original com todos os dados
  const { data: originalVideo, error } = await supabase
    .from("youtube_videos")
    .select(`
      *,
      content_assets!asset_id(storage_path, file_name, mime_type, size_bytes),
      social_accounts!social_account_id(account_name, provider_account_id)
    `)
    .eq("id", req.params.id)
    .eq("organization_id", req.organizationId!)
    .single();

  if (error || !originalVideo) throw new NotFoundError("Vídeo original");

  // Determinar canal de destino
  let targetSocialAccountId = originalVideo.social_account_id;
  if (payload.socialAccountId) {
    const { data: channel } = await supabase
      .from("social_accounts")
      .select("id")
      .eq("id", payload.socialAccountId)
      .eq("organization_id", req.organizationId!)
      .eq("platform_id", "youtube")
      .single();
    if (!channel) throw new NotFoundError("Canal do YouTube de destino");
    targetSocialAccountId = channel.id;
  }

  let newAssetId = originalVideo.asset_id;

  // Se copyAsset = true, copiar o arquivo físico
  if (payload.copyAsset && originalVideo.asset_id) {
    const { data: asset } = await supabase
      .from("content_assets")
      .select("storage_path, file_name, mime_type, size_bytes")
      .eq("id", originalVideo.asset_id)
      .single();

    if (asset) {
      const ext = path.extname(asset.file_name);
      const name = path.basename(asset.file_name, ext).replace(/[^a-zA-Z0-9-_]/g, "_");
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const newFileName = `${name}-copy-${unique}${ext}`;
      const newStoragePath = path.resolve(UPLOAD_DIR, newFileName);

      await fs.copyFile(asset.storage_path, newStoragePath);

      const { data: newAsset, error: assetError } = await supabase
        .from("content_assets")
        .insert({
          organization_id: req.organizationId!,
          uploaded_by: req.userId,
          storage_path: newStoragePath,
          file_name: asset.file_name,
          mime_type: asset.mime_type,
          size_bytes: asset.size_bytes,
        })
        .select()
        .single();

      if (assetError) {
        await fs.unlink(newStoragePath).catch(() => {});
        throw assetError;
      }
      newAssetId = newAsset.id;
    }
  }

  // Determinar novo título
  const newTitle = payload.title ?? `Cópia de ${originalVideo.title}`;

  // Determinar status
  const newStatus = payload.resetStatus ? "draft" : originalVideo.status;

  // Criar novo vídeo
  const { data: newVideo, error: createError } = await supabase
    .from("youtube_videos")
    .insert({
      organization_id: req.organizationId!,
      social_account_id: targetSocialAccountId,
      asset_id: newAssetId,
      title: newTitle,
      description: originalVideo.description,
      tags: originalVideo.tags,
      category_id: originalVideo.category_id,
      privacy_status: originalVideo.privacy_status,
      publish_at: null, // Resetar agendamento
      made_for_kids: originalVideo.made_for_kids,
      license: originalVideo.license,
      language: originalVideo.language,
      recording_date: originalVideo.recording_date,
      location_lat: originalVideo.location_lat,
      location_lng: originalVideo.location_lng,
      playlist_id: originalVideo.playlist_id,
      thumbnail_path: originalVideo.thumbnail_path,
      status: newStatus,
    })
    .select()
    .single();

  if (createError) {
    // Se copiou o asset e falhou, limpar
    if (payload.copyAsset && newAssetId !== originalVideo.asset_id) {
      const { data: newAsset } = await supabase
        .from("content_assets")
        .select("storage_path")
        .eq("id", newAssetId)
        .single();
      if (newAsset) await fs.unlink(newAsset.storage_path).catch(() => {});
      await supabase.from("content_assets").delete().eq("id", newAssetId);
    }
    throw createError;
  }

  res.status(201).json({ data: newVideo });
});

// POST /api/videos/bulk - Operações em lote
const bulkOperationSchema = z.object({
  videoIds: z.array(z.string().uuid()).min(1).max(50),
  operation: z.enum(["delete", "schedule", "publish", "change_privacy", "change_category", "change_playlist"]),
  // Parâmetros específicos por operação
  scheduledFor: z.string().datetime().optional(), // para schedule
  timezone: z.string().default("America/Sao_Paulo"), // para schedule
  privacyStatus: z.enum(["private", "unlisted", "public"]).optional(), // para change_privacy
  categoryId: z.string().optional(), // para change_category
  playlistId: z.string().optional(), // para change_playlist
});

router.post("/bulk", async (req: AuthenticatedRequest, res: Response) => {
  const payload = bulkOperationSchema.parse(req.body);
  const supabase = getSupabase();

  // Buscar todos os vídeos
  const { data: videos, error } = await supabase
    .from("youtube_videos")
    .select(`
      id, title, description, tags, category_id, privacy_status, publish_at,
      made_for_kids, license, language, recording_date, location_lat, location_lng,
      playlist_id, thumbnail_path, status, social_account_id, asset_id, organization_id,
      scheduled_post_id,
      content_assets!asset_id(storage_path, file_name, mime_type, size_bytes),
      social_accounts!social_account_id(account_name, provider_account_id)
    `)
    .in("id", payload.videoIds)
    .eq("organization_id", req.organizationId!);

  if (error) throw error;
  if (!videos || videos.length === 0) throw new NotFoundError("Nenhum vídeo encontrado");

  // Verificar se todos pertencem à org
  const invalidVideos = videos.filter(v => v.organization_id !== req.organizationId);
  if (invalidVideos.length > 0) {
    throw new AppError("Alguns vídeos não pertencem à sua organização", 403, "UNAUTHORIZED_VIDEOS");
  }

  const results: Array<{ videoId: string; success: boolean; error?: string; data?: any }> = [];

  switch (payload.operation) {
    case "delete": {
      // Só pode excluir drafts
      const nonDrafts = videos.filter(v => v.status !== "draft");
      if (nonDrafts.length > 0) {
        for (const video of nonDrafts) {
          results.push({ videoId: video.id, success: false, error: "Só é possível excluir vídeos em rascunho" });
        }
      }

      const drafts = videos.filter(v => v.status === "draft");
      for (const video of drafts) {
        try {
          // Excluir asset se existir
          if (video.asset_id) {
            const { data: asset } = await supabase
              .from("content_assets")
              .select("storage_path")
              .eq("id", video.asset_id)
              .single();

            if (asset) {
              await fs.unlink(asset.storage_path).catch(() => {});
            }
            await supabase.from("content_assets").delete().eq("id", video.asset_id);
          }

          await supabase.from("youtube_videos").delete().eq("id", video.id);
          results.push({ videoId: video.id, success: true });
        } catch (err) {
          results.push({ videoId: video.id, success: false, error: err instanceof Error ? err.message : "Erro ao excluir" });
        }
      }
      break;
    }

    case "schedule": {
      if (!payload.scheduledFor) {
        throw new ValidationError("Data/hora de agendamento obrigatória");
      }

      for (const video of videos) {
        try {
          if (video.status !== "draft") {
            results.push({ videoId: video.id, success: false, error: "Só é possível agendar vídeos em rascunho" });
            continue;
          }
          if (!video.asset_id) {
            results.push({ videoId: video.id, success: false, error: "Vídeo precisa ter arquivo enviado antes de agendar" });
            continue;
          }

          // Atualizar vídeo para scheduled
          const { data: updatedVideo, error: updateError } = await supabase
            .from("youtube_videos")
            .update({
              status: "scheduled",
              publish_at: payload.scheduledFor,
              updated_at: new Date().toISOString(),
            })
            .eq("id", video.id)
            .select()
            .single();

          if (updateError) throw updateError;

          // Criar entrada em scheduled_posts
          const { data: scheduledPost, error: postError } = await supabase
            .from("scheduled_posts")
            .insert({
              organization_id: req.organizationId!,
              author_id: req.userId,
              asset_id: video.asset_id,
              title: video.title,
              caption: video.description,
              media_url: null,
              media_type: "video",
              status: "scheduled",
              scheduled_for: payload.scheduledFor,
              timezone: payload.timezone,
            })
            .select()
            .single();

          if (postError) throw postError;

          await supabase.from("scheduled_post_targets").insert({
            scheduled_post_id: scheduledPost.id,
            platform_id: "youtube",
            social_account_id: video.social_account_id,
            platform_status: "queued",
          });

          results.push({ videoId: video.id, success: true, data: { video: updatedVideo, scheduledPost } });
        } catch (err) {
          results.push({ videoId: video.id, success: false, error: err instanceof Error ? err.message : "Erro ao agendar" });
        }
      }
      break;
    }

    case "publish": {
      for (const video of videos) {
        try {
          if (!["draft", "scheduled", "failed"].includes(video.status)) {
            results.push({ videoId: video.id, success: false, error: `Não é possível publicar vídeo com status ${video.status}` });
            continue;
          }
          if (!video.asset_id) {
            results.push({ videoId: video.id, success: false, error: "Vídeo precisa ter arquivo enviado antes de publicar" });
            continue;
          }

          // Verificar quota
          const quotaCheck = await checkQuotaForUpload(video.organization_id);
          if (!quotaCheck.canUpload) {
            results.push({ videoId: video.id, success: false, error: quotaCheck.error ?? "Quota insuficiente para upload" });
            continue;
          }

          const asset = Array.isArray(video.content_assets) ? video.content_assets[0] : video.content_assets;
          const scheduledPostId: string | null = video.scheduled_post_id;
          if (!asset) {
            results.push({ videoId: video.id, success: false, error: "Arquivo de vídeo não encontrado" });
            continue;
          }

          await supabase
            .from("youtube_videos")
            .update({ status: "publishing", updated_at: new Date().toISOString() })
            .eq("id", video.id);

          try {
            const metadata = {
              title: video.title,
              description: video.description,
              tags: video.tags,
              categoryId: video.category_id,
              privacyStatus: "public" as const,
              madeForKids: video.made_for_kids,
              license: video.license as "youtube" | "creativeCommon",
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

            await logQuotaUsage(video.organization_id, "VIDEOS_INSERT", { videoId: video.id, youtubeVideoId: result.youtubeVideoId });

            await supabase
              .from("youtube_videos")
              .update({
                status: "published",
                publish_at: null,
                youtube_video_id: result.youtubeVideoId,
                published_at: result.publishedAt ?? new Date().toISOString(),
                youtube_error: null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", video.id);

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

            results.push({ videoId: video.id, success: true, data: { youtubeVideoId: result.youtubeVideoId } });
          } catch (err) {
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

            results.push({ videoId: video.id, success: false, error: `Falha na publicação: ${errorMsg}` });
          }
        } catch (err) {
          results.push({ videoId: video.id, success: false, error: err instanceof Error ? err.message : "Erro ao publicar" });
        }
      }
      break;
    }

    case "change_privacy": {
      if (!payload.privacyStatus) {
        throw new ValidationError("Novo status de privacidade obrigatório");
      }

      for (const video of videos) {
        try {
          const { data, error: updateError } = await supabase
            .from("youtube_videos")
            .update({
              privacy_status: payload.privacyStatus,
              updated_at: new Date().toISOString(),
            })
            .eq("id", video.id)
            .select()
            .single();

          if (updateError) throw updateError;
          results.push({ videoId: video.id, success: true, data });
        } catch (err) {
          results.push({ videoId: video.id, success: false, error: err instanceof Error ? err.message : "Erro ao alterar privacidade" });
        }
      }
      break;
    }

    case "change_category": {
      if (!payload.categoryId) {
        throw new ValidationError("Nova categoria obrigatória");
      }

      for (const video of videos) {
        try {
          const { data, error: updateError } = await supabase
            .from("youtube_videos")
            .update({
              category_id: payload.categoryId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", video.id)
            .select()
            .single();

          if (updateError) throw updateError;
          results.push({ videoId: video.id, success: true, data });
        } catch (err) {
          results.push({ videoId: video.id, success: false, error: err instanceof Error ? err.message : "Erro ao alterar categoria" });
        }
      }
      break;
    }

    case "change_playlist": {
      // playlistId pode ser null para remover
      for (const video of videos) {
        try {
          const { data, error: updateError } = await supabase
            .from("youtube_videos")
            .update({
              playlist_id: payload.playlistId ?? null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", video.id)
            .select()
            .single();

          if (updateError) throw updateError;
          results.push({ videoId: video.id, success: true, data });
        } catch (err) {
          results.push({ videoId: video.id, success: false, error: err instanceof Error ? err.message : "Erro ao alterar playlist" });
        }
      }
      break;
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  res.json({
    data: {
      results,
      summary: { total: videos.length, success: successCount, failed: failCount },
    },
  });
});

// DELETE /api/videos/:id - Excluir vídeo (apenas se draft)
router.delete("/:id", async (req: AuthenticatedRequest, res: Response) => {
  const supabase = getSupabase();

  const { data: video } = await supabase
    .from("youtube_videos")
    .select("status, asset_id")
    .eq("id", req.params.id)
    .eq("organization_id", req.organizationId!)
    .single();

  if (!video) throw new NotFoundError("Vídeo");
  if (video.status !== "draft") throw new ConflictError("Só é possível excluir vídeos em rascunho");

  // Excluir asset se existir
  if (video.asset_id) {
    const { data: asset } = await supabase
      .from("content_assets")
      .select("storage_path")
      .eq("id", video.asset_id)
      .single();

    if (asset) {
      await fs.unlink(asset.storage_path).catch(() => {});
    }
    await supabase.from("content_assets").delete().eq("id", video.asset_id);
  }

  await supabase.from("youtube_videos").delete().eq("id", req.params.id);
  res.status(204).send();
});

export default router;