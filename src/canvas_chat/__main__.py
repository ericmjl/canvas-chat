"""CLI entry point for canvas-chat."""

import argparse
import socket
import threading
import time
import webbrowser

import uvicorn


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


def main() -> None:
    """Run the Canvas Chat server."""
    parser = argparse.ArgumentParser(
        description="Canvas Chat - A visual, non-linear chat interface"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=7865,
        help="Port to run the server on (default: 7865)",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host to bind to (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Don't open browser automatically",
    )
    args = parser.parse_args()

    url = f"http://{args.host}:{args.port}"
    print(f"Starting Canvas Chat at {url}")

    if not args.no_browser:
        # Start a background thread to open browser once server is ready
        browser_thread = threading.Thread(
            target=open_browser_when_ready,
            args=(args.host, args.port),
            daemon=True,
        )
        browser_thread.start()

    uvicorn.run(
        "canvas_chat.app:app",
        host=args.host,
        port=args.port,
    )


if __name__ == "__main__":
    main()
