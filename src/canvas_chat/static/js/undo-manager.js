/**
 * Undo/Redo manager for tracking user actions
 */
class UndoManager {
    /**
     *
     * @param maxHistory
     */
    constructor(maxHistory = 50) {
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = maxHistory;
        this.onStateChange = null; // Callback when undo/redo state changes
        this.pluginActionHandlers = new Map(); // actionType -> { undo, redo }
    }

    /**
     * Push an action onto the undo stack
     * @param action
     */
    push(action) {
        this.undoStack.push(action);

        // Limit history size
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }

        // Clear redo stack on new action
        this.redoStack = [];

        if (this.onStateChange) this.onStateChange();
    }

    /**
     * Undo the last action
     * @returns {Object|null} The action to undo, or null if nothing to undo
     */
    undo() {
        if (!this.canUndo()) return null;

        const action = this.undoStack.pop();
        this.redoStack.push(action);

        // Delegate to plugin handler if available
        if (this.pluginActionHandlers.has(action.type)) {
            const handler = this.pluginActionHandlers.get(action.type);
            try {
                if (handler.undo) {
                    handler.undo(action);
                    this.onStateChange?.();
                    return action;
                }
            } catch (err) {
                console.error(`[UndoManager] Plugin undo handler failed for ${action.type}:`, err);
                // Re-push action so user can retry
                this.undoStack.push(action);
                this.redoStack.pop();
                this.onStateChange?.();
                throw err;
            }
        }

        if (this.onStateChange) this.onStateChange();
        return action;
    }

    /**
     * Redo the last undone action
     * @returns {Object|null} The action to redo, or null if nothing to redo
     */
    redo() {
        if (!this.canRedo()) return null;

        const action = this.redoStack.pop();
        this.undoStack.push(action);

        // Delegate to plugin handler if available
        if (this.pluginActionHandlers.has(action.type)) {
            const handler = this.pluginActionHandlers.get(action.type);
            try {
                if (handler.redo) {
                    handler.redo(action);
                    this.onStateChange?.();
                    return action;
                }
            } catch (err) {
                console.error(`[UndoManager] Plugin redo handler failed for ${action.type}:`, err);
                // Re-push action so user can retry
                this.redoStack.push(action);
                this.undoStack.pop();
                this.onStateChange?.();
                throw err;
            }
        }

        if (this.onStateChange) this.onStateChange();
        return action;
    }

    /**
     *
     * @returns {boolean}
     */
    canUndo() {
        return this.undoStack.length > 0;
    }

    /**
     *
     * @returns {boolean}
     */
    canRedo() {
        return this.redoStack.length > 0;
    }

    /**
     * Clear all history
     */
    clear() {
        this.undoStack = [];
        this.redoStack = [];
        if (this.onStateChange) this.onStateChange();
    }

    /**
     * Allow plugins to register custom undo/redo handlers
     * @param {string} actionType - The action type (e.g., 'FILL_CELL')
     * @param {Object} handlers - { undo: Function, redo: Function }
     */
    registerActionHandler(actionType, handlers) {
        this.pluginActionHandlers.set(actionType, handlers);
    }

    /**
     * Check if action type has a plugin handler
     * @param {string} actionType
     * @returns {boolean}
     */
    hasActionHandler(actionType) {
        return this.pluginActionHandlers.has(actionType);
    }
}

// Export for browser
export { UndoManager };
