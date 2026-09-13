// Copies onnxruntime-web's WASM engine binaries from node_modules into
// client/public/onnx-wasm/ so lib/voiceTranscription.ts's
// env.backends.onnx.wasm.wasmPaths = "/onnx-wasm/" can load them as a
// same-origin static asset instead of the default jsdelivr.net CDN path —
// required for the Golden Rule's "no network call at runtime" guarantee,
// same reasoning as the model-weights README in client/public/models/.
//
// Unlike the model weights, these ARE safe to regenerate from a real npm
// dependency rather than hand-provisioned — onnxruntime-web is already
// pinned in package.json (transitively, via @xenova/transformers), so
// this just copies its own dist/ files verbatim. Runs automatically via
// package.json's predev/prebuild hooks; client/public/onnx-wasm/ itself
// is gitignored (generated, not committed — same pattern as dist/).
import fs from "node:fs";
import path from "node:path";

const SRC_DIR = path.resolve(
  import.meta.dirname,
  "../../node_modules/onnxruntime-web/dist"
);
const DEST_DIR = path.resolve(
  import.meta.dirname,
  "../../client/public/onnx-wasm"
);

// Just the runtime engine files actually needed at runtime — not the
// source maps or the node/webgl/training variants this app never loads.
const FILES = [
  "ort-wasm.wasm",
  "ort-wasm-simd.wasm",
  "ort-wasm-threaded.wasm",
  "ort-wasm-threaded.js",
  "ort-wasm-threaded.worker.js",
  "ort-wasm-simd-threaded.wasm",
];

if (!fs.existsSync(SRC_DIR)) {
  console.warn(
    `[copy-onnx-wasm] ${SRC_DIR} not found — skipping (onnxruntime-web not installed?).`
  );
  process.exit(0);
}

fs.mkdirSync(DEST_DIR, { recursive: true });

let copied = 0;
for (const file of FILES) {
  const src = path.join(SRC_DIR, file);
  if (!fs.existsSync(src)) continue;
  fs.copyFileSync(src, path.join(DEST_DIR, file));
  copied++;
}

console.log(`[copy-onnx-wasm] Copied ${copied} file(s) to ${DEST_DIR}`);
