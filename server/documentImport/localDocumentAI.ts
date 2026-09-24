// Local, on-device document reading — Step 3 of the Local AI Roadmap. Runs
// server-side in Node (same @xenova/transformers infrastructure as
// server/localNER.ts — see that file's header for the general pattern) so
// it can read a whole imported document, not just live-typed text. No
// document text ever leaves this server — no runtime network call
// (Golden Rule).
//
// Deliberately narrow scope, unchanged from the first version: rather than
// trying to re-read an entire document and re-derive every field from
// scratch (replacing the mature, well-tested rule-based pipeline in
// targetProfileFieldMap.ts), this only ever looks at two things that
// pipeline already flagged, never the fields it's fully confident about:
//   1. needsReview items — text it recognised as clearly meant to be an
//      address or vehicle, but couldn't parse at all. Extractive task —
//      buildExtractPrompt/suggestExtractedValue — there is no existing
//      reading to work from.
//   2. "Successful but shaky" fields — an address/vehicle it DID produce
//      a value for, but marked !confident (see ParsedAddressLine /
//      ParsedVehicleLine) — a second, independent opinion on something
//      the rules weren't fully sure of themselves. Verify-and-correct
//      task — buildVerifyPrompt/suggestVerifiedCorrection — the model is
//      told what the rules already read and asked to confirm or correct
//      it, not start from nothing.
// Either way, one focused, narrow question per item rather than a
// whole-document extraction task. Every reply this module returns is then
// re-validated against the app's own deterministic parsers before it's
// ever shown to an officer — see documentAIVerify.ts, not this file — so
// nothing here is trusted on the model's word alone. See routers.ts's
// parseDocument for how both plug in alongside (never replacing) the
// existing mapper.
//
// ⚠️ UNTESTED IN THIS FORM — same caveat as localNER.ts and
// scripts/dev/voice-model-setup.md: this sandbox can't fetch model
// weights from the model host, so this has not been run against the real
// model. See scripts/dev/document-ai-model-setup.md.
//
// ⚠️ Heavier than Step 2's model, and than this step's original model —
// Qwen2.5-1.5B-Instruct is roughly 2x LaMini-Flan-T5-783M's parameter
// count and ~19x bert-base-NER's. Test carefully on whatever droplet
// tier this runs on; see document-ai-model-setup.md's RAM guidance.
import {
  env,
  pipeline,
  type TextGenerationPipeline,
} from "@xenova/transformers";

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "server/models/";
env.cacheDir = "server/models/.cache/";

// onnx-community/Qwen2.5-1.5B-Instruct — a decoder-only instruction-tuned
// chat model, replacing the original LaMini-Flan-T5-783M (encoder-decoder)
// for meaningfully better instruction-following at a RAM cost the droplet
// has headroom for (see document-ai-model-setup.md's sizing note). Picked
// over the 0.5B sibling for accuracy, and over larger sizes for staying
// inside the droplet's measured ~3Gi free budget at steady state.
export const DOCUMENT_AI_MODEL_ID = "onnx-community/Qwen2.5-1.5B-Instruct";

// Same Git-LFS-pointer-stub concern as the other two local models — see
// localNER.ts's identical constant for the full reasoning. A real
// quantized model's weights are tens of megabytes at minimum, comfortably
// above this.
const MIN_PLAUSIBLE_WEIGHT_BYTES = 100_000;

// Decoder-only architecture (unlike LaMini-Flan-T5-783M's encoder/decoder
// split this replaces) — a single merged weight file, per the confirmed
// onnx/model_quantized.onnx layout of the sibling
// onnx-community/Qwen2.5-0.5B-Instruct repo (a real search result, not a
// guess — a GitHub issue against that same sibling repo reporting a 404
// for the wrong filename "decoder_model_merged_quantized.onnx" confirms
// that pattern does NOT apply to these Qwen2.5 ONNX conversions). ⚠️ Not
// confirmed against the 1.5B repo itself (this sandbox's network policy
// blocks reaching the model host directly) — verify the actual file name
// when doing the manual fetch step
// (scripts/dev/document-ai-model-setup.md) and correct here if it
// differs.
const WEIGHT_FILE_PATHS = [
  `server/models/${DOCUMENT_AI_MODEL_ID}/onnx/model_quantized.onnx`,
];

// A chat-template model needs its tokenizer config (carries the Jinja
// template apply_chat_template reads, see runChatPrompt below), not just
// config.json — LaMini-Flan-T5-783M's plain instruction-string prompting
// never needed this file to be checked explicitly.
const REQUIRED_JSON_FILES = [
  `server/models/${DOCUMENT_AI_MODEL_ID}/config.json`,
  `server/models/${DOCUMENT_AI_MODEL_ID}/tokenizer.json`,
  `server/models/${DOCUMENT_AI_MODEL_ID}/tokenizer_config.json`,
];

export type DocumentAIModelStatus = "ready" | "missing" | "incomplete";

/** Mirrors getNerModelStatus() in localNER.ts. */
export async function getDocumentAIModelStatus(): Promise<DocumentAIModelStatus> {
  const fs = await import("node:fs/promises");
  for (const path of REQUIRED_JSON_FILES) {
    try {
      await fs.access(path);
    } catch {
      return "missing";
    }
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

let generatorPromise: Promise<TextGenerationPipeline> | null = null;

function getDocumentAIPipeline(): Promise<TextGenerationPipeline> {
  if (!generatorPromise) {
    generatorPromise = pipeline("text-generation", DOCUMENT_AI_MODEL_ID, {
      quantized: true,
    });
  }
  return generatorPromise;
}

export type NeedsReviewKind = "address" | "vehicle";

export type ChatMessage = { role: "system" | "user"; content: string };

// Model replies with one of these (case-insensitive) when it can't make
// sense of the text — treated as "no suggestion", not as a literal string
// to show anyone. Kept as a short list of exact/prefix matches rather
// than trying to parse free-form refusals, since a small instruction
// model's "I don't know" phrasing is inconsistent and this only needs to
// catch the common shapes, not be exhaustive — a garbled non-refusal
// reply just gets discarded anyway by documentAIVerify.ts's deterministic
// re-parse, so nothing unverifiable reaches an officer regardless.
const UNKNOWN_MARKERS = ["unknown", "n/a", "none", "not applicable", "unclear"];

const SYSTEM_PROMPT: Record<NeedsReviewKind, string> = {
  address:
    "You read short fragments of text from police surveillance documents and identify addresses. Reply with ONLY the clean address (street number, street name, suburb, state) and nothing else — no explanation, no restating the question. Never invent, guess, or infer any detail (street number, street name, suburb, state) that is not present in the text you were given. If the text is not an address, or you cannot build a confident address only from what is given, reply with exactly: unknown",
  vehicle:
    'You read short fragments of text from police surveillance documents and identify vehicles. Reply with ONLY the clean vehicle description in the form "REGISTRATION colour make model" (e.g. "1ABC123 white Toyota Corolla sedan") and nothing else — no explanation. Never invent, guess, or infer any detail (registration, colour, make, model) that is not present in the text you were given. If the text is not about a vehicle, or you cannot build a confident description only from what is given, reply with exactly: unknown',
};

function contextSuffix(label: string): string {
  return label ? ` It was found under the heading "${label}".` : "";
}

/** Pure — no model, no I/O — deliberately, so it's directly testable in
 * server/documentImport/localDocumentAI.test.ts without the real weights
 * this sandbox can't fetch. Extractive task: used for needsReview items
 * (targetProfileFieldMap.ts's UnparsedItem) where the rules found nothing
 * at all, so there is no existing reading to give the model. */
export function buildExtractPrompt(
  kind: NeedsReviewKind,
  label: string,
  raw: string
): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT[kind] },
    { role: "user", content: `Text: ${raw}${contextSuffix(label)}` },
  ];
}

/** Pure — see buildExtractPrompt's comment for why. Verify-and-correct
 * task: used for the low-confidence "successful but shaky" pass, where
 * the rules DID produce a reading (`currentReading`) but flagged it
 * !confident — the model is asked to confirm or correct that specific
 * reading rather than extract from nothing, which is both a narrower,
 * easier task and lets the caller tell "AI independently agrees" from
 * "AI suggests something different" (see documentAIVerify.ts). */
export function buildVerifyPrompt(
  kind: NeedsReviewKind,
  label: string,
  raw: string,
  currentReading: string
): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT[kind] },
    {
      role: "user",
      content: `Text: ${raw}${contextSuffix(label)}\n\nAnother reader already read this text as: "${currentReading}". If that reading is correct, reply with it unchanged. If it is wrong, reply with the corrected version instead — still using only what is in the text above, nothing added.`,
    },
  ];
}

/** Pure — see buildExtractPrompt's comment for why. Returns null for
 * an empty reply or one of UNKNOWN_MARKERS — both mean "no suggestion",
 * not "here is an empty suggestion". Does NOT verify the reply parses —
 * that's documentAIVerify.ts's job, kept separate so this module stays a
 * pure "ask the model" facade with no dependency on the parser layer. */
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
 * Runs one chat-formatted prompt through the model and returns its raw
 * reply text. @xenova/transformers' TextGenerationPipeline accepts a
 * Chat (Message[]) directly — internally calling the tokenizer's own
 * apply_chat_template and, for chat input, always returning only the
 * newly generated assistant turn (return_full_text is forced false for
 * chat input — see node_modules/@xenova/transformers/src/pipelines.js's
 * TextGenerationPipeline._call), appended as the last entry of the
 * returned message array — so no manual prompt-template formatting or
 * prompt-stripping is needed here.
 *
 * do_sample: false forces greedy decoding — this is a verification aid
 * for a legal/evidentiary system, not a creative-writing task; the same
 * input should always produce the same output.
 */
async function runChatPrompt(messages: ChatMessage[]): Promise<string> {
  const generator = await getDocumentAIPipeline();
  const output = await generator(messages, {
    max_new_tokens: 80,
    do_sample: false,
  });
  const single = Array.isArray(output) ? output[0] : output;
  const generated = (
    single as { generated_text?: string | Array<{ content?: string }> }
  )?.generated_text;
  if (typeof generated === "string") return generated;
  if (Array.isArray(generated)) {
    return generated[generated.length - 1]?.content ?? "";
  }
  return "";
}

/**
 * Asks the model to extract an address/vehicle from raw document text it
 * had no existing reading for (targetProfileFieldMap.ts's needsReview).
 * Returns null when the model couldn't make sense of it — the caller
 * still has the original raw text to fall back on; this is purely
 * additive. The returned string is NOT yet verified — pass it through
 * documentAIVerify.ts's verifyAISuggestion before showing it to anyone.
 */
export async function suggestExtractedValue(
  kind: NeedsReviewKind,
  label: string,
  raw: string
): Promise<string | null> {
  if (!raw.trim()) return null;
  const reply = await runChatPrompt(buildExtractPrompt(kind, label, raw));
  return parseModelReply(reply);
}

/**
 * Asks the model to confirm or correct a reading the rules already
 * produced but flagged !confident. Returns null when the model couldn't
 * make sense of it either. Same "not yet verified" caveat as
 * suggestExtractedValue.
 */
export async function suggestVerifiedCorrection(
  kind: NeedsReviewKind,
  label: string,
  raw: string,
  currentReading: string
): Promise<string | null> {
  if (!raw.trim()) return null;
  const reply = await runChatPrompt(
    buildVerifyPrompt(kind, label, raw, currentReading)
  );
  return parseModelReply(reply);
}
