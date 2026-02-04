/**
 * Skill Resolver - On-demand loading of full skill definitions from SKILL.md files
 *
 * The SkillResolver handles:
 * - Discovering SKILL.md files in configured directories
 * - Parsing SKILL.md frontmatter and content
 * - Loading full SkillDefinition on-demand (not at startup)
 * - Caching resolved definitions to avoid re-parsing
 * - Validating skill definitions
 *
 * SKILL.md format:
 * ```markdown
 * ---
 * id: my-skill
 * name: My Skill
 * description: Does something useful
 * version: 1.0.0
 * mode: instruction  # or 'script'
 * tags: [productivity, text]
 * triggers:
 *   - type: command
 *     value: myskill
 *   - type: pattern
 *     value: "^do something"
 *     priority: 5
 * permissions:
 *   capabilities:
 *     - category: graph
 *       level: read
 *     - category: llm
 *       level: execute
 *   requiresApproval: false
 *   maxTokens: 4096
 * parameters:
 *   - name: target
 *     type: string
 *     description: What to process
 *     required: true
 * tools:
 *   - graph:getNode
 *   - graph:addNode
 * icon: 🚀
 * ---
 *
 * # Instructions (for mode: instruction)
 *
 * You are a helpful assistant that...
 *
 * ## Steps
 * 1. First, analyze the input...
 * 2. Then, process...
 *
 * ```
 *
 * For script mode, the content after frontmatter is the script code.
 *
 * @module agent/skill-resolver
 */

import { createSkillDefinition, createSkillMetadata, DEFAULT_SKILL_PERMISSIONS } from './skill-types.js';
import { createComponentLogger, LogLevel } from './debug-logger.js';

const logger = createComponentLogger('SkillResolver', LogLevel.DEBUG);

/**
 * Parse YAML frontmatter from markdown content
 * @param {string} content - Raw markdown content
 * @returns {{frontmatter: Object, body: string}} Parsed frontmatter and remaining body
 */
function parseFrontmatter(content) {
    const trimmed = content.trim();
    if (!trimmed.startsWith('---')) {
        return { frontmatter: {}, body: content };
    }

    const endIndex = trimmed.indexOf('\n---', 3);
    if (endIndex === -1) {
        return { frontmatter: {}, body: content };
    }

    const yamlContent = trimmed.slice(4, endIndex).trim();
    const body = trimmed.slice(endIndex + 4).trim();

    try {
        // Simple YAML parser for common cases
        // For production, consider using a full YAML library
        const frontmatter = parseSimpleYaml(yamlContent);
        return { frontmatter, body };
    } catch (e) {
        logger.warn('Failed to parse frontmatter:', e);
        return { frontmatter: {}, body: content };
    }
}

/**
 * Simple YAML parser for skill frontmatter
 * Handles common cases: strings, numbers, booleans, arrays, nested objects
 * @param {string} yaml - YAML content
 * @returns {Object} Parsed object
 */
function parseSimpleYaml(yaml) {
    const result = {};
    const lines = yaml.split('\n');
    let currentKey = null;
    let currentArray = null;
    let currentObject = null;
    let objectKey = null;
    let indent = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // Skip empty lines and comments
        if (!trimmedLine || trimmedLine.startsWith('#')) {
            continue;
        }

        const lineIndent = line.length - line.trimStart().length;

        // Check for array item
        if (trimmedLine.startsWith('- ')) {
            const value = trimmedLine.slice(2).trim();

            // Array of objects (e.g., triggers, capabilities)
            if (value.includes(':')) {
                const [objKey, objVal] = value.split(':').map((s) => s.trim());
                currentObject = { [objKey]: parseValue(objVal) };
                currentArray.push(currentObject);
                objectKey = null;
            } else {
                // Simple array item
                if (currentArray) {
                    currentArray.push(parseValue(value));
                }
            }
            continue;
        }

        // Check for object property continuation
        if (lineIndent > indent && currentObject && trimmedLine.includes(':')) {
            const [key, val] = trimmedLine.split(':').map((s) => s.trim());
            currentObject[key] = parseValue(val);
            continue;
        }

        // Regular key: value
        if (trimmedLine.includes(':')) {
            const colonIndex = trimmedLine.indexOf(':');
            const key = trimmedLine.slice(0, colonIndex).trim();
            const value = trimmedLine.slice(colonIndex + 1).trim();

            if (value === '' || value === '|') {
                // Array or multi-line value coming
                if (i + 1 < lines.length && lines[i + 1].trim().startsWith('-')) {
                    currentKey = key;
                    currentArray = [];
                    result[key] = currentArray;
                    indent = lineIndent;
                    currentObject = null;
                }
            } else if (value.startsWith('[') && value.endsWith(']')) {
                // Inline array [a, b, c]
                const items = value
                    .slice(1, -1)
                    .split(',')
                    .map((s) => parseValue(s.trim()));
                result[key] = items;
                currentArray = null;
                currentObject = null;
            } else {
                result[key] = parseValue(value);
                currentArray = null;
                currentObject = null;
            }
        }
    }

    return result;
}

/**
 * Parse a YAML value
 * @param {string} value - Raw value string
 * @returns {*} Parsed value
 */
function parseValue(value) {
    if (!value || value === '' || value === 'null') return null;
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^-?\d+$/.test(value)) return parseInt(value, 10);
    if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);

    // Remove quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
    }

    return value;
}

/**
 * Validate a skill definition
 * @param {import('./skill-types.js').SkillDefinition} skill - Skill to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateSkill(skill) {
    const errors = [];

    if (!skill.id) errors.push('Missing required field: id');
    if (!skill.name) errors.push('Missing required field: name');
    if (!skill.mode) errors.push('Missing required field: mode');

    if (skill.mode === 'script' && !skill.script) {
        errors.push('Script mode skill must have script content');
    }

    if (skill.mode === 'instruction' && !skill.instructions) {
        errors.push('Instruction mode skill must have instructions');
    }

    if (skill.mode === 'script' && !skill.scriptLanguage) {
        errors.push('Script mode skill must specify scriptLanguage (python or javascript)');
    }

    if (skill.parameters) {
        for (const param of skill.parameters) {
            if (!param.name) errors.push(`Parameter missing name`);
            if (!param.type) errors.push(`Parameter ${param.name} missing type`);
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * SkillResolver - Loads full skill definitions on-demand
 */
export class SkillResolver {
    /**
     * @param {Object} options - Resolver options
     * @param {string[]} [options.skillDirs] - Directories to search for SKILL.md files
     * @param {Function} [options.fetchFile] - Custom file fetcher (for testing or different environments)
     */
    constructor(options = {}) {
        this.skillDirs = options.skillDirs || ['./skills'];
        this.fetchFile =
            options.fetchFile || ((path) => fetch(path).then((r) => (r.ok ? r.text() : Promise.reject(r.statusText))));

        /**
         * Cache of resolved definitions
         * @type {Map<string, import('./skill-types.js').SkillDefinition>}
         */
        this.cache = new Map();

        /**
         * Map of skill ID to source path (for cache invalidation)
         * @type {Map<string, string>}
         */
        this.sourcePaths = new Map();

        logger.debug('SkillResolver initialized', { skillDirs: this.skillDirs });
    }

    /**
     * Resolve a skill by ID - load full definition
     * @param {string} skillId - Skill ID
     * @param {string} [source] - Source path (if known from metadata)
     * @returns {Promise<import('./skill-types.js').SkillDefinition|null>}
     */
    async resolve(skillId, source) {
        // Check cache first
        if (this.cache.has(skillId)) {
            logger.debug(`Returning cached skill: ${skillId}`);
            return this.cache.get(skillId);
        }

        // If source path is known, load directly
        if (source && source !== 'builtin') {
            return this._loadFromPath(source);
        }

        // Try to find in configured directories
        for (const dir of this.skillDirs) {
            const path = `${dir}/${skillId}.md`;
            try {
                const skill = await this._loadFromPath(path);
                if (skill) return skill;
            } catch {
                // Not found in this directory, try next
            }
        }

        // Also try SKILL.md in subdirectory
        for (const dir of this.skillDirs) {
            const path = `${dir}/${skillId}/SKILL.md`;
            try {
                const skill = await this._loadFromPath(path);
                if (skill) return skill;
            } catch {
                // Not found
            }
        }

        logger.warn(`Could not resolve skill: ${skillId}`);
        return null;
    }

    /**
     * Load a skill from a specific path
     * @param {string} path - Path to SKILL.md file
     * @returns {Promise<import('./skill-types.js').SkillDefinition|null>}
     * @private
     */
    async _loadFromPath(path) {
        try {
            logger.debug(`Loading skill from: ${path}`);
            const content = await this.fetchFile(path);
            const skill = this.parseSkillFile(content, path);

            if (skill) {
                // Validate
                const { valid, errors } = validateSkill(skill);
                if (!valid) {
                    logger.warn(`Invalid skill at ${path}:`, errors);
                    return null;
                }

                // Cache it
                this.cache.set(skill.id, skill);
                this.sourcePaths.set(skill.id, path);
                logger.debug(`Loaded and cached skill: ${skill.id}`);
                return skill;
            }
        } catch (e) {
            logger.debug(`Failed to load skill from ${path}:`, e.message);
        }
        return null;
    }

    /**
     * Parse a SKILL.md file into a SkillDefinition
     * @param {string} content - File content
     * @param {string} source - Source path
     * @returns {import('./skill-types.js').SkillDefinition|null}
     */
    parseSkillFile(content, source) {
        const { frontmatter, body } = parseFrontmatter(content);

        if (!frontmatter.id && !frontmatter.name) {
            logger.warn(`Skill file missing id/name in frontmatter: ${source}`);
            return null;
        }

        // Build skill definition from frontmatter + body
        const skill = createSkillDefinition({
            id: frontmatter.id || this._idFromPath(source),
            name: frontmatter.name || frontmatter.id,
            description: frontmatter.description || '',
            version: frontmatter.version || '1.0.0',
            tags: frontmatter.tags || [],
            triggers: frontmatter.triggers || [],
            mode: frontmatter.mode || 'instruction',
            permissions: {
                ...DEFAULT_SKILL_PERMISSIONS,
                ...frontmatter.permissions,
            },
            source,
            icon: frontmatter.icon,
            builtin: frontmatter.builtin || false,

            // Full content fields
            instructions: frontmatter.mode === 'script' ? undefined : body,
            script: frontmatter.mode === 'script' ? body : undefined,
            scriptLanguage: frontmatter.scriptLanguage || frontmatter.language,
            parameters: frontmatter.parameters || [],
            systemPrompt: frontmatter.systemPrompt,
            tools: frontmatter.tools || [],
            outputFormat: frontmatter.outputFormat,
        });

        return skill;
    }

    /**
     * Extract metadata from a skill file (without full instructions/script)
     * Useful for discovery without loading full content.
     * @param {string} content - File content
     * @param {string} source - Source path
     * @returns {import('./skill-types.js').SkillMetadata|null}
     */
    extractMetadata(content, source) {
        const { frontmatter } = parseFrontmatter(content);

        if (!frontmatter.id && !frontmatter.name) {
            return null;
        }

        return createSkillMetadata({
            id: frontmatter.id || this._idFromPath(source),
            name: frontmatter.name || frontmatter.id,
            description: frontmatter.description || '',
            version: frontmatter.version || '1.0.0',
            tags: frontmatter.tags || [],
            triggers: frontmatter.triggers || [],
            mode: frontmatter.mode || 'instruction',
            permissions: {
                ...DEFAULT_SKILL_PERMISSIONS,
                ...frontmatter.permissions,
            },
            source,
            icon: frontmatter.icon,
            builtin: frontmatter.builtin || false,
        });
    }

    /**
     * Derive skill ID from file path
     * @param {string} path - File path
     * @returns {string}
     * @private
     */
    _idFromPath(path) {
        const filename = path.split('/').pop() || '';
        return (
            filename
                .replace(/\.md$/i, '')
                .replace(/^SKILL$/i, '')
                .toLowerCase() || 'unknown'
        );
    }

    /**
     * Invalidate cache for a skill
     * @param {string} skillId - Skill ID to invalidate
     */
    invalidate(skillId) {
        this.cache.delete(skillId);
        this.sourcePaths.delete(skillId);
        logger.debug(`Cache invalidated for: ${skillId}`);
    }

    /**
     * Clear entire cache
     */
    clearCache() {
        this.cache.clear();
        this.sourcePaths.clear();
        logger.debug('Cache cleared');
    }

    /**
     * Discover skills in configured directories.
     * Returns metadata only - doesn't load full definitions.
     * @returns {Promise<import('./skill-types.js').SkillMetadata[]>}
     */
    async discoverSkills() {
        const discovered = [];

        // This would need backend support to list directory contents
        // For now, this is a placeholder that would be implemented with
        // a backend endpoint like /api/skills/discover
        logger.warn('Skill discovery requires backend support');

        return discovered;
    }

    /**
     * Get resolved instructions for a skill, with built-in fallback support
     * @param {string} skillId - Skill ID
     * @param {string} [source] - Source path
     * @returns {Promise<string|null>}
     */
    async getInstructions(skillId, source) {
        const skill = await this.resolve(skillId, source);
        return skill?.instructions || null;
    }

    /**
     * Get resolved script for a skill
     * @param {string} skillId - Skill ID
     * @param {string} [source] - Source path
     * @returns {Promise<{script: string, language: string}|null>}
     */
    async getScript(skillId, source) {
        const skill = await this.resolve(skillId, source);
        if (skill?.script && skill?.scriptLanguage) {
            return {
                script: skill.script,
                language: skill.scriptLanguage,
            };
        }
        return null;
    }
}

/**
 * Built-in skill instruction templates
 * For skills marked as builtin, these provide the default instructions.
 */
export const BUILTIN_SKILL_INSTRUCTIONS = {
    'builtin:summarize': `You are a summarization assistant. Your task is to create a clear, concise summary of the provided content.

## Guidelines
- Identify the key points and main ideas
- Preserve important details while removing redundancy
- Maintain the original meaning and intent
- Use clear, accessible language
- Structure the summary logically

## Output
Provide a well-structured summary that captures the essence of the content.`,

    'builtin:explain': `You are an explanation assistant. Your task is to explain the provided content in simpler, more accessible terms.

## Guidelines
- Break down complex concepts into simpler parts
- Use analogies and examples where helpful
- Avoid jargon unless explaining it
- Target a general audience level
- Be thorough but concise

## Output
Provide a clear explanation that makes the content more understandable.`,
};

/**
 * Get built-in instructions for a skill
 * @param {string} skillId - Skill ID
 * @returns {string|null}
 */
export function getBuiltinInstructions(skillId) {
    return BUILTIN_SKILL_INSTRUCTIONS[skillId] || null;
}

// Export for global scope (browser compatibility)
if (typeof window !== 'undefined') {
    window.SkillResolver = SkillResolver;
    window.getBuiltinInstructions = getBuiltinInstructions;
}
