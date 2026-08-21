import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/index.js";

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return supabaseInstance;
}

export function hasSupabaseConfig(): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

// Helper para queries com RLS - exige organization_id no header
export async function getOrgSupabase(
  organizationId: string
): Promise<SupabaseClient> {
  const client = getSupabase();
  // O RLS usa a função is_org_member(org_id) que verifica auth.uid()
  // Como usamos service_role, precisamos fazer a verificação manual ou
  // usar o header x-organization-id nas queries
  return client;
}