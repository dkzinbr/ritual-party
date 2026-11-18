import os
import posixpath
import stat
from pathlib import Path

import paramiko

HOST = os.environ["SFTP_HOST"]
PORT = int(os.environ.get("SFTP_PORT", "2022"))
USER = os.environ["SFTP_USER"]
PASSWORD = os.environ["SFTP_PASS"]
ROOT = Path(__file__).resolve().parents[1]

SKIP_DIRS = {".git", "node_modules", "data", "dist", "scripts", "agent-transcripts"}
SKIP_FILES = {".env", "22evy-enzonic.zip"}

INCLUDE = [
    "package.json",
    "package-lock.json",
    "index.html",
    "vite.config.ts",
    "tsconfig.json",
    "server",
    "src",
    "public",
]


def should_skip(path: Path) -> bool:
    if path.name in SKIP_FILES:
        return True
    return any(part in SKIP_DIRS for part in path.parts)


def connect():
    transport = paramiko.Transport((HOST, PORT))
    transport.banner_timeout = 60
    transport.auth_timeout = 60
    transport.start_client(timeout=30)
    transport.auth_password(USER, PASSWORD)
    sftp = paramiko.SFTPClient.from_transport(transport)
    if sftp is None:
        raise RuntimeError("SFTP session failed")
    return transport, sftp


def mkdir_p(sftp, remote: str):
    parts = remote.strip("/").split("/")
    current = ""
    for part in parts:
        current = f"{current}/{part}" if current else part
        try:
            sftp.stat(current)
        except FileNotFoundError:
            sftp.mkdir(current)


def put_file(sftp, local: Path, remote: str):
    mkdir_p(sftp, posixpath.dirname(remote).replace("\\", "/"))
    sftp.put(str(local), remote)
    print(f"up {remote}")


def list_root(sftp):
    print("REMOTE", sftp.getcwd() or ".")
    for item in sftp.listdir_attr("."):
        kind = "dir" if stat.S_ISDIR(item.st_mode) else "file"
        print(f"{kind:4} {item.filename}")


def upload(sftp):
    for name in INCLUDE:
        local = ROOT / name
        if local.is_file():
            put_file(sftp, local, name)
            continue
        for path in local.rglob("*"):
            if path.is_dir() or should_skip(path):
                continue
            rel = path.relative_to(ROOT).as_posix()
            put_file(sftp, path, rel)


def main():
    action = os.environ.get("SFTP_ACTION", "list")
    transport, sftp = connect()
    try:
        if action == "list":
            list_root(sftp)
        elif action == "upload":
            upload(sftp)
            print("UPLOAD_OK")
        else:
            raise SystemExit(f"unknown action {action}")
    finally:
        sftp.close()
        transport.close()


if __name__ == "__main__":
    main()
