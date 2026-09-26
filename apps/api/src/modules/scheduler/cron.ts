import { runScheduler } from "./worker.js";

const SCHEDULER_INTERVAL_MS = 60_000;
let started = false;

async function runAndScheduleNext() {
  await runScheduler();
  setTimeout(runAndScheduleNext, SCHEDULER_INTERVAL_MS);
}

export function startPublicationScheduler() {
  if (started) return;
  started = true;

  console.log("[Scheduler] Publicação automática ligada; verificando a fila a cada minuto.");
  void runAndScheduleNext();
}
