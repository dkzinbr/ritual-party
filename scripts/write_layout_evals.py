import base64
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
out = root / "scripts" / "_layout_eval"
if out.exists():
    for old in out.glob("*"):
        old.unlink()
else:
    out.mkdir()

jobs = [
    ("js", "/dist/assets/index-ByOOxhme.js", root / "dist" / "assets" / "index-ByOOxhme.js", 12000, "text"),
    ("fundo", "/dist/fundo.jpg", root / "dist" / "fundo.jpg", 4500, "bin"),
    ("marca", "/dist/marca.png", root / "dist" / "marca.png", 4500, "bin"),
    ("girassol", "/dist/fonts/Girassol-Regular.ttf", root / "dist" / "fonts" / "Girassol-Regular.ttf", 4500, "bin"),
    ("roman", "/dist/fonts/Roman_New_Times.ttf", root / "dist" / "fonts" / "Roman_New_Times.ttf", 4500, "bin"),
    ("ordem", "/dist/ordem.png", root / "dist" / "ordem.png", 4500, "bin"),
    ("seita", "/dist/seita.png", root / "dist" / "seita.png", 4500, "bin"),
    ("ink", "/dist/ordem-ink.png", root / "dist" / "ordem-ink.png", 4500, "bin"),
    ("blood", "/dist/blood-field.jpg", root / "dist" / "blood-field.jpg", 4500, "bin"),
]

for name, remote, path, size, mode in jobs:
    raw = path.read_bytes() if mode == "bin" else path.read_text(encoding="utf-8").encode("utf-8")
    if mode == "text":
        text = path.read_text(encoding="utf-8")
        parts = [text[i : i + size] for i in range(0, len(text), size)]
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
        print(name, "text", n, "parts", "first", (out / f"{name}_00.js").stat().st_size)
    else:
        b64_all = base64.b64encode(raw).decode("ascii")
        parts = [b64_all[i : i + size] for i in range(0, len(b64_all), size)]
        n = len(parts)
        for index, chunk in enumerate(parts):
            piece = "(async()=> window.__rpPutBin(%s, %d, %d, %s))()" % (
                json.dumps(remote),
                index,
                n,
                json.dumps(chunk),
            )
            dest = out / f"{name}_{index:02d}.js"
            dest.write_text(piece, encoding="utf-8")
        print(name, "bin", n, "parts", len(raw), "bytes")
