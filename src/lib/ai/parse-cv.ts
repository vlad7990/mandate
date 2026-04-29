import "server-only";
import mammoth from "mammoth";
import { getAnthropic } from "@/lib/anthropic";
import {
  CANDIDATE_PROFILE_SCHEMA,
  CV_PARSING_SYSTEM_PROMPT,
  type CandidateProfile,
} from "./cv-parsing";
import type { CalibrationModel, CompanyContext } from "./role-analysis";

const PARSE_MODEL = "claude-sonnet-4-6";

export const PDF_MIME = "application/pdf";
export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type ParseContext = {
  /** Calibration model + company context the candidate is being evaluated against. */
  calibration: Partial<CalibrationModel>;
  company: Partial<CompanyContext>;
};

/**
 * Run the combined parsing + review agent on a CV file.
 *
 * PDFs go through Anthropic's native `document` content type — base64 of
 * the raw bytes. DOCX is text-extracted via mammoth and sent as plain
 * text (Anthropic doesn't accept DOCX directly).
 */
export async function parseCv(
  fileBytes: Uint8Array,
  mimeType: string,
  ctx: ParseContext
): Promise<CandidateProfile> {
  if (mimeType !== PDF_MIME && mimeType !== DOCX_MIME) {
    throw new Error(`Unsupported MIME type for CV parse: ${mimeType}`);
  }

  const anthropic = getAnthropic();
  const userMessage = await buildUserMessage(fileBytes, mimeType, ctx);

  const response = await anthropic.messages.create({
    model: PARSE_MODEL,
    max_tokens: 4096,
    system: CV_PARSING_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    output_config: {
      format: {
        type: "json_schema",
        schema: CANDIDATE_PROFILE_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("CV parse response contained no text block");
  }

  return JSON.parse(textBlock.text) as CandidateProfile;
}

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | {
      type: "document";
      source: { type: "base64"; media_type: "application/pdf"; data: string };
    };

async function buildUserMessage(
  fileBytes: Uint8Array,
  mimeType: string,
  ctx: ParseContext
): Promise<AnthropicContentBlock[]> {
  const contextHeader = `Role context:
${JSON.stringify(
  {
    calibration: ctx.calibration,
    company: ctx.company,
    dimension_weights: ctx.calibration.dimension_weights ?? null,
  },
  null,
  2
)}`;

  if (mimeType === PDF_MIME) {
    return [
      { type: "text", text: contextHeader },
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: bytesToBase64(fileBytes),
        },
      },
      {
        type: "text",
        text: "Parse the attached PDF CV against the role context above and return the structured profile.",
      },
    ];
  }

  // DOCX: extract text server-side, then send as a plain text block.
  const extracted = await extractDocxText(fileBytes);
  return [
    { type: "text", text: contextHeader },
    {
      type: "text",
      text: `--- BEGIN CV TEXT (extracted from DOCX) ---\n${extracted}\n--- END CV TEXT ---`,
    },
    {
      type: "text",
      text: "Parse the CV text above against the role context and return the structured profile.",
    },
  ];
}

async function extractDocxText(fileBytes: Uint8Array): Promise<string> {
  // mammoth's Node API accepts a Buffer.
  const buffer = Buffer.from(fileBytes);
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value?.trim();
  if (!text) {
    throw new Error("DOCX extraction returned empty text. Is the file a valid Word document?");
  }
  return text;
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
