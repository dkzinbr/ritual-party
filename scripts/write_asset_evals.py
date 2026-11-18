import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
out = root / "scripts" / "_asset_eval"
if out.exists():
    for old in out.glob("*"):
        old.unlink()
else:
    out.mkdir()

jobs = [
    ("css", "/dist/assets/index-BMQyXMKy.css", root / "dist" / "assets" / "index-BMQyXMKy.css", 3500, "text"),
    ("js", "/dist/assets/index-ByOOxhme.js", root / "dist" / "assets" / "index-ByOOxhme.js", 8000, "text"),
    ("html", "/dist/index.html", root / "dist" / "index.html", 8000, "text"),
]

for name, remote, path, size, mode in jobs:
    data = path.read_text(encoding="utf-8") if mode == "text" else path.read_bytes()
    parts = [data[i : i + size] for i in range(0, len(data), size)]
    for index, chunk in enumerate(parts):
        last = index == len(parts) - 1
        piece = "(async()=> window.__rpChunk(%s, %s, %s))()" % (
            json.dumps(remote),
            json.dumps(chunk),
            "true" if last else "false",
        )
        dest = out / f"{name}_{index:02d}.js"
        dest.write_text(piece, encoding="utf-8")
        print(dest.name, dest.stat().st_size, "last" if last else "mid")
    print(name, "parts", len(parts), "bytes", len(data))
