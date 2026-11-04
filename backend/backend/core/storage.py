from __future__ import annotations
import os
import posixpath
from datetime import datetime, timezone
from urllib.parse import unquote, urlparse

from dotenv import load_dotenv
from werkzeug.utils import secure_filename

try:
    import boto3
except Exception:  # pragma: no cover - dependency guard
    boto3 = None


PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
load_dotenv(os.path.join(PROJECT_ROOT, ".env"), override=False)
load_dotenv(os.path.join(BACKEND_DIR, ".env"), override=True)

BUCKET_URL = (os.getenv("BUCKET_URL") or "").strip()


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")


def _normalize_s3_parts(storage_path: str):
    parsed = urlparse(storage_path)
    if parsed.scheme != "s3":
        return None, None
    bucket = parsed.netloc
    key = parsed.path.lstrip("/")
    return bucket, key


class ObjectStorage:
    def __init__(self):
        self.bucket = None
        self.prefix = ""
        self.client = None
        self.local_base = os.path.join(PROJECT_ROOT, "uploads")

        if not BUCKET_URL or boto3 is None:
            return

        parsed = urlparse(BUCKET_URL)
        access_key = os.getenv("AWS_ACCESS_KEY_ID")
        secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
        region = os.getenv("AWS_REGION", "us-east-1")
        endpoint_url = (os.getenv("S3_ENDPOINT_URL") or "").strip() or None
        bucket_from_env = (
            os.getenv("BUCKET_NAME")
            or os.getenv("S3_BUCKET")
            or os.getenv("S3_BUCKET_NAME")
            or os.getenv("AWS_S3_BUCKET")
        )

        if parsed.scheme == "s3":
            self.bucket = parsed.netloc
            self.prefix = parsed.path.strip("/")
        elif parsed.scheme in ("http", "https"):
            path_parts = [part for part in parsed.path.split("/") if part]
            host = parsed.hostname or ""
            host_parts = host.split(".") if host else []

            if path_parts:
                # Path-style URL: https://endpoint/<bucket>/<optional-prefix>
                self.bucket = path_parts[0]
                self.prefix = "/".join(path_parts[1:])
                endpoint_url = endpoint_url or f"{parsed.scheme}://{host}"
                if parsed.port:
                    endpoint_url = f"{endpoint_url}:{parsed.port}"
            elif bucket_from_env:
                # Endpoint-only URL with explicit bucket in env.
                self.bucket = bucket_from_env
                self.prefix = ""
                endpoint_url = endpoint_url or f"{parsed.scheme}://{host}"
                if parsed.port:
                    endpoint_url = f"{endpoint_url}:{parsed.port}"
            elif (
                os.getenv("S3_VIRTUAL_HOSTED", "").strip().lower() == "true"
                and len(host_parts) >= 3
                and host_parts[0] not in {"s3", "storage", "minio"}
            ):
                # Virtual-host style URL: https://<bucket>.<endpoint>
                self.bucket = host_parts[0]
                self.prefix = ""
                endpoint_host = ".".join(host_parts[1:])
                endpoint_url = endpoint_url or f"{parsed.scheme}://{endpoint_host}"
                if parsed.port:
                    endpoint_url = f"{endpoint_url}:{parsed.port}"
            else:
                raise ValueError(
                    "BUCKET_URL is missing bucket information. Use one of: "
                    "s3://<bucket>/<prefix>, https://<endpoint>/<bucket>/<prefix>, "
                    "or set BUCKET_NAME/S3_BUCKET with endpoint-style BUCKET_URL."
                )

            if parsed.username:
                access_key = access_key or unquote(parsed.username)
            if parsed.password:
                secret_key = secret_key or unquote(parsed.password)
        else:
            raise ValueError("BUCKET_URL must use s3://, http://, or https://")

        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
        )

    def _compose_key(self, doc_type: str, file_name: str) -> str:
        safe_name = secure_filename(file_name or "") or "document.bin"
        key = posixpath.join(doc_type, f"{_timestamp()}_{safe_name}")
        if self.prefix:
            return posixpath.join(self.prefix, key)
        return key

    def store(
        self, doc_type: str, file_name: str, data: bytes, mime_type: str | None = None
    ) -> str:
        key = self._compose_key(doc_type, file_name)
        args = {"Bucket": self.bucket, "Key": key, "Body": data}
        if mime_type:
            args["ContentType"] = mime_type
        try:
            if self.client is None:
                # No BUCKET_URL configured: local disk is the store, not a fallback.
                raise RuntimeError("object storage not configured")
            self.client.put_object(**args)
            return f"s3://{self.bucket}/{key}"
        except Exception:
            # Keep uploads working in local/dev/test even when remote object storage is unreachable.
            folder = os.path.join(self.local_base, doc_type)
            os.makedirs(folder, exist_ok=True)
            safe_name = secure_filename(file_name or "") or "document.bin"
            local_name = f"{_timestamp()}_{safe_name}"
            file_path = os.path.join(folder, local_name)
            with open(file_path, "wb") as out:
                out.write(data)
            return file_path

    def read(self, storage_path: str):
        if not storage_path:
            return None
        if not storage_path.startswith("s3://"):
            # Local-fallback path (see store()'s exception handler).
            try:
                with open(storage_path, "rb") as f:
                    return f.read()
            except OSError:
                return None
        bucket, key = _normalize_s3_parts(storage_path)
        if not bucket or not key:
            return None
        try:
            obj = self.client.get_object(Bucket=bucket, Key=key)
            return obj["Body"].read()
        except Exception:
            return None

    def delete(self, storage_path: str):
        if not storage_path:
            return
        if not storage_path.startswith("s3://"):
            # Local-fallback path (see store()'s exception handler).
            try:
                os.remove(storage_path)
            except OSError:
                pass
            return
        bucket, key = _normalize_s3_parts(storage_path)
        if not bucket or not key:
            return
        try:
            self.client.delete_object(Bucket=bucket, Key=key)
        except Exception:
            return
