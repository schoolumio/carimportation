// Background worker: delivers notifications, processes acceptance-period expiry, expires quotes/listings,
// and runs the daily sandbox reconciliation. Run one or more instances: `npm run worker`.
import { hostname } from "node:os";
import { claimNextJob, enqueueJob, runJob } from "../src/server/jobs/queue";
import { JOB_HANDLERS } from "../src/server/jobs/handlers";
import { prisma } from "../src/server/db";

const workerId = `${hostname()}:${process.pid}`;
let stopping = false;
process.on("SIGINT", () => (stopping = true));
process.on("SIGTERM", () => (stopping = true));

async function scheduleMaintenance() {
  const hourKey = new Date().toISOString().slice(0, 13);
  const dayKey = new Date().toISOString().slice(0, 10);
  await enqueueJob(prisma, "maintenance.expireQuotes", {}, { dedupeKey: `expire-quotes:${hourKey}` });
  await enqueueJob(prisma, "maintenance.expireListings", {}, { dedupeKey: `expire-listings:${hourKey}` });
  await enqueueJob(prisma, "finance.dailyReconciliation", { periodEnd: `${dayKey}T00:00:00.000Z` }, { dedupeKey: `reconcile:${dayKey}` });
}

async function main() {
  console.log(`[worker ${workerId}] started`);
  let lastMaintenance = 0;
  while (!stopping) {
    if (Date.now() - lastMaintenance > 60_000) {
      await scheduleMaintenance().catch((e) => console.error("[worker] maintenance scheduling failed", e));
      lastMaintenance = Date.now();
    }
    const job = await claimNextJob(workerId);
    if (!job) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    await runJob(job, JOB_HANDLERS);
    console.log(`[worker] ${job.type} ${job.id} done`);
  }
  await prisma.$disconnect();
  console.log("[worker] stopped");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
