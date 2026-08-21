import { Router, Response } from "express";
import { z } from "zod";
import { getSupabase } from "../../lib/supabase.js";
import { authAndOrg, AuthenticatedRequest } from "../auth/middleware.js";
import { ValidationError, NotFoundError, ConflictError, AppError } from "../../lib/errors.js";
import { env } from "../../config/index.js";
import {
  getAuthUrl,
  exchangeCodeForTokens,
  getChannelInfo,
  saveConnectedChannel,
} from "./youtube.js";

const router = Router();

// Aplicar auth + org em todas as rotas
router.use(...authAndOrg);

// ============ OAuth Flow ============

// GET /api/channels/youtube/connect - Inicia fluxo OAuth
router.get("/youtube/connect", async (req: AuthenticatedRequest, res: Response) => {
  // State pode conter info extra (ex: return URL)
  const state = `org:${req.organizationId}:user:${req.userId}`;
  const authUrl = getAuthUrl(state);
  res.json({ data: { authUrl } });
});

// GET /api/channels/youtube/callback - Callback do Google OAuth
router.get("/youtube/callback", async (req: AuthenticatedRequest, res: Response) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    // Redirecionar para frontend com erro
    const frontendUrl = `${env.WEB_ORIGIN}/app/canais?error=${encodeURIComponent(oauthError as string)}`;
    return res.redirect(frontendUrl);
  }

  if (!code || typeof code !== "string") {
    const frontendUrl = `${env.WEB_ORIGIN}/app/canais?error=${encodeURIComponent("Código de autorização ausente")}`;
    return res.redirect(frontendUrl);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const channelInfo = await getChannelInfo(tokens.access_token!);

    // Salvar canal conectado
    await saveConnectedChannel(req.organizationId!, req.userId, channelInfo, tokens);

    // Sucesso - redirecionar para frontend
    const frontendUrl = `${env.WEB_ORIGIN}/app/canais?connected=${encodeURIComponent(channelInfo.title)}`;
    res.redirect(frontendUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao conectar canal";
    const frontendUrl = `${env.WEB_ORIGIN}/app/canais?error=${encodeURIComponent(message)}`;
    res.redirect(frontendUrl);
  }
});

// ============ CRUD Canais ============

// GET /api/channels - Listar canais conectados
router.get("/", async (req: AuthenticatedRequest, res: Response) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("social_accounts")
    .select("*")
    .eq("organization_id", req.organizationId!)
    .eq("platform_id", "youtube")
    .order("created_at", { ascending: false });

  if (error) throw error;
  res.json({ data: data ?? [] });
});

// GET /api/channels/:id/status - Verificar status da conexão (token válido?)
router.get("/:id/status", async (req: AuthenticatedRequest, res: Response) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("social_accounts")
    .select("id, status, connected_at, updated_at")
    .eq("id", req.params.id)
    .eq("organization_id", req.organizationId!)
    .single();

  if (error || !data) throw new NotFoundError("Canal");
  res.json({ data });
});

// DELETE /api/channels/:id - Desconectar canal
router.delete("/:id", async (req: AuthenticatedRequest, res: Response) => {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("social_accounts")
    .delete()
    .eq("id", req.params.id)
    .eq("organization_id", req.organizationId!);

  if (error) throw error;
  res.status(204).send();
});

// POST /api/channels/:id/test - Testar conexão (renovar token e buscar info do canal)
router.post("/:id/test", async (req: AuthenticatedRequest, res: Response) => {
  const supabase = getSupabase();
  const { data: account, error } = await supabase
    .from("social_accounts")
    .select("provider_account_id, token_reference, account_name")
    .eq("id", req.params.id)
    .eq("organization_id", req.organizationId!)
    .eq("platform_id", "youtube")
    .single();

  if (error || !account) throw new NotFoundError("Canal");
  if (!account.token_reference) throw new AppError("Canal sem token de acesso", 400, "NO_TOKEN");

  try {
    // Importar dinamicamente para evitar dependência circular
    const { refreshAccessToken, getChannelInfo, createOAuth2Client } = await import("./youtube.js");

    const accessToken = await refreshAccessToken(account.token_reference);
    const channelInfo = await getChannelInfo(accessToken);

    res.json({
      data: {
        connected: true,
        channelId: channelInfo.channelId,
        title: channelInfo.title,
        accountName: account.account_name,
      },
    });
  } catch (err) {
    // Token expirado ou revogado
    await supabase
      .from("social_accounts")
      .update({ status: "expired" })
      .eq("id", req.params.id);

    res.status(400).json({
      data: {
        connected: false,
        error: err instanceof Error ? err.message : "Token inválido ou expirado",
      },
    });
  }
});

export default router;