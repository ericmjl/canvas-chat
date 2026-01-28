"""
Modal deployment for Canvas Chat.

Deploy with:
    modal deploy modal_app.py

Run locally with Modal:
    modal serve modal_app.py

Note: This app uses a local-first architecture where users provide their own
API keys via the UI. No server-side secrets are required.
"""

import modal

# Create the Modal app
app = modal.App("canvas-chat")

# Define the image with all dependencies
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "libreoffice-impress",
        "libreoffice-common",
        "fonts-dejavu-core",
        "libwebp7",
    )
    .pip_install(
        "fastapi[standard]>=0.115.0",
        "uvicorn>=0.32.0",
        "litellm>=1.50.0",
        "sse-starlette>=2.0.0",
        "pydantic>=2.0.0",
        "exa-py>=1.0.0",
        "pymupdf>=1.24.0",
        "pillow>=12.1.0,<13",
        "python-pptx>=1.0.0",
        "python-slugify",
        "python-multipart>=0.0.9",
        "html2text>=2024.0.0",
        "ruamel.yaml>=0.18.0",
        "youtube-transcript-api>=1.2.3,<2",
    )
    .add_local_dir("src/canvas_chat", remote_path="/app/canvas_chat")
    .add_local_file("pyproject.toml", remote_path="/app/pyproject.toml")
)


@app.function(
    image=image,
    scaledown_window=300,
    secrets=[modal.Secret.from_name("canvas-chat-secrets")],
)
@modal.concurrent(max_inputs=100)
@modal.asgi_app()
def fastapi_app():
    """Serve the FastAPI application."""
    import sys

    sys.path.insert(0, "/app")

    from canvas_chat.app import app as canvas_app

    return canvas_app
