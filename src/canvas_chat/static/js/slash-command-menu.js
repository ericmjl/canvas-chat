/**
 * Slash command autocomplete menu
 */

import { NodeRegistry } from './node-registry.js';
import { storage } from './storage.js';

// FeatureRegistry will be injected at runtime (after app initialization)
let featureRegistry = null;

/**
 * Set the FeatureRegistry instance (called from app.js after initialization)
 * @param {FeatureRegistry} registry - FeatureRegistry instance
 */
export function setFeatureRegistry(registry) {
    featureRegistry = registry;
}

// Built-in slash command definitions
// Note: /note is now handled by NoteFeature plugin, but kept here for backwards compatibility
// until all commands are migrated to plugins
const BUILTIN_SLASH_COMMANDS = [
    { command: '/search', description: 'Search the web', placeholder: 'query' },
    { command: '/research', description: 'Deep research', placeholder: 'topic' },
    { command: '/matrix', description: 'Create a comparison matrix', placeholder: 'context for matrix' },
    { command: '/committee', description: 'Consult multiple LLMs and synthesize', placeholder: 'question' },
    {
        command: '/factcheck',
        description: 'Verify claims with web search',
        placeholder: 'claim(s) to verify',
        requiresContext: true,
    },
    // Note: /code is now handled by CodeFeature plugin (removed from here to avoid duplicate)
];

/**
 * Get all available slash commands (built-in + node plugins + feature plugins)
 * @returns {Array} Combined array of all slash commands
 */
function getAllSlashCommands() {
    const nodePluginCommands = NodeRegistry.getSlashCommands();
    const featurePluginCommands = featureRegistry?.getSlashCommandsWithMetadata() || [];
    return [...BUILTIN_SLASH_COMMANDS, ...nodePluginCommands, ...featurePluginCommands];
}

// Export for backwards compatibility
const SLASH_COMMANDS = getAllSlashCommands();

/**
 * Slash command autocomplete menu
 */
class SlashCommandMenu {
    /**
     *
     */
    constructor() {
        this.menu = null;
        this.activeInput = null;
        this.selectedIndex = 0;
        this.visible = false;
        this.filteredCommands = [];
        this.onSelect = null; // Callback when command is selected
        this.justSelected = false; // Flag to prevent immediate send after selection
        this.getHasContext = null; // Callback to check if context is available (selected nodes)
        this.getHasSelectedCsv = null; // Callback to check if a CSV node is selected

        this.createMenu();
    }

    /**
     *
     */
    createMenu() {
        this.menu = document.createElement('div');
        this.menu.className = 'slash-command-menu';
        this.menu.style.display = 'none';
        document.body.appendChild(this.menu);

        // Prevent clicks inside menu from blurring input
        this.menu.addEventListener('mousedown', (e) => {
            e.preventDefault();
        });
    }

    /**
     * Attach to an input element
     * @param input
     * @param onSelect
     */
    attach(input, onSelect) {
        this.onSelect = onSelect;

        // Store original placeholder for later reset
        input.dataset.originalPlaceholder = input.placeholder;

        input.addEventListener('input', (e) => this.handleInput(e, input));
        input.addEventListener('keydown', (e) => this.handleKeydown(e, input));
        input.addEventListener('blur', () => {
            // Delay hide to allow click on menu item
            setTimeout(() => this.hide(), 150);
        });
    }

    /**
     *
     * @param e
     * @param input
     */
    handleInput(e, input) {
        const value = input.value;

        // Clear the justSelected flag only on real user input (not programmatic)
        if (!e._programmatic) {
            this.justSelected = false;
        }

        // Reset placeholder if input is empty or doesn't start with /
        if (!value || !value.startsWith('/')) {
            input.placeholder = input.dataset.originalPlaceholder || 'Type a message...';
        }

        // Check if typing a slash command
        if (value.startsWith('/')) {
            const typed = value.split(' ')[0].toLowerCase(); // Just the command part

            // Filter commands that match (get fresh list to include plugin commands)
            const allCommands = getAllSlashCommands();
            this.filteredCommands = allCommands.filter((cmd) => cmd.command.toLowerCase().startsWith(typed));

            if (this.filteredCommands.length > 0 && !value.includes(' ')) {
                // Show menu only if still typing command (no space yet)
                this.show(input);
            } else {
                this.hide();
            }
        } else {
            this.hide();
        }
    }

    /**
     *
     * @param {KeyboardEvent} e
     * @param {HTMLTextAreaElement} input
     * @returns {boolean}
     */
    handleKeydown(e, input) {
        // If we just selected a command, block the next Enter from sending
        if (this.justSelected && e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            this.justSelected = false;
            return true;
        }

        if (!this.visible) return false;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                e.stopPropagation();
                this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredCommands.length - 1);
                this.render();
                return true;
            case 'ArrowUp':
                e.preventDefault();
                e.stopPropagation();
                this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
                this.render();
                return true;
            case 'Tab':
            case 'Enter':
                if (this.filteredCommands.length > 0) {
                    const cmd = this.filteredCommands[this.selectedIndex];
                    if (!this.isCommandDisabled(cmd)) {
                        e.preventDefault();
                        e.stopPropagation();
                        this.selectCommand(input, cmd);
                        return true;
                    }
                }
                break;
            case 'Escape':
                e.preventDefault();
                e.stopPropagation();
                this.hide();
                return true;
        }
        return false;
    }

    /**
     *
     * @param input
     * @param cmd
     */
    selectCommand(input, cmd) {
        // Insert the command with a trailing space
        input.value = cmd.command + ' ';

        // Update placeholder to hint at expected input
        if (cmd.placeholder) {
            input.placeholder = cmd.placeholder + '...';
        }

        input.focus();

        // Trigger input event for any listeners (but mark it as programmatic)
        const event = new Event('input', { bubbles: true });
        event._programmatic = true;
        input.dispatchEvent(event);

        // Set flag AFTER dispatching event to prevent immediate send
        this.justSelected = true;

        this.hide();

        if (this.onSelect) {
            this.onSelect(cmd);
        }
    }

    /**
     *
     * @param input
     */
    show(input) {
        this.activeInput = input;
        this.visible = true;
        this.selectedIndex = 0;

        // Position menu above the input
        const rect = input.getBoundingClientRect();
        this.menu.style.display = 'block';
        this.menu.style.left = `${rect.left}px`;
        this.menu.style.bottom = `${window.innerHeight - rect.top + 4}px`;
        this.menu.style.minWidth = `${Math.min(rect.width, 300)}px`;

        this.render();
    }

    /**
     *
     */
    hide() {
        this.visible = false;
        this.menu.style.display = 'none';
        this.activeInput = null;
    }

    /**
     * Check if a command is currently disabled
     * @param {Object} cmd
     * @returns {boolean}
     */
    isCommandDisabled(cmd) {
        const hasExa = storage.hasExaApiKey();
        const inputText = this.activeInput ? this.activeInput.value : '';
        const hasInputText = inputText.includes(' ') && inputText.split(' ').slice(1).join(' ').trim().length > 0;
        const hasSelectedNodes = this.getHasContext ? this.getHasContext() : false;
        const hasContext = hasInputText || hasSelectedNodes;
        const hasSelectedCsv = this.getHasSelectedCsv ? this.getHasSelectedCsv() : false;

        const isExaDisabled = cmd.requiresExa && !hasExa;
        const isContextDisabled = cmd.requiresContext && !hasContext;
        const isCsvDisabled = cmd.requiresCsv && !hasSelectedCsv;
        return isExaDisabled || isContextDisabled || isCsvDisabled;
    }

    /**
     *
     */
    render() {
        const hasExa = storage.hasExaApiKey();
        // Check if context is available (selected nodes or text after command)
        const inputText = this.activeInput ? this.activeInput.value : '';
        const hasInputText = inputText.includes(' ') && inputText.split(' ').slice(1).join(' ').trim().length > 0;
        const hasSelectedNodes = this.getHasContext ? this.getHasContext() : false;
        const hasContext = hasInputText || hasSelectedNodes;
        const hasSelectedCsv = this.getHasSelectedCsv ? this.getHasSelectedCsv() : false;

        const commandsHtml = this.filteredCommands
            .map((cmd, index) => {
                const isExaDisabled = cmd.requiresExa && !hasExa;
                const isContextDisabled = cmd.requiresContext && !hasContext;
                const isCsvDisabled = cmd.requiresCsv && !hasSelectedCsv;
                const isDisabled = isExaDisabled || isContextDisabled || isCsvDisabled;
                const disabledClass = isDisabled ? 'disabled' : '';
                let disabledSuffix = '';
                if (isExaDisabled) {
                    disabledSuffix = ' <span class="requires-exa">(requires Exa)</span>';
                } else if (isContextDisabled) {
                    disabledSuffix = ' <span class="requires-context">(requires text or selected node)</span>';
                } else if (isCsvDisabled) {
                    disabledSuffix = ' <span class="requires-csv">(requires selected CSV node)</span>';
                }

                // Show which provider will be used for search/research commands
                let description = cmd.description;
                if (cmd.command === '/search') {
                    const provider = hasExa ? 'Exa' : 'DuckDuckGo';
                    description = `Search the web (${provider})`;
                } else if (cmd.command === '/research') {
                    const provider = hasExa ? 'Exa' : 'DuckDuckGo';
                    description = `Deep research (${provider})`;
                }

                return `
            <div class="slash-command-item ${index === this.selectedIndex ? 'selected' : ''} ${disabledClass}"
                 data-index="${index}">
                <span class="slash-command-name">${cmd.command}</span>
                <span class="slash-command-desc">${description}${disabledSuffix}</span>
            </div>
        `;
            })
            .join('');

        this.menu.innerHTML = `
            ${commandsHtml}
            <div class="slash-command-hint">
                <kbd>↑</kbd><kbd>↓</kbd> navigate · <kbd>Tab</kbd> select · <kbd>Esc</kbd> dismiss
            </div>
        `;

        // Add click handlers
        this.menu.querySelectorAll('.slash-command-item').forEach((item, index) => {
            item.addEventListener('click', () => {
                const cmd = this.filteredCommands[index];
                if (!this.isCommandDisabled(cmd)) {
                    this.selectedIndex = index;
                    this.selectCommand(this.activeInput, cmd);
                }
            });
        });
    }
}

// Export for browser
window.SlashCommandMenu = SlashCommandMenu;
window.SLASH_COMMANDS = getAllSlashCommands();
window.getAllSlashCommands = getAllSlashCommands;

export { getAllSlashCommands, SLASH_COMMANDS, SlashCommandMenu };
