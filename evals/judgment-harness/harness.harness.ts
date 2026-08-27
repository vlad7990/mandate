/**
 * §185 — the judgment benchmark harness.
 *
 * Every proof in the ledger so far shares one author: the person who
 * wrote the fixture also wrote the expectation. This harness breaks
 * that. The RUNNER (this file) drives real CVs through the LIVE seams —
 * parse → evaluate → refuter → rank, agent sessions and trails and all —
 * and emits a judgment sheet whose verdict columns are EMPTY. The
 * founder fills them by hand. A second command scores the filled sheet:
 * concordance, rank correlation, and every disagreement verbatim. That
 * report is the §128 deliverable — the first test of the system's
 * judgment where the expectation's author is not the fixture's.
 *
 * Commands (HARNESS_CMD): ingest | score | teardown. See README.md in
 * this directory for the founder's exact invocations.
 *
 * Honesty notes, stated rather than buried:
 * - Runs under MANDATE_EVAL=1 like the eval rig, so inference uses the
 *   RULED capability map, not a live registry override.
 * - The harness sits below the action layer, so it re-checks §177's
 *   door itself (assertCalibrationMatchesSpec) before ingesting — the
 *   door must hold here exactly as it does in the app.
 * - Trail events written by the agents during a run are REAL history of
 *   real runs and are deliberately not torn down by the teardown
 *   command; it removes candidates and their files only.
 */
import { describe, it } from "vitest";
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { runCvParseAndPersist } from "@/lib/candidates/agent-parser";
import { ensureCandidateEvaluation } from "@/lib/ai/generate-evaluation";
import { runRankerScoring } from "@/lib/ranking/agent-ranker";
import { assertCalibrationMatchesSpec } from "@/lib/calibration/spec-drift";
import { PDF_MIME, DOCX_MIME } from "@/lib/ai/parse-cv";
import { claimGrade, claimText } from "@/lib/ai/evidence-grades";
import type { CalibrationModel, CompanyContext } from "@/lib/ai/role-analysis";
import type { CandidateProfile } from "@/lib/ai/cv-parsing";
import type { CandidateEvaluation } from "@/lib/ai/candidate-evaluation";

const ROOT = process.cwd();
const CV_DIR = path.join(ROOT, "evals/fixtures/cvs");
const OUT_DIR = path.join(ROOT, "evals/judgment-harness/output");
const MANIFEST = path.join(OUT_DIR, "run-manifest.json");
const SHEET = path.join(OUT_DIR, "judgment-sheet.md");
const REPORT = path.join(OUT_DIR, "judgment-report.md");

type Manifest = {
  projectId: string;
  startedAt: string;
  candidates: {
    candidateId: string;
    file: string;
    cvPath: string;
    parsed: boolean;
    evaluated: boolean;
  }[];
};

// ── env ────────────────────────────────────────────────────────────────

/** The seams read agent creds from process.env; load the founder's
 * .env.local wholesale (setup.ts loads only the API key). Existing
 * shell values win. */
function loadEnvLocal(): void {
  let raw: string;
  try {
    raw = readFileSync(path.join(ROOT, ".env.local"), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(?:"([^"]*)"|'([^']*)'|(.*))$/);
    if (!m) continue;
    const key = m[1];
    const value = (m[2] ?? m[3] ?? m[4])?.trim();
    if (value && value !== "[SENSITIVE]" && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

/** The human half of the run — the founder's (or a drive persona's)
 * own session. The harness never holds a service key: every row it
 * touches, it touches under RLS. */
async function signInHuman(): Promise<{ client: SupabaseClient; userId: string; organizationId: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.HARNESS_EMAIL;
  const password = process.env.HARNESS_PASSWORD;
  if (!url || !anon) throw new Error("Supabase env absent — is .env.local present?");
  if (!email || !password) {
    throw new Error(
      "HARNESS_EMAIL / HARNESS_PASSWORD are required — the harness runs as YOU, under RLS, never as a service key."
    );
  }
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Harness sign-in failed: ${error?.message}`);
  const { data: profile } = await client
    .from("users")
    .select("organization_id")
    .eq("id", data.user.id)
    .single<{ organization_id: string | null }>();
  if (!profile?.organization_id) throw new Error("Harness user has no organisation.");
  return { client, userId: data.user.id, organizationId: profile.organization_id };
}

// ── ingest ─────────────────────────────────────────────────────────────

async function ingest(): Promise<void> {
  const projectId = process.env.HARNESS_PROJECT;
  if (!projectId) {
    throw new Error(
      "HARNESS_PROJECT is required — create a THROWAWAY mandate in the app (its calibration is what candidates are judged against) and pass its id. Never point this at a live client mandate."
    );
  }

  const limit = Number(process.env.HARNESS_LIMIT ?? "10");
  const files = readdirSync(CV_DIR)
    .filter((f) => /\.(pdf|docx)$/i.test(f))
    .sort()
    .slice(0, limit);
  if (files.length === 0) {
    throw new Error(`No CVs found in ${CV_DIR} — drop PDF/DOCX files there first.`);
  }

  // H.2 — the cost gate. Printed, then the run refuses without consent.
  const estimate = `${files.length} parse + ${files.length} evaluation + up to ${files.length} refuter calls + 1 ranking ≈ ${files.length * 3 + 1} model calls (sonnet-class)`;
  if (process.env.HARNESS_CONFIRM !== "yes") {
    console.log(`\n[harness] would ingest ${files.length} CV(s): ${files.join(", ")}`);
    console.log(`[harness] estimated spend: ${estimate}`);
    console.log(`[harness] re-run with HARNESS_CONFIRM=yes to proceed.\n`);
    return;
  }

  const human = await signInHuman();
  const { data: project, error: pErr } = await human.client
    .from("projects")
    .select("id, title, organization_id, calibration_model, company_context")
    .eq("id", projectId)
    .single<{
      id: string;
      title: string;
      organization_id: string;
      calibration_model: Partial<CalibrationModel> | null;
      company_context: Partial<CompanyContext> | null;
    }>();
  if (pErr || !project) throw new Error(`Project not found or not yours: ${pErr?.message}`);

  // §177's door, held here exactly as the app holds it.
  await assertCalibrationMatchesSpec(human.client, projectId, project.calibration_model);

  console.log(`[harness] ingesting ${files.length} CV(s) into "${project.title}" — ${estimate}`);

  const manifest: Manifest = {
    projectId,
    startedAt: new Date().toISOString(),
    candidates: [],
  };

  for (const file of files) {
    const bytes = new Uint8Array(readFileSync(path.join(CV_DIR, file)));
    const mimeType = file.toLowerCase().endsWith(".pdf") ? PDF_MIME : DOCX_MIME;
    const fallbackName = file.replace(/\.(pdf|docx)$/i, "").trim();

    const { data: candidate, error: iErr } = await human.client
      .from("candidates")
      .insert({
        organization_id: human.organizationId,
        project_id: projectId,
        full_name: fallbackName,
        pipeline_stage: "found",
        cv_processing: true,
        source: "upload",
      })
      .select("id")
      .single<{ id: string }>();
    if (iErr || !candidate) {
      console.error(`[harness] ${file}: row insert failed — ${iErr?.message}`);
      continue;
    }

    const ext = mimeType === PDF_MIME ? "pdf" : "docx";
    const cvPath = `${human.organizationId}/${projectId}/${candidate.id}/cv.${ext}`;
    const { error: upErr } = await human.client.storage
      .from("cvs")
      .upload(cvPath, bytes, { contentType: mimeType, upsert: true });
    if (upErr) {
      console.error(`[harness] ${file}: upload failed — ${upErr.message}`);
      manifest.candidates.push({ candidateId: candidate.id, file, cvPath, parsed: false, evaluated: false });
      continue;
    }

    console.log(`[harness] ${file}: parsing…`);
    const parse = await runCvParseAndPersist({
      candidateId: candidate.id,
      projectId,
      organizationId: human.organizationId,
      fileBytes: bytes,
      mimeType,
      cvPath,
      calibration: project.calibration_model ?? {},
      company: project.company_context ?? {},
      trigger: "upload",
      priorName: fallbackName,
    });
    if (!parse.ok) {
      console.error(`[harness] ${file}: parse failed — ${parse.reason}`);
      manifest.candidates.push({ candidateId: candidate.id, file, cvPath, parsed: false, evaluated: false });
      continue;
    }

    console.log(`[harness] ${file}: evaluating (refuter runs on negative verdicts)…`);
    const evaluation = await ensureCandidateEvaluation(candidate.id, projectId, {
      trigger: "profile_view",
    });
    manifest.candidates.push({
      candidateId: candidate.id,
      file,
      cvPath,
      parsed: true,
      evaluated: evaluation.status === "ready",
    });
  }

  const evaluated = manifest.candidates.filter((c) => c.evaluated);
  if (evaluated.length >= 2) {
    console.log(`[harness] ranking ${evaluated.length} candidates…`);
    await runRankerScoring(projectId);
  } else {
    console.log(`[harness] fewer than 2 evaluated candidates — ranking skipped.`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  await writeSheet(human.client, manifest);
  console.log(`\n[harness] sheet written: ${path.relative(ROOT, SHEET)}`);
  console.log(`[harness] fill every "> " field by hand, then run the score command.`);
  console.log(`[harness] candidates STAY in the project until you run teardown — read them in the app too.\n`);
}

// ── the sheet ──────────────────────────────────────────────────────────

type SheetRow = {
  candidateId: string;
  file: string;
  name: string;
  tier: string | null;
  recommendation: string | null;
  fit: string;
  rank: number | null;
  refuter: string;
  topGap: string;
};

async function loadRows(client: SupabaseClient, manifest: Manifest): Promise<SheetRow[]> {
  const rows: SheetRow[] = [];
  const { data: scores } = await client
    .from("candidate_scores")
    .select("candidate_id, rank_position")
    .eq("project_id", manifest.projectId);
  const rankById = new Map<string, number | null>(
    (scores ?? []).map((s: { candidate_id: string; rank_position: number | null }) => [
      s.candidate_id,
      s.rank_position,
    ])
  );

  for (const entry of manifest.candidates) {
    const { data: cand } = await client
      .from("candidates")
      .select("id, full_name, cv_structured")
      .eq("id", entry.candidateId)
      .maybeSingle<{ id: string; full_name: string; cv_structured: unknown }>();
    if (!cand) continue;
    const cv = (cand.cv_structured ?? {}) as Partial<CandidateProfile> & {
      evaluation?: CandidateEvaluation;
    };
    const ev = cv.evaluation;
    const fit = cv.fit_dimensions
      ? `${cv.fit_dimensions.technical}/${cv.fit_dimensions.domain}/${cv.fit_dimensions.leadership}/${cv.fit_dimensions.regulatory}/${cv.fit_dimensions.transformation}`
      : "—";
    const topGapBlock = ev?.gaps?.[0];
    const topGap = topGapBlock
      ? `${topGapBlock.headline}${topGapBlock.evidence_grade ? ` [${topGapBlock.evidence_grade}]` : ""}`
      : (() => {
          const risk = (cv.risks ?? [])[0];
          return risk
            ? `${claimText(risk)}${claimGrade(risk) ? ` [${claimGrade(risk)}]` : ""}`
            : "—";
        })();
    rows.push({
      candidateId: cand.id,
      file: entry.file,
      name: cand.full_name,
      tier: ev?.final_verdict?.tier ?? null,
      recommendation: ev?.recommendation ?? null,
      fit,
      rank: rankById.get(cand.id) ?? null,
      refuter: ev?.second_opinion
        ? ev.second_opinion.agrees
          ? "concurred"
          : "CONTESTED"
        : "not run",
      topGap,
    });
  }
  rows.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  return rows;
}

async function writeSheet(client: SupabaseClient, manifest: Manifest): Promise<void> {
  const rows = await loadRows(client, manifest);
  const lines: string[] = [
    "# Judgment sheet",
    "",
    `Project: ${manifest.projectId} · run: ${manifest.startedAt} · candidates: ${rows.length}`,
    "",
    "The system's half is filled in. Yours is every line starting with `> `.",
    "Answer with plain values after the colon — `yes`/`no`, a tier number",
    "1–4, a rank number, free text for notes. Then run the score command.",
    "",
  ];
  rows.forEach((r, i) => {
    lines.push(`## ${i + 1}. ${r.name} — ${r.file}`);
    lines.push("");
    lines.push(
      `system: ${r.tier ?? "no evaluation"} · ${r.recommendation ?? "—"} · fit ${r.fit} · rank ${r.rank ?? "—"} · refuter: ${r.refuter}`
    );
    lines.push(`top gap: ${r.topGap}`);
    lines.push("");
    lines.push("> agree: ");
    lines.push("> your_tier: ");
    lines.push("> would_present: ");
    lines.push("> your_rank: ");
    lines.push("> notes: ");
    lines.push("");
    lines.push(`<!-- id:${r.candidateId} sys_tier:${r.tier ?? "-"} sys_rec:${r.recommendation ?? "-"} sys_rank:${r.rank ?? "-"} -->`);
    lines.push("");
  });
  writeFileSync(SHEET, lines.join("\n"));
}

// ── score ──────────────────────────────────────────────────────────────

type FilledBlock = {
  name: string;
  sysTier: string;
  sysRec: string;
  sysRank: number | null;
  agree: string | null;
  yourTier: string | null;
  wouldPresent: string | null;
  yourRank: number | null;
  notes: string | null;
};

function parseSheet(): FilledBlock[] {
  const raw = readFileSync(SHEET, "utf8");
  const blocks = raw.split(/^## /m).slice(1);
  return blocks.map((block) => {
    const name = block.split("\n")[0]?.replace(/^\d+\.\s*/, "").trim() ?? "?";
    const meta = block.match(/<!-- id:\S+ sys_tier:(\S+) sys_rec:(\S+) sys_rank:(\S+) -->/);
    const field = (key: string): string | null => {
      const m = block.match(new RegExp(`^> ${key}:\\s*(.*)$`, "m"));
      const v = m?.[1]?.trim();
      return v ? v : null;
    };
    const num = (v: string | null): number | null => {
      const n = Number(v);
      return v != null && Number.isFinite(n) ? n : null;
    };
    return {
      name,
      sysTier: meta?.[1] ?? "-",
      sysRec: meta?.[2] ?? "-",
      sysRank: meta?.[3] && meta[3] !== "-" ? Number(meta[3]) : null,
      agree: field("agree")?.toLowerCase() ?? null,
      yourTier: field("your_tier"),
      wouldPresent: field("would_present")?.toLowerCase() ?? null,
      yourRank: num(field("your_rank")),
      notes: field("notes"),
    };
  });
}

function spearman(pairs: [number, number][]): number | null {
  const n = pairs.length;
  if (n < 3) return null;
  const d2 = pairs.reduce((acc, [a, b]) => acc + (a - b) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}

async function score(): Promise<void> {
  if (!existsSync(SHEET)) throw new Error(`No sheet at ${SHEET} — run ingest first.`);
  const blocks = parseSheet();
  const filled = blocks.filter((b) => b.agree != null);
  const unfilled = blocks.filter((b) => b.agree == null).map((b) => b.name);

  const agreements = filled.filter((b) => b.agree === "yes");
  const disagreements = filled.filter((b) => b.agree !== "yes");
  const tierMatches = filled.filter(
    (b) => b.yourTier != null && b.sysTier.replace("tier_", "") === b.yourTier
  );
  const rankPairs = blocks
    .filter((b) => b.sysRank != null && b.yourRank != null)
    .map((b) => [b.sysRank as number, b.yourRank as number] as [number, number]);
  const rho = spearman(rankPairs);

  const lines: string[] = [
    "# Judgment report",
    "",
    `Filled: ${filled.length}/${blocks.length}${unfilled.length ? ` (unfilled: ${unfilled.join(", ")})` : ""}`,
    "",
    `Verdict concordance: ${agreements.length}/${filled.length} agreed`,
    `Tier concordance: ${tierMatches.length}/${filled.filter((b) => b.yourTier != null).length} exact`,
    `Rank correlation (Spearman, n=${rankPairs.length}): ${rho == null ? "needs ≥3 ranked pairs" : rho.toFixed(2)}`,
    "",
  ];
  if (disagreements.length > 0) {
    lines.push("## Disagreements — each one verbatim, because these ARE the finding");
    lines.push("");
    for (const d of disagreements) {
      lines.push(`- **${d.name}** — system said ${d.sysTier} · ${d.sysRec}; founder said tier ${d.yourTier ?? "?"}, present: ${d.wouldPresent ?? "?"}${d.notes ? ` — "${d.notes}"` : ""}`);
    }
    lines.push("");
  }
  writeFileSync(REPORT, lines.join("\n"));
  console.log("\n" + lines.join("\n"));
  console.log(`[harness] report written: ${path.relative(ROOT, REPORT)}\n`);
}

// ── teardown ───────────────────────────────────────────────────────────

async function teardown(): Promise<void> {
  if (!existsSync(MANIFEST)) throw new Error(`No manifest at ${MANIFEST} — nothing to tear down.`);
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest;
  const human = await signInHuman();

  // Storage first, while the session that owns the grant is live —
  // storage deletes are API-only, SQL leaves the bytes behind.
  const paths = manifest.candidates.map((c) => c.cvPath);
  if (paths.length > 0) {
    const { error } = await human.client.storage.from("cvs").remove(paths);
    if (error) console.error(`[harness] storage remove: ${error.message}`);
  }
  const ids = manifest.candidates.map((c) => c.candidateId);
  const { error: dErr } = await human.client.from("candidates").delete().in("id", ids);
  if (dErr) console.error(`[harness] candidate delete: ${dErr.message}`);

  console.log(`[harness] removed ${ids.length} candidate(s) and their files from project ${manifest.projectId}.`);
  console.log(`[harness] the project itself, and the agents' trail events, remain — real history of a real run.`);
  console.log(`[harness] delete the throwaway project from the app when you are done with it.`);
}

// ── entry ──────────────────────────────────────────────────────────────

const cmd = process.env.HARNESS_CMD ?? "ingest";

describe("judgment harness (§185)", () => {
  it(`${cmd}`, async () => {
    loadEnvLocal();
    if (cmd === "ingest") await ingest();
    else if (cmd === "score") await score();
    else if (cmd === "teardown") await teardown();
    else throw new Error(`Unknown HARNESS_CMD: ${cmd} (ingest | score | teardown)`);
  });
});
