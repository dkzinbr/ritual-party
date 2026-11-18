import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
body = (root / "scripts" / "boot.html").read_text(encoding="utf-8")
expr = "(async()=> window.__rpWrite(%s, %s))()" % (json.dumps("/dist/index.html"), json.dumps(body))
out = root / "scripts" / "_write_boot.js"
out.write_text(expr, encoding="utf-8")
print("expr", out.stat().st_size, "body", len(body))
