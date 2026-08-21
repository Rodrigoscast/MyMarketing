import { Request, Response, NextFunction } from "express";
import { getSupabase } from "../../lib/supabase.js";
import { UnauthorizedError, ForbiddenError } from "../../lib/errors.js";

export interface AuthenticatedRequest extends Request {
  userId?: string;
  organizationId?: string;
  userRole?: string;
}

/**
 * Middleware que valida o JWT do Supabase no header Authorization
 * e extrai o user_id. Não verifica membership de organização.
 */
export async function authMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Token de autorização ausente");
  }

  const token = authHeader.slice(7);
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new UnauthorizedError("Token inválido ou expirado");
  }

  req.userId = data.user.id;
  next();
}

/**
 * Middleware que exige o header x-organization-id e verifica
 * se o usuário é membro da organização.
 */
export async function requireOrgMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  const orgId = req.headers["x-organization-id"] as string;
  if (!orgId) {
    throw new ForbiddenError("Header x-organization-id obrigatório");
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", req.userId!)
    .single();

  if (error || !data) {
    throw new ForbiddenError("Usuário não é membro desta organização");
  }

  req.organizationId = orgId;
  req.userRole = data.role;
  next();
}

/**
 * Middleware combinado: auth + org membership
 */
export const authAndOrg = [authMiddleware, requireOrgMiddleware];