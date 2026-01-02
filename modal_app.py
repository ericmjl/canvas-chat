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

# Define the image using pixi for environment management
image = (
    modal.Image.debian_slim(python_version="3.11")
    # Install pixi
    .run_commands("curl -fsSL https://pixi.sh/install.sh | bash")
    .env({"PATH": "/root/.pixi/bin:$PATH"})
    # Copy project files needed for pixi install
    .add_local_file("pyproject.toml", remote_path="/app/pyproject.toml")
    .add_local_file("pixi.lock", remote_path="/app/pixi.lock")
    .add_local_dir("src", remote_path="/app/src")
    # Install dependencies using pixi
    .run_commands(
        "cd /app && /root/.pixi/bin/pixi install --locked",
    )
)


@app.function(
    image=image,
    scaledown_window=300,
)
@modal.concurrent(max_inputs=100)
@modal.asgi_app()
def fastapi_app():
    """Serve the FastAPI application."""
    import subprocess
    import sys

    # Get the pixi environment's Python path and add it to sys.path
    result = subprocess.run(
        [
            "/root/.pixi/bin/pixi",
            "run",
            "-e",
            "default",
            "python",
            "-c",
            "import sys; print(':'.join(sys.path))",
        ],
        capture_output=True,
        text=True,
        cwd="/app",
    )
    for path in result.stdout.strip().split(":"):
        if path and path not in sys.path:
            sys.path.insert(0, path)

    from canvas_chat.app import app as canvas_app

    return canvas_app
