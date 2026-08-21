import { Router } from "express";
import { z } from "zod";
import { getSupabase } from "../../lib/supabase.js";
import { encrypt } from "../../lib/crypto.js";
import { authAndOrg } from "../auth/middleware.js";
import { NotFoundError, ConflictError } from "../../lib/errors.js";
const router = Router();
// Aplicar auth + org em todas as rotas
router.use(...authAndOrg);
const connectSchema = z.object({
    platformId: z.literal("youtube"),
    accountName: z.string().min(1),
    providerAccountId: z.string().min(1), // channel_id do YouTube
    refreshToken: z.string().min(10), // token de refresh OAuth
    accessToken: z.string().optional(),
    expiresAt: z.string().datetime().optional(),
});
// GET /api/channels - Listar canais conectados
router.get("/", async (req, res) => {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from("social_accounts")
        .select("*")
        .eq("organization_id", req.organizationId)
        .eq("platform_id", "youtube")
        .order("created_at", { ascending: false });
    if (error)
        throw error;
    res.json({ data: data ?? [] });
});
// POST /api/channels - Conectar novo canal YouTube
router.post("/", async (req, res) => {
    const payload = connectSchema.parse(req.body);
    const supabase = getSupabase();
    // Verificar se já existe
    const { data: existing } = await supabase
        .from("social_accounts")
        .select("id")
        .eq("organization_id", req.organizationId)
        .eq("platform_id", "youtube")
        .eq("provider_account_id", payload.providerAccountId)
        .single();
    if (existing) {
        throw new ConflictError("Este canal do YouTube já está conectado");
    }
    const encryptedRefreshToken = encrypt(payload.refreshToken);
    const { data, error } = await supabase
        .from("social_accounts")
        .insert({
        organization_id: req.organizationId,
        platform_id: "youtube",
        account_name: payload.accountName,
        provider_account_id: payload.providerAccountId,
        token_reference: encryptedRefreshToken,
        status: "connected",
        connected_at: new Date().toISOString(),
    })
        .select()
        .single();
    if (error)
        throw error;
    res.status(201).json({ data });
});
// DELETE /api/channels/:id - Desconectar canal
router.delete("/:id", async (req, res) => {
    const supabase = getSupabase();
    const { error } = await supabase
        .from("social_accounts")
        .delete()
        .eq("id", req.params.id)
        .eq("organization_id", req.organizationId);
    if (error)
        throw error;
    res.status(204).send();
});
// GET /api/channels/:id/status - Verificar status da conexão (token válido?)
router.get("/:id/status", async (req, res) => {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from("social_accounts")
        .select("id, status, connected_at, updated_at")
        .eq("id", req.params.id)
        .eq("organization_id", req.organizationId)
        .single();
    if (error || !data)
        throw new NotFoundError("Canal");
    res.json({ data });
});
export default router;
