"""Tests for DDG endpoints (per-iteration cap, domain filtering, and related logic)."""

from unittest.mock import patch

from canvas_chat.plugins.ddg_endpoints import (
    _max_sources_per_iteration,
    is_domain_blocked,
)


class TestMaxSourcesPerIteration:
    """Unit tests for _max_sources_per_iteration.

    Ensures the per-iteration cap formula is correct so sources are spread
    across iterations for better query diversity. Protects against
    regressions if the formula is changed.
    """

    def test_defaults_40_sources_4_iterations(self):
        """Default research params: 40 sources over 4 iterations -> 10 per iteration."""
        assert _max_sources_per_iteration(40, 4) == 10

    def test_80_sources_4_iterations(self):
        """80 sources over 4 iterations -> 20 per iteration."""
        assert _max_sources_per_iteration(80, 4) == 20

    def test_small_total_one_iteration(self):
        """5 sources, 1 iteration -> 5 (floor is 5)."""
        assert _max_sources_per_iteration(5, 1) == 5

    def test_ceiling_division_20_sources_3_iterations(self):
        """20 sources over 3 iterations -> ceil(20/3) = 7 per iteration."""
        assert _max_sources_per_iteration(20, 3) == 7

    def test_minimum_5_per_iteration(self):
        """Result is always at least 5 even when division would be smaller."""
        assert _max_sources_per_iteration(8, 4) == 5  # 8/4=2, but min is 5
        assert _max_sources_per_iteration(1, 1) == 5

    def test_even_split(self):
        """When max_sources is divisible by max_iterations, result is exact."""
        assert _max_sources_per_iteration(60, 4) == 15
        assert _max_sources_per_iteration(12, 3) == 5  # 12/3=4, but min is 5


class TestIsDomainBlocked:
    """Unit tests for is_domain_blocked.

    Ensures blocked domain filtering correctly matches exact domains and
    subdomains so untrusted sources (e.g. Grokipedia) can be excluded.
    """

    def test_exact_domain_blocked(self):
        """Exact domain match is blocked."""
        assert is_domain_blocked("https://grokipedia.com/page", ["grokipedia.com"])
        assert is_domain_blocked("https://grokipedia.com", ["grokipedia.com"])

    def test_subdomain_blocked(self):
        """Subdomains of blocked domain are blocked."""
        assert is_domain_blocked(
            "https://www.grokipedia.com/article", ["grokipedia.com"]
        )
        assert is_domain_blocked("https://sub.grokipedia.com/path", ["grokipedia.com"])

    def test_domain_not_blocked(self):
        """Other domains are not blocked."""
        assert not is_domain_blocked("https://example.com/page", ["grokipedia.com"])
        assert not is_domain_blocked(
            "https://wikipedia.org/wiki/Test", ["grokipedia.com"]
        )

    def test_case_insensitive(self):
        """Domain matching is case-insensitive."""
        assert is_domain_blocked("https://GROKIPEDIA.COM/page", ["grokipedia.com"])
        assert is_domain_blocked("https://www.Grokipedia.COM/", ["grokipedia.com"])
        assert is_domain_blocked("https://grokipedia.com/", ["GROKIPEDIA.COM"])

    def test_empty_url_or_blocklist(self):
        """Empty URL or empty blocklist returns False."""
        assert not is_domain_blocked("", ["grokipedia.com"])
        assert not is_domain_blocked("https://grokipedia.com", [])
        assert not is_domain_blocked("", [])

    def test_multiple_blocked_domains(self):
        """Any domain in the blocklist matches."""
        blocklist = ["grokipedia.com", "spam.example.com"]
        assert is_domain_blocked("https://grokipedia.com/p", blocklist)
        assert is_domain_blocked("https://spam.example.com/p", blocklist)
        assert not is_domain_blocked("https://trusted.example.com/p", blocklist)

    def test_invalid_url_returns_false(self):
        """Invalid or malformed URL does not raise; returns False."""
        assert not is_domain_blocked("not-a-url", ["grokipedia.com"])


class TestDdgSearchEndpointFiltersBlockedDomains:
    """Integration tests: /api/ddg/search filters blocked domains."""

    def test_blocked_domains_excluded_from_search_results(self):
        """Results from blocked domains are not returned by /api/ddg/search."""
        from fastapi.testclient import TestClient

        from canvas_chat.app import app
        from canvas_chat.config import AppConfig

        mock_results = [
            {
                "title": "Good Source",
                "href": "https://example.com/article",
                "body": "Snippet",
            },
            {
                "title": "Grokipedia",
                "href": "https://www.grokipedia.com/page",
                "body": "Snippet",
            },
            {
                "title": "Another Good",
                "href": "https://reliable.org/post",
                "body": "Snippet",
            },
        ]

        with (
            patch("ddgs.DDGS") as mock_ddgs_class,
            patch("canvas_chat.app.get_admin_config") as mock_config,
        ):
            mock_ddgs = mock_ddgs_class.return_value.__enter__.return_value
            mock_ddgs.text.return_value = mock_results
            mock_config.return_value = AppConfig.empty()
            # AppConfig.empty() uses default blocked_domains = ["grokipedia.com"]
            assert "grokipedia.com" in mock_config.return_value.blocked_domains

            client = TestClient(app)
            response = client.post(
                "/api/ddg/search",
                json={"query": "test query", "max_results": 10},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["provider"] == "duckduckgo"
        urls = [r["url"] for r in data["results"]]
        assert "https://www.grokipedia.com/page" not in urls
        assert "https://example.com/article" in urls
        assert "https://reliable.org/post" in urls
        assert len(data["results"]) == 2
        assert data["num_results"] == 2
