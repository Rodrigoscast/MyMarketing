import { Router, Response } from "express";
import { authAndOrg, AuthenticatedRequest } from "../auth/middleware.js";
import { getQuotaStatus, checkQuotaForUpload, logQuotaUsage, fetchRealQuotaInfo, QUOTA_COSTS } from "./quota.js";
import { AppError } from "../../lib/errors.js";

const router = Router();
router.use(...authAndOrg);

// GET /api/analytics/quota - Status atual da quota
router.get("/quota", async (req: AuthenticatedRequest, res: Response) => {
  const status = await getQuotaStatus(req.organizationId!);
  res.json({
    data: {
      ...status,
      costs: QUOTA_COSTS,
      thresholds: {
        warning: 0.8,
        critical: 0.95,
      },
    },
  });
});

// GET /api/analytics/quota/check-upload - Verificar se pode fazer upload
router.get("/quota/check-upload", async (req: AuthenticatedRequest, res: Response) => {
  const result = await checkQuotaForUpload(req.organizationId!);
  res.json({ data: result });
});

// POST /api/analytics/quota/log - Registrar uso manual (para testes)
const logSchema = {
  operation: { type: "string", enum: Object.keys(QUOTA_COSTS) },
  metadata: { type: "object" },
};

router.post("/quota/log", async (req: AuthenticatedRequest, res: Response) => {
  const { operation, metadata } = req.body;

  if (!operation || !QUOTA_COSTS[operation as keyof typeof QUOTA_COSTS]) {
    throw new AppError("Operação inválida", 400, "INVALID_OPERATION");
  }

  await logQuotaUsage(req.organizationId!, operation as keyof typeof QUOTA_COSTS, metadata);
  const status = await getQuotaStatus(req.organizationId!);
  res.json({ data: status });
});

// GET /api/analytics/quota/real - Verificar quota real na API do YouTube
router.get("/quota/real", async (req: AuthenticatedRequest, res: Response) => {
  const socialAccountId = req.query.socialAccountId as string;

  if (!socialAccountId) {
    throw new AppError("socialAccountId é obrigatório", 400, "MISSING_SOCIAL_ACCOUNT");
  }

  const result = await fetchRealQuotaInfo(req.organizationId!, socialAccountId);
  res.json({ data: result });
});

export default router;