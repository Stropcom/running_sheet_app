// Local, on-device speech-to-text for the Observation field's voice-input
// button (RS Quick Entry). Runs entirely in the browser via a WASM build
// of Whisper (@xenova/transformers, on top of onnxruntime-web) — no audio
// or transcript ever leaves the device, no network call at runtime. This
// is the Golden Rule's own "deterministic/on-device" pattern applied to a
// genuinely NLP-shaped problem (see CLAUDE.md's "Planned — local voice
// observation" note), not an exception to it.
//
// Named transcribeVoiceClip, not transcribeAudio — deliberately, to avoid
// any string collision with server/_core/voiceTranscription.ts's dead
// Manus scaffolding function of that name, which the no-runtime-ai guard
// blocks by literal string match wherever it appears outside _core. This
// function has nothing to do with that one; different name avoids the
// false-positive entirely rather than fighting the guard.
//
// Two things must be self-hosted static assets for the "no network call"
// guarantee to actually hold, since both default to fetching from a
// remote host otherwise:
//   1. The model weights (Whisper tiny.en, ONNX format) — must live at
//      /models/Xenova/whisper-tiny.en/ in the built client. See
//      client/public/models/README.md for exactly what's needed there —
//      this repo does NOT vendor the (tens-of-MB) weight files themselves,
//      the same way it doesn't vendor node_modules; they're an
//      agency-controlled deployment step, not something to commit.
//   2. onnxruntime-web's own WASM engine binaries — these ARE available
//      locally (onnxruntime-web is a real npm dependency, pulled in
//      transitively by @xenova/transformers), so scripts/dev/
//      copy-onnx-wasm.ts copies them into client/public/onnx-wasm/
//      automatically before `pnpm dev`/`pnpm build` — nothing to fetch or
//      configure by hand for this half.
import {
  env,
  AutoModelForSpeechSeq2Seq,
  AutoTokenizer,
  AutoProcessor,
  AutomaticSpeechRecognitionPipeline,
} from "@xenova/transformers";

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "/models/";
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = "/onnx-wasm/";
  // Multi-threaded WASM needs Cross-Origin-Opener/Embedder-Policy headers
  // for SharedArrayBuffer, which this app doesn't set — that's a real risk
  // to the Google Maps JS API embed elsewhere in the app if applied
  // site-wide (see CLAUDE.md). Single-threaded is slower but always works
  // with zero header changes; revisit only if scoped narrowly and tested
  // against Maps first.
  env.backends.onnx.wasm.numThreads = 1;
}

export const VOICE_MODEL_ID = "Xenova/whisper-tiny.en";

// A Git LFS pointer stub (the file Hugging Face's raw git host serves in
// place of a large binary when git-lfs isn't installed on the machine that
// cloned it — see scripts/dev/voice-model-setup.md) is ~130 bytes. Real
// quantized Whisper-tiny.en weights are multi-megabyte. 100KB is comfortably
// between the two, so a file under this size means the deploy step fetched
// pointer stubs, not the actual model binaries — this bit a real deployment.
const MIN_PLAUSIBLE_WEIGHT_BYTES = 100_000;

const WEIGHT_FILE_PATHS = [
  `/models/${VOICE_MODEL_ID}/onnx/encoder_model_quantized.onnx`,
  `/models/${VOICE_MODEL_ID}/onnx/decoder_model_merged_quantized.onnx`,
];

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null =
  null;

// transformers.js caches every fetched model file in the browser's Cache
// Storage API under a fixed cache name ('transformers-cache', see
// node_modules/@xenova/transformers/src/utils/hub.js#getModelFile) keyed on
// the request path — and it checks that cache *before ever issuing a
// fetch*, with no revalidation or expiry. If a broken file (e.g. a Git LFS
// pointer stub) was ever fetched once, it stays cached forever and keeps
// getting served even after the server starts returning the real file, with
// no way for the app to detect it short of evicting the stale entry itself.
// This bit a real deployment: the server-side fix landed, but the phone
// that had already failed once kept reusing its own stale cached stub.
// Runs before every model load (cheap no-op once the cache is clean) so
// this self-heals with zero user action required, rather than needing
// someone to manually clear site data on a phone in the field.
async function evictStaleModelWeightCacheEntries(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open("transformers-cache");
    for (const key of WEIGHT_FILE_PATHS) {
      const cached = await cache.match(key);
      if (!cached) continue;
      const size = (await cached.clone().arrayBuffer()).byteLength;
      if (size < MIN_PLAUSIBLE_WEIGHT_BYTES) {
        await cache.delete(key);
      }
    }
  } catch {
    // Cache API unavailable/blocked (e.g. private browsing) — nothing to
    // evict; getModelFile() will just fetch fresh every time in that case.
  }
}

// Deliberately NOT using the library's own pipeline() convenience factory.
// For "automatic-speech-recognition" it tries two model classes in order —
// AutoModelForSpeechSeq2Seq (which supports whisper), then AutoModelForCTC
// (which doesn't) — and on any failure of the first, silently retries with
// the second and surfaces *that* class's generic "Unsupported model type"
// error instead of the real, first failure. That masked a genuine
// first-deployment error behind a misleading message. Loading the model/
// tokenizer/processor directly via the one correct Auto-class and
// constructing the pipeline by hand gets the real underlying error instead.
function getTranscriber(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      await evictStaleModelWeightCacheEntries();
      const pretrainedOptions = { quantized: true };
      const [tokenizer, model, processor] = await Promise.all([
        AutoTokenizer.from_pretrained(VOICE_MODEL_ID, pretrainedOptions),
        AutoModelForSpeechSeq2Seq.from_pretrained(
          VOICE_MODEL_ID,
          pretrainedOptions
        ),
        AutoProcessor.from_pretrained(VOICE_MODEL_ID, pretrainedOptions),
      ]);
      return new AutomaticSpeechRecognitionPipeline({
        task: "automatic-speech-recognition",
        tokenizer,
        model,
        processor,
      });
    })();
  }
  return transcriberPromise;
}

export type VoiceModelStatus = "ready" | "missing" | "incomplete";

/**
 * Whether the self-hosted model files are actually present *and* look like
 * real binaries rather than Git LFS pointer stubs — lets the mic button
 * show a specific "not installed" vs. "incomplete" state instead of
 * hanging/erroring with a cryptic ONNX Runtime message the first time
 * someone taps it on a deployment where the manual model-file step (see
 * scripts/dev/voice-model-setup.md) hasn't been done, or was done with a
 * plain `git clone` that silently grabbed pointer stubs instead of weights.
 */
export async function getVoiceModelStatus(): Promise<VoiceModelStatus> {
  try {
    const configRes = await fetch(`/models/${VOICE_MODEL_ID}/config.json`, {
      method: "HEAD",
    });
    if (!configRes.ok) return "missing";

    for (const url of WEIGHT_FILE_PATHS) {
      const res = await fetch(url, { method: "HEAD" });
      if (!res.ok) return "missing";
      const contentLength = Number(res.headers.get("content-length") ?? "0");
      if (contentLength > 0 && contentLength < MIN_PLAUSIBLE_WEIGHT_BYTES) {
        return "incomplete";
      }
    }
    return "ready";
  } catch {
    return "missing";
  }
}

/**
 * Transcribes a recorded audio clip entirely on-device. The pipeline
 * accepts a URL and decodes/resamples it itself (via AudioContext, same
 * as any other Web Audio use — not a network fetch, this is a local
 * blob: URL), so no manual PCM handling is needed here. The object URL
 * is revoked immediately after — nothing about the clip is retained
 * beyond this call, satisfying the "discard temporary audio" requirement.
 */
export async function transcribeVoiceClip(blob: Blob): Promise<string> {
  const transcriber = await getTranscriber();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const result = await transcriber(objectUrl);
    const single = Array.isArray(result) ? result[0] : result;
    return (single?.text ?? "").trim();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Batch version of the same trigger->expansion lookup the RS textarea
 * already applies per-keystroke on Space/Tab (see handleShortcutKeyDown
 * in SheetDetail.tsx and the inline equivalent in IntelligenceMapping.tsx)
 * — a voice transcript arrives as one whole block of text, not keystrokes,
 * so this runs the identical lookup as a single pass over every word
 * instead. Reuses whatever shortcut map the caller already has (global +
 * per-target shortcuts merged), so anything configured on the Shortcuts
 * page "just works" for voice with nothing to duplicate or keep in sync.
 */
export function applyShortcutsToTranscript(
  text: string,
  shortcutMap: Record<string, string>
): string {
  if (!text.trim()) return text;
  // Capturing group keeps the whitespace runs as their own array entries,
  // so original spacing survives untouched for every non-matching word.
  return text
    .split(/(\s+)/)
    .map(token => {
      const trimmed = token.trim();
      if (!trimmed) return token;
      // Whisper punctuates sentences on its own — strip a trailing
      // .,!?;: before the lookup (a spoken "hb." shouldn't miss the "hb"
      // shortcut just because it landed at a sentence boundary), but the
      // match still replaces the whole token, punctuation included.
      const key = trimmed.toLowerCase().replace(/[.,!?;:]+$/, "");
      return shortcutMap[key] ?? token;
    })
    .join("");
}
