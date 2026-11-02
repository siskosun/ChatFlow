"""Build ChatFlow 0.2 engineering candidates, not a production release."""
import hashlib
import json
import os
import shutil
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
INCLUDE_DIRS = ["workspace", "icons"]
RUNTIME_FILES = [
    "src/tl-core.js",
    "src/tl-provider.js",
    "src/tl-capture.js",
    "src/tl-inject.js",
    "src/tl-passages.js",
    "src/tl-store.js",
    "src/tl-archive.js",
    "src/tl-context.js",
    "src/experiment-core.js",
    "src/experiment-db.js",
    "src/experiment-service.js",
    "src/tl-service.js",
]
manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
assert manifest["version"] == "0.2"
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
    for folder in INCLUDE_DIRS:
        shutil.copytree(ROOT / folder, out / folder)
    for relative in RUNTIME_FILES:
        source = ROOT / relative
        assert source.is_file(), f"Missing runtime file: {relative}"
        target = out / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
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
            "version": "0.2",
            "status": "candidate_real_account_acceptance_pending",
            "files": hashes,
        }, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    archive = DIST / f"chatflow-{browser}-0.2-candidate.zip"
    with zipfile.ZipFile(
        archive, "w", zipfile.ZIP_DEFLATED, allowZip64=True, compresslevel=6
    ) as z:
        for p in sorted(out.rglob("*")):
            if p.is_file():
                info = zipfile.ZipInfo(
                    p.relative_to(out).as_posix(), (1980, 1, 1, 0, 0, 0)
                )
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                z.writestr(info, p.read_bytes())

    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        packaged_manifest = json.loads(z.read("manifest.json"))
        assert packaged_manifest["version"] == "0.2"
        assert "workspace/index.html" in z.namelist()
        assert "LICENSE" in z.namelist()
        assert "THIRD_PARTY_NOTICES.md" in z.namelist()
        packaged_files = set(z.namelist())
        for script in packaged_manifest["content_scripts"]:
            assert all(path in packaged_files for path in script["js"])
        assert packaged_manifest["background"]["service_worker"] in packaged_files
        assert all(path in packaged_files for path in RUNTIME_FILES)
        assert not any(path.startswith("lib/") for path in packaged_files)
        assert not any(path.startswith("popup/") for path in packaged_files)
        for legacy in (
            "src/background.js", "src/content.js", "src/picker.js",
            "src/render.js", "src/zip.js", "lib/marked.umd.js",
        ):
            assert legacy not in packaged_files, f"Unused legacy code shipped: {legacy}"

    print("BUILT", browser, commit)

sums = [
    hashlib.sha256(p.read_bytes()).hexdigest() + "  " + p.name
    for p in sorted(DIST.glob("*.zip"))
]
(DIST / "SHA256SUMS").write_text("\n".join(sums) + "\n", encoding="utf-8")
assert len(sums) == 2
print("PACKAGE_VERIFICATION_PASSED", len(sums))
