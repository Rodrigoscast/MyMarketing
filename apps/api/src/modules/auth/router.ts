import { Router } from "express";
import { z } from "zod";
import { createClient, type Session, type User } from "@supabase/supabase-js";
import { getSupabase } from "../../lib/supabase.js";
import { isDev, env } from "../../config/index.js";
import { authMiddleware, AuthenticatedRequest } from "./middleware.js";
import { ConflictError, UnauthorizedError, AppError } from "../../lib/errors.js";

const router = Router();

/**
 * Cliente usado APENAS para operações de auth (signUp / signIn / admin).
 * Importante: após um signInWithPassword o supabase-js troca o header
 * Authorization para o token do usuário. Por isso este cliente é criado
 * por requisição — nunca compartilhado — e as queries de dados (inserção
 * de organização/provisão) usam `getSupabase()`, que mantém o service role.
 */
function getAuthClient() {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const registerSchema = z.object({
  name: z.string().min(2, "Informe seu nome"),
  company: z.string().min(2, "Informe o nome da empresa"),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres"),
});

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Informe sua senha"),
});

interface OrgShape {
  id: string;
  name: string;
  plan: string;
}

type OrgJoin = OrgShape[] | OrgShape | null;

function pickOrg(joined: OrgJoin): OrgShape | null {
  if (!joined) return null;
  return Array.isArray(joined) ? joined[0] ?? null : joined;
}

/**
 * Cria (ou reutiliza) o perfil, a organização e a associação de dono
 * para um usuário recém-cadastrado. Idempotente: se o usuário já tiver
 * uma organização, devolve a existente.
 */
async function provisionOrganization(userId: string, company: string, fullName: string): Promise<OrgShape> {
  const supabase = getSupabase();

  // Perfil (idempotente)
  await supabase
    .from("profiles")
    .upsert({ id: userId, full_name: fullName }, { onConflict: "id" });

  // Já tem organização? retorna a primeira
  const { data: existing } = await supabase
    .from("organization_members")
    .select("organization_id, organizations(id, name, plan)")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  const existingOrg = existing ? pickOrg(existing.organizations as OrgJoin) : null;

  if (!existingOrg) {
    // Cria a organização
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({ name: company })
      .select("id, name, plan")
      .single();

    if (orgError) {
      throw new AppError("Não foi possível criar a organização", 500, "ORG_CREATE_FAILED", orgError.message);
    }

    // Associa o usuário como owner
    const { error: memberError } = await supabase
      .from("organization_members")
      .insert({ organization_id: org.id, user_id: userId, role: "owner" });

    if (memberError) {
      // Rollback da organização recém-criada
      await supabase.from("organizations").delete().eq("id", org.id);
      throw new AppError("Não foi possível vincular a organização", 500, "ORG_MEMBER_FAILED", memberError.message);
    }

    return org as OrgShape;
  }

  return existingOrg;
}

/** Busca a primeira organização de um usuário. */
async function getFirstOrganization(userId: string): Promise<OrgShape | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id, organizations(id, name, plan)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data?.organizations) return null;
  return pickOrg(data.organizations as OrgJoin);
}

function toUserPayload(user: User) {
  return {
    id: user.id,
    email: user.email ?? null,
    name: (user.user_metadata?.full_name as string) ?? null,
  };
}

function sessionToData(session: Session, user: User, organization: OrgShape | null) {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? null,
    user: toUserPayload(user),
    organization,
  };
}

// POST /api/auth/register - Cria conta, organização e retorna sessão
router.post("/register", async (req, res) => {
  const input = registerSchema.parse(req.body);
  const supabase = getAuthClient(); // por requisição; não polui o cliente de dados

  let userRecord: User;
  let session: Session | null = null;

  if (isDev) {
    // Dev: cria o usuário já confirmado pelo admin (sem envio de email,
    // evitando rate limit) e autentica na hora para seguir direto ao /app.
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.name },
    });

    if (createError || !created.user) {
      if (createError?.message.toLowerCase().includes("already")) {
        throw new ConflictError("Já existe uma conta cadastrada com este email");
      }
      throw new ConflictError(createError?.message ?? "Não foi possível criar o usuário");
    }

    userRecord = created.user;

    const { data: signedIn, error: signInError } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (signInError || !signedIn?.session) {
      throw new AppError("Não foi possível autenticar após o cadastro", 500, "SIGN_IN_AFTER_CREATE_FAILED");
    }
    session = signedIn.session;
  } else {
    // Produção: fluxo normal com confirmação por email
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { full_name: input.name } },
    });

    if (error || !data.user) {
      if (error?.message.toLowerCase().includes("already")) {
        throw new ConflictError("Já existe uma conta cadastrada com este email");
      }
      throw new ConflictError(error?.message ?? "Não foi possível criar o usuário");
    }

    userRecord = data.user;
    session = data.session; // null se confirmação exigida
  }

  // Cria organização e associa como owner (idempotente)
  const organization = await provisionOrganization(userRecord.id, input.company, input.name);

  if (!session) {
    return res.status(201).json({
      data: {
        requiresEmailConfirmation: true,
        user: toUserPayload(userRecord),
        organization,
      },
    });
  }

  return res.status(201).json({
    data: sessionToData(session, userRecord, organization),
  });
});

// POST /api/auth/login - Autentica e retorna sessão + organização
router.post("/login", async (req, res) => {
  const input = loginSchema.parse(req.body);
  const supabase = getAuthClient(); // por requisição; não polui o cliente de dados

  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error || !data.session) {
    throw new UnauthorizedError("Email ou senha inválidos");
  }

  const organization = await getFirstOrganization(data.user.id);

  return res.json({
    data: sessionToData(data.session, data.user, organization),
  });
});

// GET /api/auth/me - Valida token e retorna usuário + membresias
router.get("/me", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const supabase = getSupabase();
  const token = (req.headers.authorization as string).slice(7);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new UnauthorizedError("Sessão inválida ou expirada");
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(id, name, plan)")
    .eq("user_id", data.user.id);

  if (membershipsError) {
    throw new AppError("Não foi possível carregar suas organizações", 500, "ORG_LOAD_FAILED", membershipsError.message);
  }

  return res.json({
    data: {
      user: toUserPayload(data.user),
      memberships: memberships ?? [],
    },
  });
});

export default router;