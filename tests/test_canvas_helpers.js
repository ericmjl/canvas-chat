/**
 * Tests for canvas UI helper functions
 * Tests navigation popover selection logic and zoom class determination.
 */

import {
    test,
    assertEqual
} from './test_setup.js';
import {
    resolveSemanticZoomBand,
    semanticBandToCssClass,
} from '../src/canvas_chat/static/js/utils.js';

// ============================================================
// Navigation popover selection logic tests
// ============================================================

/**
 * Tests for the navigation popover keyboard selection logic.
 * When navigating parent/child nodes with Arrow Up/Down, if multiple
 * connections exist, a popover opens. Arrow keys cycle through options
 * with wrapping (going past last item wraps to first, and vice versa).
 *
 * The selection logic uses modular arithmetic:
 *   newIndex = (currentIndex + direction + itemCount) % itemCount
 * where direction is +1 for down, -1 for up.
 */

test('Popover selection: wraps from last to first when going down', () => {
    const itemCount = 5;
    let selectedIndex = 4;  // Last item
    const direction = 1;    // Down
    selectedIndex = (selectedIndex + direction + itemCount) % itemCount;
    assertEqual(selectedIndex, 0);  // Should wrap to first
});

test('Popover selection: wraps from first to last when going up', () => {
    const itemCount = 5;
    let selectedIndex = 0;  // First item
    const direction = -1;   // Up
    selectedIndex = (selectedIndex + direction + itemCount) % itemCount;
    assertEqual(selectedIndex, 4);  // Should wrap to last
});

test('Popover selection: moves down normally in middle of list', () => {
    const itemCount = 5;
    let selectedIndex = 2;  // Middle item
    const direction = 1;    // Down
    selectedIndex = (selectedIndex + direction + itemCount) % itemCount;
    assertEqual(selectedIndex, 3);
});

test('Popover selection: moves up normally in middle of list', () => {
    const itemCount = 5;
    let selectedIndex = 2;  // Middle item
    const direction = -1;   // Up
    selectedIndex = (selectedIndex + direction + itemCount) % itemCount;
    assertEqual(selectedIndex, 1);
});

test('Popover selection: handles single item list going down', () => {
    const itemCount = 1;
    let selectedIndex = 0;
    const direction = 1;    // Down
    selectedIndex = (selectedIndex + direction + itemCount) % itemCount;
    assertEqual(selectedIndex, 0);  // Should stay on same item
});

test('Popover selection: handles single item list going up', () => {
    const itemCount = 1;
    let selectedIndex = 0;
    const direction = -1;   // Up
    selectedIndex = (selectedIndex + direction + itemCount) % itemCount;
    assertEqual(selectedIndex, 0);  // Should stay on same item
});

test('Popover selection: handles two item list wrapping down', () => {
    const itemCount = 2;
    let selectedIndex = 1;  // Last item
    const direction = 1;    // Down
    selectedIndex = (selectedIndex + direction + itemCount) % itemCount;
    assertEqual(selectedIndex, 0);  // Wrap to first
});

test('Popover selection: handles two item list wrapping up', () => {
    const itemCount = 2;
    let selectedIndex = 0;  // First item
    const direction = -1;   // Up
    selectedIndex = (selectedIndex + direction + itemCount) % itemCount;
    assertEqual(selectedIndex, 1);  // Wrap to last
});

// ============================================================
// Semantic zoom band (nominal + hysteresis) — utils.resolveSemanticZoomBand
// ============================================================

function cssClassForScale(scale, previousBand) {
    return semanticBandToCssClass(resolveSemanticZoomBand(scale, previousBand));
}

test('semantic zoom nominal: scale 0.8 returns zoom-full', () => {
    assertEqual(cssClassForScale(0.8, undefined), 'zoom-full');
});

test('semantic zoom nominal: scale 1.0 returns zoom-full', () => {
    assertEqual(cssClassForScale(1.0, undefined), 'zoom-full');
});

test('semantic zoom nominal: scale 0.6 returns zoom-summary (boundary)', () => {
    assertEqual(cssClassForScale(0.6, undefined), 'zoom-summary');
});

test('semantic zoom nominal: scale 0.5 returns zoom-summary', () => {
    assertEqual(cssClassForScale(0.5, undefined), 'zoom-summary');
});

test('semantic zoom nominal: scale 0.35 returns zoom-mini (boundary)', () => {
    assertEqual(cssClassForScale(0.35, undefined), 'zoom-mini');
});

test('semantic zoom nominal: scale 0.3 returns zoom-mini', () => {
    assertEqual(cssClassForScale(0.3, undefined), 'zoom-mini');
});

test('semantic zoom nominal: scale 0.1 returns zoom-mini', () => {
    assertEqual(cssClassForScale(0.1, undefined), 'zoom-mini');
});

test('semantic zoom hysteresis: stays full between 0.58 and 0.62 when coming from full', () => {
    assertEqual(cssClassForScale(0.59, 'full'), 'zoom-full');
});

test('semantic zoom hysteresis: drops to summary below 0.58 from full', () => {
    assertEqual(cssClassForScale(0.57, 'full'), 'zoom-summary');
});

test('semantic zoom hysteresis: summary returns to full above 0.62', () => {
    assertEqual(cssClassForScale(0.63, 'summary'), 'zoom-full');
});
