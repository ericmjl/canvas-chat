"""CLI entry point for canvas-chat."""

import socket
import threading
import time
import webbrowser

import typer
import uvicorn

app = typer.Typer(
    name="canvas-chat",
    help="A visual, non-linear chat interface where conversations are nodes on an infinite canvas.",
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
def main(
    port: int = typer.Option(7865, "--port", help="Port to run the server on"),
    host: str = typer.Option("127.0.0.1", "--host", help="Host to bind to"),
    no_browser: bool = typer.Option(
        False, "--no-browser", help="Don't open browser automatically"
    ),
) -> None:
    """Run the Canvas Chat server."""
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


if __name__ == "__main__":
    app()
