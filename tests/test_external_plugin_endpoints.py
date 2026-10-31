"""Tests for external Python plugins that register FastAPI routes."""

import logging
import sys

from fastapi.testclient import TestClient

from canvas_chat.app import app, load_python_plugins
from canvas_chat.config import AppConfig, PluginConfig

PING_PATH = "/api/test-external-plugin-ping"
AFTER_ERROR_PATH = "/api/test-external-plugin-after-error"


def write_plugin(directory, filename, source):
    """Write a temporary plugin module and return its path.

    :param directory: Directory that should contain the module.
    :param filename: Module filename.
    :param source: Python source for the module.
    :returns: Path to the written module.
    """
    path = directory / filename
    path.write_text(source, encoding="utf-8")
    return path


def plugin_config(path, plugin_id):
    """Build an AppConfig that loads one external Python plugin.

    :param path: Path to the plugin module.
    :param plugin_id: Plugin id used as the import module name.
    :returns: AppConfig containing that plugin.
    """
    return AppConfig(plugins=[PluginConfig(py_path=path, id=plugin_id)])


def drop_route(path):
    """Remove a route added by a test plugin from the shared app.

    :param path: URL path of the route to remove.
    """
    app.router.routes = [
        route for route in app.router.routes if getattr(route, "path", None) != path
    ]


def drop_module(plugin_id):
    """Remove a test plugin from ``sys.modules``.

    :param plugin_id: Module name assigned while loading the plugin.
    """
    sys.modules.pop(plugin_id, None)


def test_plugin_with_register_endpoints_route_is_reachable(tmp_path):
    """A plugin that defines register_endpoints exposes a reachable route."""
    plugin_id = "canvas_chat_test_external_ping"
    plugin_path = write_plugin(
        tmp_path,
        "ping_plugin.py",
        f'''
def register_endpoints(app):
    @app.get("{PING_PATH}")
    async def ping():
        return {{"ok": True, "source": "external-plugin"}}
''',
    )
    try:
        load_python_plugins(plugin_config(plugin_path, plugin_id))

        response = TestClient(app).get(PING_PATH)

        assert response.status_code == 200
        assert response.json() == {"ok": True, "source": "external-plugin"}
    finally:
        drop_route(PING_PATH)
        drop_module(plugin_id)


def test_plugin_without_register_endpoints_still_loads(tmp_path, caplog):
    """A plugin with no register_endpoints function still loads."""
    plugin_id = "canvas_chat_test_external_plain"
    plugin_path = write_plugin(
        tmp_path,
        "plain_plugin.py",
        "MARKER = 'plain-plugin-loaded'\n",
    )
    caplog.set_level(logging.INFO, logger="canvas_chat.app")
    try:
        load_python_plugins(plugin_config(plugin_path, plugin_id))

        assert sys.modules[plugin_id].MARKER == "plain-plugin-loaded"
        assert f"Loaded Python plugin: {plugin_path.name}" in caplog.text
    finally:
        drop_module(plugin_id)


def test_register_endpoints_error_is_logged_and_does_not_stop_startup(
    tmp_path, caplog
):
    """A raising register_endpoints is logged and later plugins still load."""
    broken_id = "canvas_chat_test_external_broken"
    healthy_id = "canvas_chat_test_external_after_error"
    broken_path = write_plugin(
        tmp_path,
        "broken_plugin.py",
        """
MARKER = "broken-module-loaded"

def register_endpoints(app):
    raise RuntimeError("endpoint registration failed")
""",
    )
    healthy_path = write_plugin(
        tmp_path,
        "healthy_plugin.py",
        f'''
def register_endpoints(app):
    @app.get("{AFTER_ERROR_PATH}")
    async def after_error():
        return {{"ok": True}}
''',
    )
    config = AppConfig(
        plugins=[
            PluginConfig(py_path=broken_path, id=broken_id),
            PluginConfig(py_path=healthy_path, id=healthy_id),
        ]
    )
    caplog.set_level(logging.INFO, logger="canvas_chat.app")
    try:
        load_python_plugins(config)

        assert sys.modules[broken_id].MARKER == "broken-module-loaded"
        assert f"Loaded Python plugin: {broken_path.name}" in caplog.text
        assert "Failed to register endpoints" in caplog.text
        assert "endpoint registration failed" in caplog.text
        assert any(
            record.exc_info is not None and record.levelno >= logging.ERROR
            for record in caplog.records
            if "Failed to register endpoints" in record.message
        )

        response = TestClient(app).get(AFTER_ERROR_PATH)
        assert response.status_code == 200
        assert response.json() == {"ok": True}
    finally:
        drop_route(AFTER_ERROR_PATH)
        drop_module(broken_id)
        drop_module(healthy_id)
