/**
 * Event system for the plugin architecture
 * Provides structured event objects with cancellation support
 */

/**
 * Base event class for all plugin system events
 * Similar to DOM events, provides consistent structure
 */
class CanvasEvent {
    /**
     * @param {string} type - Event type (e.g., 'node:created', 'command:before')
     * @param {Object} data - Event payload data
     */
    constructor(type, data = {}) {
        this.type = type;
        this.timestamp = Date.now();
        this.data = data;
    }
}

/**
 * Cancellable event class for events that can be prevented
 * Used for 'before:*' events where handlers can block the action
 */
class CancellableEvent extends CanvasEvent {
    /**
     * @param {string} type - Event type (e.g., 'command:before', 'node:before:delete')
     * @param {Object} data - Event payload data
     */
    constructor(type, data = {}) {
        super(type, data);
        this.cancelled = false;
        this.reason = null;
    }

    /**
     * Cancel the event and prevent the associated action
     * @param {string} reason - Optional reason for cancellation
     */
    preventDefault(reason = '') {
        this.cancelled = true;
        this.reason = reason;
    }

    /**
     * Alias for cancelled (DOM-style API compatibility)
     * @returns {boolean}
     */
    get defaultPrevented() {
        return this.cancelled;
    }
}

export { CanvasEvent, CancellableEvent };
