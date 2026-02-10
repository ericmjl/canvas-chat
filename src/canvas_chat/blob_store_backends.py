"""
Pluggable Blob Store Backends.

This module provides an abstract base class and registry for blob store backends.
Backends can be registered via configuration or programmatically.

Built-in backends:
- LocalBlobStoreBackend: Stores blobs on local filesystem (default)

Example backends (not included, require additional dependencies):
- S3BlobStoreBackend: AWS S3 storage
- GCSBlobStoreBackend: Google Cloud Storage
- AzureBlobStoreBackend: Azure Blob Storage

Usage:
    # Register a custom backend
    from canvas_chat.blob_store_backends import BlobStoreRegistry, BlobStoreBackend

    class MyBackend(BlobStoreBackend):
        ...

    BlobStoreRegistry.register('my-backend', MyBackend)

    # Use via config.yaml:
    # blobStore:
    #   type: my-backend
    #   config:
    #     custom_option: value
"""

import json
import logging
import os
import shutil
import time
import uuid
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, BinaryIO

logger = logging.getLogger(__name__)


# =============================================================================
# Data Types
# =============================================================================


@dataclass
class BlobMetadata:
    """Metadata for a stored blob."""

    id: str
    filename: str
    mime_type: str
    size: int
    created_at: float
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "filename": self.filename,
            "mimeType": self.mime_type,
            "size": self.size,
            "createdAt": self.created_at,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "BlobMetadata":
        """Create from dictionary."""
        return cls(
            id=data["id"],
            filename=data["filename"],
            mime_type=data.get(
                "mimeType", data.get("mime_type", "application/octet-stream")
            ),
            size=data["size"],
            created_at=data.get("createdAt", data.get("created_at", time.time())),
            metadata=data.get("metadata", {}),
        )


@dataclass
class StorageStats:
    """Storage statistics."""

    total_blobs: int
    total_size: int
    oldest_blob: float | None = None
    newest_blob: float | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "totalBlobs": self.total_blobs,
            "totalSize": self.total_size,
            "oldestBlob": self.oldest_blob,
            "newestBlob": self.newest_blob,
        }


@dataclass
class SignedUrlResult:
    """Result of generating a signed URL."""

    url: str
    expires_at: float
    method: str = "GET"  # GET for download, PUT for upload


# =============================================================================
# Abstract Base Class
# =============================================================================


class BlobStoreBackend(ABC):
    """
    Abstract base class for blob store backends.

    All blob store backends must implement these methods to be usable
    with the Canvas Chat blob storage system.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Return the name of this backend."""
        pass

    @abstractmethod
    async def initialize(self, config: dict[str, Any]) -> None:
        """
        Initialize the backend with configuration.

        Called once when the backend is first used.

        Args:
            config: Backend-specific configuration from config.yaml
        """
        pass

    @abstractmethod
    async def store(
        self,
        data: bytes | BinaryIO,
        blob_id: str | None = None,
        filename: str = "blob",
        mime_type: str = "application/octet-stream",
        metadata: dict[str, Any] | None = None,
    ) -> BlobMetadata:
        """
        Store a blob.

        Args:
            data: The blob data (bytes or file-like object)
            blob_id: Optional ID (generated if not provided)
            filename: Original filename
            mime_type: MIME type of the data
            metadata: Optional additional metadata

        Returns:
            BlobMetadata for the stored blob
        """
        pass

    @abstractmethod
    async def retrieve(self, blob_id: str) -> tuple[bytes, BlobMetadata]:
        """
        Retrieve a blob by ID.

        Args:
            blob_id: The blob ID

        Returns:
            Tuple of (data bytes, metadata)

        Raises:
            KeyError: If blob not found
        """
        pass

    @abstractmethod
    async def get_metadata(self, blob_id: str) -> BlobMetadata:
        """
        Get metadata for a blob without retrieving the data.

        Args:
            blob_id: The blob ID

        Returns:
            BlobMetadata

        Raises:
            KeyError: If blob not found
        """
        pass

    @abstractmethod
    async def delete(self, blob_id: str) -> bool:
        """
        Delete a blob.

        Args:
            blob_id: The blob ID

        Returns:
            True if deleted, False if not found
        """
        pass

    @abstractmethod
    async def exists(self, blob_id: str) -> bool:
        """
        Check if a blob exists.

        Args:
            blob_id: The blob ID

        Returns:
            True if exists
        """
        pass

    @abstractmethod
    async def list_blobs(
        self,
        prefix: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[BlobMetadata]:
        """
        List blobs with optional filtering.

        Args:
            prefix: Optional ID prefix filter
            limit: Maximum number of results
            offset: Offset for pagination

        Returns:
            List of BlobMetadata
        """
        pass

    @abstractmethod
    async def get_stats(self) -> StorageStats:
        """
        Get storage statistics.

        Returns:
            StorageStats
        """
        pass

    async def create_signed_url(
        self,
        blob_id: str,
        expires_in: int = 3600,
        method: str = "GET",
    ) -> SignedUrlResult | None:
        """
        Create a signed URL for direct access (optional).

        Not all backends support this. Cloud backends (S3, GCS, Azure)
        typically do, while local filesystem does not.

        Args:
            blob_id: The blob ID
            expires_in: URL validity in seconds
            method: HTTP method (GET for download, PUT for upload)

        Returns:
            SignedUrlResult or None if not supported
        """
        return None

    async def create_upload_url(
        self,
        blob_id: str | None = None,
        filename: str = "blob",
        mime_type: str = "application/octet-stream",
        expires_in: int = 3600,
    ) -> tuple[str, SignedUrlResult] | None:
        """
        Create a pre-signed URL for direct upload (optional).

        For backends that support direct upload (S3, GCS, Azure),
        this bypasses the server and uploads directly to storage.

        Args:
            blob_id: Optional blob ID (generated if not provided)
            filename: Original filename
            mime_type: MIME type
            expires_in: URL validity in seconds

        Returns:
            Tuple of (blob_id, SignedUrlResult) or None if not supported
        """
        return None

    async def stream(
        self, blob_id: str, chunk_size: int = 8192
    ) -> AsyncIterator[bytes]:
        """
        Stream blob data in chunks (optional optimization).

        Default implementation loads entire blob into memory.
        Backends can override for more efficient streaming.

        Args:
            blob_id: The blob ID
            chunk_size: Size of each chunk

        Yields:
            Chunks of blob data
        """
        data, _ = await self.retrieve(blob_id)
        for i in range(0, len(data), chunk_size):
            yield data[i : i + chunk_size]

    @abstractmethod
    async def shutdown(self) -> None:
        """
        Cleanup when the backend is being shut down.

        Override to release resources, close connections, etc.
        """
        pass


# =============================================================================
# Local Filesystem Backend
# =============================================================================


class LocalBlobStoreBackend(BlobStoreBackend):
    """
    Local filesystem blob store backend.

    Stores blobs in a directory structure with metadata in JSON files.
    This is the default backend and requires no external dependencies.

    Config options:
        storage_dir: Directory path (default: ~/.canvas-chat/blobs)
    """

    def __init__(self):
        self.storage_dir: Path | None = None
        self.metadata_dir: Path | None = None
        self._initialized = False

    @property
    def name(self) -> str:
        return "local"

    async def initialize(self, config: dict[str, Any]) -> None:
        if self._initialized:
            return

        storage_path = config.get("storage_dir", "~/.canvas-chat/blobs")
        self.storage_dir = Path(os.path.expanduser(storage_path))
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        self.metadata_dir = self.storage_dir / ".metadata"
        self.metadata_dir.mkdir(parents=True, exist_ok=True)

        self._initialized = True
        logger.info(f"[LocalBlobStore] Initialized with storage_dir={self.storage_dir}")

    async def shutdown(self) -> None:
        pass

    def _blob_path(self, blob_id: str) -> Path:
        """Get the file path for a blob (sharded by first 2 chars)."""
        subdir = blob_id[:2] if len(blob_id) >= 2 else "00"
        return self.storage_dir / subdir / blob_id

    def _metadata_path(self, blob_id: str) -> Path:
        """Get the metadata file path for a blob."""
        return self.metadata_dir / f"{blob_id}.json"

    async def store(
        self,
        data: bytes | BinaryIO,
        blob_id: str | None = None,
        filename: str = "blob",
        mime_type: str = "application/octet-stream",
        metadata: dict[str, Any] | None = None,
    ) -> BlobMetadata:
        if not self._initialized:
            raise RuntimeError("Backend not initialized")

        blob_id = blob_id or str(uuid.uuid4())
        blob_path = self._blob_path(blob_id)
        blob_path.parent.mkdir(parents=True, exist_ok=True)

        # Write blob data
        if isinstance(data, bytes):
            blob_path.write_bytes(data)
            size = len(data)
        else:
            with open(blob_path, "wb") as f:
                shutil.copyfileobj(data, f)
            size = blob_path.stat().st_size

        # Create metadata
        blob_metadata = BlobMetadata(
            id=blob_id,
            filename=filename,
            mime_type=mime_type,
            size=size,
            created_at=time.time(),
            metadata=metadata or {},
        )

        # Write metadata
        self._metadata_path(blob_id).write_text(json.dumps(blob_metadata.to_dict()))

        logger.debug(f"[LocalBlobStore] Stored blob {blob_id} ({size} bytes)")
        return blob_metadata

    async def retrieve(self, blob_id: str) -> tuple[bytes, BlobMetadata]:
        if not self._initialized:
            raise RuntimeError("Backend not initialized")

        blob_path = self._blob_path(blob_id)
        if not blob_path.exists():
            raise KeyError(f"Blob not found: {blob_id}")

        data = blob_path.read_bytes()
        metadata = await self.get_metadata(blob_id)
        return data, metadata

    async def get_metadata(self, blob_id: str) -> BlobMetadata:
        if not self._initialized:
            raise RuntimeError("Backend not initialized")

        metadata_path = self._metadata_path(blob_id)
        if not metadata_path.exists():
            raise KeyError(f"Blob not found: {blob_id}")

        return BlobMetadata.from_dict(json.loads(metadata_path.read_text()))

    async def delete(self, blob_id: str) -> bool:
        if not self._initialized:
            raise RuntimeError("Backend not initialized")

        blob_path = self._blob_path(blob_id)
        metadata_path = self._metadata_path(blob_id)

        deleted = False
        if blob_path.exists():
            blob_path.unlink()
            deleted = True
        if metadata_path.exists():
            metadata_path.unlink()
            deleted = True

        logger.debug(f"[LocalBlobStore] Deleted blob {blob_id}: {deleted}")
        return deleted

    async def exists(self, blob_id: str) -> bool:
        if not self._initialized:
            raise RuntimeError("Backend not initialized")
        return self._blob_path(blob_id).exists()

    async def list_blobs(
        self,
        prefix: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[BlobMetadata]:
        if not self._initialized:
            raise RuntimeError("Backend not initialized")

        results = []
        for metadata_file in sorted(self.metadata_dir.glob("*.json")):
            blob_id = metadata_file.stem
            if prefix and not blob_id.startswith(prefix):
                continue

            try:
                metadata = BlobMetadata.from_dict(json.loads(metadata_file.read_text()))
                results.append(metadata)
            except (json.JSONDecodeError, KeyError):
                continue

        # Sort by creation time (newest first) and apply pagination
        results.sort(key=lambda m: m.created_at, reverse=True)
        return results[offset : offset + limit]

    async def get_stats(self) -> StorageStats:
        if not self._initialized:
            raise RuntimeError("Backend not initialized")

        total_blobs = 0
        total_size = 0
        oldest = None
        newest = None

        for metadata_file in self.metadata_dir.glob("*.json"):
            try:
                metadata = BlobMetadata.from_dict(json.loads(metadata_file.read_text()))
                total_blobs += 1
                total_size += metadata.size
                if oldest is None or metadata.created_at < oldest:
                    oldest = metadata.created_at
                if newest is None or metadata.created_at > newest:
                    newest = metadata.created_at
            except (json.JSONDecodeError, KeyError):
                continue

        return StorageStats(
            total_blobs=total_blobs,
            total_size=total_size,
            oldest_blob=oldest,
            newest_blob=newest,
        )

    async def stream(
        self, blob_id: str, chunk_size: int = 8192
    ) -> AsyncIterator[bytes]:
        if not self._initialized:
            raise RuntimeError("Backend not initialized")

        blob_path = self._blob_path(blob_id)
        if not blob_path.exists():
            raise KeyError(f"Blob not found: {blob_id}")

        with open(blob_path, "rb") as f:
            while chunk := f.read(chunk_size):
                yield chunk


# =============================================================================
# S3 Backend (Example - requires boto3)
# =============================================================================


class S3BlobStoreBackend(BlobStoreBackend):
    """
    AWS S3 blob store backend.

    This is an example implementation showing how cloud backends work.
    Requires boto3: pip install boto3

    Config options:
        bucket: S3 bucket name (required)
        region: AWS region (default: us-east-1)
        prefix: Key prefix for all blobs (default: blobs/)
        # Credentials from environment: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY

    Features:
        - Pre-signed URLs for direct upload/download
        - Efficient streaming
        - Automatic retry on failures
    """

    def __init__(self):
        self.bucket: str | None = None
        self.region: str = "us-east-1"
        self.prefix: str = "blobs/"
        self.s3_client = None
        self._initialized = False

    @property
    def name(self) -> str:
        return "s3"

    async def initialize(self, config: dict[str, Any]) -> None:
        if self._initialized:
            return

        try:
            import boto3
            from botocore.config import Config as BotoConfig
        except ImportError as err:
            raise ImportError("S3 backend requires boto3: pip install boto3") from err

        self.bucket = config.get("bucket")
        if not self.bucket:
            raise ValueError("S3 backend requires 'bucket' in config")

        self.region = config.get("region", "us-east-1")
        self.prefix = config.get("prefix", "blobs/")

        self.s3_client = boto3.client(
            "s3",
            region_name=self.region,
            config=BotoConfig(signature_version="s3v4"),
        )

        self._initialized = True
        logger.info(
            f"[S3BlobStore] Initialized with bucket={self.bucket}, region={self.region}"
        )

    async def shutdown(self) -> None:
        pass

    def _key(self, blob_id: str) -> str:
        """Get the S3 key for a blob."""
        return f"{self.prefix}{blob_id}"

    def _metadata_key(self, blob_id: str) -> str:
        """Get the S3 key for blob metadata."""
        return f"{self.prefix}.metadata/{blob_id}.json"

    async def store(
        self,
        data: bytes | BinaryIO,
        blob_id: str | None = None,
        filename: str = "blob",
        mime_type: str = "application/octet-stream",
        metadata: dict[str, Any] | None = None,
    ) -> BlobMetadata:
        if not self._initialized:
            raise RuntimeError("Backend not initialized")

        blob_id = blob_id or str(uuid.uuid4())

        # Prepare data
        if isinstance(data, bytes):
            body = data
            size = len(data)
        else:
            body = data.read()
            size = len(body)

        # Upload blob
        self.s3_client.put_object(
            Bucket=self.bucket,
            Key=self._key(blob_id),
            Body=body,
            ContentType=mime_type,
            Metadata={"filename": filename},
        )

        # Create and upload metadata
        blob_metadata = BlobMetadata(
            id=blob_id,
            filename=filename,
            mime_type=mime_type,
            size=size,
            created_at=time.time(),
            metadata=metadata or {},
        )

        self.s3_client.put_object(
            Bucket=self.bucket,
            Key=self._metadata_key(blob_id),
            Body=json.dumps(blob_metadata.to_dict()),
            ContentType="application/json",
        )

        logger.debug(f"[S3BlobStore] Stored blob {blob_id} ({size} bytes)")
        return blob_metadata

    async def retrieve(self, blob_id: str) -> tuple[bytes, BlobMetadata]:
        if not self._initialized:
            raise RuntimeError("Backend not initialized")

        try:
            response = self.s3_client.get_object(
                Bucket=self.bucket, Key=self._key(blob_id)
            )
            data = response["Body"].read()
            metadata = await self.get_metadata(blob_id)
            return data, metadata
        except self.s3_client.exceptions.NoSuchKey as err:
            raise KeyError(f"Blob not found: {blob_id}") from err

    async def get_metadata(self, blob_id: str) -> BlobMetadata:
        if not self._initialized:
            raise RuntimeError("Backend not initialized")

        try:
            response = self.s3_client.get_object(
                Bucket=self.bucket, Key=self._metadata_key(blob_id)
            )
            data = json.loads(response["Body"].read())
            return BlobMetadata.from_dict(data)
        except self.s3_client.exceptions.NoSuchKey as err:
            raise KeyError(f"Blob not found: {blob_id}") from err

    async def delete(self, blob_id: str) -> bool:
        if not self._initialized:
            raise RuntimeError("Backend not initialized")

        try:
            self.s3_client.delete_object(Bucket=self.bucket, Key=self._key(blob_id))
            self.s3_client.delete_object(
                Bucket=self.bucket, Key=self._metadata_key(blob_id)
            )
            logger.debug(f"[S3BlobStore] Deleted blob {blob_id}")
            return True
        except Exception:
            return False

    async def exists(self, blob_id: str) -> bool:
        if not self._initialized:
            raise RuntimeError("Backend not initialized")

        try:
            self.s3_client.head_object(Bucket=self.bucket, Key=self._key(blob_id))
            return True
        except Exception:
            return False

    async def list_blobs(
        self,
        prefix: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[BlobMetadata]:
        if not self._initialized:
            raise RuntimeError("Backend not initialized")

        search_prefix = f"{self.prefix}.metadata/"
        if prefix:
            search_prefix += prefix

        results = []
        paginator = self.s3_client.get_paginator("list_objects_v2")

        for page in paginator.paginate(Bucket=self.bucket, Prefix=search_prefix):
            for obj in page.get("Contents", []):
                if not obj["Key"].endswith(".json"):
                    continue
                try:
                    response = self.s3_client.get_object(
                        Bucket=self.bucket, Key=obj["Key"]
                    )
                    data = json.loads(response["Body"].read())
                    results.append(BlobMetadata.from_dict(data))
                except Exception:
                    continue

        # Sort and paginate
        results.sort(key=lambda m: m.created_at, reverse=True)
        return results[offset : offset + limit]

    async def get_stats(self) -> StorageStats:
        if not self._initialized:
            raise RuntimeError("Backend not initialized")

        blobs = await self.list_blobs(limit=10000)  # Get all for stats
        if not blobs:
            return StorageStats(total_blobs=0, total_size=0)

        return StorageStats(
            total_blobs=len(blobs),
            total_size=sum(b.size for b in blobs),
            oldest_blob=min(b.created_at for b in blobs),
            newest_blob=max(b.created_at for b in blobs),
        )

    async def create_signed_url(
        self,
        blob_id: str,
        expires_in: int = 3600,
        method: str = "GET",
    ) -> SignedUrlResult | None:
        if not self._initialized:
            raise RuntimeError("Backend not initialized")

        operation = "get_object" if method == "GET" else "put_object"
        url = self.s3_client.generate_presigned_url(
            operation,
            Params={"Bucket": self.bucket, "Key": self._key(blob_id)},
            ExpiresIn=expires_in,
        )

        return SignedUrlResult(
            url=url,
            expires_at=time.time() + expires_in,
            method=method,
        )

    async def create_upload_url(
        self,
        blob_id: str | None = None,
        filename: str = "blob",
        mime_type: str = "application/octet-stream",
        expires_in: int = 3600,
    ) -> tuple[str, SignedUrlResult] | None:
        if not self._initialized:
            raise RuntimeError("Backend not initialized")

        blob_id = blob_id or str(uuid.uuid4())

        url = self.s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self.bucket,
                "Key": self._key(blob_id),
                "ContentType": mime_type,
            },
            ExpiresIn=expires_in,
        )

        return blob_id, SignedUrlResult(
            url=url,
            expires_at=time.time() + expires_in,
            method="PUT",
        )


# =============================================================================
# Backend Registry
# =============================================================================


class BlobStoreRegistry:
    """
    Registry for blob store backends.

    Provides a singleton registry where backends can be registered
    and looked up by name. The active backend is selected via configuration.
    """

    _instance: "BlobStoreRegistry | None" = None
    _backends: dict[str, type[BlobStoreBackend]] = {}
    _active_backend: BlobStoreBackend | None = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            # Register built-in backends
            cls._backends = {
                "local": LocalBlobStoreBackend,
                "s3": S3BlobStoreBackend,
            }
        return cls._instance

    @classmethod
    def register(cls, name: str, backend_class: type[BlobStoreBackend]) -> None:
        """
        Register a blob store backend.

        Args:
            name: Backend name (used in config.yaml)
            backend_class: Backend class (must extend BlobStoreBackend)
        """
        instance = cls()
        instance._backends[name] = backend_class
        logger.info(f"[BlobStoreRegistry] Registered backend: {name}")

    @classmethod
    def get_backend_class(cls, name: str) -> type[BlobStoreBackend] | None:
        """Get a registered backend class by name."""
        instance = cls()
        return instance._backends.get(name)

    @classmethod
    def list_backends(cls) -> list[str]:
        """List all registered backend names."""
        instance = cls()
        return list(instance._backends.keys())

    @classmethod
    async def get_active(cls) -> BlobStoreBackend:
        """
        Get the active backend instance.

        Creates and initializes the backend on first call based on config.
        """
        instance = cls()
        if instance._active_backend is None:
            # Default to local if not configured
            instance._active_backend = LocalBlobStoreBackend()
            await instance._active_backend.initialize({})
        return instance._active_backend

    @classmethod
    async def set_active(
        cls, backend_type: str, config: dict[str, Any]
    ) -> BlobStoreBackend:
        """
        Set the active backend.

        Args:
            backend_type: Backend name (must be registered)
            config: Backend configuration

        Returns:
            The initialized backend instance
        """
        instance = cls()

        backend_class = instance._backends.get(backend_type)
        if not backend_class:
            available = ", ".join(instance._backends.keys())
            raise ValueError(
                f"Unknown blob store backend: {backend_type}. Available: {available}"
            )

        backend = backend_class()
        await backend.initialize(config)
        instance._active_backend = backend

        logger.info(f"[BlobStoreRegistry] Set active backend: {backend_type}")
        return backend

    @classmethod
    async def shutdown(cls) -> None:
        """Shutdown the active backend."""
        instance = cls()
        if instance._active_backend:
            await instance._active_backend.shutdown()
            instance._active_backend = None


# =============================================================================
# Configuration Helper
# =============================================================================


async def configure_blob_store_from_config(config: dict[str, Any]) -> BlobStoreBackend:
    """
    Configure blob store from application config.

    Expected config format:
    ```yaml
    blobStore:
      type: local  # or s3, gcs, azure, etc.
      config:
        storage_dir: ~/.canvas-chat/blobs  # local-specific
        bucket: my-bucket                   # s3-specific
        region: us-west-2                   # s3-specific
    ```

    Args:
        config: Application configuration dictionary

    Returns:
        Configured and initialized backend
    """
    blob_config = config.get("blobStore", {})
    backend_type = blob_config.get("type", "local")
    backend_config = blob_config.get("config", {})

    return await BlobStoreRegistry.set_active(backend_type, backend_config)
