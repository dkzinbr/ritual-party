import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
out = root / "scripts" / "_put_eval"
if out.exists():
    for old in out.glob("*"):
        old.unlink()
else:
    out.mkdir()

jobs = [
    ("css", "/dist/assets/index-BMQyXMKy.css", root / "dist" / "assets" / "index-BMQyXMKy.css", 3500),
    ("js", "/dist/assets/index-ByOOxhme.js", root / "dist" / "assets" / "index-ByOOxhme.js", 8000),
]

for name, remote, path, size in jobs:
    data = path.read_text(encoding="utf-8")
    parts = [data[i : i + size] for i in range(0, len(data), size)]
    n = len(parts)
    for index, chunk in enumerate(parts):
        piece = "(async()=> window.__rpPut(%s, %d, %d, %s))()" % (
            json.dumps(remote),
            index,
            n,
            json.dumps(chunk),
        )
        dest = out / f"{name}_{index:02d}.js"
        dest.write_text(piece, encoding="utf-8")
    print(name, n, "parts")
