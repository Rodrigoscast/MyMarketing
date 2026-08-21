import { google } from "googleapis";
import { decrypt, encrypt } from "../../lib/crypto.js";
import { getSupabase } from "../../lib/supabase.js";
import { env } from "../../config/index.js";
import { NotFoundError, AppError } from "../../lib/errors.js";
// Escopos necessários para o YouTube
export const YOUTUBE_SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.force-ssl",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
];
/**
 * Cria cliente OAuth2 configurado
 */
export function createOAuth2Client() {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
        throw new AppError("Configuração OAuth do Google incompleta", 500, "OAUTH_CONFIG_MISSING");
    }
    return new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
}
/**
 * Gera URL de autorização para conectar canal
 */
export function getAuthUrl(state) {
    const oauth2Client = createOAuth2Client();
    return oauth2Client.generateAuthUrl({
        access_type: "offline", // necessário para receber refresh_token
        prompt: "consent", // força tela de consentimento para garantir refresh_token
        scope: YOUTUBE_SCOPES,
        state: state ?? "youtube_connect",
        include_granted_scopes: true,
    });
}
/**
 * Troca código de autorização por tokens
 */
export async function exchangeCodeForTokens(code) {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
        throw new AppError("Refresh token não recebido. Reautorize com prompt=consent.", 400, "NO_REFRESH_TOKEN");
    }
    return {
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token ?? undefined,
        expiry_date: tokens.expiry_date ?? undefined,
    };
}
/**
 * Obtém informações do canal autenticado
 */
export async function getChannelInfo(accessToken) {
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ access_token: accessToken });
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });
    const response = await youtube.channels.list({
        part: ["snippet", "contentDetails", "statistics"],
        mine: true,
    });
    const channel = response.data.items?.[0];
    if (!channel)
        throw new NotFoundError("Canal do YouTube");
    return {
        channelId: channel.id,
        title: channel.snippet?.title ?? "Canal sem nome",
        thumbnails: channel.snippet?.thumbnails,
    };
}
/**
 * Renova access token usando refresh token criptografado
 */
export async function refreshAccessToken(encryptedRefreshToken) {
    const refreshToken = decrypt(encryptedRefreshToken);
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await oauth2Client.refreshAccessToken();
    if (!credentials.access_token) {
        throw new AppError("Falha ao renovar access token", 500, "TOKEN_REFRESH_FAILED");
    }
    return credentials.access_token;
}
/**
 * Cria cliente YouTube autenticado para um canal da organização
 */
export async function getAuthenticatedYouTubeClient(organizationId, socialAccountId) {
    const supabase = getSupabase();
    const { data: account, error } = await supabase
        .from("social_accounts")
        .select("provider_account_id, token_reference")
        .eq("id", socialAccountId)
        .eq("organization_id", organizationId)
        .eq("platform_id", "youtube")
        .single();
    if (error || !account)
        throw new NotFoundError("Canal do YouTube");
    if (!account.token_reference)
        throw new AppError("Canal sem token de acesso", 400, "NO_TOKEN");
    const accessToken = await refreshAccessToken(account.token_reference);
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ access_token: accessToken });
    return {
        youtube: google.youtube({ version: "v3", auth: oauth2Client }),
        youtubeAnalytics: google.youtubeAnalytics({ version: "v2", auth: oauth2Client }),
        channelId: account.provider_account_id,
    };
}
/**
 * Salva/atualiza canal conectado no banco
 */
export async function saveConnectedChannel(organizationId, userId, channelInfo, tokens) {
    const supabase = getSupabase();
    const encryptedRefreshToken = encrypt(tokens.refresh_token);
    const { data, error } = await supabase
        .from("social_accounts")
        .upsert({
        organization_id: organizationId,
        platform_id: "youtube",
        account_name: channelInfo.title,
        provider_account_id: channelInfo.channelId,
        token_reference: encryptedRefreshToken,
        status: "connected",
        connected_at: new Date().toISOString(),
    }, {
        onConflict: "organization_id,platform_id,provider_account_id",
        ignoreDuplicates: false,
    })
        .select()
        .single();
    if (error)
        throw error;
    return data;
}
