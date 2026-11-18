import os
from io import BytesIO

import requests

url = os.environ["UPLOAD_URL"]
payload = BytesIO(b"console.log('22evy')\n")
attempts = [
    {"params": {}, "files": {"files": ("probe.js", payload.getvalue(), "application/javascript")}},
    {"params": {"filename": "probe.js"}, "files": {"files": ("probe.js", payload.getvalue(), "application/javascript")}},
    {"params": {"name": "probe.js"}, "files": {"file": ("probe.js", payload.getvalue(), "application/javascript")}},
    {"params": {"filename": "probe.js"}, "files": {"file": ("probe.js", payload.getvalue(), "application/javascript")}},
    {"params": {}, "files": {"file": ("probe.js", payload.getvalue(), "application/javascript")}},
    {
        "params": {"directory": "/", "filename": "probe.js"},
        "files": {"files[]": ("probe.js", payload.getvalue(), "application/javascript")},
    },
]

for index, attempt in enumerate(attempts, start=1):
    response = requests.post(
        url,
        params=attempt["params"],
        files=attempt["files"],
        data={"directory": "/"},
        headers={"Expect": ""},
        timeout=60,
    )
    print(index, response.status_code, response.text[:200], attempt["params"], list(attempt["files"]))
    if response.status_code in (200, 201, 204):
        print("OK")
        break
