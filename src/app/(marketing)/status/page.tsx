import type { Metadata } from "next";
import { SiteNav } from "../_components/site-nav";
import { SiteFooter } from "../_components/site-footer";
import { runStatusChecks } from "@/lib/status/checks";
import type { CheckState } from "@/lib/status/heartbeat";

export const dynamic = "force-dynamic";

const TITLE = "Status";
const DESCRIPTION =
  "Live operational status of Mandate — application, database, authentication, and scheduled maintenance.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/status" },
  robots: { index: false },
};

/**
 * The human-readable status page (§139 D2). Every light is a live
 * check or a persisted heartbeat — R1: no light without a reading —
 * and the page states its own blind spot in words (R3). Severity is a
 * dot plus a word, never colour alone.
 */

const CHECK_ROWS: ReadonlyArray<{
  key: "db" | "auth" | "cron";
  label: string;
  caption: string;
}> = [
  {
    key: "db",
    label: "Application & database",
    caption: "A zero-row round trip through the API to the database.",
  },
  {
    key: "auth",
    label: "Authentication",
    caption: "The sign-in service's own health reading.",
  },
  {
    key: "cron",
    label: "Scheduled maintenance",
    caption: "The daily job's last recorded run, within its window.",
  },
];

const STATE_WORD: Record<CheckState, string> = {
  ok: "Operational",
  degraded: "Degraded",
};

export default async function StatusPage() {
  const report = await runStatusChecks();

  return (
    <>
      <SiteNav />
      <main id="main">
        <section className="m-section m-section--gap-tight-top">
          <div className="m-container">
            <div className="m-status">
              <p className="m-eyebrow">System status</p>
              <h1 className="m-status__headline">
                {report.ok ? (
                  <>
                    All systems <em>operational.</em>
                  </>
                ) : (
                  <>
                    Degraded — <em>we can see it too.</em>
                  </>
                )}
              </h1>
              <p className="m-status__stamp">
                Read live at {report.at.replace("T", " ").replace(/\.\d+Z$/, " UTC")}
              </p>

              <ul className="m-status__list">
                {CHECK_ROWS.map((row) => {
                  const state = report.checks[row.key];
                  return (
                    <li key={row.key} className="m-status__row">
                      <span
                        className={
                          state === "ok"
                            ? "m-status__dot m-status__dot--ok"
                            : "m-status__dot m-status__dot--degraded"
                        }
                        aria-hidden
                      />
                      <div className="m-status__cell">
                        <span className="m-status__label">{row.label}</span>
                        <span className="m-status__caption">{row.caption}</span>
                      </div>
                      <span
                        className={
                          state === "ok"
                            ? "m-status__word m-status__word--ok"
                            : "m-status__word m-status__word--degraded"
                        }
                      >
                        {STATE_WORD[state]}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <p className="m-status__honesty">
                This page shares the product&apos;s own infrastructure. If it
                is unreachable, that is itself the signal — an independent
                monitor watches from outside for exactly that case. Every
                light above is a live check or a recorded heartbeat; nothing
                here is hardcoded.
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
