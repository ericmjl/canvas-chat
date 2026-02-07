/**
 * Skill Feature Plugin - /skill command for discovering and invoking skills
 *
 * Provides:
 * - `/skill` - List all available skills
 * - `/skill <name>` - Invoke a skill by name
 * - `/skill list [tag]` - List skills, optionally filtered by tag
 * - `/skill info <name>` - Show detailed skill information
 *
 * @module plugins/skill-feature
 */

import { FeaturePlugin } from '../feature-plugin.js';
import {
    getSkillRegistry,
    registerBuiltInSkills,
    createSkillInvocationService,
    createSkillInvocationRequest,
} from '../agent/index.js';

/**
 * SkillFeature - Plugin for skill discovery and invocation
 * @extends FeaturePlugin
 */
export class SkillFeature extends FeaturePlugin {
    /**
     * @param {import('../feature-plugin.js').AppContext} context
     */
    constructor(context) {
        super(context);
        // graph, canvas, chat, storage are available via getters from FeaturePlugin base class

        /** @type {import('../agent/skill-registry.js').SkillRegistry|null} */
        this.registry = null;

        /** @type {import('../agent/skill-invocation-service.js').SkillInvocationService|null} */
        this.invocationService = null;
    }

    /**
     * Get plugin name
     * @returns {string}
     */
    get name() {
        return 'skill-feature';
    }

    /**
     * Initialize the skill system
     */
    _initializeSkillSystem() {
        if (!this.registry) {
            this.registry = getSkillRegistry();
            // Register built-in skills
            registerBuiltInSkills(this.registry);
        }

        if (!this.invocationService) {
            this.invocationService = createSkillInvocationService({
                graph: this.graph,
                canvas: this.canvas,
                chat: this.chat,
                storage: this.storage,
            });
        }
    }

    /**
     * Plugin lifecycle - called when loaded
     */
    async onLoad() {
        console.log('[SkillFeature] Loaded');
        this._initializeSkillSystem();
    }

    /**
     * Get slash commands provided by this plugin
     * @returns {import('../feature-plugin.js').SlashCommand[]}
     */
    getSlashCommands() {
        return [
            {
                command: '/skill',
                description: 'Discover and invoke skills (Codex-style)',
                placeholder: 'list, info <name>, or <skill-name> [args]',
            },
            {
                command: '/skills',
                description: 'Alias for /skill list',
                placeholder: '[tag filter]',
            },
        ];
    }

    /**
     * Handle slash command
     * @param {string} command - Command name
     * @param {string} args - Command arguments
     * @param {import('../feature-plugin.js').CommandContext} context - Execution context
     * @returns {Promise<boolean>} Whether the command was handled
     */
    async handleCommand(command, args, context) {
        const normalizedCmd = command.toLowerCase();

        if (normalizedCmd === '/skills') {
            return this._handleListCommand(args, context);
        }

        if (normalizedCmd === '/skill') {
            return this._handleSkillCommand(args, context);
        }

        return false;
    }

    /**
     * Handle /skill command with subcommands
     * @param {string} args - Command arguments
     * @param {import('../feature-plugin.js').CommandContext} context
     * @returns {Promise<boolean>}
     * @private
     */
    async _handleSkillCommand(args, context) {
        this._initializeSkillSystem();
        const parts = args.trim().split(/\s+/);
        const subcommand = parts[0]?.toLowerCase();

        // No args = list all skills
        if (!args.trim()) {
            return this._handleListCommand('', context);
        }

        // Handle subcommands
        switch (subcommand) {
            case 'list':
                return this._handleListCommand(parts.slice(1).join(' '), context);

            case 'info':
                return this._handleInfoCommand(parts.slice(1).join(' '), context);

            case 'invoke':
                return this._handleInvokeCommand(parts.slice(1), context);

            default:
                // Try to match as skill invocation
                return this._handleSkillInvocation(args, context);
        }
    }

    /**
     * Handle skill list command
     * @param {string} filter - Optional tag filter
     * @param {import('../feature-plugin.js').CommandContext} context
     * @returns {Promise<boolean>}
     * @private
     */
    async _handleListCommand(filter, context) {
        const options = {};
        if (filter) {
            options.tags = [filter];
        }

        const skills = this.registry.listSkills(options);

        if (skills.length === 0) {
            this._showMessage(filter ? `No skills found with tag "${filter}"` : 'No skills registered');
            return true;
        }

        // Format skill list
        const lines = skills.map((s) => {
            const icon = s.icon || '🔧';
            const tags = s.tags.length > 0 ? ` [${s.tags.join(', ')}]` : '';
            return `${icon} **${s.name}** (${s.id})${tags}\n   ${s.description}`;
        });

        const content = `## Available Skills\n\n${lines.join('\n\n')}`;

        // Create a note node with the list
        await this._createOutputNode(content, 'Skills List', context);

        return true;
    }

    /**
     * Handle skill info command
     * @param {string} skillId - Skill ID or name
     * @param {import('../feature-plugin.js').CommandContext} context
     * @returns {Promise<boolean>}
     * @private
     */
    async _handleInfoCommand(skillId, context) {
        if (!skillId) {
            this._showMessage('Usage: /skill info <skill-id>');
            return true;
        }

        // Try to find by ID first, then by name
        let skill = this.registry.getSkill(skillId);
        if (!skill) {
            // Search by name
            const skills = this.registry.searchSkills(skillId);
            skill = skills[0];
        }

        if (!skill) {
            this._showMessage(`Skill not found: ${skillId}`);
            return true;
        }

        // Format detailed info
        const triggers = skill.triggers
            .map((t) => `- ${t.type}: \`${t.value}\`${t.priority ? ` (priority: ${t.priority})` : ''}`)
            .join('\n');

        const permissions = skill.permissions?.capabilities?.map((c) => `- ${c.category}: ${c.level}`).join('\n');

        const content = `## ${skill.icon || '🔧'} ${skill.name}

**ID:** \`${skill.id}\`
**Version:** ${skill.version}
**Mode:** ${skill.mode}
**Tags:** ${skill.tags.join(', ') || 'none'}

### Description
${skill.description}

### Triggers
${triggers || 'No triggers defined'}

### Permissions
${permissions || 'Default permissions'}

${skill.builtin ? '*This is a built-in skill*' : `**Source:** ${skill.source}`}`;

        await this._createOutputNode(content, `Skill: ${skill.name}`, context);

        return true;
    }

    /**
     * Handle explicit invoke command
     * @param {string[]} parts - [skillId, ...args]
     * @param {import('../feature-plugin.js').CommandContext} context
     * @returns {Promise<boolean>}
     * @private
     */
    async _handleInvokeCommand(parts, context) {
        const skillId = parts[0];
        const message = parts.slice(1).join(' ');

        if (!skillId) {
            this._showMessage('Usage: /skill invoke <skill-id> [message]');
            return true;
        }

        return this._invokeSkill(skillId, message, context);
    }

    /**
     * Handle skill invocation (either by command trigger or direct name)
     * @param {string} input - User input
     * @param {import('../feature-plugin.js').CommandContext} context
     * @returns {Promise<boolean>}
     * @private
     */
    async _handleSkillInvocation(input, context) {
        // Try to match input to a skill
        const match = this.registry.matchInput(input);

        if (match) {
            // Found a matching skill
            return this._invokeSkill(match.skill.id, match.args, context);
        }

        // Try to find by name or ID
        const parts = input.trim().split(/\s+/);
        const potentialId = parts[0];
        const skill = this.registry.getSkill(potentialId) || this.registry.searchSkills(potentialId)[0];

        if (skill) {
            const message = parts.slice(1).join(' ');
            return this._invokeSkill(skill.id, message, context);
        }

        // No skill found
        this._showMessage(`No skill found matching: ${input}\n\nUse \`/skill list\` to see available skills.`);
        return true;
    }

    /**
     * Invoke a skill
     * @param {string} skillId - Skill ID
     * @param {string} message - User message
     * @param {import('../feature-plugin.js').CommandContext} context
     * @returns {Promise<boolean>}
     * @private
     */
    async _invokeSkill(skillId, message, context) {
        const skill = this.registry.getSkill(skillId);
        if (!skill) {
            this._showMessage(`Skill not found: ${skillId}`);
            return true;
        }

        // Get context from selected nodes
        const contextNodeIds = context.selectedNodeIds || [];

        // Get parent node (where to attach result)
        const parentNodeId = contextNodeIds[0] || this._findLastNode();

        const request = createSkillInvocationRequest({
            skillId,
            message: message || undefined,
            contextNodeIds,
            parentNodeId,
        });

        try {
            const result = await this.invocationService.invoke(request);

            if (!result.success) {
                this._showMessage(`Skill failed: ${result.error}`);
            }
            // Success feedback is handled by the working node -> finalized node

            return true;
        } catch (error) {
            console.error('[SkillFeature] Invocation error:', error);
            this._showMessage(`Error invoking skill: ${error.message}`);
            return true;
        }
    }

    /**
     * Create an output node with content
     * @param {string} content - Node content
     * @param {string} title - Node title
     * @param {import('../feature-plugin.js').CommandContext} context
     * @private
     */
    async _createOutputNode(content, title, context) {
        const { NodeType, createNode, createEdge, EdgeType } = await import('../graph-types.js');

        const parentNodeId = context.selectedNodeIds?.[0] || this._findLastNode();

        const node = createNode(NodeType.NOTE, content, {
            title,
        });

        // Position near parent if exists
        if (parentNodeId) {
            const parentNode = this.graph.getNode(parentNodeId);
            if (parentNode) {
                node.position = {
                    x: parentNode.position.x + 50,
                    y: parentNode.position.y + (parentNode.height || 200) + 50,
                };
            }
        }

        this.graph.addNode(node);

        // Add edge from parent
        if (parentNodeId) {
            const edge = createEdge(parentNodeId, node.id, EdgeType.REPLY);
            this.graph.addEdge(edge);
        }

        // Render and select
        this.canvas.renderNode(node);
        this.canvas.selectNode(node.id);
        this.canvas.panToNode(node.id);
    }

    /**
     * Find the last node in the graph (for positioning)
     * @returns {string|null}
     * @private
     */
    _findLastNode() {
        const nodes = this.graph.getAllNodes();
        if (nodes.length === 0) return null;

        // Find node with latest timestamp or rightmost position
        let lastNode = nodes[0];
        for (const node of nodes) {
            if (node.timestamp > lastNode.timestamp) {
                lastNode = node;
            }
        }
        return lastNode.id;
    }

    /**
     * Show a brief message to the user
     * @param {string} message - Message to show
     * @private
     */
    _showMessage(message) {
        // Use toast or alert based on availability
        if (this._context.showToast) {
            this._context.showToast(message);
        } else {
            console.log('[SkillFeature]', message);
        }
    }

    /**
     * Get canvas event handlers (for skill-related canvas events)
     * @returns {Object<string, Function>}
     */
    getCanvasEventHandlers() {
        return {
            // Handle skill node actions
            skillRunAction: this._handleSkillRunAction.bind(this),
        };
    }

    /**
     * Handle skill run node actions
     * @param {Object} event - Canvas event
     * @private
     */
    async _handleSkillRunAction(event) {
        const { nodeId, action } = event;

        switch (action) {
            case 'cancel':
                // Cancel running skill
                const node = this.graph.getNode(nodeId);
                if (node?.metadata?.runId) {
                    this.invocationService.cancel(node.metadata.runId);
                }
                break;

            case 'retry':
                // Retry failed skill
                const retryNode = this.graph.getNode(nodeId);
                if (retryNode?.metadata?.skillId) {
                    await this._invokeSkill(retryNode.metadata.skillId, retryNode.metadata.message || '', {
                        selectedNodeIds: retryNode.metadata.contextNodeIds || [],
                    });
                }
                break;

            default:
                console.log('[SkillFeature] Unknown action:', action);
        }
    }
}

// Export for registration
export default SkillFeature;

// Export for global scope (browser compatibility)
if (typeof window !== 'undefined') {
    window.SkillFeature = SkillFeature;
}
