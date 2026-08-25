import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAILTO_POINTER_BODY,
  MAILTO_URL_CEILING,
  buildMailtoUrl,
  openMailDraft,
} from "./mail-draft";

const location = { href: "" };
const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  location.href = "";
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  vi.stubGlobal("window", { location });
  vi.stubGlobal("navigator", { clipboard: { writeText } });
});

describe("buildMailtoUrl", () => {
  it("encodes subject and body, with and without a recipient", () => {
    expect(buildMailtoUrl({ subject: "A & B", body: "line one\nline two" })).toBe(
      "mailto:?subject=A%20%26%20B&body=line%20one%0Aline%20two"
    );
    expect(
      buildMailtoUrl({ to: "avery@example.test", subject: "Hi", body: "x" })
    ).toBe("mailto:avery@example.test?subject=Hi&body=x");
  });
});

describe("openMailDraft", () => {
  it("opens the full URL when it fits under the ceiling", async () => {
    const outcome = await openMailDraft({ subject: "Short", body: "Short body." });
    expect(outcome).toBe("opened");
    expect(location.href).toBe(
      buildMailtoUrl({ subject: "Short", body: "Short body." })
    );
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies the full body and opens a pointer body when over the ceiling", async () => {
    const body = "x".repeat(MAILTO_URL_CEILING + 100);
    const outcome = await openMailDraft({ subject: "Long", body });
    expect(outcome).toBe("opened_body_on_clipboard");
    expect(writeText).toHaveBeenCalledWith(body);
    expect(location.href).toBe(
      buildMailtoUrl({ subject: "Long", body: MAILTO_POINTER_BODY })
    );
    expect(location.href.length).toBeLessThanOrEqual(MAILTO_URL_CEILING);
  });

  it("refuses to open a clipped draft when the clipboard is unavailable", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const body = "x".repeat(MAILTO_URL_CEILING + 100);
    const outcome = await openMailDraft({ subject: "Long", body });
    expect(outcome).toBe("too_long_clipboard_unavailable");
    expect(location.href).toBe("");
  });
});
