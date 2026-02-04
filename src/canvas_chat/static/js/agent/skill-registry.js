/**
 * Skill Registry - Metadata-only skill discovery and storage
 *
 * The SkillRegistry stores lightweight SkillMetadata for all registered skills.
 * It does NOT store full skill definitions (instructions/scripts) to keep memory
 * usage low. Use SkillResolver to load full definitions on-demand.
 *
 * Key responsibilities:
 * - Register skills from SKILL.md files
 * - List available skills by tags, triggers, or search
 * - Match user input to appropriate skills
 * - Provide skill metadata for UI display
 *
 * @module agent/skill-registry
 */

import { createSkillMetadata, DEFAULT_SKILL_PERMISSIONS } from './skill-types.js';
import { createComponentLogger, LogLevel } from './debug-logger.js';

const logger = createComponentLogger('SkillRegistry', LogLevel.DEBUG);

/**
 * SkillRegistry singleton instance
 * @type {SkillRegistry|null}
 */
let registryInstance = null;

/**
 * Get the global SkillRegistry instance
 * @returns {SkillRegistry}
 */
export function getSkillRegistry() {
    if (!registryInstance) {
        registryInstance = new SkillRegistry();
    }
    return registryInstance;
}

/**
 * SkillRegistry - Stores and queries skill metadata
 */
export class SkillRegistry {
    constructor() {
        /**
         * Map of skill ID to metadata
         * @type {Map<string, import('./skill-types.js').SkillMetadata>}
         */
        this.skills = new Map();

        /**
         * Index of command triggers for fast lookup
         * @type {Map<string, string>}
         */
        this.commandIndex = new Map();

        /**
         * Pattern triggers sorted by priority
         * @type {Array<{pattern: RegExp, skillId: string, priority: number}>}
         */
        this.patternIndex = [];

        /**
         * Index of tags to skill IDs
         * @type {Map<string, Set<string>>}
         */
        this.tagIndex = new Map();

        /**
         * Event handlers
         * @type {Map<string, Set<Function>>}
         */
        this.listeners = new Map();

        logger.debug('SkillRegistry initialized');
    }

    /**
     * Register a skill from metadata
     * @param {import('./skill-types.js').SkillMetadata} metadata - Skill metadata
     * @returns {boolean} Whether registration succeeded
     */
    registerSkill(metadata) {
        const skill = createSkillMetadata(metadata);

        // Validate required fields
        if (!skill.id || !skill.name) {
            logger.warn('Skill registration failed: missing id or name', skill);
            return false;
        }

        // Check for duplicate IDs
        if (this.skills.has(skill.id)) {
            logger.warn(`Skill ${skill.id} already registered, replacing`);
        }

        // Store metadata
        this.skills.set(skill.id, skill);

        // Index triggers
        for (const trigger of skill.triggers) {
            this._indexTrigger(skill.id, trigger);
        }

        // Index tags
        for (const tag of skill.tags) {
            if (!this.tagIndex.has(tag)) {
                this.tagIndex.set(tag, new Set());
            }
            this.tagIndex.get(tag).add(skill.id);
        }

        logger.debug(`Registered skill: ${skill.id}`, {
            name: skill.name,
            mode: skill.mode,
            triggers: skill.triggers.length,
            tags: skill.tags,
        });

        this._emit('skillRegistered', skill);
        return true;
    }

    /**
     * Index a trigger for fast lookup
     * @param {string} skillId - Skill ID
     * @param {import('./skill-types.js').SkillTrigger} trigger - Trigger definition
     * @private
     */
    _indexTrigger(skillId, trigger) {
        switch (trigger.type) {
            case 'command':
                // Normalize command (lowercase, no leading slash)
                const cmd = trigger.value.toLowerCase().replace(/^\//, '');
                this.commandIndex.set(cmd, skillId);
                break;

            case 'pattern':
                try {
                    const pattern = new RegExp(trigger.value, 'i');
                    this.patternIndex.push({
                        pattern,
                        skillId,
                        priority: trigger.priority || 0,
                    });
                    // Keep patterns sorted by priority (descending)
                    this.patternIndex.sort((a, b) => b.priority - a.priority);
                } catch (e) {
                    logger.warn(`Invalid pattern for skill ${skillId}: ${trigger.value}`);
                }
                break;

            // Event and tool triggers are handled elsewhere
        }
    }

    /**
     * Unregister a skill
     * @param {string} skillId - Skill ID to remove
     * @returns {boolean} Whether removal succeeded
     */
    unregisterSkill(skillId) {
        const skill = this.skills.get(skillId);
        if (!skill) {
            return false;
        }

        // Remove from main map
        this.skills.delete(skillId);

        // Remove from command index
        for (const [cmd, id] of this.commandIndex) {
            if (id === skillId) {
                this.commandIndex.delete(cmd);
            }
        }

        // Remove from pattern index
        this.patternIndex = this.patternIndex.filter((p) => p.skillId !== skillId);

        // Remove from tag index
        for (const [tag, ids] of this.tagIndex) {
            ids.delete(skillId);
            if (ids.size === 0) {
                this.tagIndex.delete(tag);
            }
        }

        logger.debug(`Unregistered skill: ${skillId}`);
        this._emit('skillUnregistered', { id: skillId });
        return true;
    }

    /**
     * Get metadata for a skill by ID
     * @param {string} skillId - Skill ID
     * @returns {import('./skill-types.js').SkillMetadata|undefined}
     */
    getSkill(skillId) {
        return this.skills.get(skillId);
    }

    /**
     * List all registered skills
     * @param {Object} [options] - Filter options
     * @param {string[]} [options.tags] - Filter by tags (OR)
     * @param {string} [options.mode] - Filter by execution mode
     * @param {boolean} [options.builtin] - Filter by builtin flag
     * @returns {import('./skill-types.js').SkillMetadata[]}
     */
    listSkills(options = {}) {
        let results = Array.from(this.skills.values());

        if (options.tags && options.tags.length > 0) {
            results = results.filter((skill) => skill.tags.some((t) => options.tags.includes(t)));
        }

        if (options.mode) {
            results = results.filter((skill) => skill.mode === options.mode);
        }

        if (options.builtin !== undefined) {
            results = results.filter((skill) => skill.builtin === options.builtin);
        }

        return results;
    }

    /**
     * Search skills by name or description
     * @param {string} query - Search query
     * @returns {import('./skill-types.js').SkillMetadata[]}
     */
    searchSkills(query) {
        const lowerQuery = query.toLowerCase();
        return Array.from(this.skills.values()).filter(
            (skill) =>
                skill.name.toLowerCase().includes(lowerQuery) ||
                skill.description.toLowerCase().includes(lowerQuery) ||
                skill.tags.some((t) => t.toLowerCase().includes(lowerQuery))
        );
    }

    /**
     * Find skill by command trigger
     * @param {string} command - Command string (with or without leading slash)
     * @returns {import('./skill-types.js').SkillMetadata|undefined}
     */
    findByCommand(command) {
        const cmd = command.toLowerCase().replace(/^\//, '');
        const skillId = this.commandIndex.get(cmd);
        return skillId ? this.skills.get(skillId) : undefined;
    }

    /**
     * Find skills matching a pattern trigger
     * @param {string} text - Text to match against patterns
     * @returns {import('./skill-types.js').SkillMetadata[]}
     */
    findByPattern(text) {
        const matches = [];
        for (const { pattern, skillId } of this.patternIndex) {
            if (pattern.test(text)) {
                const skill = this.skills.get(skillId);
                if (skill) {
                    matches.push(skill);
                }
            }
        }
        return matches;
    }

    /**
     * Match user input to the most appropriate skill
     * Checks command triggers first, then pattern triggers.
     * @param {string} input - User input text
     * @returns {{skill: import('./skill-types.js').SkillMetadata, match: 'command'|'pattern', args: string}|null}
     */
    matchInput(input) {
        const trimmed = input.trim();

        // Check for command (starts with /)
        if (trimmed.startsWith('/')) {
            const [cmdPart, ...rest] = trimmed.split(/\s+/);
            const cmd = cmdPart.slice(1); // Remove leading slash
            const skill = this.findByCommand(cmd);
            if (skill) {
                return {
                    skill,
                    match: 'command',
                    args: rest.join(' '),
                };
            }
        }

        // Check pattern triggers
        const patternMatches = this.findByPattern(trimmed);
        if (patternMatches.length > 0) {
            return {
                skill: patternMatches[0], // Highest priority match
                match: 'pattern',
                args: trimmed,
            };
        }

        return null;
    }

    /**
     * Get all unique tags across all skills
     * @returns {string[]}
     */
    getAllTags() {
        return Array.from(this.tagIndex.keys()).sort();
    }

    /**
     * Get skill count
     * @returns {number}
     */
    get size() {
        return this.skills.size;
    }

    /**
     * Clear all registered skills
     */
    clear() {
        this.skills.clear();
        this.commandIndex.clear();
        this.patternIndex = [];
        this.tagIndex.clear();
        logger.debug('SkillRegistry cleared');
        this._emit('cleared');
    }

    /**
     * Subscribe to registry events
     * @param {'skillRegistered'|'skillUnregistered'|'cleared'} event - Event name
     * @param {Function} callback - Event handler
     * @returns {Function} Unsubscribe function
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
        return () => this.listeners.get(event)?.delete(callback);
    }

    /**
     * Emit an event
     * @param {string} event - Event name
     * @param {*} data - Event data
     * @private
     */
    _emit(event, data) {
        const handlers = this.listeners.get(event);
        if (handlers) {
            for (const handler of handlers) {
                try {
                    handler(data);
                } catch (e) {
                    logger.error(`Error in event handler for ${event}:`, e);
                }
            }
        }
    }

    /**
     * Export registry state for persistence
     * @returns {Object}
     */
    toJSON() {
        return {
            skills: Array.from(this.skills.values()),
        };
    }

    /**
     * Import registry state from persistence
     * @param {Object} data - Exported state
     */
    fromJSON(data) {
        this.clear();
        if (data.skills && Array.isArray(data.skills)) {
            for (const skill of data.skills) {
                this.registerSkill(skill);
            }
        }
    }
}

/**
 * Register built-in skills
 * These are core skills that ship with Canvas Chat.
 * @param {SkillRegistry} registry - Registry to populate
 */
export function registerBuiltInSkills(registry) {
    // Example built-in skill: Summarize
    registry.registerSkill({
        id: 'builtin:summarize',
        name: 'Summarize',
        description: 'Summarize the selected content or conversation branch',
        version: '1.0.0',
        tags: ['text', 'analysis', 'builtin'],
        triggers: [
            { type: 'command', value: 'summarize' },
            { type: 'pattern', value: '^summarize\\s+(this|the|my)', priority: 10 },
        ],
        mode: 'instruction',
        permissions: {
            ...DEFAULT_SKILL_PERMISSIONS,
            capabilities: [
                { category: 'graph', level: 'read' },
                { category: 'llm', level: 'execute' },
            ],
        },
        source: 'builtin',
        icon: '📝',
        builtin: true,
    });

    // Example built-in skill: Explain
    registry.registerSkill({
        id: 'builtin:explain',
        name: 'Explain',
        description: 'Explain the selected content in simpler terms',
        version: '1.0.0',
        tags: ['text', 'education', 'builtin'],
        triggers: [
            { type: 'command', value: 'explain' },
            { type: 'pattern', value: '^explain\\s+(this|that|what)', priority: 10 },
        ],
        mode: 'instruction',
        permissions: {
            ...DEFAULT_SKILL_PERMISSIONS,
            capabilities: [
                { category: 'graph', level: 'read' },
                { category: 'llm', level: 'execute' },
            ],
        },
        source: 'builtin',
        icon: '💡',
        builtin: true,
    });

    logger.info(`Registered ${registry.size} built-in skills`);
}

// Export for global scope (browser compatibility)
if (typeof window !== 'undefined') {
    window.SkillRegistry = SkillRegistry;
    window.getSkillRegistry = getSkillRegistry;
    window.registerBuiltInSkills = registerBuiltInSkills;
}
