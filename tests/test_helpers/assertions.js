function assertTrue(actual, message = '') {
    if (actual !== true) {
        throw new Error(message || `Expected true, got ${actual}`);
    }
}

function assertEqual(actual, expected, message = '') {
    if (Object.is(actual, expected)) {
        return;
    }

    const bothObjects =
        actual !== null && expected !== null && typeof actual === 'object' && typeof expected === 'object';

    if (bothObjects) {
        const actualStr = JSON.stringify(actual);
        const expectedStr = JSON.stringify(expected);
        if (actualStr === expectedStr) {
            return;
        }
        throw new Error(message || `Expected ${expectedStr}, got ${actualStr}`);
    }

    throw new Error(message || `Expected ${expected}, got ${actual}`);
}

function assertFalse(actual, message = '') {
    if (actual !== false) {
        throw new Error(message || `Expected false, got ${actual}`);
    }
}

export { assertTrue, assertEqual, assertFalse };
