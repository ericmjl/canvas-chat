"""Tests for DDG endpoints plugin (per-iteration cap and related logic)."""

from canvas_chat.plugins.ddg_endpoints import _max_sources_per_iteration


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
