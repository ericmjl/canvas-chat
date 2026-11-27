"""Unit tests for the CLI browser-URL mapping (#293 Part A). No network needed."""

from unittest.mock import patch

import pytest

from canvas_chat.__main__ import browser_url_for, open_browser_when_ready

# --- browser_url_for ---


@pytest.mark.parametrize(
    ("host", "expected"),
    [
        ("localhost", "http://localhost:7865"),
        ("127.0.0.1", "http://localhost:7865"),
        ("0.0.0.0", "http://localhost:7865"),
        ("::1", "http://localhost:7865"),
        ("[::1]", "http://localhost:7865"),
        ("LOCALHOST", "http://localhost:7865"),
    ],
)
def test_browser_url_for_loopback_binds_map_to_localhost(host, expected):
    """Every loopback literal opens the browser on the canonical origin."""
    assert browser_url_for(host, 7865) == expected


@pytest.mark.parametrize(
    ("host", "expected"),
    [
        ("192.168.1.20", "http://192.168.1.20:7865"),
        ("10.0.0.3", "http://10.0.0.3:7865"),
        ("mybox.tailnet.ts.net", "http://mybox.tailnet.ts.net:7865"),
    ],
)
def test_browser_url_for_non_loopback_hosts_are_never_rewritten(host, expected):
    """LAN IPs, tailnet IPs and custom hostnames stay exactly as bound."""
    assert browser_url_for(host, 7865) == expected


def test_browser_url_for_preserves_port():
    """The port is passed through unchanged."""
    assert browser_url_for("0.0.0.0", 9000) == "http://localhost:9000"


# --- open_browser_when_ready ---


def test_open_browser_when_ready_opens_localhost_for_any_loopback_bind():
    """The browser thread opens the canonical URL even when bound to 0.0.0.0."""
    opened = []
    with (
        patch("canvas_chat.__main__.wait_for_server", return_value=True),
        patch("canvas_chat.__main__.webbrowser.open", side_effect=opened.append),
    ):
        open_browser_when_ready("0.0.0.0", 7865)

    assert opened == ["http://localhost:7865"]


def test_open_browser_when_ready_does_nothing_when_server_never_comes_up():
    """No browser is opened if the server did not start."""
    opened = []
    with (
        patch("canvas_chat.__main__.wait_for_server", return_value=False),
        patch("canvas_chat.__main__.webbrowser.open", side_effect=opened.append),
    ):
        open_browser_when_ready("127.0.0.1", 7865)

    assert opened == []
