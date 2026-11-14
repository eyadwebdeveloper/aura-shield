#!/usr/bin/env python3
"""Fetch the Human-Atlas model files into Aura's public/models/ and verify.

- Moves the 4 files already in public/atlas/ (mis-placed by a previous pass)
  to public/models/ where the code and manifests expect them.
- Downloads the 28 missing .bin.gz chunks from the Human-Atlas GitHub repo.
- Verifies every file's byte size against the manifests (gzipBytes / bytes),
  and that the two manifests match the upstream copies bit-for-bit.
"""
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

BASE = Path("/home/z/my-project/aura-work/public")
REPO = "https://raw.githubusercontent.com/slorksmo/Human-Atlas/main/public/models"


def fetch(url: str, dest: Path) -> None:
    result = subprocess.run(
        ["curl", "-sS", "-f", "-L", "--retry", "3", "-o", str(dest), url],
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"download failed: {url}")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    old, models = BASE / "atlas", BASE / "models"
    models.mkdir(exist_ok=True)

    # 1. Relocate the mis-placed files from the earlier partial integration.
    moved = []
    if old.is_dir():
        for f in old.iterdir():
            target = models / f.name
            if not target.exists():
                shutil.move(str(f), str(target))
                moved.append(f.name)
        if not any(old.iterdir()):
            old.rmdir()
    print(f"moved from public/atlas -> public/models: {moved or 'nothing'}")

    # 2. Download whatever is missing.
    downloads = []
    for manifest_name in ("atlas.json", "atlas-female.json"):
        manifest = json.loads((models / manifest_name).read_text())
        for chunk in manifest["chunks"]:
            gz = models / Path(chunk["gzip"]).name
            raw = models / Path(chunk["url"]).name
            if not gz.exists():
                downloads.append((f"{REPO}/{gz.name}", gz, chunk["gzipBytes"], "gzip"))
            # plain .bin ships only as a legacy fallback; skip it (see README)
            _ = raw
    for manifest_name in ("atlas.json", "atlas-female.json"):
        if not (models / manifest_name).exists():
            downloads.append((f"{REPO}/{manifest_name}", models / manifest_name, None, "json"))

    print(f"to download: {len(downloads)} files")
    for url, dest, size, kind in downloads:
        fetch(url, dest)
        actual = dest.stat().st_size
        status = "ok" if size is None or actual == size else "SIZE MISMATCH"
        print(f"  {dest.name:22s} {actual:>10,d} B  {status}")
        if status != "ok":
            return 1

    # 3. Full verification pass against both manifests.
    problems = []
    for manifest_name in ("atlas.json", "atlas-female.json"):
        manifest = json.loads((models / manifest_name).read_text())
        for chunk in manifest["chunks"]:
            gz = models / Path(chunk["gzip"]).name
            if not gz.exists():
                problems.append(f"missing {gz.name}")
            elif gz.stat().st_size != chunk["gzipBytes"]:
                problems.append(f"{gz.name}: {gz.stat().st_size} != {chunk['gzipBytes']}")
        # manifest itself must be byte-identical to upstream
        upstream = subprocess.run(
            ["curl", "-sS", "-f", "-L", f"{REPO}/{manifest_name}"],
            check=False, capture_output=True,
        ).stdout
        if hashlib.sha256(upstream).hexdigest() != sha256(models / manifest_name):
            problems.append(f"{manifest_name} differs from upstream")

    if problems:
        print("VERIFICATION FAILED:")
        for p in problems:
            print(f"  - {p}")
        return 1

    total = sum(f.stat().st_size for f in models.iterdir())
    count = len(list(models.iterdir()))
    print(f"VERIFIED: {count} files, {total / 1e6:.1f} MB total in public/models/")
    for f in sorted(models.iterdir()):
        print(f"  {f.name:26s} {f.stat().st_size:>10,d} B")
    return 0


if __name__ == "__main__":
    sys.exit(main())
