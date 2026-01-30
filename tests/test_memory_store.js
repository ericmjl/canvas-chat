/**
 * Tests for memory-store.js
 *
 * Tests memory store interface and InMemoryStore implementation.
 */

// =============================================================================
// Test Utilities
// =============================================================================

const testResults = [];

function test(name, fn) {
    return (async () => {
        try {
            await fn();
            testResults.push({ name, passed: true });
            console.log(`✓ ${name}`);
        } catch (error) {
            testResults.push({ name, passed: false, error: error.message });
            console.log(`✗ ${name}: ${error.message}`);
        }
    })();
}

function assertEqual(actual, expected, message = '') {
    if (actual !== expected) {
        throw new Error(`${message ? message + ': ' : ''}Expected ${expected}, got ${actual}`);
    }
}

function assertTrue(condition, message = '') {
    if (!condition) {
        throw new Error(message || 'Expected true');
    }
}

// =============================================================================
// Tests
// =============================================================================

async function runTests() {
    // Import modules
    const { MemoryTypeEnum, InMemoryStore, MemoryStoreRegistry } =
        await import('../src/canvas_chat/static/js/agent/memory-store.js');

    // -------------------------------------------------------------------------
    // Memory Type Tests
    // -------------------------------------------------------------------------

    await test('MemoryTypeEnum has all required types', () => {
        assertEqual(MemoryTypeEnum.WORLD, 'world');
        assertEqual(MemoryTypeEnum.EXPERIENCE, 'experience');
        assertEqual(MemoryTypeEnum.OPINION, 'opinion');
    });

    // -------------------------------------------------------------------------
    // InMemoryStore Tests
    // -------------------------------------------------------------------------

    await test('InMemoryStore can retain memory', async () => {
        const store = new InMemoryStore();

        const memory = await store.retain({
            bankId: 'test-bank',
            type: MemoryTypeEnum.WORLD,
            content: 'The sky is blue.',
            sourceRefs: ['node-1'],
        });

        assertTrue(memory.id.length > 0);
        assertEqual(memory.bankId, 'test-bank');
        assertEqual(memory.type, 'world');
        assertEqual(memory.content, 'The sky is blue.');
        assertEqual(memory.sourceRefs[0], 'node-1');
        assertTrue(memory.createdAt > 0);
    });

    await test('InMemoryStore can recall memories', async () => {
        const store = new InMemoryStore();

        // Add several memories
        await store.retain({
            bankId: 'test-bank',
            type: MemoryTypeEnum.WORLD,
            content: 'Paris is the capital of France.',
            sourceRefs: ['node-1'],
        });

        await store.retain({
            bankId: 'test-bank',
            type: MemoryTypeEnum.EXPERIENCE,
            content: 'User asked about French geography.',
            sourceRefs: ['node-2'],
        });

        await store.retain({
            bankId: 'other-bank',
            type: MemoryTypeEnum.WORLD,
            content: 'This should not appear.',
            sourceRefs: ['node-3'],
        });

        // Recall from specific bank
        const memories = await store.recall({
            bankId: 'test-bank',
        });

        assertEqual(memories.length, 2);
    });

    await test('InMemoryStore filters by type', async () => {
        const store = new InMemoryStore();

        await store.retain({
            bankId: 'test-bank',
            type: MemoryTypeEnum.WORLD,
            content: 'Fact 1',
            sourceRefs: [],
        });

        await store.retain({
            bankId: 'test-bank',
            type: MemoryTypeEnum.EXPERIENCE,
            content: 'Experience 1',
            sourceRefs: [],
        });

        await store.retain({
            bankId: 'test-bank',
            type: MemoryTypeEnum.OPINION,
            content: 'Opinion 1',
            sourceRefs: [],
            confidence: 0.8,
        });

        const worlds = await store.recall({
            bankId: 'test-bank',
            types: [MemoryTypeEnum.WORLD],
        });

        assertEqual(worlds.length, 1);
        assertEqual(worlds[0].type, 'world');

        const experiences = await store.recall({
            bankId: 'test-bank',
            types: [MemoryTypeEnum.EXPERIENCE],
        });

        assertEqual(experiences.length, 1);
        assertEqual(experiences[0].type, 'experience');
    });

    await test('InMemoryStore filters by query', async () => {
        const store = new InMemoryStore();

        await store.retain({
            bankId: 'test-bank',
            type: MemoryTypeEnum.WORLD,
            content: 'Paris is the capital of France.',
            sourceRefs: [],
        });

        await store.retain({
            bankId: 'test-bank',
            type: MemoryTypeEnum.WORLD,
            content: 'Berlin is the capital of Germany.',
            sourceRefs: [],
        });

        const parisMemories = await store.recall({
            bankId: 'test-bank',
            query: 'Paris',
        });

        assertEqual(parisMemories.length, 1);
        assertTrue(parisMemories[0].content.includes('Paris'));
    });

    await test('InMemoryStore respects limit', async () => {
        const store = new InMemoryStore();

        for (let i = 0; i < 20; i++) {
            await store.retain({
                bankId: 'test-bank',
                type: MemoryTypeEnum.WORLD,
                content: `Memory ${i}`,
                sourceRefs: [],
            });
        }

        const limited = await store.recall({
            bankId: 'test-bank',
            limit: 5,
        });

        assertEqual(limited.length, 5);
    });

    await test('InMemoryStore can delete memory', async () => {
        const store = new InMemoryStore();

        const memory = await store.retain({
            bankId: 'test-bank',
            type: MemoryTypeEnum.WORLD,
            content: 'To be deleted',
            sourceRefs: [],
        });

        const deleted = await store.delete(memory.id);
        assertTrue(deleted);

        const remaining = await store.recall({ bankId: 'test-bank' });
        assertEqual(remaining.length, 0);
    });

    await test('InMemoryStore can clear bank', async () => {
        const store = new InMemoryStore();

        await store.retain({
            bankId: 'test-bank',
            type: MemoryTypeEnum.WORLD,
            content: 'Memory 1',
            sourceRefs: [],
        });

        await store.retain({
            bankId: 'test-bank',
            type: MemoryTypeEnum.WORLD,
            content: 'Memory 2',
            sourceRefs: [],
        });

        const count = await store.clearBank('test-bank');
        assertEqual(count, 2);

        const remaining = await store.recall({ bankId: 'test-bank' });
        assertEqual(remaining.length, 0);
    });

    await test('InMemoryStore reflect returns recalled memories', async () => {
        const store = new InMemoryStore();

        await store.retain({
            bankId: 'test-bank',
            type: MemoryTypeEnum.WORLD,
            content: 'Paris is the capital of France.',
            sourceRefs: [],
        });

        const result = await store.reflect({
            bankId: 'test-bank',
            question: 'France', // Simple query that matches via substring search
        });

        // Default implementation returns memories for agent to synthesize
        assertEqual(result.answer, null);
        assertTrue(result.usedMemories.length > 0);
        assertEqual(result.confidence, 0);
    });

    // -------------------------------------------------------------------------
    // Memory Store Registry Tests
    // -------------------------------------------------------------------------

    await test('MemoryStoreRegistry has default in-memory store', () => {
        const registry = new MemoryStoreRegistry();

        const store = registry.get();
        assertTrue(store !== null);
        assertEqual(store.storeId, 'in-memory');
    });

    await test('MemoryStoreRegistry can register custom store', () => {
        const registry = new MemoryStoreRegistry();

        const customStore = new InMemoryStore();
        customStore.storeId = 'custom-store';

        registry.register(customStore);

        const retrieved = registry.get('custom-store');
        assertEqual(retrieved.storeId, 'custom-store');
    });

    await test('MemoryStoreRegistry can set default', () => {
        const registry = new MemoryStoreRegistry();

        const customStore = new InMemoryStore();
        customStore.storeId = 'custom-store';

        registry.register(customStore);
        registry.setDefault('custom-store');

        const defaultStore = registry.get();
        assertEqual(defaultStore.storeId, 'custom-store');
    });

    await test('MemoryStoreRegistry lists all stores', () => {
        const registry = new MemoryStoreRegistry();

        const stores = registry.list();
        assertTrue(stores.includes('in-memory'));
    });

    // -------------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------------

    const passed = testResults.filter((r) => r.passed).length;
    const failed = testResults.filter((r) => !r.passed).length;

    console.log('\n' + '='.repeat(50));
    console.log(`Memory Store Tests: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch((err) => {
    console.error('Test runner error:', err);
    process.exit(1);
});
