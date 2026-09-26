import { Router, Response } from "express";
import { z } from "zod";
import { getSupabase } from "../../lib/supabase.js";
import { authAndOrg, AuthenticatedRequest } from "../auth/middleware.js";
import { ValidationError, NotFoundError, ConflictError, AppError } from "../../lib/errors.js";
import { env } from "../../config/index.js";
import { startAnalyticsJob } from "../../jobs/analyticsJobs.js";
import {
  getAuthUrl,
  exchangeCodeForTokens,
  getChannelInfo,
  saveConnectedChannel,
  syncYouTubeChannelVideos,
} from "./youtube.js";

const router = Router();

/**
 * Decodifica o state gerado em /youtube/connect (formato `org:<uuid>:user:<uuid>`).
 * O state é ecoado de volta pelo Google no redirect da callback — é o único
 * elo que sobrevive à ida ao navegador, já que a callback não recebe headers.
 */
function parseState(state: string): { organizationId: string; userId: string } | null {
  const match = state.match(/^org:([0-9a-f-]{36}):user:([0-9a-f-]{36})$/i);
  if (!match) return null;
  return { organizationId: match[1], userId: match[2] };
}

// GET /api/channels/youtube/callback - Callback do Google OAuth
// PÚBLICA: o Google redireciona o navegador direto para cá, sem headers de
// Authorization. Por isso fica registrada ANTES do authAndOrg e a identidade
// org/usuário vem do `state` (com validação de membresia).
router.get("/youtube/callback", async (req: AuthenticatedRequest, res: Response) => {
  const { code, state, error: oauthError } = req.query;

  const frontendUrl = (params: Record<string, string>) => {
    const url = new URL(`${env.WEB_ORIGIN}/app/canais`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  };

  if (oauthError) {
    return res.redirect(frontendUrl({ error: String(oauthError) }));
  }

  if (!code || typeof code !== "string") {
    return res.redirect(frontendUrl({ error: "Código de autorização ausente" }));
  }

  const identity = parseState(String(state ?? ""));
  if (!identity) {
    return res.redirect(frontendUrl({ error: "Sessão de conexão inválida. Tente conectar novamente." }));
  }

  // Confere se o usuário de fato pertence à organização, para que um state
  // forjado não consiga anexar um canal a uma organização arbitrária.
  const supabase = getSupabase();
  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("organization_id", identity.organizationId)
    .eq("user_id", identity.userId)
    .maybeSingle();

  if (!member) {
    return res.redirect(frontendUrl({ error: "Sessão de conexão expirada. Entre novamente e tente conectar." }));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const channelInfo = await getChannelInfo(tokens.access_token!);

    // Salvar canal conectado
    await saveConnectedChannel(identity.organizationId, identity.userId, channelInfo, tokens);
    startAnalyticsJob(identity.organizationId);

    // Sucesso - redirecionar para frontend
    return res.redirect(frontendUrl({ connected: channelInfo.title }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao conectar canal";
    return res.redirect(frontendUrl({ error: message }));
  }
});

// Aplicar auth + org em todas as rotas abaixo
router.use(...authAndOrg);

// ============ OAuth Flow ============

// GET /api/channels/youtube/connect - Inicia fluxo OAuth
router.get("/youtube/connect", async (req: AuthenticatedRequest, res: Response) => {
  // State carrega org/usuário para a callback recuperar sem headers
  const state = `org:${req.organizationId}:user:${req.userId}`;
  const authUrl = getAuthUrl(state);
  res.json({ data: { authUrl } });
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
    const sync = await syncYouTubeChannelVideos(req.organizationId!, req.params.id);

    res.json({
      data: {
        connected: true,
        channelId: channelInfo.channelId,
        title: channelInfo.title,
        accountName: account.account_name,
        sync,
      },
    });
  } catch (err) {
    // Apenas invalid_grant indica que o canal realmente expirou.
    if (err instanceof AppError && err.code === "YOUTUBE_TOKEN_EXPIRED") {
      await supabase
        .from("social_accounts")
        .update({ status: "expired" })
        .eq("id", req.params.id);
    }

    res.status(400).json({
      data: {
        connected: false,
        error: err instanceof Error ? err.message : "Token inválido ou expirado",
      },
    });
  }
});

export default router;
