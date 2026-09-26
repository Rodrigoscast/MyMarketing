import cors from "cors";
import express from "express";
import { env, hasSupabaseConfig } from "./config/index.js";
import apiRouter from "./routers/index.js";
import { errorHandler } from "./lib/errorHandler.js";
import { startPublicationScheduler } from "./modules/scheduler/cron.js";

const app = express();

app.use(
  cors({
    origin: env.WEB_ORIGIN,
    credentials: true,
  })
);
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// Servir arquivos estáticos (uploads)
app.use("/uploads", express.static("public/uploads"));

// Rotas da API
app.use("/api", apiRouter);

// Error handler (deve ser o último middleware)
app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`🚀 MyMarketing API rodando em http://localhost:${env.PORT}`);
  console.log(`   Ambiente: ${env.NODE_ENV}`);
  console.log(`   Web Origin: ${env.WEB_ORIGIN}`);
  console.log(`   Supabase: ${hasSupabaseConfig ? "configurado" : "NÃO CONFIGURADO"}`);
  startPublicationScheduler();
});

export { app };
