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
    /**
     *
     * @param context
     */
    constructor(context) {
        super(context);
        this.loadCount = 0;
        this.eventsReceived = [];
        this.commandsExecuted = [];
    }

    /**
     *
     */
    async onLoad() {
        this.loadCount++;
        console.log('[SimpleTestPlugin] Loaded');
    }

    /**
     * @returns {Object} Event subscriptions mapping
     */
    getEventSubscriptions() {
        return {
            'node:created': this.onNodeCreated.bind(this),
            'command:before': this.onCommandBefore.bind(this),
        };
    }

    /**
     *
     * @param event
     */
    onNodeCreated(event) {
        this.eventsReceived.push({ type: 'node:created', data: event.data });
    }

    /**
     *
     * @param event
     */
    onCommandBefore(event) {
        this.eventsReceived.push({ type: 'command:before', data: event.data });
    }

    /**
     * @param {string} command
     * @param {string} args
     * @param {Object} context
     */
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

    /**
     * @param {string} _command
     * @param {string} _args
     * @param {Object} _context
     * @returns {never}
     */
    async handleErrorCommand(_command, _args, _context) {
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
    /**
     *
     * @param context
     */
    constructor(context) {
        super(context);
        this.state = {
            counter: 0,
            operations: [],
        };
    }

    /**
     *
     */
    async onLoad() {
        console.log('[ComplexTestPlugin] Loaded');
    }

    /**
     * @returns {Object} Event subscriptions mapping
     */
    getEventSubscriptions() {
        return {
            'command:before': this.onCommandBefore.bind(this),
        };
    }

    /**
     *
     * @param event
     */
    onCommandBefore(event) {
        // Cancel commands that start with 'blocked'
        if (event.data.command === '/blocked') {
            event.preventDefault('Command blocked by ComplexTestPlugin');
        }
    }

    /**
     * @param {string} _command
     * @param {string} _args
     * @param {Object} _context
     */
    async handleCountCommand(_command, _args, _context) {
        this.state.counter++;
        this.state.operations.push({ type: 'count', counter: this.state.counter });

        const node = createNode(NodeType.TEXT, `Counter: ${this.state.counter}`);
        this.graph.addNode(node);
    }

    /**
     * @param {string} _command
     * @param {string} _args
     * @param {Object} _context
     */
    async handleAsyncCommand(_command, _args, _context) {
        this.state.operations.push({ type: 'async', status: 'started' });

        // Simulate async operation
        await new Promise((resolve) => setTimeout(resolve, 10));

        this.state.operations.push({ type: 'async', status: 'completed' });

        const node = createNode(NodeType.TEXT, `Async operation completed`);
        this.graph.addNode(node);
    }
}

export { SimpleTestPlugin, ComplexTestPlugin };
