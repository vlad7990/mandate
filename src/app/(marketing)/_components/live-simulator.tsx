"use client";

import { useEffect, useRef, useState } from "react";

const TYPING_EXAMPLES = [
  "Head of IT Operations for RBC Capital Markets",
  "Chief Risk Officer for a UK challenger bank",
  "VP of Engineering at a Series-C fintech",
  "CTO for a US healthcare-payer modernisation",
];

/**
 * Cycles a typewriter placeholder through a list of example role
 * briefs while the input is empty AND unfocused. Pauses the animation
 * when the user focuses the input or starts typing — feels closer to
 * a real terminal cursor than a spinning gimmick.
 */
function useTypingPlaceholder(
  examples: string[],
  active: boolean
): string {
  const [text, setText] = useState("");
  const stateRef = useRef({
    exampleIdx: 0,
    charIdx: 0,
    direction: 1 as 1 | -1,
  });

  useEffect(() => {
    if (!active) {
      // Reset deferred to a microtask so the setState lands outside
      // the synchronous effect body — keeps react-hooks/set-state-in-
      // effect quiet without needing a remount-by-key dance.
      stateRef.current = { exampleIdx: 0, charIdx: 0, direction: 1 };
      const reset = window.setTimeout(() => setText(""), 0);
      return () => window.clearTimeout(reset);
    }

    let timer: number | undefined;

    const tick = () => {
      const s = stateRef.current;
      const target = examples[s.exampleIdx] ?? "";
      const nextChar = s.charIdx + s.direction;

      if (s.direction === 1 && nextChar > target.length) {
        // Finished typing this example — pause, then reverse.
        timer = window.setTimeout(() => {
          stateRef.current.direction = -1;
          tick();
        }, 1600);
        return;
      }

      if (s.direction === -1 && nextChar < 0) {
        // Finished erasing — advance to next example.
        stateRef.current.exampleIdx = (s.exampleIdx + 1) % examples.length;
        stateRef.current.charIdx = 0;
        stateRef.current.direction = 1;
        timer = window.setTimeout(tick, 320);
        return;
      }

      stateRef.current.charIdx = nextChar;
      setText(target.slice(0, nextChar));
      // Type slightly slower than erase — looks more human.
      const delay = s.direction === 1 ? 56 : 28;
      timer = window.setTimeout(tick, delay);
    };

    timer = window.setTimeout(tick, 600);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [examples, active]);

  return text;
}

type DemoResult = {
  role_title: string;
  company_name: string;
  seniority: string;
  function: string;
  inferred_scope: string;
  missing_information: string[];
  calibration_weights: {
    technical: number;
    domain: number;
    leadership: number;
    regulatory: number;
    transformation: number;
  };
  boolean_queries: string[];
};

const DIMENSIONS: Array<{
  key: keyof DemoResult["calibration_weights"];
  label: string;
}> = [
  { key: "technical", label: "TECHNICAL" },
  { key: "domain", label: "DOMAIN" },
  { key: "leadership", label: "LEADERSHIP" },
  { key: "regulatory", label: "REGULATORY" },
  { key: "transformation", label: "TRANSFORMATION" },
];

export function LiveSimulator() {
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  // Bumped on each submit so the inner ProgressTracker remounts and
  // its step counter resets cleanly — avoids synchronously setting
  // state from a useEffect when `pending` flips.
  const [runId, setRunId] = useState(0);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  // Typewriter only runs when the input is empty, unfocused, and we're
  // not mid-request — anything else and the cursor would compete with
  // the user's own typing or the live progress UI.
  const showTyping = !focused && input.length === 0 && !pending && !result;
  const typedPlaceholder = useTypingPlaceholder(TYPING_EXAMPLES, showTyping);

  const submit = async (raw: string) => {
    const text = raw.trim();
    if (!text || pending) return;
    setRunId((r) => r + 1);
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role_input: text }),
      });
      if (!response.ok) {
        // NEVER surface the upstream body. It previously rendered
        // `body.error` verbatim, which put the raw provider payload in
        // front of visitors — vendor name, request id, and at one point
        // "Your credit balance is too low to access the Anthropic API".
        // A prospect evaluating the product should never learn our
        // billing status. Map to three cases the visitor can act on;
        // the detail stays server-side.
        // Status code only. This previously logged `body.error` — the
        // full upstream payload — to the browser console, so the DOM was
        // clean but anyone with devtools open could read our billing
        // state and a provider request_id. The server already has the
        // detail; the client does not need it.
        await response.json().catch(() => null);
        console.error(`[simulator] request failed (${response.status})`);
        throw new Error(
          response.status === 429
            ? "You have run this a few times already — try again in an hour."
            : response.status === 400
              ? "That brief could not be read. Try naming a role and a company."
              // Previously claimed the example below was "real output from
              // an earlier run". It is not — it is written copy. Asserting
              // a false provenance on the page that sells auditability is
              // the one error this brand cannot afford. Say what is true.
              : "The live simulator is offline right now. Below is a worked example of the same output — we'll run your actual mandate with you instead."
        );
      }
      const data = (await response.json()) as DemoResult;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="m-sim">
      <div className="m-sim__bar">
        <span
          className={`m-sim__bar-dot ${
            pending ? "m-sim__bar-dot--live" : ""
          }`}
        />
        <span>SIMULATOR</span>
        <span style={{ marginLeft: "auto", color: "var(--fg-muted)" }}>
          /api/demo
        </span>
      </div>

      <form
        className="m-sim__input-row"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(input);
        }}
      >
        <input
          className={`m-sim__input ${
            showTyping ? "m-sim__input--typing" : ""
          }`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="e.g. Head of IT Operations for RBC Capital Markets"
          aria-label="Role to analyse"
          disabled={pending}
        />
        {showTyping && (
          <span className="m-sim__placeholder" aria-hidden>
            {typedPlaceholder}
          </span>
        )}
        <button
          type="submit"
          className="m-sim__submit"
          disabled={pending || !input.trim()}
        >
          {pending ? "Thinking…" : "Analyze →"}
        </button>
      </form>

      <div className="m-sim__body">
        {/* The error is a strip ABOVE the worked example, not a
            replacement for it. Previously any failure unmounted
            SimulatorIdle, so a visitor lost both the example and the
            chips and had no route back — the failure took the proof
            with it. */}
        {error && (
          <div role="alert" className="m-sim__error">
            <span className="m-sim__error-msg">{error}</span>
            <button
              type="button"
              className="m-sim__retry"
              onClick={() => {
                setError(null);
                if (input.trim()) submit(input);
              }}
            >
              Try again
            </button>
            {/* A failure needs an exit, not just a repeat. Retrying an
                outage returns the identical error; this is the route
                that still gets the visitor a real run. */}
            <a
              className="m-sim__retry"
              href={`mailto:hello@getmandate.io?subject=${encodeURIComponent(
                "Live run request"
              )}&body=${encodeURIComponent(
                `I'd like to see Mandate run this mandate:\n\n${input.trim()}\n`
              )}`}
            >
              Book a live run →
            </a>
          </div>
        )}

        {/*
          A persistent, empty-on-mount live region. The simulator's whole
          loading/success path was previously silent to assistive tech —
          there was no aria-live or role=status anywhere on the page, so
          a screen-reader user pressed Analyze and received no indication
          that anything was happening or had finished. The region exists
          before the text does, which is what makes the announcement
          fire reliably.
        */}
        <p className="m-sr-only" role="status" aria-live="polite">
          {pending
            ? "Analysing the mandate. This takes about thirty seconds."
            : result
              ? "Analysis complete. Structured mandate, company context and draft scoring model are shown below."
              : ""}
        </p>

        {!result && !pending && <SimulatorIdle onPick={setInput} />}

        {pending && <SimulatorProgress key={runId} />}

        {result && !pending && <SimulatorResult result={result} />}
      </div>
    </div>
  );
}

/**
 * Idle state — a worked example rendered in exactly the same three
 * columns the live result uses.
 *
 * The previous idle state was a prompt and a paragraph, so the payoff
 * stayed invisible until someone typed and waited ~20s. Most visitors
 * never got there. Showing the shape of the answer up front is what
 * actually argues the product: structured mandate, grounded context,
 * and a weighted model you approve before anyone is scored.
 *
 * Labelled EXAMPLE throughout so it is never mistaken for a live run.
 */
function SimulatorIdle({ onPick }: { onPick: (value: string) => void }) {
  return (
    <div className="m-simout">
      <div className="m-simout__grid">
        <div className="m-simout__col">
          <div className="m-simout__head">
            <span className="m-simout__tick" aria-hidden>✓</span>
            Structured mandate
          </div>
          <dl className="m-simout__fields">
            <div><dt>Seniority</dt><dd>Director, reports to CIO</dd></div>
            <div><dt>Function</dt><dd>IT operations, service management</dd></div>
            <div><dt>Sector</dt><dd>Private healthcare, regulated</dd></div>
            <div><dt>Scale signal</dt><dd>2,000–8,000 staff, multi-site</dd></div>
          </dl>
        </div>

        <div className="m-simout__col">
          <div className="m-simout__head">
            <span className="m-simout__tick" aria-hidden>✓</span>
            Context, web-grounded
          </div>
          <p className="m-simout__prose">
            Sector is consolidating; uptime and clinical-system availability
            dominate the operating agenda. Service-desk maturity and
            out-of-hours cover are the usual failure points at this scale.
          </p>
          <div className="m-simout__note">14 sources consulted</div>
        </div>

        <div className="m-simout__col">
          <div className="m-simout__head">
            <span className="m-simout__dot" aria-hidden />
            Draft scoring model
          </div>
          <div className="m-simout__bars">
            {[
              { label: "Multi-site service operations", pct: 26 },
              { label: "Clinical-system availability", pct: 22 },
              { label: "Vendor & contract control", pct: 18 },
            ].map((d) => (
              <div key={d.label} className="m-simout__bar">
                <div className="m-simout__barhead">
                  <span>{d.label}</span>
                  <span className="m-simout__pct">{d.pct}%</span>
                </div>
                <div className="m-simout__track">
                  <span style={{ width: `${d.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="m-simout__foot">
            A draft. In the product you edit and approve it before anyone is
            scored against it.
          </p>
        </div>
      </div>

      <div className="m-simout__cta">
        <span className="m-simout__badge">Example</span>
        <span>Type a real mandate above to run it live.</span>
      </div>

      <ul
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          marginTop: "0.5rem",
          listStyle: "none",
          padding: 0,
        }}
      >
        {TYPING_EXAMPLES.slice(1).map((ex) => (
          <li key={ex}>
            <button
              type="button"
              className="m-chip"
              style={{ cursor: "pointer", background: "var(--bg-elev-2)" }}
              /* Was setting .value on the DOM node and dispatching a
                 plain Event. React owns this input, ignored the
                 synthetic event, and re-rendered from empty state — so
                 clicking a chip wiped the field and left submit
                 disabled. Lift to state instead. */
              onClick={() => {
                onPick(ex);
                document.querySelector<HTMLInputElement>(".m-sim__input")?.focus();
              }}
            >
              <span className="m-chip__dot" />
              {ex}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}


/**
 * In-flight state.
 *
 * This used to render four named steps — "Reading brief", "Researching
 * company", "Calibrating model", "Generating queries" — advanced by a
 * fixed 2200ms interval with no connection to the request. It reported
 * work that was not observed, on a page whose argument is that its
 * output is auditable. A visitor with devtools open could watch the
 * steps tick while the network panel showed a single pending call, or
 * one that had already failed.
 *
 * An elapsed counter is the honest version: it is a real measurement of
 * a real thing. Restore the named steps only if the route streams
 * genuine server events for them.
 *
 * `aria-hidden` because the parent already owns a `role="status"`
 * region announcing the analysing state — a ticking clock in a live
 * region would announce every second.
 */
function SimulatorProgress() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="m-sim__progress" aria-hidden>
      <span className="m-sim__progress-dot" />
      <span className="m-sim__progress-label">Analysing</span>
      <span className="m-sim__progress-time">
        {mm}:{ss}
      </span>
      <span className="m-sim__progress-track">
        <span />
      </span>
    </div>
  );
}

function SimulatorResult({ result }: { result: DemoResult }) {
  return (
    <div style={{ display: "grid", gap: "1.5rem", position: "relative" }}>
      {/* Single-pass scan line — sweeps down once when results land */}
      <span className="m-sim__scanline" aria-hidden />

      {/* Top row — role decomposition */}
      <div
        className="m-sim__row"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "0.75rem",
          animationDelay: "0ms",
        }}
      >
        <ResultField label="Role" value={result.role_title} accent />
        <ResultField label="Company" value={result.company_name} />
        <ResultField label="Seniority" value={result.seniority} />
        <ResultField label="Function" value={result.function} />
      </div>

      {/* Inferred scope */}
      <div className="m-sim__row" style={{ animationDelay: "120ms" }}>
        <SectionTitle>Inferred scope</SectionTitle>
        <p
          style={{
            color: "var(--fg-soft)",
            lineHeight: 1.6,
            fontSize: "0.9375rem",
          }}
        >
          {result.inferred_scope}
        </p>
      </div>

      {/* Calibration weights */}
      <div className="m-sim__row" style={{ animationDelay: "240ms" }}>
        <SectionTitle>Calibration weights</SectionTitle>
        <div style={{ display: "grid", gap: "0.625rem" }}>
          {DIMENSIONS.map((d, i) => {
            const v = Math.max(
              0,
              Math.min(10, result.calibration_weights[d.key] ?? 0)
            );
            return (
              <div
                key={d.key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr 32px",
                  alignItems: "center",
                  gap: "0.875rem",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.6875rem",
                    letterSpacing: "0.16em",
                    color: "var(--fg-muted)",
                  }}
                >
                  {d.label}
                </span>
                <div className="m-sim__bar-fill" aria-hidden>
                  <span
                    style={{
                      // Stagger the bar fills across each dimension for
                      // a satisfying readout cascade.
                      transitionDelay: `${360 + i * 90}ms`,
                      width: `${(v / 10) * 100}%`,
                    }}
                  />
                </div>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.875rem",
                    color: "var(--fg)",
                    textAlign: "right",
                  }}
                >
                  {v}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Missing information */}
      {result.missing_information.length > 0 && (
        <div className="m-sim__row" style={{ animationDelay: "360ms" }}>
          <SectionTitle>Information required</SectionTitle>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              display: "grid",
              gap: "0.375rem",
            }}
          >
            {result.missing_information.slice(0, 6).map((it, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  gap: "0.625rem",
                  alignItems: "flex-start",
                  color: "var(--fg-soft)",
                  fontSize: "0.9375rem",
                }}
              >
                <span
                  style={{
                    color: "var(--warn)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  ?
                </span>
                {it}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Boolean queries — typewriter reveal per-block via CSS */}
      {result.boolean_queries.length > 0 && (
        <div className="m-sim__row" style={{ animationDelay: "480ms" }}>
          <SectionTitle>Boolean queries</SectionTitle>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {result.boolean_queries.slice(0, 3).map((q, i) => (
              <div
                key={i}
                className={`m-sim__bool m-sim__bool--q${i + 1}`}
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--line)",
                  padding: "0.75rem 0.875rem",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.8125rem",
                  color: "var(--fg)",
                  letterSpacing: "0.01em",
                  lineHeight: 1.55,
                  overflowWrap: "anywhere",
                  borderLeft: "2px solid var(--accent)",
                }}
              >
                <span
                  style={{
                    color: "var(--fg-faint)",
                    marginRight: "0.625rem",
                  }}
                >
                  Q{i + 1}
                </span>
                {q}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "0.6875rem",
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--accent)",
        marginBottom: "0.625rem",
      }}
    >
      {children}
    </h4>
  );
}

function ResultField({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: accent ? "var(--accent-soft)" : "var(--bg)",
        border: `1px solid ${accent ? "rgba(59,130,246,0.4)" : "var(--line)"}`,
        padding: "0.75rem 0.875rem",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.625rem",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--fg-muted)",
          marginBottom: "0.25rem",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: accent ? "var(--font-display)" : "var(--font-body)",
          fontSize: accent ? "1.125rem" : "0.9375rem",
          fontWeight: accent ? 420 : 500,
          color: accent ? "var(--accent)" : "var(--fg)",
          letterSpacing: accent ? "-0.01em" : "0",
          lineHeight: 1.25,
        }}
      >
        {value}
      </div>
    </div>
  );
}
