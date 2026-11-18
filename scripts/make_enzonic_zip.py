import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
zip_path = root / "22evy-enzonic.zip"

pkg = {
    "name": "ritual-party",
    "private": True,
    "type": "module",
    "dependencies": {
        "express": "^5.2.1",
        "tsx": "^4.23.15",
    },
}

with ZipFile(zip_path, "w", ZIP_DEFLATED) as zf:
    zf.writestr("package.json", json.dumps(pkg, indent=2) + "\n")
    zf.write(root / "index.js", "index.js")
    for folder in ("server", "dist"):
        for path in (root / folder).rglob("*"):
            if path.is_file():
                zf.write(path, path.relative_to(root).as_posix())

print(zip_path, zip_path.stat().st_size)
print(ZipFile(zip_path).namelist())
