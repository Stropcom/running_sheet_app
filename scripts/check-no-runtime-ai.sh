#!/usr/bin/env bash
# CI backstop: scans the operational source tree for any reference to an
# external AI/LLM SDK, package, or API host. Fails the build if found.
#
# This is the authoritative check - the Claude Code hook is a convenience
# that catches problems early, this script is what actually gates merges.
#
# Usage: ./scripts/check-no-runtime-ai.sh [path-to-scan ...]
# Defaults to this repo's operational source dirs (server, client/src, shared).
set -euo pipefail

SCAN_ROOTS=("$@")
if [[ ${#SCAN_ROOTS[@]} -eq 0 ]]; then
  SCAN_ROOTS=(server client/src shared)
fi

# Directories that are allowed to reference AI tooling: dev-time-only
# tooling that never ships in the built app, plus any `_core` directory
# (server/_core, client/src/_core, shared/_core) — documented in
# CLAUDE.md's Golden Rule as inherited platform scaffolding that is
# never imported by a live route.
EXCLUDE_DIRS=("dev-tools" "scripts/dev" "node_modules" ".git" "_core")

BANNED_PATTERNS=(
  "openai"
  "anthropic"
  "@anthropic-ai/sdk"
  "generativelanguage\.googleapis\.com"
  "api\.openai\.com"
  "api\.anthropic\.com"
  "huggingface"
  "cohere"
  "openrouter"
  "langchain"
  "llama-index"
  "forge\.manus\.im"
  "invokeLLM\("
  "generateImage\("
  "transcribeAudio\("
)

EXCLUDE_ARGS=()
for d in "${EXCLUDE_DIRS[@]}"; do
  EXCLUDE_ARGS+=(--exclude-dir="$d")
done

FOUND=0

for pattern in "${BANNED_PATTERNS[@]}"; do
  for root in "${SCAN_ROOTS[@]}"; do
    if grep -rniE "${EXCLUDE_ARGS[@]}" "$pattern" "$root" 2>/dev/null; then
      FOUND=1
    fi
  done
done

if [[ "$FOUND" -eq 1 ]]; then
  echo ""
  echo "FAILED: found reference(s) to external AI/LLM services in: ${SCAN_ROOTS[*]}"
  echo "This app must not depend on any external AI/LLM API at runtime."
  echo "Move dev-only tooling into a /dev-tools directory (excluded from this scan),"
  echo "or remove the dependency from operational code."
  exit 1
fi

echo "OK: no runtime AI/LLM references found in: ${SCAN_ROOTS[*]}"
exit 0
