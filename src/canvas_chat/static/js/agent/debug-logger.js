/**
 * Debug Logger for Agent Architecture
 *
 * Provides detailed logging and instrumentation for tracing code execution paths.
 * Enable debug mode by setting `window.AGENT_DEBUG = true` or running in dev mode.
 */

// =============================================================================
// Configuration
// =============================================================================

/**
 * Check if debug mode is enabled
 * @returns {boolean}
 */
function isDebugEnabled() {
    // Check global flag
    if (typeof window !== 'undefined' && window.AGENT_DEBUG) {
        return true;
    }
    // Check URL parameter
    if (typeof window !== 'undefined' && window.location?.search?.includes('agent_debug=true')) {
        return true;
    }
    // Check localStorage
    if (typeof localStorage !== 'undefined' && localStorage.getItem('AGENT_DEBUG') === 'true') {
        return true;
    }
    return false;
}

// =============================================================================
// Log Levels
// =============================================================================

/**
 * Log levels for filtering
 * @type {Object<string, number>}
 */
const LogLevel = {
    TRACE: 0, // Most verbose - every function entry/exit
    DEBUG: 1, // Detailed debugging info
    INFO: 2, // Important state changes
    WARN: 3, // Warnings
    ERROR: 4, // Errors
};

/**
 * Current log level (can be changed at runtime)
 * @type {number}
 */
let currentLogLevel = LogLevel.DEBUG;

// =============================================================================
// Formatting
// =============================================================================

/**
 * ANSI-like color codes for console styling
 */
const Colors = {
    // Components
    ENGINE: 'color: #4CAF50; font-weight: bold', // Green
    MEMORY: 'color: #2196F3; font-weight: bold', // Blue
    CONTROLLER: 'color: #9C27B0; font-weight: bold', // Purple
    TYPES: 'color: #FF9800; font-weight: bold', // Orange
    EVENT: 'color: #00BCD4; font-weight: bold', // Cyan

    // Log levels
    TRACE: 'color: #9E9E9E', // Gray
    DEBUG: 'color: #607D8B', // Blue-gray
    INFO: 'color: #4CAF50', // Green
    WARN: 'color: #FFC107', // Yellow
    ERROR: 'color: #F44336', // Red

    // Reset
    RESET: 'color: inherit; font-weight: normal',
};

/**
 * Component prefixes with emojis
 */
const ComponentPrefix = {
    ENGINE: '⚙️ [Engine]',
    MEMORY: '🧠 [Memory]',
    CONTROLLER: '🎮 [RunController]',
    TYPES: '📋 [Types]',
    EVENT: '📡 [Event]',
    GENERAL: '🔍 [Agent]',
};

// =============================================================================
// Debug Logger Class
// =============================================================================

/**
 * Debug logger for agent architecture
 */
class DebugLogger {
    /**
     * @param {string} component - Component name (ENGINE, MEMORY, CONTROLLER, etc.)
     */
    constructor(component) {
        this.component = component;
        this.prefix = ComponentPrefix[component] || ComponentPrefix.GENERAL;
        this.color = Colors[component] || Colors.DEBUG;
        this.callStack = [];
        this.timers = new Map();
    }

    /**
     * Check if a log level should be shown
     * @param {number} level
     * @returns {boolean}
     */
    shouldLog(level) {
        return isDebugEnabled() && level >= currentLogLevel;
    }

    /**
     * Format a timestamp
     * @returns {string}
     */
    timestamp() {
        const now = new Date();
        return now.toISOString().split('T')[1].slice(0, -1);
    }

    /**
     * Log a trace message (function entry/exit)
     * @param {string} message
     * @param {...any} args
     */
    trace(message, ...args) {
        if (this.shouldLog(LogLevel.TRACE)) {
            console.log(`%c${this.timestamp()} ${this.prefix}%c ${message}`, this.color, Colors.TRACE, ...args);
        }
    }

    /**
     * Log a debug message
     * @param {string} message
     * @param {...any} args
     */
    debug(message, ...args) {
        if (this.shouldLog(LogLevel.DEBUG)) {
            console.log(`%c${this.timestamp()} ${this.prefix}%c ${message}`, this.color, Colors.DEBUG, ...args);
        }
    }

    /**
     * Log an info message
     * @param {string} message
     * @param {...any} args
     */
    info(message, ...args) {
        if (this.shouldLog(LogLevel.INFO)) {
            console.log(`%c${this.timestamp()} ${this.prefix}%c ${message}`, this.color, Colors.INFO, ...args);
        }
    }

    /**
     * Log a warning message
     * @param {string} message
     * @param {...any} args
     */
    warn(message, ...args) {
        if (this.shouldLog(LogLevel.WARN)) {
            console.warn(`%c${this.timestamp()} ${this.prefix}%c ${message}`, this.color, Colors.WARN, ...args);
        }
    }

    /**
     * Log an error message
     * @param {string} message
     * @param {...any} args
     */
    error(message, ...args) {
        if (this.shouldLog(LogLevel.ERROR)) {
            console.error(`%c${this.timestamp()} ${this.prefix}%c ${message}`, this.color, Colors.ERROR, ...args);
        }
    }

    /**
     * Log function entry
     * @param {string} fnName - Function name
     * @param {Object} [params] - Function parameters
     */
    enter(fnName, params = null) {
        this.callStack.push(fnName);
        const indent = '  '.repeat(this.callStack.length - 1);
        if (this.shouldLog(LogLevel.TRACE)) {
            if (params) {
                console.groupCollapsed(
                    `%c${this.timestamp()} ${this.prefix}%c ${indent}→ ${fnName}`,
                    this.color,
                    Colors.TRACE
                );
                console.log('Parameters:', params);
                console.groupEnd();
            } else {
                console.log(`%c${this.timestamp()} ${this.prefix}%c ${indent}→ ${fnName}`, this.color, Colors.TRACE);
            }
        }
    }

    /**
     * Log function exit
     * @param {string} fnName - Function name
     * @param {*} [result] - Return value
     */
    exit(fnName, result = undefined) {
        const indent = '  '.repeat(this.callStack.length - 1);
        this.callStack.pop();
        if (this.shouldLog(LogLevel.TRACE)) {
            if (result !== undefined) {
                console.groupCollapsed(
                    `%c${this.timestamp()} ${this.prefix}%c ${indent}← ${fnName}`,
                    this.color,
                    Colors.TRACE
                );
                console.log('Result:', result);
                console.groupEnd();
            } else {
                console.log(`%c${this.timestamp()} ${this.prefix}%c ${indent}← ${fnName}`, this.color, Colors.TRACE);
            }
        }
    }

    /**
     * Start a timer
     * @param {string} label - Timer label
     */
    timeStart(label) {
        this.timers.set(label, performance.now());
        this.trace(`⏱️ Timer started: ${label}`);
    }

    /**
     * End a timer and log duration
     * @param {string} label - Timer label
     * @returns {number} Duration in ms
     */
    timeEnd(label) {
        const start = this.timers.get(label);
        if (start) {
            const duration = performance.now() - start;
            this.timers.delete(label);
            this.debug(`⏱️ Timer ${label}: ${duration.toFixed(2)}ms`);
            return duration;
        }
        return 0;
    }

    /**
     * Log an event
     * @param {string} eventType - Event type
     * @param {Object} eventData - Event data
     */
    event(eventType, eventData) {
        if (this.shouldLog(LogLevel.DEBUG)) {
            console.groupCollapsed(
                `%c${this.timestamp()} ${ComponentPrefix.EVENT}%c ${eventType}`,
                Colors.EVENT,
                Colors.DEBUG
            );
            console.log('Data:', eventData);
            console.groupEnd();
        }
    }

    /**
     * Log state change
     * @param {string} stateName - State name
     * @param {*} oldValue - Old value
     * @param {*} newValue - New value
     */
    stateChange(stateName, oldValue, newValue) {
        if (this.shouldLog(LogLevel.INFO)) {
            console.log(
                `%c${this.timestamp()} ${this.prefix}%c 📊 State change: ${stateName}`,
                this.color,
                Colors.INFO,
                { from: oldValue, to: newValue }
            );
        }
    }

    /**
     * Create a table log for structured data
     * @param {string} title - Table title
     * @param {Array|Object} data - Data to display
     */
    table(title, data) {
        if (this.shouldLog(LogLevel.DEBUG)) {
            console.log(`%c${this.timestamp()} ${this.prefix}%c ${title}:`, this.color, Colors.DEBUG);
            console.table(data);
        }
    }

    /**
     * Log a group of related messages
     * @param {string} groupName - Group name
     * @param {Function} logFn - Function containing log calls
     */
    group(groupName, logFn) {
        if (this.shouldLog(LogLevel.DEBUG)) {
            console.groupCollapsed(`%c${this.timestamp()} ${this.prefix}%c ${groupName}`, this.color, Colors.DEBUG);
            logFn();
            console.groupEnd();
        }
    }
}

// =============================================================================
// Pre-configured Loggers
// =============================================================================

/**
 * Create loggers for each component
 */
const engineLogger = new DebugLogger('ENGINE');
const memoryLogger = new DebugLogger('MEMORY');
const controllerLogger = new DebugLogger('CONTROLLER');
const typesLogger = new DebugLogger('TYPES');
const eventLogger = new DebugLogger('EVENT');

// =============================================================================
// Global Debug Functions
// =============================================================================

/**
 * Enable agent debug mode
 */
function enableAgentDebug() {
    if (typeof window !== 'undefined') {
        window.AGENT_DEBUG = true;
    }
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('AGENT_DEBUG', 'true');
    }
    console.log('🔍 Agent debug mode ENABLED. Refresh to see all logs from page load.');
}

/**
 * Disable agent debug mode
 */
function disableAgentDebug() {
    if (typeof window !== 'undefined') {
        window.AGENT_DEBUG = false;
    }
    if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('AGENT_DEBUG');
    }
    console.log('🔇 Agent debug mode DISABLED.');
}

/**
 * Set log level
 * @param {string} level - 'trace', 'debug', 'info', 'warn', 'error'
 */
function setAgentLogLevel(level) {
    const levelMap = {
        trace: LogLevel.TRACE,
        debug: LogLevel.DEBUG,
        info: LogLevel.INFO,
        warn: LogLevel.WARN,
        error: LogLevel.ERROR,
    };
    if (levelMap[level.toLowerCase()] !== undefined) {
        currentLogLevel = levelMap[level.toLowerCase()];
        console.log(`📊 Agent log level set to: ${level.toUpperCase()}`);
    } else {
        console.warn(`Unknown log level: ${level}. Use: trace, debug, info, warn, error`);
    }
}

// Expose to window for runtime control
if (typeof window !== 'undefined') {
    window.enableAgentDebug = enableAgentDebug;
    window.disableAgentDebug = disableAgentDebug;
    window.setAgentLogLevel = setAgentLogLevel;

    // Log instructions on load
    if (isDebugEnabled()) {
        console.log('%c🔍 Agent Debug Mode Active', 'color: #4CAF50; font-size: 14px; font-weight: bold');
        console.log('Available commands:');
        console.log('  window.disableAgentDebug() - Disable debug logging');
        console.log('  window.setAgentLogLevel("trace") - Set log level (trace/debug/info/warn/error)');
    }
}

// =============================================================================
// Exports
// =============================================================================

export {
    DebugLogger,
    LogLevel,
    isDebugEnabled,
    engineLogger,
    memoryLogger,
    controllerLogger,
    typesLogger,
    eventLogger,
    enableAgentDebug,
    disableAgentDebug,
    setAgentLogLevel,
};
