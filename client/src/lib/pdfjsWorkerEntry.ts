// Thin wrapper around pdfjs-dist's own worker build, loaded as the actual
// pdf.js Worker script (see GlobalWorkerOptions.workerSrc in
// DocumentViewerModal.tsx) instead of pointing straight at
// "pdfjs-dist/build/pdf.worker.min.mjs" — needed purely to install the same
// Map.prototype.getOrInsertComputed polyfill the main thread gets (see the
// matching one there for the full explanation) inside the WORKER's own
// separate global scope too, since the installed pdfjs-dist@6.3.289 build
// calls that method extensively on the worker side as well (confirmed via
// a direct grep of the shipped worker bundle) and a main-thread-only
// polyfill doesn't reach across to a Worker's isolated globals.
//
// Safe regardless of import/statement execution order: Map.prototype is a
// shared prototype object looked up at CALL time, not per-instance at
// construction time, so every #methodPromises = new Map() field the real
// worker module defines still picks up this polyfill as long as it's
// applied before that method is actually invoked (which only happens in
// response to a real PDF operation, well after both modules' top-level
// code — including this polyfill line — has run).
if (!(Map.prototype as any).getOrInsertComputed) {
  (Map.prototype as any).getOrInsertComputed = function (
    this: Map<unknown, unknown>,
    key: unknown,
    callbackFn: (key: unknown) => unknown
  ) {
    if (this.has(key)) return this.get(key);
    const value = callbackFn(key);
    this.set(key, value);
    return value;
  };
}

import "pdfjs-dist/build/pdf.worker.min.mjs";
