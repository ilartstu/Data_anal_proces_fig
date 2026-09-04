"""Temporary on-disk storage for uploaded files, keyed by a generated id.

Files are kept so that every request re-parses them with the current
header/column configuration (the app is otherwise stateless).
"""
from __future__ import annotations

import json
import os
import time
import uuid
from dataclasses import dataclass, asdict
from pathlib import Path

DATA_DIR = Path(os.environ.get("DATA_DIR", "/data/uploads"))
MAX_AGE_SECONDS = int(os.environ.get("UPLOAD_MAX_AGE", str(24 * 3600)))


@dataclass
class Upload:
    id: str
    filename: str
    ext: str          # ".csv" / ".xlsx" / ".xls"
    delimiter: str | None  # detected delimiter for csv, else None
    created: float

    @property
    def path(self) -> Path:
        return DATA_DIR / f"{self.id}{self.ext}"


def _meta_path(upload_id: str) -> Path:
    return DATA_DIR / f"{upload_id}.meta.json"


def ensure_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def cleanup_old() -> None:
    """Best-effort removal of uploads older than MAX_AGE_SECONDS."""
    ensure_dir()
    now = time.time()
    for meta in DATA_DIR.glob("*.meta.json"):
        try:
            data = json.loads(meta.read_text())
            if now - data.get("created", now) > MAX_AGE_SECONDS:
                up = Upload(**data)
                up.path.unlink(missing_ok=True)
                meta.unlink(missing_ok=True)
        except Exception:
            continue


def save(filename: str, content: bytes, delimiter: str | None) -> Upload:
    ensure_dir()
    cleanup_old()
    ext = Path(filename).suffix.lower() or ".csv"
    upload_id = uuid.uuid4().hex
    up = Upload(id=upload_id, filename=filename, ext=ext,
                delimiter=delimiter, created=time.time())
    up.path.write_bytes(content)
    _meta_path(upload_id).write_text(json.dumps(asdict(up)))
    return up


def get(upload_id: str) -> Upload:
    meta = _meta_path(upload_id)
    if not meta.exists():
        raise KeyError(upload_id)
    data = json.loads(meta.read_text())
    return Upload(**data)


def delete(upload_id: str) -> None:
    """Remove an uploaded file and its metadata (best-effort)."""
    try:
        up = get(upload_id)
        up.path.unlink(missing_ok=True)
    except Exception:
        pass
    _meta_path(upload_id).unlink(missing_ok=True)
