#!/bin/bash
# Download the Human-Atlas model files (gzip chunks + manifests) into public/models,
# verifying every file against the byte sizes declared in the manifests.
set -u
DEST="/home/z/my-project/public/models"
BASE="https://raw.githubusercontent.com/slorksmo/Human-Atlas/main/public/models"
mkdir -p "$DEST"

download() { # $1 = filename
  local f="$1"
  for attempt in 1 2 3; do
    curl -sL --max-time 240 "$BASE/$f" -o "$DEST/$f" && [ -s "$DEST/$f" ] && return 0
    sleep 2
  done
  echo "FAILED: $f" >&2
  return 1
}

# Manifests first
download atlas.json || exit 1
download atlas-female.json || exit 1

# Chunk lists from manifests (url field, last path segment)
PATTERNS=$(python3 - <<'EOF'
import json
for m in ['atlas.json','atlas-female.json']:
    d=json.load(open(f'/home/z/my-project/public/models/{m}'))
    for c in d['chunks']:
        print(c['url'].split('/')[-1])
EOF
)

FAILED=0
for bin in $PATTERNS; do
  download "$bin.gz" || FAILED=1
done

# Verify sizes against manifest declarations
python3 - <<'EOF'
import json, os, sys
dest='/home/z/my-project/public/models'
ok=True
for m in ['atlas.json','atlas-female.json']:
    d=json.load(open(f'{dest}/{m}'))
    for c in d['chunks']:
        gz=c['url'].split('/')[-1]+'.gz'
        size=os.path.getsize(f'{dest}/{gz}') if os.path.exists(f'{dest}/{gz}') else -1
        if size!=c['gzipBytes']:
            ok=False
            print(f'SIZE MISMATCH {gz}: got {size}, expected {c["gzipBytes"]}')
print('ALL GZIP FILES VERIFIED OK' if ok else 'VERIFICATION FAILED')
sys.exit(0 if ok else 1)
EOF
[ "$FAILED" -eq 0 ] || exit 1
echo "Download complete."
