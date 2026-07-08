#!/usr/bin/env bash
set -euo pipefail

base="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"

if ! git rev-parse --verify "$base" >/dev/null 2>&1; then
  exit 1
fi

if ! changed_files="$(
  git diff --name-only "$base" HEAD -- . \
    ':(exclude,glob)docs/**' \
    ':(exclude,glob)*.md' \
    ':(exclude,glob)**/*.md' \
    ':(exclude,glob).github/**' \
    ':(exclude,glob).serena/**' \
    ':(exclude,glob)mcp/**'
)"; then
  exit 1
fi

if [[ -z "$changed_files" ]]; then
  exit 0
fi

exit 1
