import { Router } from "express";
import authRouter from "../modules/auth/router.js";
import channelsRouter from "../modules/channels/router.js";
import videosRouter from "../modules/videos/router.js";
import schedulerRouter from "../modules/scheduler/router.js";
import analyticsRouter from "../modules/analytics/router.js";
import quotaRouter from "../modules/analytics/quota-router.js";
const apiRouter = Router();
// Health check (sem auth)
apiRouter.get("/health", (_req, res) => {
    res.json({ ok: true, service: "mymarketing-api", timestamp: new Date().toISOString() });
});
// Autenticação (pública)
apiRouter.use("/auth", authRouter);
// Rotas com autenticação
apiRouter.use("/channels", channelsRouter);
apiRouter.use("/videos", videosRouter);
apiRouter.use("/scheduler", schedulerRouter);
apiRouter.use("/analytics", analyticsRouter);
apiRouter.use("/analytics", quotaRouter);
// Rotas legadas mantidas para compatibilidade (dashboard existente)
apiRouter.get("/platforms", (_req, res) => {
    res.json({
        data: [
            { id: "linkedin", display_name: "LinkedIn", category: "social" },
            { id: "facebook", display_name: "Facebook", category: "social" },
            { id: "instagram", display_name: "Instagram", category: "social" },
            { id: "tiktok", display_name: "TikTok", category: "social" },
            { id: "youtube", display_name: "YouTube", category: "social" },
            { id: "google_ads", display_name: "Google Ads", category: "ads" },
            { id: "meta_ads", display_name: "Meta Ads", category: "ads" },
        ],
    });
});
export default apiRouter;
