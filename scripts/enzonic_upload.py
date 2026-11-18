import os
from collections import defaultdict
from pathlib import Path

import requests

URL = os.environ["UPLOAD_URL"]
ROOT = Path(__file__).resolve().parents[1]
INCLUDE = ["index.js", "package.json", "package-lock.json", "server", "dist"]


def files_by_directory():
    groups = defaultdict(list)
    for name in INCLUDE:
        local = ROOT / name
        if local.is_file():
            groups["/"].append(local)
            continue
        for path in local.rglob("*"):
            if path.is_dir():
                continue
            rel = path.relative_to(ROOT)
            parent = rel.parent.as_posix()
            directory = "/" if parent == "." else f"/{parent}"
            groups[directory].append(path)
    return groups


def main():
    for directory, paths in files_by_directory().items():
        for path in paths:
            with path.open("rb") as handle:
                target = f"{URL}&directory={requests.utils.quote(directory)}"
                response = requests.post(
                    target,
                    files={"files": (path.name, handle, "application/octet-stream")},
                    data={"directory": directory},
                    headers={"Expect": ""},
                    timeout=120,
                )
            print(directory, path.name, response.status_code, response.text[:180])
            response.raise_for_status()
    print("UPLOAD_OK")


if __name__ == "__main__":
    main()
