/**
 * Simple EventEmitter for browser use
 * Provides a pub/sub pattern for decoupling components
 */
class EventEmitter {
    /**
     *
     */
    constructor() {
        this._events = new Map();
    }

    /**
     * Register an event listener
     * @param {string} event - Event name
     * @param {Function} listener - Callback function
     * @returns {EventEmitter} this for chaining
     */
    on(event, listener) {
        if (!this._events.has(event)) {
            this._events.set(event, []);
        }
        this._events.get(event).push(listener);
        return this;
    }

    /**
     * Remove an event listener
     * @param {string} event - Event name
     * @param {Function} listener - Callback function to remove
     * @returns {EventEmitter} this for chaining
     */
    off(event, listener) {
        if (!this._events.has(event)) return this;
        const listeners = this._events.get(event);
        const index = listeners.indexOf(listener);
        if (index !== -1) {
            listeners.splice(index, 1);
        }
        return this;
    }

    /**
     * Register a one-time event listener
     * @param {string} event - Event name
     * @param {Function} listener - Callback function
     * @returns {EventEmitter} this for chaining
     */
    once(event, listener) {
        const onceWrapper = (...args) => {
            this.off(event, onceWrapper);
            listener.apply(this, args);
        };
        return this.on(event, onceWrapper);
    }

    /**
     * Emit an event with arguments
     * @param {string} event - Event name
     * @param {...any} args - Arguments to pass to listeners
     * @returns {boolean} true if event had listeners
     */
    emit(event, ...args) {
        if (!this._events.has(event)) return false;
        const listeners = this._events.get(event).slice(); // Copy to avoid modification during iteration
        for (const listener of listeners) {
            listener.apply(this, args);
        }
        return true;
    }

    /**
     * Remove all listeners for an event, or all events if no event specified
     * @param {string} [event] - Event name (optional)
     * @returns {EventEmitter} this for chaining
     */
    removeAllListeners(event) {
        if (event) {
            this._events.delete(event);
        } else {
            this._events.clear();
        }
        return this;
    }

    /**
     * Get listener count for an event
     * @param {string} event - Event name
     * @returns {number} Number of listeners
     */
    listenerCount(event) {
        return this._events.has(event) ? this._events.get(event).length : 0;
    }
}

export { EventEmitter };
