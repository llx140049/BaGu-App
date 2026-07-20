"""Object storage with a local-development fallback."""

from pathlib import Path, PurePosixPath
from urllib.parse import quote

import httpx

from app.core.config import settings


class ObjectNotFoundError(FileNotFoundError):
    pass


def _safe_key(key: str) -> str:
    path = PurePosixPath(key.replace("\\", "/"))
    if path.is_absolute() or ".." in path.parts or not path.parts:
        raise ValueError("Invalid object key")
    return path.as_posix()


class ObjectStorage:
    @property
    def uses_supabase(self) -> bool:
        return settings.STORAGE_BACKEND.casefold() == "supabase"

    def _supabase_url(self, key: str) -> str:
        if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
            raise RuntimeError("Supabase Storage is enabled but its URL or service key is missing")
        bucket = quote(settings.SUPABASE_STORAGE_BUCKET, safe="")
        object_key = quote(_safe_key(key), safe="/")
        return f"{settings.SUPABASE_URL.rstrip('/')}/storage/v1/object/{bucket}/{object_key}"

    @staticmethod
    def _headers() -> dict[str, str]:
        return {
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
            "apikey": settings.SUPABASE_SERVICE_KEY,
        }

    async def put(self, key: str, data: bytes, content_type: str) -> str:
        safe_key = _safe_key(key)
        if not self.uses_supabase:
            path = (Path(settings.UPLOAD_DIR).resolve() / safe_key).resolve()
            upload_root = Path(settings.UPLOAD_DIR).resolve()
            if upload_root not in path.parents:
                raise ValueError("Invalid local object path")
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            return safe_key

        headers = {
            **self._headers(),
            "Content-Type": content_type,
            "x-upsert": "true",
        }
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(self._supabase_url(safe_key), content=data, headers=headers)
        response.raise_for_status()
        return safe_key

    async def get(self, key: str) -> bytes:
        safe_key = _safe_key(key)
        if not self.uses_supabase:
            path = (Path(settings.UPLOAD_DIR).resolve() / safe_key).resolve()
            upload_root = Path(settings.UPLOAD_DIR).resolve()
            if upload_root not in path.parents or not path.is_file():
                raise ObjectNotFoundError(safe_key)
            return path.read_bytes()

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(self._supabase_url(safe_key), headers=self._headers())
        if response.status_code == 404:
            raise ObjectNotFoundError(safe_key)
        response.raise_for_status()
        return response.content

    async def delete(self, keys: list[str]) -> None:
        safe_keys = [_safe_key(key) for key in keys if key]
        if not safe_keys:
            return
        if not self.uses_supabase:
            upload_root = Path(settings.UPLOAD_DIR).resolve()
            for key in safe_keys:
                path = (upload_root / key).resolve()
                if upload_root in path.parents and path.is_file():
                    path.unlink()
            return

        bucket = quote(settings.SUPABASE_STORAGE_BUCKET, safe="")
        url = f"{settings.SUPABASE_URL.rstrip('/')}/storage/v1/object/{bucket}"
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.request(
                "DELETE",
                url,
                json={"prefixes": safe_keys},
                headers={**self._headers(), "Content-Type": "application/json"},
            )
        response.raise_for_status()


object_storage = ObjectStorage()
