import "dotenv/config";

export const env = {
  port: Number(process.env.PORT ?? 3333),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
};
