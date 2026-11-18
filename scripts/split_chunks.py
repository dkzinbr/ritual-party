import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
out = Path(__file__).resolve().parent / "_chunks"
if out.exists():
    for old in out.glob("*"):
        old.unlink()
else:
    out.mkdir()

jobs = [
    ("server_index", root / "server" / "index.ts", 4000, "text"),
    ("server_store", root / "server" / "store.ts", 4000, "text"),
    ("dist_css", root / "dist" / "assets" / "index-BMQyXMKy.css", 4000, "text"),
    ("dist_js", root / "dist" / "assets" / "index-ByOOxhme.js", 8000, "text"),
]

for name, path, size, mode in jobs:
    data = path.read_text(encoding="utf-8") if mode == "text" else path.read_bytes()
    chunks = [data[i : i + size] for i in range(0, len(data), size)]
    manifest = []
    for index, chunk in enumerate(chunks):
        file = out / f"{name}_{index:03d}.json"
        file.write_text(json.dumps(chunk), encoding="utf-8")
        manifest.append({"file": file.name, "chars": len(chunk)})
    print(name, len(chunks), "chunks")
