import json
from pathlib import Path

out = Path(__file__).resolve().parent / "_layout_eval"
batches_dir = Path(__file__).resolve().parent / "_layout_batches"
if batches_dir.exists():
    for old in batches_dir.glob("*"):
        old.unlink()
else:
    batches_dir.mkdir()


def batch(prefix: str, per: int) -> None:
    files = sorted(out.glob(f"{prefix}_*.js"))
    calls = []
    for f in files:
        text = f.read_text(encoding="utf-8").strip()
        if text.startswith("(async()=>") and text.endswith(")()"):
            inner = text[len("(async()=>") : -3].strip()
        else:
            inner = text
        calls.append(inner)
    for start in range(0, len(calls), per):
        group = calls[start : start + per]
        expr = "(async()=> JSON.stringify(await Promise.all([%s])))()" % ",".join(group)
        dest = batches_dir / f"{prefix}_{start:02d}.js"
        dest.write_text(expr, encoding="utf-8")
        print(prefix, start, "parts", len(group), "bytes", dest.stat().st_size)


batch("js", 2)
batch("fundo", 3)
batch("marca", 3)
batch("girassol", 3)
batch("roman", 3)
print("done", batches_dir)
