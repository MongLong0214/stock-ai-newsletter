#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FONT_DIR="$ROOT_DIR/fonts/noto-sans-kr"
VENV_DIR="${OG_FONTTOOLS_VENV:-$ROOT_DIR/.venv-fonts}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/og-font-subset.XXXXXX")"
TEXT_FILE="$WORK_DIR/og-subset-chars.txt"

cleanup() {
  rm -R "$WORK_DIR"
}
trap cleanup EXIT

ensure_pyftsubset() {
  if command -v pyftsubset >/dev/null 2>&1; then
    command -v pyftsubset
    return
  fi

  if [ ! -x "$VENV_DIR/bin/pyftsubset" ]; then
    if [ -d "$VENV_DIR" ]; then
      rm -R "$VENV_DIR"
    fi
    "$PYTHON_BIN" -m venv "$VENV_DIR"
    "$VENV_DIR/bin/pip" install --disable-pip-version-check --quiet \
      'fonttools==4.53.1' \
      'brotli==1.1.0'
  fi

  printf '%s\n' "$VENV_DIR/bin/pyftsubset"
}

"$PYTHON_BIN" - "$TEXT_FILE" "$ROOT_DIR" <<'PY'
from pathlib import Path
import sys

out = Path(sys.argv[1])
root = Path(sys.argv[2])
chars: set[str] = set()

# KS X 1001 complete Hangul syllables: EUC-KR rows B0A1-C8FE decode to 2,350 chars.
for lead in range(0xB0, 0xC9):
    for trail in range(0xA1, 0xFF):
        try:
            char = bytes([lead, trail]).decode("euc_kr")
        except UnicodeDecodeError:
            continue
        if "\uac00" <= char <= "\ud7a3":
            chars.add(char)

for start, end in ((0x0020, 0x007F), (0x00A0, 0x0100), (0x3131, 0x3164)):
    for codepoint in range(start, end):
        chars.add(chr(codepoint))

for char in "₩€↑↓→←·…—–‘’“”%ℓ㎡℃°±×÷※★☆■□▲△▼▽●○()[]{}<>/\\|_+-=~:;,.!?@#$&*^`'\"":
    chars.add(char)

source_files = [
    root / "lib/og-template.tsx",
    root / "scripts/og/verify-og-glyph-coverage.ts",
    *sorted((root / "app").rglob("opengraph-image.tsx")),
    *sorted((root / "app").rglob("twitter-image.tsx")),
]
for path in source_files:
    if not path.exists():
        continue
    for char in path.read_text(encoding="utf-8"):
        if not char.isspace():
            chars.add(char)

out.write_text("".join(sorted(chars)), encoding="utf-8")
PY

PYFTSUBSET="$(ensure_pyftsubset)"

for weight in 500 700; do
  input="$FONT_DIR/noto-sans-kr-korean-$weight-normal.woff"
  output="$FONT_DIR/noto-sans-kr-korean-$weight-normal-subset.woff"

  "$PYFTSUBSET" "$input" \
    --output-file="$output" \
    --flavor=woff \
    --text-file="$TEXT_FILE" \
    --no-hinting
done

du -k "$FONT_DIR"/*normal*.woff
