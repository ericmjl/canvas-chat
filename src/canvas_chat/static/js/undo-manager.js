/**
 * Undo/Redo manager for tracking user actions
 */
class UndoManager {
    constructor(maxHistory = 50) {
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = maxHistory;
        this.onStateChange = null;  // Callback when undo/redo state changes
    }

    /**
     * Push an action onto the undo stack
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

        if (this.onStateChange) this.onStateChange();
        return action;
    }

    canUndo() {
        return this.undoStack.length > 0;
    }

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
}

// Export for browser
window.UndoManager = UndoManager;

// CommonJS export for Node.js/testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UndoManager };
}
