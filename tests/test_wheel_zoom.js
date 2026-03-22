/**
 * Unit tests for Ctrl+scroll zoom math (normalizeWheelDeltaY, scaleAfterWheelZoom).
 */

import {
    test,
    assertEqual,
    assertTrue,
} from './test_setup.js';
import {
    DOM_DELTA_LINE,
    DOM_DELTA_PAGE,
    DOM_DELTA_PIXEL,
    normalizeWheelDeltaY,
    scaleAfterWheelZoom,
    zoomWheelSensitivityMultiplier,
} from '../src/canvas_chat/static/js/utils.js';

test('normalizeWheelDeltaY: pixel mode passes through', () => {
    assertEqual(normalizeWheelDeltaY(10, DOM_DELTA_PIXEL, 16, 600), 10);
});

test('normalizeWheelDeltaY: line mode scales by line height', () => {
    assertEqual(normalizeWheelDeltaY(3, DOM_DELTA_LINE, 16, 600), 48);
});

test('normalizeWheelDeltaY: page mode scales by page height', () => {
    assertEqual(normalizeWheelDeltaY(-1, DOM_DELTA_PAGE, 16, 800), -800);
});

test('zoomWheelSensitivityMultiplier: 50 matches former slider maximum (5.0×)', () => {
    assertEqual(zoomWheelSensitivityMultiplier(50), 5.0);
});

test('zoomWheelSensitivityMultiplier: min and extended max', () => {
    assertEqual(zoomWheelSensitivityMultiplier(0), 0.2);
    assertEqual(zoomWheelSensitivityMultiplier(100), 10.0);
});

test('scaleAfterWheelZoom: zero delta unchanged', () => {
    assertEqual(scaleAfterWheelZoom(1.0, 0, 50, 0.1, 3.0), 1.0);
});

test('scaleAfterWheelZoom: positive delta zooms out', () => {
    const next = scaleAfterWheelZoom(1.0, 100, 50, 0.1, 3.0);
    assertTrue(next < 1.0);
});

test('scaleAfterWheelZoom: negative delta zooms in', () => {
    const next = scaleAfterWheelZoom(1.0, -100, 50, 0.1, 3.0);
    assertTrue(next > 1.0);
});

test('scaleAfterWheelZoom: clamps to min', () => {
    const next = scaleAfterWheelZoom(0.15, 5000, 50, 0.1, 3.0);
    assertEqual(next, 0.1);
});

test('scaleAfterWheelZoom: clamps to max', () => {
    const next = scaleAfterWheelZoom(2.9, -5000, 50, 0.1, 3.0);
    assertEqual(next, 3.0);
});
