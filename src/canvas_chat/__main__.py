"""CLI entry point for canvas-chat."""

import os
import socket
import threading
import time
import webbrowser
from pathlib import Path

import typer
import uvicorn

from canvas_chat import __version__
from canvas_chat.config import AppConfig

app = typer.Typer(
    name="canvas-chat",
    help=(
        "A visual, non-linear chat interface where conversations are "
        "nodes on an infinite canvas."
    ),
    add_completion=False,
)


def wait_for_server(host: str, port: int, timeout: float = 10.0) -> bool:
    """Wait for the server to start accepting connections."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return True
        except (ConnectionRefusedError, OSError):
            time.sleep(0.1)
    return False


def open_browser_when_ready(host: str, port: int) -> None:
    """Open browser once the server is ready."""
    if wait_for_server(host, port):
        url = f"http://{host}:{port}"
        webbrowser.open(url)


@app.command()
def version() -> None:
    """Show the version of canvas-chat."""
    typer.echo(__version__)


@app.command()
def launch(
    port: int = typer.Option(7865, "--port", help="Port to run the server on"),
    host: str = typer.Option("127.0.0.1", "--host", help="Host to bind to"),
    no_browser: bool = typer.Option(
        False, "--no-browser", help="Don't open browser automatically"
    ),
    config_path: str | None = typer.Option(
        None,
        "--config",
        help="Path to configuration file (models and plugins)",
    ),
    admin_mode: bool = typer.Option(
        False,
        "--admin-mode/--no-admin-mode",
        help="Enable admin mode (server-side API keys, hide user settings)",
    ),
) -> None:
    """Launch the Canvas Chat server."""
    # Load configuration if provided
    if config_path is not None:
        try:
            # Load config with or without admin mode
            config = AppConfig.load(Path(config_path), admin_mode=admin_mode)

            # Only validate environment in admin mode
            if admin_mode:
                config.validate_environment()
                typer.echo(
                    f"Admin mode enabled: {len(config.models)} models "
                    f"(server-side keys from {config._config_path})"
                )
            else:
                typer.echo(
                    f"Config loaded: {len(config.models)} models "
                    f"(users provide their own keys via UI)"
                )

            if config.plugins:
                typer.echo(f"Loaded {len(config.plugins)} plugin(s)")

            # Set environment variables for the FastAPI app to read
            os.environ["CANVAS_CHAT_CONFIG_PATH"] = str(config._config_path)
            if admin_mode:
                os.environ["CANVAS_CHAT_ADMIN_MODE"] = "true"
            else:
                os.environ.pop("CANVAS_CHAT_ADMIN_MODE", None)

        except FileNotFoundError as e:
            typer.echo(f"Error: {e}", err=True)
            raise typer.Exit(1) from e
        except ValueError as e:
            typer.echo(f"Configuration error: {e}", err=True)
            raise typer.Exit(1) from e
    else:
        # No config provided - clear any env vars
        os.environ.pop("CANVAS_CHAT_CONFIG_PATH", None)
        os.environ.pop("CANVAS_CHAT_ADMIN_MODE", None)

    url = f"http://{host}:{port}"
    typer.echo(f"Starting Canvas Chat at {url}")

    if not no_browser:
        browser_thread = threading.Thread(
            target=open_browser_when_ready,
            args=(host, port),
            daemon=True,
        )
        browser_thread.start()

    uvicorn.run(
        "canvas_chat.app:app",
        host=host,
        port=port,
    )


@app.command(hidden=True)
def main(
    port: int = typer.Option(7865, "--port", help="Port to run the server on"),
    host: str = typer.Option("127.0.0.1", "--host", help="Host to bind to"),
    no_browser: bool = typer.Option(
        False, "--no-browser", help="Don't open browser automatically"
    ),
    admin_mode: bool = typer.Option(
        False,
        "--admin-mode/--no-admin-mode",
        help="Enable admin mode with server-side API keys",
    ),
    config_path: str = typer.Option(
        "config.yaml",
        "--config",
        help="Path to configuration file (used with --admin-mode)",
    ),
) -> None:
    """Deprecated alias for 'launch' command."""
    typer.echo("⚠️  'main' command is deprecated, use 'launch' instead", err=True)
    launch(port, host, no_browser, config_path, admin_mode)


if __name__ == "__main__":
    app()
