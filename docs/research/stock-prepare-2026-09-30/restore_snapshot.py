"""Restore Git research snapshots into a separate destination; never overwrite differing files.
Usage: python3 restore_snapshot.py /tmp/stock-research-restore
Only archived /tmp sources are restored. Recreates original names and decompresses JSON.
"""
from pathlib import Path
import gzip, hashlib, json, sys

base = Path(__file__).resolve().parent
if len(sys.argv) != 2:
    raise SystemExit(__doc__)
destination = Path(sys.argv[1]).expanduser().resolve()
manifest = json.loads((base / 'artifact-manifest.json').read_text())
pending = []
for entry in manifest['files']:
    origin = Path(entry['origin'])
    if not str(origin).startswith('/tmp/'):
        continue
    stored = (base / entry['path']).read_bytes()
    if hashlib.sha256(stored).hexdigest() != entry['storedSha256']:
        raise SystemExit('Stored hash mismatch: ' + entry['path'])
    raw = gzip.decompress(stored) if entry['encoding'] == 'gzip' else stored
    if hashlib.sha256(raw).hexdigest() != entry['originalSha256']:
        raise SystemExit('Original hash mismatch: ' + entry['path'])
    target = destination / origin.relative_to('/')
    if target.exists() and target.read_bytes() != raw:
        raise SystemExit('Refusing to overwrite different file: ' + str(target))
    pending.append((target, raw))
for target, raw in pending:
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        target.write_bytes(raw)
print(f'Restored {len(pending)} byte-verified files under {destination}/tmp; no raw corpus or model cache is included.')
