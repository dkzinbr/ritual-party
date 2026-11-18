import base64
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
out = root / "scripts" / "_b64_eval"
if out.exists():
    for old in out.glob("*"):
        old.unlink()
else:
    out.mkdir()

jobs = [
    ("css", "/dist/assets/index-BMQyXMKy.css", root / "dist" / "assets" / "index-BMQyXMKy.css", 4000, "text"),
    ("js", "/dist/assets/index-ByOOxhme.js", root / "dist" / "assets" / "index-ByOOxhme.js", 6000, "text"),
]

for name, remote, path, size, mode in jobs:
    data = path.read_text(encoding="utf-8")
    parts = [data[i : i + size] for i in range(0, len(data), size)]
    n = len(parts)
    for index, chunk in enumerate(parts):
        b64 = base64.b64encode(chunk.encode("utf-8")).decode("ascii")
        piece = "(async()=> window.__rpPutB64(%s, %d, %d, %s))()" % (
            json.dumps(remote),
            index,
            n,
            json.dumps(b64),
        )
        dest = out / f"{name}_{index:02d}.js"
        dest.write_text(piece, encoding="utf-8")
    print(name, n, "parts", "first", (out / f"{name}_00.js").stat().st_size)
