"""Uploads are read whole into memory, so they get a ceiling."""

from fastapi import HTTPException, UploadFile

MAX_UPLOAD = 5 * 1024 * 1024


async def read_upload(file: UploadFile) -> bytes:
    raw = await file.read(MAX_UPLOAD + 1)
    if len(raw) > MAX_UPLOAD:
        raise HTTPException(413, f"file is larger than {MAX_UPLOAD // (1024 * 1024)} MB")
    return raw
