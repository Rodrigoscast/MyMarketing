import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";
let client = null;
export function hasSupabaseConfig() {
    return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}
export function getSupabase() {
    if (!hasSupabaseConfig()) {
        throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    }
    if (!client) {
        client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false
            }
        });
    }
    return client;
}
