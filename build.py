"""Build ChatFlow 0.1 review candidates, not a production release."""
import hashlib
import json
import os
import shutil
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
INCLUDE = ["src", "workspace", "icons", "lib"]
manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
assert manifest["version"] == "0.1"
assert manifest["manifest_version"] == 3
assert "<all_urls>" not in json.dumps(manifest)
assert manifest["background"]["service_worker"] == "src/tl-service.js"

try:
    commit = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
    ).strip()
except (OSError, subprocess.CalledProcessError):
    commit = os.environ.get("SOURCE_COMMIT", "uncommitted")

shutil.rmtree(DIST, ignore_errors=True)
DIST.mkdir()

for browser in ("chrome", "edge"):
    out = DIST / browser
    out.mkdir()
    for folder in INCLUDE:
        shutil.copytree(ROOT / folder, out / folder)
    for name in ("LICENSE", "THIRD_PARTY_NOTICES.md"):
        shutil.copyfile(ROOT / name, out / name)

    (out / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    hashes = {
        p.relative_to(out).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(out.rglob("*")) if p.is_file()
    }
    (out / "BUILD_INFO.json").write_text(
        json.dumps({
            "schema": 1,
            "product": "ChatFlow",
            "source_commit": commit,
            "version": "0.1",
            "status": "candidate_real_account_acceptance_pending",
            "files": hashes,
        }, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    archive = DIST / f"chatflow-{browser}-0.1-candidate.zip"
    with zipfile.ZipFile(
        archive, "w", zipfile.ZIP_DEFLATED, allowZip64=True, compresslevel=6
    ) as z:
        for p in sorted(out.rglob("*")):
            if p.is_file():
                z.write(p, p.relative_to(out).as_posix())

    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        packaged_manifest = json.loads(z.read("manifest.json"))
        assert packaged_manifest["version"] == "0.1"
        assert "workspace/index.html" in z.namelist()
        assert "LICENSE" in z.namelist()
        assert "THIRD_PARTY_NOTICES.md" in z.namelist()
        for script in packaged_manifest["content_scripts"]:
            assert all(path in z.namelist() for path in script["js"])
        assert packaged_manifest["background"]["service_worker"] in z.namelist()

    print("BUILT", browser, commit)

sums = [
    hashlib.sha256(p.read_bytes()).hexdigest() + "  " + p.name
    for p in sorted(DIST.glob("*.zip"))
]
(DIST / "SHA256SUMS").write_text("\n".join(sums) + "\n", encoding="utf-8")
assert len(sums) == 2
print("PACKAGE_VERIFICATION_PASSED", len(sums))
