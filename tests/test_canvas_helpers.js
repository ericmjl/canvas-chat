/**
 * Tests for canvas UI helper functions
 * Tests navigation popover selection logic and zoom class determination.
 */

import {
    test,
    assertEqual
} from './test_setup.js';

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
// Zoom class determination tests
// ============================================================

/**
 * Get zoom class based on scale
 * Copy of logic from canvas.js for testing
 */
function getZoomClass(scale) {
    if (scale > 0.6) {
        return 'zoom-full';
    } else if (scale > 0.35) {
        return 'zoom-summary';
    } else {
        return 'zoom-mini';
    }
}

test('getZoomClass: scale 0.8 returns zoom-full', () => {
    assertEqual(getZoomClass(0.8), 'zoom-full');
});

test('getZoomClass: scale 1.0 returns zoom-full', () => {
    assertEqual(getZoomClass(1.0), 'zoom-full');
});

test('getZoomClass: scale 0.6 returns zoom-summary (boundary)', () => {
    // Note: scale > 0.6 is full, so 0.6 exactly is summary
    assertEqual(getZoomClass(0.6), 'zoom-summary');
});

test('getZoomClass: scale 0.5 returns zoom-summary', () => {
    assertEqual(getZoomClass(0.5), 'zoom-summary');
});

test('getZoomClass: scale 0.35 returns zoom-mini (boundary)', () => {
    // Note: scale > 0.35 is summary, so 0.35 exactly is mini
    assertEqual(getZoomClass(0.35), 'zoom-mini');
});

test('getZoomClass: scale 0.3 returns zoom-mini', () => {
    assertEqual(getZoomClass(0.3), 'zoom-mini');
});

test('getZoomClass: scale 0.1 returns zoom-mini', () => {
    assertEqual(getZoomClass(0.1), 'zoom-mini');
});
