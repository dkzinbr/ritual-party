import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
body = (root / "server" / "store.ts").read_text(encoding="utf-8")
expr = "(async()=> window.__rpWrite(\"/server/store.ts\", %s))()" % json.dumps(body)
out = root / "scripts" / "_write_store.js"
out.write_text(expr, encoding="utf-8")
print("store_expr", out.stat().st_size, "body", len(body))

chunks_dir = root / "scripts" / "_store_eval"
if chunks_dir.exists():
    for old in chunks_dir.glob("*"):
        old.unlink()
else:
    chunks_dir.mkdir()

size = 3500
parts = [body[i : i + size] for i in range(0, len(body), size)]
for index, chunk in enumerate(parts):
    last = index == len(parts) - 1
    piece = "(async()=> window.__rpChunk('/server/store.ts', %s, %s))()" % (
        json.dumps(chunk),
        "true" if last else "false",
    )
    dest = chunks_dir / f"{index:02d}.js"
    dest.write_text(piece, encoding="utf-8")
    print(dest.name, dest.stat().st_size, "last" if last else "mid")
print("parts", len(parts))
