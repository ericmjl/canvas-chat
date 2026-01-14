/**
 * Example Test Plugin
 * Demonstrates the FeaturePlugin API for testing and documentation
 */

import { FeaturePlugin } from '../feature-plugin.js';
import { NodeType, createNode } from '../graph-types.js';

/**
 * SimpleTestPlugin is a minimal example feature plugin.
 * Used for testing the plugin system and as documentation.
 */
class SimpleTestPlugin extends FeaturePlugin {
    constructor(context) {
        super(context);
        this.loadCount = 0;
        this.eventsReceived = [];
        this.commandsExecuted = [];
    }

    async onLoad() {
        this.loadCount++;
        console.log('[SimpleTestPlugin] Loaded');
    }

    async onUnload() {
        console.log('[SimpleTestPlugin] Unloaded');
    }

    getEventSubscriptions() {
        return {
            'node:created': this.onNodeCreated.bind(this),
            'command:before': this.onCommandBefore.bind(this),
        };
    }

    onNodeCreated(event) {
        this.eventsReceived.push({ type: 'node:created', data: event.data });
    }

    onCommandBefore(event) {
        this.eventsReceived.push({ type: 'command:before', data: event.data });
    }

    async handleTestCommand(command, args, context) {
        this.commandsExecuted.push({ command, args, context });

        // Create a simple text node
        const node = createNode(NodeType.TEXT, `Test command executed: ${args}`);
        this.graph.addNode(node);

        // Show a toast
        if (this.showToast) {
            this.showToast('Test command executed!', 'success');
        }
    }

    async handleErrorCommand(command, args, context) {
        throw new Error('Intentional test error');
    }
}

/**
 * ComplexTestPlugin demonstrates more advanced features:
 * - State management
 * - Async operations
 * - Event cancellation
 */
class ComplexTestPlugin extends FeaturePlugin {
    constructor(context) {
        super(context);
        this.state = {
            counter: 0,
            operations: [],
        };
    }

    async onLoad() {
        console.log('[ComplexTestPlugin] Loaded');
    }

    getEventSubscriptions() {
        return {
            'command:before': this.onCommandBefore.bind(this),
        };
    }

    onCommandBefore(event) {
        // Cancel commands that start with 'blocked'
        if (event.data.command === '/blocked') {
            event.preventDefault('Command blocked by ComplexTestPlugin');
        }
    }

    async handleCountCommand(command, args, context) {
        this.state.counter++;
        this.state.operations.push({ type: 'count', counter: this.state.counter });

        const node = createNode(NodeType.TEXT, `Counter: ${this.state.counter}`);
        this.graph.addNode(node);
    }

    async handleAsyncCommand(command, args, context) {
        this.state.operations.push({ type: 'async', status: 'started' });

        // Simulate async operation
        await new Promise((resolve) => setTimeout(resolve, 10));

        this.state.operations.push({ type: 'async', status: 'completed' });

        const node = createNode(NodeType.TEXT, `Async operation completed`);
        this.graph.addNode(node);
    }
}

export { SimpleTestPlugin, ComplexTestPlugin };
