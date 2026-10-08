import { NextResponse } from "next/server";
import { getServiceRoleSupabaseClient } from "@/lib/supabase-service-role";
import { createS3Destination, type Destination } from "@/lib/backup/destination";
import { runBackup } from "@/lib/backup/run";
import { summaryLine, toHeartbeatDetail } from "@/lib/backup/report";

/**
 * The storage backup job.
 *
 * ## Why this is its own cron and not a step in /api/cron/maintenance
 *
 * The maintenance route already runs guarantee-fee maintenance and, on
 * Mondays, the agent sweep — which makes one model call per active
 * mandate at a measured 25–32 seconds each. Hanging the backup off the
 * same invocation would mean a slow sweep starves it, and one failure
 * takes both. A separate cron entry costs nothing (Vercel allows 100 per
 * project on every plan) and buys an independent time budget, independent
 * failure, and an independent heartbeat.
 *
 * ## ⚠️ NOT YET SCHEDULED
 *
 * `vercel.json` is deliberately unchanged: adding the cron entry would
 * activate the job on the next deploy, which is a production
 * configuration change. Until it is scheduled and the `BACKUP_*`
 * environment variables exist, this route exists and does nothing —
 * reachable only with `CRON_SECRET`, and answering honestly that it is
 * not configured. The same honest-absence shape as call transcription.
 *
 * Migration 161 (the advisory-lock wrapper) is also unapplied, so even
 * with a destination configured the run would refuse for want of a lock.
 * Both are listed in the activation steps.
 *
 * ## Auth — fails closed
 *
 * No `CRON_SECRET` means 503, not open. A scheduling endpoint that
 * defaulted to public would let anyone drive our write cadence — and
 * this one reads every candidate CV, so it would also let anyone drive
 * our egress bill.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sits inside Vercel's function limit with room for the manifest write.
 * Writing the manifest is what makes progress durable, so it must never
 * be the thing that gets cut off; `DEFAULT_BUDGET_MS` stops copying well
 * before this.
 */
export const maxDuration = 60;

/** Resolve the destination from the environment, or explain its absence. */
function resolveDestination():
  | { ok: true; destination: Destination }
  | { ok: false; reason: string } {
  const kind = process.env.BACKUP_DESTINATION;
  if (!kind) {
    return {
      ok: false,
      reason:
        "BACKUP_DESTINATION is not set. The storage backup is not configured and did not run.",
    };
  }
  if (kind !== "s3") {
    // The local adapter is for tests and the restore rehearsal only. A
    // filesystem destination on a serverless function would be written
    // to an ephemeral disk and discarded — a backup that silently
    // backs up nothing is worse than none.
    return {
      ok: false,
      reason: `BACKUP_DESTINATION="${kind}" is not valid in a deployment; only "s3" is.`,
    };
  }

  const endpoint = process.env.BACKUP_S3_ENDPOINT;
  const region = process.env.BACKUP_S3_REGION;
  const bucket = process.env.BACKUP_S3_BUCKET;
  const accessKeyId = process.env.BACKUP_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY;

  const missing = Object.entries({
    BACKUP_S3_ENDPOINT: endpoint,
    BACKUP_S3_REGION: region,
    BACKUP_S3_BUCKET: bucket,
    BACKUP_S3_ACCESS_KEY_ID: accessKeyId,
    BACKUP_S3_SECRET_ACCESS_KEY: secretAccessKey,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    // Names only — never values.
    return {
      ok: false,
      reason: `Storage backup is half-configured; missing: ${missing.join(", ")}.`,
    };
  }

  return {
    ok: true,
    destination: createS3Destination({
      endpoint: endpoint!,
      region: region!,
      bucket: bucket!,
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
      prefix: process.env.BACKUP_S3_PREFIX,
    }),
  };
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/backup] CRON_SECRET is not set; refusing to run");
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const resolved = resolveDestination();
  if (!resolved.ok) {
    // 503 rather than 500: this is an absent configuration, not a fault.
    console.warn(`[backup] not configured: ${resolved.reason}`);
    return NextResponse.json(
      { outcome: "skipped", reason: resolved.reason },
      { status: 503 }
    );
  }

  const service = getServiceRoleSupabaseClient();
  const report = await runBackup(
    service,
    resolved.destination,
    process.env.BACKUP_ENCRYPTION_KEY
  );

  // Requirement 9: one honest line, no CV content and no credentials.
  // `summaryLine` and `toHeartbeatDetail` both run every reason through
  // the sanitiser, which redacts credential SHAPES and caps length.
  const line = summaryLine(report);
  if (report.outcome === "failed") console.error(line);
  else console.log(line);

  const detail = toHeartbeatDetail(report);

  // The heartbeat is how a silent failure becomes visible: /api/health
  // reads the cron heartbeat, and this writes its own row so a backup
  // that stops running is distinguishable from a maintenance job that
  // stops running. Best-effort — a failed stamp must not fail the run it
  // is reporting on, but it is logged, because a job that cannot say it
  // ran is the exact silence the row exists to end.
  try {
    const stamp = new Date().toISOString();
    const { error } = await service.from("ops_heartbeats").upsert({
      name: "storage_backup",
      // Only a genuinely successful run stamps `last_ok_at`. A partial
      // run that made progress is honest progress, but it is not "ok",
      // and an operator watching this field should see the difference.
      last_ok_at: report.outcome === "complete" ? stamp : null,
      detail: detail as unknown as Record<string, unknown>,
      updated_at: stamp,
    });
    if (error) console.error("[backup] heartbeat stamp failed", error.message);
  } catch (err) {
    console.error("[backup] heartbeat stamp threw", err);
  }

  // A failed run returns 500 so the Vercel cron log shows it red. Vercel
  // does not retry, so the signal is for a human; the next run is what
  // actually recovers.
  const status = report.outcome === "failed" ? 500 : 200;
  return NextResponse.json({ ...detail, durationMs: report.durationMs }, { status });
}
