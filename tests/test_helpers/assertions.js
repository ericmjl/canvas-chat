function assertTrue(actual, message = '') {
    if (actual !== true) {
        throw new Error(message || `Expected true, got ${actual}`);
    }
}

function assertEqual(actual, expected, message = '') {
    if (actual !== expected) {
        throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
}

export { assertTrue, assertEqual };
