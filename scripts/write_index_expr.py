import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
body = (root / "server" / "index.ts").read_text(encoding="utf-8")
expr = (
    "(async()=>{ const r=await fetch(\"/api/client/servers/eeed59a1/files/write?file=\""
    "+encodeURIComponent(\"/server/index.ts\"),{method:\"POST\",body:%s}); "
    "return {status:r.status,len:%d}; })()" % (json.dumps(body), len(body))
)
out = Path(__file__).resolve().parent / "_write_index.js"
out.write_text(expr, encoding="utf-8")
print(out.stat().st_size)
