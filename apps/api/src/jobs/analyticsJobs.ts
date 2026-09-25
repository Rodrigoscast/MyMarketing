import { randomUUID } from "node:crypto";
import { collectAnalyticsForOrg } from "../modules/analytics/worker.js";

type AnalyticsJobResult = Awaited<ReturnType<typeof collectAnalyticsForOrg>>;

type AnalyticsJob = {
  id: string;
  organizationId: string;
  status: "running" | "completed" | "failed";
  result?: AnalyticsJobResult;
  error?: string;
  createdAt: number;
};

const jobs = new Map<string, AnalyticsJob>();
const JOB_TTL_MS = 15 * 60 * 1000;

function removeExpiredJobs() {
  const expiration = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.createdAt < expiration) jobs.delete(id);
  }
}

export function startAnalyticsJob(organizationId: string) {
  removeExpiredJobs();

  const job: AnalyticsJob = {
    id: randomUUID(),
    organizationId,
    status: "running",
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);

  void collectAnalyticsForOrg(organizationId)
    .then((result) => {
      job.status = "completed";
      job.result = result;
    })
    .catch((error: unknown) => {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : "Não foi possível atualizar os analytics.";
    });

  return job;
}

export function getAnalyticsJob(jobId: string, organizationId: string) {
  const job = jobs.get(jobId);
  if (!job || job.organizationId !== organizationId) return null;
  return job;
}
