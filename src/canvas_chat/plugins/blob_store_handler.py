"""
Blob Store Handler - Server-side blob storage API endpoints.

This module provides REST API endpoints for the ServerBlobStore JavaScript client.
Supports pluggable storage backends via BlobStoreRegistry.

Endpoints:
- POST /api/blobs - Upload a blob
- GET /api/blobs/{id} - Download a blob
- GET /api/blobs/{id}/metadata - Get blob metadata
- HEAD /api/blobs/{id}/metadata - Check if blob exists
- DELETE /api/blobs/{id} - Delete a blob
- GET /api/blobs - List blobs
- GET /api/blobs/stats - Get storage statistics
- POST /api/blobs/{id}/signed-url - Generate a signed URL (if backend supports)
- POST /api/blobs/presign-upload - Get pre-signed upload URL (if backend supports)

Storage backends:
- local: Local filesystem (default)
- s3: AWS S3 (requires boto3)
- gcs: Google Cloud Storage (not implemented)
- azure: Azure Blob Storage (not implemented)

Configure via config.yaml:
    blobStore:
      type: local  # or s3
      config:
        storage_dir: ~/.canvas-chat/blobs  # local-specific
        bucket: my-bucket                   # s3-specific
"""

import json
import logging
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from canvas_chat.blob_store_backends import (
    BlobStoreBackend,
    BlobStoreRegistry,
    configure_blob_store_from_config,
)

logger = logging.getLogger(__name__)


class BlobMetadataResponse(BaseModel):
    """Metadata response for API."""

    id: str
    filename: str
    mimeType: str
    size: int
    createdAt: float
    metadata: dict[str, Any] | None = None


class StorageStatsResponse(BaseModel):
    """Storage statistics response."""

    totalBlobs: int
    totalSize: int
    oldestBlob: float | None
    newestBlob: float | None


class SignedUrlResponse(BaseModel):
    """Signed URL response."""

    url: str
    expiresAt: float
    method: str


class UploadUrlResponse(BaseModel):
    """Pre-signed upload URL response."""

    blobId: str
    uploadUrl: str
    expiresAt: float


class BlobStoreHandler:
    """
    Handler that delegates to a pluggable blob store backend.

    This class provides the API layer on top of any registered backend.
    """

    def __init__(self, backend: BlobStoreBackend | None = None):
        """
        Initialize handler with optional backend.

        If no backend provided, uses the active backend from BlobStoreRegistry.
        """
        self._backend = backend
        self._initialized = False

    async def _get_backend(self) -> BlobStoreBackend:
        """Get the backend, initializing if needed."""
        if self._backend:
            return self._backend
        return await BlobStoreRegistry.get_active()

    async def store(
        self,
        file: UploadFile,
        blob_id: str | None = None,
        mime_type: str | None = None,
        metadata: dict | None = None,
    ) -> BlobMetadataResponse:
        """Store a blob via the active backend."""
        backend = await self._get_backend()

        # Read file content
        content = await file.read()
        content_type = mime_type or file.content_type or "application/octet-stream"

        try:
            result = await backend.store(
                data=content,
                blob_id=blob_id,
                filename=file.filename or "blob",
                mime_type=content_type,
                metadata=metadata,
            )

            return BlobMetadataResponse(
                id=result.id,
                filename=result.filename,
                mimeType=result.mime_type,
                size=result.size,
                createdAt=result.created_at,
                metadata=result.metadata,
            )
        except Exception as e:
            logger.error(f"Failed to store blob: {e}")
            raise HTTPException(
                status_code=500, detail=f"Failed to store blob: {e}"
            ) from e

    async def retrieve(self, blob_id: str) -> tuple[bytes, BlobMetadataResponse]:
        """Retrieve a blob via the active backend."""
        backend = await self._get_backend()

        try:
            data, metadata = await backend.retrieve(blob_id)
            return data, BlobMetadataResponse(
                id=metadata.id,
                filename=metadata.filename,
                mimeType=metadata.mime_type,
                size=metadata.size,
                createdAt=metadata.created_at,
                metadata=metadata.metadata,
            )
        except KeyError as err:
            raise HTTPException(status_code=404, detail="Blob not found") from err
        except Exception as e:
            logger.error(f"Failed to retrieve blob {blob_id}: {e}")
            raise HTTPException(
                status_code=500, detail=f"Failed to retrieve blob: {e}"
            ) from e

    async def get_metadata(self, blob_id: str) -> BlobMetadataResponse | None:
        """Get blob metadata via the active backend."""
        backend = await self._get_backend()

        try:
            metadata = await backend.get_metadata(blob_id)
            return BlobMetadataResponse(
                id=metadata.id,
                filename=metadata.filename,
                mimeType=metadata.mime_type,
                size=metadata.size,
                createdAt=metadata.created_at,
                metadata=metadata.metadata,
            )
        except KeyError:
            return None
        except Exception as e:
            logger.error(f"Failed to get metadata for {blob_id}: {e}")
            raise HTTPException(
                status_code=500, detail=f"Failed to get metadata: {e}"
            ) from e

    async def delete(self, blob_id: str) -> bool:
        """Delete a blob via the active backend."""
        backend = await self._get_backend()

        try:
            return await backend.delete(blob_id)
        except Exception as e:
            logger.error(f"Failed to delete blob {blob_id}: {e}")
            raise HTTPException(
                status_code=500, detail=f"Failed to delete blob: {e}"
            ) from e

    async def exists(self, blob_id: str) -> bool:
        """Check if blob exists via the active backend."""
        backend = await self._get_backend()

        try:
            return await backend.exists(blob_id)
        except Exception as e:
            logger.error(f"Failed to check blob {blob_id}: {e}")
            return False

    async def list_blobs(
        self,
        prefix: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[BlobMetadataResponse]:
        """List blobs via the active backend."""
        backend = await self._get_backend()

        try:
            results = await backend.list_blobs(
                prefix=prefix, limit=limit, offset=offset
            )
            return [
                BlobMetadataResponse(
                    id=m.id,
                    filename=m.filename,
                    mimeType=m.mime_type,
                    size=m.size,
                    createdAt=m.created_at,
                    metadata=m.metadata,
                )
                for m in results
            ]
        except Exception as e:
            logger.error(f"Failed to list blobs: {e}")
            raise HTTPException(
                status_code=500, detail=f"Failed to list blobs: {e}"
            ) from e

    async def get_stats(self) -> StorageStatsResponse:
        """Get storage stats via the active backend."""
        backend = await self._get_backend()

        try:
            stats = await backend.get_stats()
            return StorageStatsResponse(
                totalBlobs=stats.total_blobs,
                totalSize=stats.total_size,
                oldestBlob=stats.oldest_blob,
                newestBlob=stats.newest_blob,
            )
        except Exception as e:
            logger.error(f"Failed to get stats: {e}")
            raise HTTPException(
                status_code=500, detail=f"Failed to get stats: {e}"
            ) from e

    async def create_signed_url(
        self, blob_id: str, expires_in: int = 3600
    ) -> SignedUrlResponse | None:
        """Create a signed download URL if backend supports it."""
        backend = await self._get_backend()

        result = await backend.create_signed_url(blob_id, expires_in, "GET")
        if result is None:
            return None

        return SignedUrlResponse(
            url=result.url,
            expiresAt=result.expires_at,
            method=result.method,
        )

    async def create_upload_url(
        self,
        blob_id: str | None = None,
        filename: str = "blob",
        mime_type: str = "application/octet-stream",
        expires_in: int = 3600,
    ) -> UploadUrlResponse | None:
        """Create a pre-signed upload URL if backend supports it."""
        backend = await self._get_backend()

        result = await backend.create_upload_url(
            blob_id, filename, mime_type, expires_in
        )
        if result is None:
            return None

        return UploadUrlResponse(
            blobId=result[0],
            uploadUrl=result[1].url,
            expiresAt=result[1].expires_at,
        )

    async def stream(self, blob_id: str, chunk_size: int = 8192):
        """Stream blob data in chunks."""
        backend = await self._get_backend()

        try:
            async for chunk in backend.stream(blob_id, chunk_size):
                yield chunk
        except KeyError as err:
            raise HTTPException(status_code=404, detail="Blob not found") from err


# Singleton handler instance
_blob_handler: BlobStoreHandler | None = None
_config: dict[str, Any] = {}


async def initialize_blob_store(
    config: dict[str, Any] | None = None,
) -> BlobStoreHandler:
    """
    Initialize the blob store with configuration.

    Call this during app startup to configure the backend.

    Args:
        config: Application configuration with optional blobStore section

    Returns:
        Initialized BlobStoreHandler
    """
    global _blob_handler, _config

    if config:
        _config = config
        await configure_blob_store_from_config(config)

    _blob_handler = BlobStoreHandler()
    logger.info("Blob store handler initialized")
    return _blob_handler


def get_blob_handler() -> BlobStoreHandler:
    """Get or create the blob handler singleton."""
    global _blob_handler
    if _blob_handler is None:
        # Create with default backend (will be initialized lazily)
        _blob_handler = BlobStoreHandler()
    return _blob_handler


def register_endpoints(app: FastAPI) -> None:
    """Register blob storage API endpoints."""

    @app.post("/api/blobs", response_model=BlobMetadataResponse)
    async def upload_blob(
        file: UploadFile = File(...),  # noqa: B008 (FastAPI dependency injection)
        id: str | None = Form(None),
        mimeType: str | None = Form(None),
        metadata: str | None = Form(None),
    ):
        """Upload a blob."""
        handler = get_blob_handler()

        # Parse metadata JSON if provided
        parsed_metadata = None
        if metadata:
            try:
                parsed_metadata = json.loads(metadata)
            except json.JSONDecodeError as err:
                raise HTTPException(
                    status_code=400, detail="Invalid metadata JSON"
                ) from err

        return await handler.store(file, id, mimeType, parsed_metadata)

    @app.get("/api/blobs/{blob_id}")
    async def download_blob(blob_id: str):
        """Download a blob."""
        handler = get_blob_handler()
        data, metadata = await handler.retrieve(blob_id)

        return Response(
            content=data,
            media_type=metadata.mimeType,
            headers={
                "Content-Disposition": f'attachment; filename="{metadata.filename}"'
            },
        )

    @app.get("/api/blobs/{blob_id}/stream")
    async def stream_blob(blob_id: str):
        """Stream a blob (for large files)."""
        handler = get_blob_handler()
        metadata = await handler.get_metadata(blob_id)
        if metadata is None:
            raise HTTPException(status_code=404, detail="Blob not found")

        return StreamingResponse(
            handler.stream(blob_id),
            media_type=metadata.mimeType,
            headers={
                "Content-Disposition": f'attachment; filename="{metadata.filename}"'
            },
        )

    @app.get("/api/blobs/{blob_id}/metadata", response_model=BlobMetadataResponse)
    async def get_blob_metadata(blob_id: str):
        """Get blob metadata."""
        handler = get_blob_handler()
        metadata = await handler.get_metadata(blob_id)
        if metadata is None:
            raise HTTPException(status_code=404, detail="Blob not found")
        return metadata

    @app.head("/api/blobs/{blob_id}/metadata")
    async def check_blob_exists(blob_id: str):
        """Check if a blob exists."""
        handler = get_blob_handler()
        if not await handler.exists(blob_id):
            raise HTTPException(status_code=404, detail="Blob not found")
        return Response(status_code=200)

    @app.delete("/api/blobs/{blob_id}")
    async def delete_blob(blob_id: str):
        """Delete a blob."""
        handler = get_blob_handler()
        deleted = await handler.delete(blob_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Blob not found")
        return {"deleted": True}

    @app.get("/api/blobs", response_model=list[BlobMetadataResponse])
    async def list_blobs(
        prefix: str | None = Query(None),
        limit: int = Query(100, ge=1, le=1000),
        offset: int = Query(0, ge=0),
    ):
        """List blobs with optional filtering."""
        handler = get_blob_handler()
        return await handler.list_blobs(prefix, limit, offset)

    @app.get("/api/blobs/stats", response_model=StorageStatsResponse)
    async def get_storage_stats():
        """Get storage statistics."""
        handler = get_blob_handler()
        return await handler.get_stats()

    @app.post("/api/blobs/{blob_id}/signed-url")
    async def create_signed_url(blob_id: str, expiresIn: int = 3600):
        """
        Generate a signed URL for a blob (if backend supports it).

        For backends like S3, GCS, Azure, this returns a pre-signed URL
        that allows direct download without going through the server.
        """
        handler = get_blob_handler()
        if not await handler.exists(blob_id):
            raise HTTPException(status_code=404, detail="Blob not found")

        result = await handler.create_signed_url(blob_id, expiresIn)
        if result is None:
            # Backend doesn't support signed URLs, return direct URL
            return {"url": f"/api/blobs/{blob_id}", "supported": False}

        return {"url": result.url, "expiresAt": result.expiresAt, "supported": True}

    @app.post("/api/blobs/presign-upload")
    async def presign_upload(
        filename: str = "blob",
        mimeType: str = "application/octet-stream",
        expiresIn: int = 3600,
    ):
        """
        Get a pre-signed URL for direct upload (if backend supports it).

        For backends like S3, GCS, Azure, this returns a URL that allows
        the client to upload directly without going through the server.
        """
        handler = get_blob_handler()
        result = await handler.create_upload_url(None, filename, mimeType, expiresIn)

        if result is None:
            # Backend doesn't support pre-signed uploads
            return {"supported": False, "uploadUrl": "/api/blobs"}

        return {
            "supported": True,
            "blobId": result.blobId,
            "uploadUrl": result.uploadUrl,
            "expiresAt": result.expiresAt,
        }

    @app.get("/api/blobs/backends")
    async def list_backends():
        """List available blob store backends."""
        return {
            "available": BlobStoreRegistry.list_backends(),
            "active": (await BlobStoreRegistry.get_active()).name,
        }

    logger.info("Blob store endpoints registered")
