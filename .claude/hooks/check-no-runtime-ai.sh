#!/usr/bin/env bash
# Blocks Claude Code from writing/editing operational source files that
# introduce a runtime dependency on an external AI/LLM API.
#
# Reads the PreToolUse JSON payload from stdin, checks the target file
# path and content, and exits 2 (blocking) if a banned pattern is found
# outside the explicitly allowed dev-tools / _core directories.
set -euo pipefail

INPUT="$(cat)"

FILE_PATH="$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')"
CONTENT="$(echo "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // empty')"

# Nothing to check (e.g. no file_path resolved) - allow.
if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Dev-time tooling, and any `_core` directory (documented in CLAUDE.md's
# Golden Rule as inherited platform scaffolding, never wired into a live
# route), are explicitly exempt. The enforcement files themselves, and
# CLAUDE.md (the policy doc that has to describe these strings in prose),
# are also exempt: they legitimately contain these strings as data, not
# as a runtime call.
if [[ "$FILE_PATH" == */dev-tools/* || "$FILE_PATH" == */scripts/dev/* || "$FILE_PATH" == */_core/* || "$FILE_PATH" == *check-no-runtime-ai.sh || "$FILE_PATH" == */.claude/settings.json || "$FILE_PATH" == */CLAUDE.md ]]; then
  exit 0
fi

# Banned patterns: known AI/LLM SDK imports, package names, raw API hosts,
# and the dead _core helper call sites. Extend this list as new
# providers/SDKs/helpers come into use.
BANNED_PATTERNS=(
  "openai"
  "anthropic"
  "@anthropic-ai/sdk"
  "generativelanguage.googleapis.com"
  "api.openai.com"
  "api.anthropic.com"
  "huggingface"
  "cohere"
  "openrouter"
  "langchain"
  "llama-index"
  "forge.manus.im"
  "invokeLLM\("
  "generateImage\("
  "transcribeAudio\("
)

MATCHES=""
for pattern in "${BANNED_PATTERNS[@]}"; do
  if echo "$CONTENT" | grep -qiE "$pattern"; then
    MATCHES="${MATCHES}${pattern}, "
  fi
done

if [[ -n "$MATCHES" ]]; then
  echo "BLOCKED: '$FILE_PATH' references banned AI/LLM pattern(s): ${MATCHES%, }" >&2
  echo "This app must not call external AI/LLM services at runtime." >&2
  echo "If this is genuinely dev-time tooling, move it under /dev-tools." >&2
  exit 2
fi

exit 0
