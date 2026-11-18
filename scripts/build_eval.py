import json
from pathlib import Path

parts = Path(__file__).resolve().parent / "_parts"
root = Path(__file__).resolve().parent

files = {
    "/server/index.ts": json.loads((parts / "server_index.ts.json").read_text(encoding="utf-8")),
    "/dist/index.html": json.loads((parts / "dist_index.html.json").read_text(encoding="utf-8")),
    "/dist/favicon.svg": json.loads((parts / "dist_favicon.svg.json").read_text(encoding="utf-8")),
    "/dist/manifest.webmanifest": json.loads(
        (parts / "dist_manifest.webmanifest.json").read_text(encoding="utf-8")
    ),
}

dumped = json.dumps(files).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
expr = (
    "(async()=>{ const files = "
    + dumped
    + '; const out=[]; for (const [path, body] of Object.entries(files)) { const r=await fetch("/api/client/servers/eeed59a1/files/write?file="+encodeURIComponent(path),{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body}); out.push({path,status:r.status,len:body.length}); } return out; })()'
)
out = root / "_eval_a.js"
out.write_text(expr, encoding="utf-8")
print(out.stat().st_size)
