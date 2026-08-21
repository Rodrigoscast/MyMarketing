import { Router, Response } from "express";
import { z } from "zod";
import { getSupabase } from "../../lib/supabase.js";
import { authAndOrg, AuthenticatedRequest } from "../auth/middleware.js";
import { NotFoundError } from "../../lib/errors.js";

const router = Router();
router.use(...authAndOrg);

// GET /api/scheduler/queue - Ver fila de publicação
router.get("/queue", async (req: AuthenticatedRequest, res: Response) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("youtube_videos")
    .select("id, title, status, publish_at, created_at, social_account_id")
    .eq("organization_id", req.organizationId!)
    .in("status", ["scheduled", "publishing", "published", "failed"])
    .order("publish_at", { ascending: true });

  if (error) throw error;
  res.json({ data: data ?? [] });
});

// GET /api/scheduler/next - Próximo vídeo a ser publicado
router.get("/next", async (req: AuthenticatedRequest, res: Response) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("youtube_videos")
    .select("id, title, status, publish_at, asset_id, social_account_id")
    .eq("organization_id", req.organizationId!)
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

router.post("/retry/:id", async (req: AuthenticatedRequest, res: Response) => {
  const supabase = getSupabase();
  const { data: video, error } = await supabase
    .from("youtube_videos")
    .select("id, status")
    .eq("id", req.params.id)
    .eq("organization_id", req.organizationId!)
    .single();

  if (error || !video) throw new NotFoundError("Vídeo");
  if (video.status !== "failed") throw new Error("Só é possível reenviar vídeos com falha");

  const { data: updated, error: updateError } = await supabase
    .from("youtube_videos")
    .update({ status: "publishing", updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .select()
    .single();

  if (updateError) throw updateError;
  res.json({ data: updated });
});

export default router;