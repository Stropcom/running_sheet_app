// Local, on-device document reading — Step 3 of the Local AI Roadmap. Runs
// server-side in Node (same @xenova/transformers infrastructure as
// server/localNER.ts — see that file's header for the general pattern) so
// it can read a whole imported document, not just live-typed text. No
// document text ever leaves this server — no runtime network call
// (Golden Rule).
//
// Deliberately narrow scope for this first version: rather than trying to
// re-read an entire document and re-derive every field from scratch
// (replacing the mature, well-tested rule-based pipeline in
// targetProfileFieldMap.ts), this only ever looks at two things that
// pipeline already flagged, never the fields it's fully confident about:
//   1. needsReview items — text it recognised as clearly meant to be an
//      address or vehicle, but couldn't parse at all.
//   2. "Successful but shaky" fields — an address/vehicle it DID produce
//      a value for, but marked !confident (see ParsedAddressLine /
//      ParsedVehicleLine) — a second, independent opinion on something
//      the rules weren't fully sure of themselves, shown alongside their
//      answer rather than replacing it.
// Either way, one focused, narrow question per item ("clean this up, or
// say you can't") rather than a whole-document extraction task a 783M-
// parameter model realistically can't do reliably. See routers.ts's
// parseDocument for how both plug in alongside (never replacing) the
// existing mapper.
//
// ⚠️ UNTESTED IN THIS FORM — same caveat as localNER.ts and
// scripts/dev/voice-model-setup.md: this sandbox can't fetch model
// weights from Hugging Face, so this has not been run against the real
// model. See scripts/dev/document-ai-model-setup.md.
//
// ⚠️ Heavier than Step 2's model — LaMini-Flan-T5-783M is roughly 7x the
// parameter count of bert-base-NER. Test carefully on whatever droplet
// tier this runs on; the Local AI Roadmap earmarked a bigger tier
// specifically for this step, not the one sized for Steps 1 & 2.
import {
  env,
  pipeline,
  type Text2TextGenerationPipeline,
} from "@xenova/transformers";

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "server/models/";
env.cacheDir = "server/models/.cache/";

// LaMini-Flan-T5-783M — an instruction-tuned encoder-decoder model, the
// documented example model for transformers.js's text2text-generation
// pipeline (node_modules/@xenova/transformers/types/pipelines.d.ts's own
// worked example uses this exact model, same "confirmed from the
// installed library, not just memory" standard as NER_MODEL_ID in
// localNER.ts). Deliberately smaller than the roadmap's original "1-3
// billion parameter" ballpark — picked for the infrastructure that
// actually exists right now rather than what was originally scoped;
// revisit if accuracy needs a bigger model once there's a droplet sized
// for one.
export const DOCUMENT_AI_MODEL_ID = "Xenova/LaMini-Flan-T5-783M";

// Same Git-LFS-pointer-stub concern as the other two local models — see
// localNER.ts's identical constant for the full reasoning. A real
// quantized 783M-parameter model's weights are tens of megabytes at
// minimum, comfortably above this.
const MIN_PLAUSIBLE_WEIGHT_BYTES = 100_000;

// Encoder-decoder architecture (like Whisper, unlike bert-base-NER's
// single-file shape) — expected to need both halves, per the same
// repo-layout convention as VOICE model files in voiceTranscription.ts.
// ⚠️ Not confirmed against the real Hugging Face repo (this sandbox can't
// reach it) — verify the actual file names when doing the manual fetch
// step (scripts/dev/document-ai-model-setup.md) and correct here if
// they differ.
const WEIGHT_FILE_PATHS = [
  `server/models/${DOCUMENT_AI_MODEL_ID}/onnx/encoder_model_quantized.onnx`,
  `server/models/${DOCUMENT_AI_MODEL_ID}/onnx/decoder_model_merged_quantized.onnx`,
];
const CONFIG_FILE_PATH = `server/models/${DOCUMENT_AI_MODEL_ID}/config.json`;

export type DocumentAIModelStatus = "ready" | "missing" | "incomplete";

/** Mirrors getNerModelStatus() in localNER.ts. */
export async function getDocumentAIModelStatus(): Promise<DocumentAIModelStatus> {
  const fs = await import("node:fs/promises");
  try {
    await fs.access(CONFIG_FILE_PATH);
  } catch {
    return "missing";
  }
  for (const path of WEIGHT_FILE_PATHS) {
    try {
      const stat = await fs.stat(path);
      if (stat.size < MIN_PLAUSIBLE_WEIGHT_BYTES) return "incomplete";
    } catch {
      return "missing";
    }
  }
  return "ready";
}

let generatorPromise: Promise<Text2TextGenerationPipeline> | null = null;

function getDocumentAIPipeline(): Promise<Text2TextGenerationPipeline> {
  if (!generatorPromise) {
    generatorPromise = pipeline("text2text-generation", DOCUMENT_AI_MODEL_ID, {
      quantized: true,
    });
  }
  return generatorPromise;
}

export type NeedsReviewKind = "address" | "vehicle";

// Model replies with one of these (case-insensitive) when it can't make
// sense of the text — treated as "no suggestion", not as a literal string
// to show anyone. Kept as a short list of exact/prefix matches rather
// than trying to parse free-form refusals, since a small instruction
// model's "I don't know" phrasing is inconsistent and this only needs to
// catch the common shapes, not be exhaustive — a garbled non-refusal
// reply just becomes a suggestion the officer can see is wrong at a
// glance, no worse than not asking at all.
const UNKNOWN_MARKERS = ["unknown", "n/a", "none", "not applicable", "unclear"];

/** Pure — no model, no I/O — deliberately, so it's directly testable in
 * server/documentImport/localDocumentAI.test.ts without the real weights
 * this sandbox can't fetch. */
export function buildCleanupPrompt(kind: NeedsReviewKind, raw: string): string {
  if (kind === "address") {
    return `Rewrite the following as a single clean street address (street number, street name, suburb, state). If it is not an address, reply with exactly: unknown\n\nText: ${raw}`;
  }
  return `Rewrite the following as a vehicle description in the form "REGISTRATION colour make model" (e.g. "1ABC123 white Toyota Corolla sedan"). If it is not about a vehicle, reply with exactly: unknown\n\nText: ${raw}`;
}

/** Pure — see buildCleanupPrompt's comment for why. Returns null for
 * an empty reply or one of UNKNOWN_MARKERS — both mean "no suggestion",
 * not "here is an empty suggestion". */
export function parseModelReply(reply: string): string | null {
  const trimmed = reply.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (
    UNKNOWN_MARKERS.some(
      marker => lower === marker || lower.startsWith(`${marker}.`)
    )
  ) {
    return null;
  }
  return trimmed;
}

/**
 * Asks the model to independently rewrite one piece of raw document text
 * into a clean address/vehicle description. Two callers, same question:
 * routers.ts's parseDocument uses this both for needsReview items (see
 * targetProfileFieldMap.ts's UnparsedItem — text the rules recognised but
 * couldn't parse at all) and for the low-confidence "successful but
 * shaky" pass (an address/vehicle the rules DID produce a value for, but
 * flagged !confident — see ParsedAddressLine/ParsedVehicleLine) — same
 * question either way: "independently, what do you make of this text?",
 * compared against what the rules already produced in the second case.
 * Returns null when the model couldn't make sense of it either — the
 * caller still has the original raw text (and, in the low-confidence
 * case, the rules' own attempt) to fall back on; this is purely additive.
 */
export async function suggestCleanValue(
  kind: NeedsReviewKind,
  raw: string
): Promise<string | null> {
  if (!raw.trim()) return null;
  const generator = await getDocumentAIPipeline();
  const prompt = buildCleanupPrompt(kind, raw);
  const output = await generator(prompt, { max_new_tokens: 64 });
  const single = Array.isArray(output) ? output[0] : output;
  const text = (single as { generated_text?: string })?.generated_text ?? "";
  return parseModelReply(text);
}
