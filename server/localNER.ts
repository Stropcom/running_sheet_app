// Local, on-device named-entity recognition — Step 2 of the Local AI
// Roadmap. Runs server-side in Node (via @xenova/transformers, the same
// package the browser-side voice feature uses — see
// client/src/lib/voiceTranscription.ts's header comment for the general
// pattern this mirrors) so it can scan historical observation text across
// the whole Intelligence folder, not just one row as it's typed. No audio
// or text ever leaves this server — no runtime network call, satisfying
// CLAUDE.md's Golden Rule the same way the voice feature does.
//
// What this is for: extractEntitiesFromText (db.ts) is regex/rule-based —
// good at finding an entity shaped the way it expects, blind to one that
// isn't. This model instead recognises a person's name by *context* (the
// words around it), so it can catch a name in an unusual sentence the
// rules were never written to expect — the "messy-text entity catcher"
// from the roadmap. It only ever flags a candidate for human review (see
// missedEntityScan.ts) — it never creates or edits an entity itself.
//
// ⚠️ UNTESTED IN THIS FORM — same honest caveat as voice-model-setup.md:
// this sandbox's network policy blocks fetching model weights from
// Hugging Face, so this code has not been run against the real model
// here. It's written to mirror transformers.js's documented
// token-classification pipeline shape as closely as possible, but must be
// exercised against real weights (see scripts/dev/ner-model-setup.md)
// before being trusted in production.
import {
  env,
  pipeline,
  type TokenClassificationPipeline,
} from "@xenova/transformers";

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "server/models/";
env.cacheDir = "server/models/.cache/";

// dslim/bert-base-NER, a widely-used general-purpose English NER model
// (CoNLL-2003 label set: PER/ORG/LOC/MISC), converted to ONNX by Xenova —
// same "Xenova/<original repo name>" convention as VOICE_MODEL_ID in
// voiceTranscription.ts. Verify this exact repo ID still resolves on
// Hugging Face Hub before fetching — see scripts/dev/ner-model-setup.md.
export const NER_MODEL_ID = "Xenova/bert-base-NER";

// Same reasoning as voiceTranscription.ts's MIN_PLAUSIBLE_WEIGHT_BYTES — a
// Git LFS pointer stub is ~130 bytes; real quantized BERT-base weights are
// tens of megabytes. This threshold just needs to sit clearly between the two.
const MIN_PLAUSIBLE_WEIGHT_BYTES = 100_000;

const WEIGHT_FILE_PATH = `server/models/${NER_MODEL_ID}/onnx/model_quantized.onnx`;
const CONFIG_FILE_PATH = `server/models/${NER_MODEL_ID}/config.json`;

export type NerModelStatus = "ready" | "missing" | "incomplete";

/** Mirrors getVoiceModelStatus() in voiceTranscription.ts, checking the
 * local filesystem instead of an HTTP fetch since this runs server-side. */
export async function getNerModelStatus(): Promise<NerModelStatus> {
  const fs = await import("node:fs/promises");
  try {
    await fs.access(CONFIG_FILE_PATH);
  } catch {
    return "missing";
  }
  try {
    const stat = await fs.stat(WEIGHT_FILE_PATH);
    if (stat.size < MIN_PLAUSIBLE_WEIGHT_BYTES) return "incomplete";
  } catch {
    return "missing";
  }
  return "ready";
}

let nerPipelinePromise: Promise<TokenClassificationPipeline> | null = null;

function getNerPipeline(): Promise<TokenClassificationPipeline> {
  if (!nerPipelinePromise) {
    nerPipelinePromise = pipeline("token-classification", NER_MODEL_ID, {
      quantized: true,
    });
  }
  return nerPipelinePromise;
}

export interface NerPersonMention {
  /** The recognised name span, exactly as it appeared in the text. */
  text: string;
  /** Model confidence, 0-1. */
  score: number;
}

// Below this, a "PER" tag is more often a false positive (a capitalised
// non-name word, a mid-sentence fragment) than a real name — picked by
// hand, same as fuzzyMatch.ts's threshold, pending real-world tuning once
// this can actually be run and checked against real running sheets.
const MIN_PERSON_CONFIDENCE = 0.85;

// A single-letter "name" at 90%+ confidence turned out to be a real,
// common failure shape once this actually ran against real running sheets
// (see missedEntityScan.ts's header comment): an initial like "H. Hogan"
// has its "." tagged "O" (not a PER token), which flushes the span after
// just "H" instead of continuing on to "Hogan" — the model isn't wrong
// about "H" being part of a name, this reconstruction just splits it from
// the surname that follows. A minimum length filters out the fragment;
// the surname half still gets caught on its own as a separate mention.
const MIN_MENTION_LENGTH = 2;

export interface RawTokenTag {
  entity?: string;
  word?: string;
  score?: number;
}

/**
 * Rebuilds whole-name spans from the model's raw per-token BIO tags.
 * Pulled out as its own pure function — no model, no I/O — specifically so
 * this reconstruction logic (the part most likely to have a subtle bug,
 * since it's written from documentation rather than a tested model run)
 * can be exercised directly in server/localNER.test.ts without needing the
 * real weights this sandbox can't fetch.
 *
 * No aggregation_strategy option exists in this package version (see
 * node_modules/@xenova/transformers/src/pipelines.js's
 * TokenClassificationPipeline._call — it only accepts ignore_labels) — the
 * pipeline always returns one raw WordPiece-level tag per token, e.g. a
 * two-word name like "Sarah Connor" comes back as two separate B-PER/
 * I-PER entries, and a name split mid-word ("Johnson" -> "John" +
 * "##son") comes back as two entries too. This merges those back by hand.
 */
export function mergePersonTokenTags(
  tokens: RawTokenTag[]
): NerPersonMention[] {
  const mentions: NerPersonMention[] = [];
  let current: { words: string[]; scores: number[] } | null = null;

  const flush = () => {
    if (!current) return;
    const { words, scores } = current;
    current = null;
    let text = "";
    for (const w of words) {
      // "##"-prefixed pieces are WordPiece continuations of the previous
      // word (BERT tokenizer convention) — joined with no space; anything
      // else is a new word, joined with one.
      text += w.startsWith("##") ? w.slice(2) : (text ? " " : "") + w;
    }
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (
      text.length >= MIN_MENTION_LENGTH &&
      avgScore >= MIN_PERSON_CONFIDENCE
    ) {
      mentions.push({ text, score: avgScore });
    }
  };

  for (const t of tokens) {
    const entity = t.entity ?? "";
    const word = t.word ?? "";
    const score = t.score ?? 0;

    if (entity === "I-PER" && current) {
      current.words.push(word);
      current.scores.push(score);
    } else if (entity === "B-PER" || entity === "I-PER") {
      // B-PER starts a new span; a stray I-PER with nothing already open
      // is treated as a start too, rather than silently dropped.
      flush();
      current = { words: [word], scores: [score] };
    } else {
      flush();
    }
  }
  flush();

  return mentions;
}

/**
 * Runs NER over a block of observation text and returns every span the
 * model tagged as a person, above MIN_PERSON_CONFIDENCE. Deliberately thin
 * — deduplication against what extractEntitiesFromText already found, and
 * against the existing registry, is missedEntityScan.ts's job, not this
 * function's.
 */
export async function findPersonMentions(
  text: string
): Promise<NerPersonMention[]> {
  if (!text.trim()) return [];
  const classifier = await getNerPipeline();
  const raw = await classifier(text);
  const tokens = Array.isArray(raw) ? raw : [raw];
  return mergePersonTokenTags(tokens as RawTokenTag[]);
}
