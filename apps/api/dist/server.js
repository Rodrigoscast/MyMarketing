import cors from "cors";
import express from "express";
import { z } from "zod";
import { env } from "./env.js";
import { getSupabase, hasSupabaseConfig } from "./supabase.js";
const app = express();
app.use(cors({
    origin: env.webOrigin,
    credentials: true
}));
app.use(express.json({ limit: "20mb" }));
const platformList = [
    { id: "linkedin", display_name: "LinkedIn", category: "social" },
    { id: "facebook", display_name: "Facebook", category: "social" },
    { id: "instagram", display_name: "Instagram", category: "social" },
    { id: "tiktok", display_name: "TikTok", category: "social" },
    { id: "youtube", display_name: "YouTube", category: "social" },
    { id: "google_ads", display_name: "Google Ads", category: "ads" },
    { id: "meta_ads", display_name: "Meta Ads", category: "ads" }
];
const scheduledPostSchema = z.object({
    organizationId: z.string().uuid(),
    title: z.string().min(3),
    caption: z.string().min(1),
    mediaUrl: z.string().url().optional(),
    mediaType: z.enum(["video", "image", "text"]).default("text"),
    scheduledFor: z.string().datetime(),
    timezone: z.string().default("America/Sao_Paulo"),
    platforms: z.array(z.string().min(2)).min(1)
});
const connectionSchema = z.object({
    organizationId: z.string().uuid(),
    platformId: z.enum(["google_ads", "meta_ads"]),
    accountName: z.string().min(2),
    providerAccountId: z.string().min(2)
});
app.get("/health", (_request, response) => {
    response.json({
        ok: true,
        service: "mymarketing-api",
        supabaseConfigured: hasSupabaseConfig()
    });
});
app.get("/platforms", (_request, response) => {
    response.json({ data: platformList });
});
app.get("/scheduled-posts", async (request, response, next) => {
    try {
        if (!hasSupabaseConfig()) {
            response.json({
                data: [
                    {
                        id: "demo-1",
                        title: "Video institucional",
                        status: "scheduled",
                        scheduled_for: "2026-04-27T12:00:00.000Z"
                    }
                ],
                mode: "demo"
            });
            return;
        }
        const organizationId = request.header("x-organization-id");
        let query = getSupabase()
            .from("scheduled_posts")
            .select("*, scheduled_post_targets(platform_id, platform_status)")
            .order("scheduled_for", { ascending: true });
        if (organizationId) {
            query = query.eq("organization_id", organizationId);
        }
        const { data, error } = await query;
        if (error) {
            throw error;
        }
        response.json({ data });
    }
    catch (error) {
        next(error);
    }
});
app.post("/scheduled-posts", async (request, response, next) => {
    try {
        const payload = scheduledPostSchema.parse(request.body);
        if (!hasSupabaseConfig()) {
            response.status(503).json({
                error: "Supabase is not configured. Add apps/api/.env to persist scheduled posts."
            });
            return;
        }
        const supabase = getSupabase();
        const { data: post, error: postError } = await supabase
            .from("scheduled_posts")
            .insert({
            organization_id: payload.organizationId,
            title: payload.title,
            caption: payload.caption,
            media_url: payload.mediaUrl,
            media_type: payload.mediaType,
            scheduled_for: payload.scheduledFor,
            timezone: payload.timezone,
            status: "scheduled"
        })
            .select()
            .single();
        if (postError) {
            throw postError;
        }
        const targets = payload.platforms.map((platformId) => ({
            scheduled_post_id: post.id,
            platform_id: platformId,
            platform_status: "queued"
        }));
        const { error: targetError } = await supabase.from("scheduled_post_targets").insert(targets);
        if (targetError) {
            throw targetError;
        }
        response.status(201).json({ data: post });
    }
    catch (error) {
        next(error);
    }
});
app.get("/ad-insights", async (request, response, next) => {
    try {
        if (!hasSupabaseConfig()) {
            response.json({
                data: [
                    { day: "2026-04-19", spend: 8400, revenue: 32000, impressions: 76000, clicks: 18400 },
                    { day: "2026-04-20", spend: 9300, revenue: 41000, impressions: 68000, clicks: 14100 }
                ],
                mode: "demo"
            });
            return;
        }
        const organizationId = request.header("x-organization-id");
        let query = getSupabase()
            .from("ad_metrics_daily")
            .select("*, ad_campaigns!inner(name, organization_id, ad_connections(platform_id))")
            .order("day", { ascending: true })
            .limit(90);
        if (organizationId) {
            query = query.eq("ad_campaigns.organization_id", organizationId);
        }
        const { data, error } = await query;
        if (error) {
            throw error;
        }
        response.json({ data });
    }
    catch (error) {
        next(error);
    }
});
app.post("/ad-connections", async (request, response, next) => {
    try {
        const payload = connectionSchema.parse(request.body);
        if (!hasSupabaseConfig()) {
            response.status(503).json({
                error: "Supabase is not configured. Add apps/api/.env to persist ad connections."
            });
            return;
        }
        const { data, error } = await getSupabase()
            .from("ad_connections")
            .insert({
            organization_id: payload.organizationId,
            platform_id: payload.platformId,
            account_name: payload.accountName,
            provider_account_id: payload.providerAccountId,
            status: "connected"
        })
            .select()
            .single();
        if (error) {
            throw error;
        }
        response.status(201).json({ data });
    }
    catch (error) {
        next(error);
    }
});
app.get("/settings/general", async (request, response, next) => {
    try {
        const organizationId = request.header("x-organization-id");
        if (!organizationId) {
            response.status(400).json({ error: "x-organization-id header is required." });
            return;
        }
        if (!hasSupabaseConfig()) {
            response.json({
                data: {
                    organization_id: organizationId,
                    timezone: "America/Sao_Paulo",
                    locale: "pt-BR",
                    brand_voice: "Elegante e direto",
                    approval_required: true
                },
                mode: "demo"
            });
            return;
        }
        const { data, error } = await getSupabase()
            .from("brand_settings")
            .select("*")
            .eq("organization_id", organizationId)
            .single();
        if (error) {
            throw error;
        }
        response.json({ data });
    }
    catch (error) {
        next(error);
    }
});
app.use((error, _request, response, _next) => {
    if (error instanceof z.ZodError) {
        response.status(422).json({ error: "Validation error", issues: error.flatten() });
        return;
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    response.status(500).json({ error: message });
});
app.listen(env.port, () => {
    console.log(`MyMarketing API running on http://localhost:${env.port}`);
});
