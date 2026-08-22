import { google, youtube_v3 } from "googleapis";
import { getSupabase } from "../../lib/supabase.js";
import { getAuthenticatedYouTubeClient } from "../channels/youtube.js";
import { AppError } from "../../lib/errors.js";

/**
 * YouTube API Quota Management
 *
 * YouTube Data API v3 has a default quota of 10,000 units/day
 * Common operations and their costs:
 * - videos.list: 1 unit
 * - videos.insert (upload): 1600 units
 * - videos.update: 50 units
 * - videos.delete: 50 units
 * - channels.list: 1 unit
 * - commentThreads.list: 1 unit
 * - search.list: 100 units
 * - playlists.list: 1 unit
 * - playlistItems.list: 1 unit
 *
 * YouTube Analytics API has separate quota
 */

export const QUOTA_COSTS = {
  VIDEOS_LIST: 1,
  VIDEOS_INSERT: 1600,
  VIDEOS_UPDATE: 50,
  VIDEOS_DELETE: 50,
  CHANNELS_LIST: 1,
  COMMENT_THREADS_LIST: 1,
  SEARCH_LIST: 100,
  PLAYLISTS_LIST: 1,
  PLAYLIST_ITEMS_LIST: 1,
} as const;

export interface QuotaStatus {
  dailyLimit: number;
  used: number;
  remaining: number;
  percentageUsed: number;
  resetAt: Date;
  warning: boolean;
  critical: boolean;
}

const DAILY_QUOTA_LIMIT = 10000; // Default YouTube Data API quota
const WARNING_THRESHOLD = 0.8; // 80%
const CRITICAL_THRESHOLD = 0.95; // 95%

/**
 * Estima o custo de uma operação
 */
export function estimateQuotaCost(operation: keyof typeof QUOTA_COSTS): number {
  return QUOTA_COSTS[operation];
}

/**
 * Verifica se há quota suficiente para uma operação
 */
export function canPerformOperation(currentUsed: number, operation: keyof typeof QUOTA_COSTS): boolean {
  const cost = QUOTA_COSTS[operation];
  return currentUsed + cost <= DAILY_QUOTA_LIMIT;
}

/**
 * Busca status atual de quota do YouTube (via API não oficial)
 * Nota: YouTube não expõe quota usage via API oficial, então usamos estimativas
 * baseadas em logs de uso salvos no banco
 */
export async function getQuotaStatus(organizationId: string): Promise<QuotaStatus> {
  const supabase = getSupabase();

  // Buscar uso do dia atual
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const { data: usage, error } = await supabase
    .from("api_usage_logs")
    .select("quota_cost")
    .eq("organization_id", organizationId)
    .gte("created_at", today.toISOString())
    .lt("created_at", tomorrow.toISOString());

  if (error) {
    console.error("[Quota] Erro ao buscar uso:", error);
  }

  const used = (usage ?? []).reduce((sum, log) => sum + (log.quota_cost ?? 0), 0);
  const remaining = Math.max(0, DAILY_QUOTA_LIMIT - used);
  const percentageUsed = used / DAILY_QUOTA_LIMIT;

  return {
    dailyLimit: DAILY_QUOTA_LIMIT,
    used,
    remaining,
    percentageUsed,
    resetAt: tomorrow,
    warning: percentageUsed >= WARNING_THRESHOLD,
    critical: percentageUsed >= CRITICAL_THRESHOLD,
  };
}

/**
 * Registra uso de quota
 */
export async function logQuotaUsage(
  organizationId: string,
  operation: keyof typeof QUOTA_COSTS,
  metadata?: Record<string, any>
): Promise<void> {
  const supabase = getSupabase();
  const cost = QUOTA_COSTS[operation];

  const { error } = await supabase.from("api_usage_logs").insert({
    organization_id: organizationId,
    operation,
    quota_cost: cost,
    metadata: metadata ?? {},
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[Quota] Erro ao registrar uso:", error);
  }
}

/**
 * Verifica quota antes de operações custosas (upload de vídeo)
 */
export async function checkQuotaForUpload(organizationId: string): Promise<{
  canUpload: boolean;
  quotaStatus: QuotaStatus;
  error?: string;
}> {
  const status = await getQuotaStatus(organizationId);
  const uploadCost = QUOTA_COSTS.VIDEOS_INSERT;

  if (status.used + uploadCost > DAILY_QUOTA_LIMIT) {
    return {
      canUpload: false,
      quotaStatus: status,
      error: `Quota insuficiente. Necessário: ${uploadCost}, Disponível: ${status.remaining}. Reseta em: ${status.resetAt.toLocaleString("pt-BR")}`,
    };
  }

  return { canUpload: true, quotaStatus: status };
}

/**
 * Middleware para verificar quota em rotas de upload
 */
export function quotaCheckMiddleware(operation: keyof typeof QUOTA_COSTS) {
  return async (req: any, res: any, next: any) => {
    const orgId = req.organizationId;
    if (!orgId) return next();

    const status = await getQuotaStatus(orgId);
    const cost = QUOTA_COSTS[operation];

    if (status.used + cost > DAILY_QUOTA_LIMIT) {
      return res.status(429).json({
        error: "QUOTA_EXCEEDED",
        message: `Limite diário de quota da API do YouTube atingido (${status.used}/${DAILY_QUOTA_LIMIT}). Reseta às ${status.resetAt.toLocaleTimeString("pt-BR")}.`,
        quotaStatus: status,
      });
    }

    // Adicionar info de quota ao request para logging posterior
    req.quotaInfo = { operation, cost, status };
    next();
  };
}

/**
 * Busca informações reais da quota via YouTube API (se disponível)
 * Nota: Isso consome quota extra, usar com moderação
 */
export async function fetchRealQuotaInfo(organizationId: string, socialAccountId: string): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  try {
    const { youtube } = await getAuthenticatedYouTubeClient(organizationId, socialAccountId);

    // Fazer uma chamada leve para verificar se a API responde
    const response = await youtube.channels.list({
      part: ["snippet"],
      mine: true,
      maxResults: 1,
    });

    return { success: true, data: response.data };
  } catch (err: any) {
    if (err.code === 403 && err.errors?.[0]?.reason === "quotaExceeded") {
      return { success: false, error: "Quota excedida na API do YouTube" };
    }
    return { success: false, error: err.message };
  }
}