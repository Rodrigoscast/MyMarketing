import "dotenv/config";
import { z } from "zod";
const envSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().default(3333),
    WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
    // Armazenamento local de uploads
    UPLOAD_DIR: z.string().default("./public/uploads/videos"),
    MAX_UPLOAD_SIZE_MB: z.coerce.number().default(2048), // 2GB para vídeos
    // Google / YouTube OAuth
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_REDIRECT_URI: z.string().url().optional(),
    // Crypto para refresh tokens
    ENCRYPTION_KEY: z.string().length(64).optional(), // 32 bytes = 256 bits, hex = 64 chars
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    console.error("❌ Variáveis de ambiente inválidas:", parsed.error.flatten().fieldErrors);
    process.exit(1);
}
export const env = parsed.data;
// Validação extra apenas em produção
if (env.NODE_ENV === "production") {
    const requiredProd = [
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "GOOGLE_REDIRECT_URI",
        "ENCRYPTION_KEY",
    ];
    for (const key of requiredProd) {
        if (!env[key]) {
            console.error(`❌ Variável obrigatória em produção ausente: ${key}`);
            process.exit(1);
        }
    }
}
export const isDev = env.NODE_ENV === "development";
export const isProd = env.NODE_ENV === "production";
export const hasSupabaseConfig = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
