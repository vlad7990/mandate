import { describe, expect, it } from "vitest";
import {
  CRON_MAX_AGE_HOURS,
  heartbeatState,
  overallOk,
} from "./heartbeat";

const NOW = new Date("2026-08-25T12:00:00Z");

describe("heartbeatState", () => {
  it("reads a missing heartbeat as degraded — no light without a reading", () => {
    expect(heartbeatState(null, NOW, CRON_MAX_AGE_HOURS)).toBe("degraded");
  });

  it("reads an unparseable stamp as degraded", () => {
    expect(heartbeatState("not-a-date", NOW, CRON_MAX_AGE_HOURS)).toBe(
      "degraded"
    );
  });

  it("reads a fresh stamp as ok", () => {
    expect(
      heartbeatState("2026-08-25T06:00:00Z", NOW, CRON_MAX_AGE_HOURS)
    ).toBe("ok");
  });

  it("reads a stamp at exactly the ceiling as ok, past it as degraded", () => {
    expect(heartbeatState("2026-08-24T10:00:00Z", NOW, 26)).toBe("ok");
    expect(heartbeatState("2026-08-24T09:59:59Z", NOW, 26)).toBe("degraded");
  });
});

describe("overallOk", () => {
  it("is ok only when every check is ok", () => {
    expect(overallOk({ db: "ok", auth: "ok", cron: "ok" })).toBe(true);
    expect(overallOk({ db: "ok", auth: "degraded", cron: "ok" })).toBe(false);
  });

  it("is ok for zero checks — vacuous truth is fine for an empty roster", () => {
    expect(overallOk({})).toBe(true);
  });
});
