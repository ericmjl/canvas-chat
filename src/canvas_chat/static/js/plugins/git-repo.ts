/**
 * Git Repository Feature Plugin
 *
 * Handles git repository URL fetching with interactive file selection.
 * Fully self-contained plugin that demonstrates plugin architecture.
 */

import { FeaturePlugin } from '../feature-plugin.js';
import { createNode, NodeType } from '../graph-types.js';
import { createEdge, EdgeType } from '../graph-types.js';
import { isUrlContent, apiUrl } from '../utils.js';
import { BaseNode, Actions, wrapNode } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';

/**
 * @typedef {Object} Canvas
 * @property {Map} outputPanels - Map of output panels
 * @property {Function} updateOutputPanelContent - Method to update panel content
 * @property {Function} selectGitRepoFile - Method to select a file in git repo node
 * @property {Function} renderNode - Method to render a node
 * @property {Function} showToast - Method to show toast notification
 * @property {Function} updateNodeContent - Method to update node content
 * @property {Function} showStopButton - Method to show stop button
 * @property {Function} hideStopButton - Method to hide stop button
 * @property {Function} showContinueButton - Method to show continue button
 * @property {Function} hideContinueButton - Method to hide continue button
 * @property {Map} nodeElements - Map of node elements
 * @property {boolean} [outputExpanded] - Whether output is expanded
 */

/**
 * @typedef {Object} GitRepoData
 * @property {string} url - Repository URL
 * @property {Object} files - Map of file paths to file data
 * @property {string} [selectedFilePath] - Currently selected file path
 */

/**
 * @typedef {Object} FileData
 * @property {string} content - File content
 * @property {string} status - File status ('success', 'error')
 * @property {string} [fileType] - File type (image, text, etc.)
 * @property {string} [mimeType] - MIME type for images
 */

/**
 * GitRepoFeature class manages git repository URL fetching.
 * Extends FeaturePlugin to integrate with the plugin architecture.
 */
export class GitRepoFeature extends FeaturePlugin {
    /**
     * @param {AppContext} context - Application context with injected dependencies
     */
    constructor(context) {
        super(context);
        // All properties (graph, canvas, modalManager, chatInput, showToast, etc.)
        // are already provided by FeaturePlugin base class via context
        // No need to assign them here
    }

    /**
     * Get slash commands for this feature
     * @returns {Array} Array of slash command definitions
     */
    getSlashCommands() {
        return [
            {
                command: '/git',
                description: 'Fetch git repository with file selection',
                placeholder: 'https://github.com/user/repo',
            },
        ];
    }

    /**
     * Handle /git slash command
     * @param {string} command - The slash command (e.g., '/git')
     * @param {string} args - Text after the command (URL)
     * @param {Object} _contextObj - Additional context (unused, kept for interface)
     */
    async handleCommand(command, args, _contextObj) {
        const url = args.trim();
        if (!url) {
            this.showToast?.('Please provide a repository URL', 'warning');
            return;
        }

        // Validate it's actually a URL
        if (!isUrlContent(url)) {
            this.showToast?.('Please provide a valid URL', 'warning');
            return;
        }

        // Use existing handleGitUrl() logic
        await this.handleGitUrl(url);
    }

    /**
     * Check if URL is a git repository URL
     * @param {string} _url - URL to check (unused, deprecated)
     * @returns {boolean} True if URL matches git repository patterns
     */
    // Note: isGitRepositoryUrl is no longer used - URL routing is handled by backend UrlFetchRegistry
    // This method is kept for backward compatibility but should not be called
    isGitRepositoryUrl(_url) {
        // Deprecated: URL routing is now handled by backend UrlFetchRegistry
        // This method may be removed in the future
        console.warn('[GitRepoFeature] isGitRepositoryUrl() is deprecated - use backend routing instead');
        return false;
    }

    /**
     * Extract git host from URL
     * @param {string} url - Git repository URL
     * @returns {string|null} Host (e.g., 'github.com') or null
     */
    extractGitHost(url) {
        try {
            // Handle SSH URLs: git@github.com:user/repo.git
            if (url.startsWith('git@')) {
                const match = url.match(/git@([^:]+):/);
                if (match) {
                    return match[1].toLowerCase();
                }
            }

            // Handle HTTPS/HTTP URLs: https://github.com/user/repo.git
            const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
            let host = urlObj.hostname.toLowerCase();
            // Remove port if present
            if (host.includes(':')) {
                host = host.split(':')[0];
            }
            return host;
        } catch (err) {
            console.warn('[GitRepoFeature] Failed to extract host from URL:', err);
            return null;
        }
    }

    /**
     * Get git credentials from plugin-specific localStorage
     * @returns {Object<string, string>} Map of host to credential
     */
    getGitCredentials() {
        const creds = localStorage.getItem('git-repo-plugin-credentials');
        return creds ? JSON.parse(creds) : {};
    }

    /**
     * Save git credentials to plugin-specific localStorage
     * @param {Object<string, string>} credentials - Map of host to credential
     */
    saveGitCredentials(credentials) {
        localStorage.setItem('git-repo-plugin-credentials', JSON.stringify(credentials));
    }

    /**
     * Get git credential for a specific host
     * @param {string} host - Git host (e.g., 'github.com')
     * @returns {string|null} Credential or null if not found
     */
    getGitCredentialForHost(host) {
        const creds = this.getGitCredentials();
        return creds[host] || null;
    }

    /**
     * Get git credentials for a specific URL's host
     * @param {string} url - Git repository URL
     * @returns {Object<string, string>} Map of host to credential (empty if none)
     */
    getGitCredentialsForUrl(url) {
        const host = this.extractGitHost(url);
        if (!host) {
            return {};
        }

        const cred = this.getGitCredentialForHost(host);
        if (!cred) {
            return {};
        }

        return { [host]: cred };
    }

    /**
     * Public API: Handle git repository URL
     * Called by NoteFeature when git URL is detected
     * @param {string} url - Git repository URL
     */
    async handleGitUrl(url) {
        await this.showFileSelectionModal(url);
    }

    /**
     * Show file selection modal for git repository
     * @param {string} url - Git repository URL
     */
    async showFileSelectionModal(url) {
        const modal = this.modalManager.getPluginModal('git-repo', 'file-selection');
        if (!modal) {
            this.showToast?.('File selection modal not found', 'error');
            return;
        }

        // Get selected nodes (if any) to link the fetched content to
        const parentIds = this.canvas.getSelectedNodeIds();

        // Create a placeholder node while fetching
        const fetchNode = createNode(NodeType.GIT_REPO, `Loading repository files:\n${url}...`, {
            position: this.graph.autoPosition(parentIds),
        });

        this.graph.addNode(fetchNode);
        this.canvas.clearSelection();

        // Create edges from parents (if replying to selected nodes)
        for (const parentId of parentIds) {
            const edge = createEdge(parentId, fetchNode.id, parentIds.length > 1 ? EdgeType.MERGE : EdgeType.REPLY);
            this.graph.addEdge(edge);
        }

        // Clear input
        this.chatInput.value = '';
        this.chatInput.style.height = 'auto';
        this.saveSession?.();
        this.updateEmptyState?.();

        // Show modal
        this.modalManager.showPluginModal('git-repo', 'file-selection');

        // Set URL in modal
        const urlInput = modal.querySelector('#git-repo-url');
        if (urlInput) {
            urlInput.textContent = url;
        }

        // Store current URL and node ID
        modal.dataset.url = url;
        modal.dataset.nodeId = fetchNode.id;

        // Load file tree
        await this.loadFileTree(url, modal);

        // Setup event listeners
        this.setupModalEventListeners(modal, url, fetchNode.id);
    }

    /**
     * Load file tree from backend
     * @param {string} url - Git repository URL
     * @param {HTMLElement} modal - Modal element
     */
    async loadFileTree(url, modal) {
        const treeContainer = modal.querySelector('#git-repo-file-tree');
        const loadingIndicator = modal.querySelector('#git-repo-loading');
        const errorMessage = modal.querySelector('#git-repo-error');

        if (loadingIndicator) {
            loadingIndicator.style.display = 'block';
        }
        if (errorMessage) {
            errorMessage.style.display = 'none';
        }
        if (treeContainer) {
            treeContainer.innerHTML = '';
        }

        // Get git credentials for this URL's host
        const gitCreds = this.getGitCredentialsForUrl(url);

        try {
            const response = await fetch(apiUrl('/api/url-fetch/list-files'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url,
                    git_credentials: gitCreds,
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to list repository files');
            }

            const data = await response.json();

            // Store temp_dir for reuse in stream endpoint (avoids double clone)
            const tempDir = data.temp_dir;
            if (tempDir) {
                modal.dataset.tempDir = tempDir;
            }

            // Get smart defaults
            const defaultFiles = this.getSmartDefaultFiles(data.files);

            // Render file tree
            if (treeContainer) {
                this.renderFileTree(data.files, defaultFiles, treeContainer);
            }

            // Update selection count
            this.updateSelectionCount(modal, defaultFiles.size);
        } catch (err) {
            if (errorMessage) {
                errorMessage.textContent = `Error: ${err.message}`;
                errorMessage.style.display = 'block';
            }
            this.showToast?.(`Failed to load repository files: ${err.message}`, 'error');
        } finally {
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }
        }
    }

    /**
     * Get all file paths recursively under a directory
     * @param {Array} items - File tree items
     * @returns {Array<string>} Array of file paths
     */
    getAllFilePaths(items) {
        const paths = [];
        for (const item of items) {
            if (item.type === 'file') {
                paths.push(item.path);
            } else if (item.type === 'directory' && item.children) {
                paths.push(...this.getAllFilePaths(item.children));
            }
        }
        return paths;
    }

    /**
     * Check if a directory or any of its descendants contain selected files
     * @param {Object} item - Directory item from file tree
     * @param {Set<string>} selectedPaths - Set of selected file paths
     * @returns {boolean} True if directory should be auto-expanded
     */
    shouldAutoExpandDirectory(item, selectedPaths) {
        if (item.type !== 'directory' || !item.children) {
            return false;
        }

        // Check if any direct children are selected
        for (const child of item.children) {
            if (child.type === 'file' && selectedPaths.has(child.path)) {
                return true;
            }
            // Recursively check nested directories
            if (child.type === 'directory' && this.shouldAutoExpandDirectory(child, selectedPaths)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Render file tree recursively with classic OS-style tree view
     * @param {Array} files - File tree items (paths are full paths from repo root)
     * @param {Set<string>} selectedPaths - Set of selected file paths
     * @param {HTMLElement} container - Container element (ul or div)
     * @param {number} depth - Current nesting depth (for indentation)
     * @param {Object} options - Rendering options
     * @param {boolean} options.hideCheckboxes - If true, hide checkboxes (for read-only node view)
     * @param {Set<string>} options.fetchedFiles - Set of actually fetched file paths (for highlighting)
     * @param {string} options.selectedFilePath - Currently selected file path (for drawer view highlight)
     */
    renderFileTree(files, selectedPaths, container, depth = 0, options = {}) {
        const { hideCheckboxes = false, fetchedFiles = null, selectedFilePath = null } = options;
        // If container is already a ul, use it directly; otherwise create a new ul
        const ul = container.tagName === 'UL' ? container : document.createElement('ul');
        if (container.tagName !== 'UL') {
            ul.className = 'git-repo-file-tree-list';
        }

        for (const item of files) {
            const li = document.createElement('li');
            li.className = 'git-repo-file-tree-item';
            // Don't set paddingLeft - CSS handles indentation via nested ul margin-left

            // Backend stores full paths from repo root, use directly
            const fullPath = item.path;
            const isSelected = selectedPaths.has(fullPath);

            // Extract filename/dirname for display (last part of path)
            const displayName = fullPath.split('/').pop();

            if (item.type === 'file') {
                // File: empty spacer (for alignment) + checkbox + icon + name
                // Add empty spacer to align with directories (macOS-style)
                const spacer = document.createElement('span');
                spacer.className = 'git-repo-expand-spacer';
                spacer.style.width = '16px';
                spacer.style.display = 'inline-block';
                spacer.style.marginRight = '4px';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `git-repo-file-${fullPath.replace(/[^a-zA-Z0-9]/g, '_')}`;
                checkbox.checked = isSelected;
                checkbox.dataset.path = fullPath;
                checkbox.dataset.type = 'file';
                if (hideCheckboxes) {
                    checkbox.style.display = 'none';
                }

                // Check if this file was actually fetched
                // Use selectedFiles (the actual paths sent to backend) to determine if fetched
                // This ensures we use the same path format as the backend's files dictionary keys
                const isFetched = fetchedFiles ? fetchedFiles.has(fullPath) : false;
                if (isFetched) {
                    li.classList.add('git-repo-file-fetched');
                }

                // Files explicitly selected in modal should stay highlighted
                if (isSelected) {
                    li.classList.add('git-repo-file-selected');
                }

                // Check if this file is currently selected for viewing in the drawer
                const isViewSelected =
                    selectedFilePath &&
                    (fullPath === selectedFilePath ||
                        fullPath.toLowerCase() === selectedFilePath.toLowerCase() ||
                        fullPath.split('/').pop() === selectedFilePath.split('/').pop());
                if (isViewSelected) {
                    li.classList.add('git-repo-file-view-selected');
                }

                const label = document.createElement('label');
                label.htmlFor = checkbox.id;
                label.className = 'git-repo-file-label';
                label.title = fullPath; // Tooltip with full path

                // Determine icon based on file extension
                const fileExt = fullPath.split('.').pop()?.toLowerCase() || '';
                const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'];
                const fileIcon = imageExts.includes(fileExt) ? '🖼️' : '📄';

                if (isFetched) {
                    label.classList.add('git-repo-file-fetched-label');
                    // Make fetched files clickable to open drawer
                    label.style.cursor = 'pointer';
                    // Use the path from selectedFiles (which matches backend keys) instead of item.path
                    // Find the matching path from selectedFiles that corresponds to this file
                    // If fullPath is in fetchedFiles, use it; otherwise try to find a match
                    let filePathForLookup = fullPath;
                    if (fetchedFiles) {
                        // fetchedFiles contains the actual paths sent to backend (same as files dict keys)
                        // Check if fullPath is in fetchedFiles, or find a matching path
                        if (fetchedFiles.has(fullPath)) {
                            filePathForLookup = fullPath;
                        } else {
                            // Try to find a matching path (case-insensitive or partial match)
                            const matchingPath = Array.from(fetchedFiles).find(
                                (p) =>
                                    p === fullPath ||
                                    p.toLowerCase() === fullPath.toLowerCase() ||
                                    p.endsWith(fullPath) ||
                                    fullPath.endsWith(p) ||
                                    p.split('/').pop() === fullPath.split('/').pop()
                            );
                            if (matchingPath) {
                                filePathForLookup = matchingPath;
                            }
                        }
                    }
                    label.dataset.filePath = filePathForLookup;
                }
                label.innerHTML = `<span class="git-repo-file-icon">${fileIcon}</span> ${displayName}`;

                // Wrap content in a container for consistency
                const contentWrapper = document.createElement('span');
                contentWrapper.className = 'git-repo-file-tree-item-content';
                contentWrapper.style.display = 'inline-flex';
                contentWrapper.style.alignItems = 'center';
                contentWrapper.appendChild(spacer);
                contentWrapper.appendChild(checkbox);
                contentWrapper.appendChild(label);
                li.appendChild(contentWrapper);
            } else if (item.type === 'directory') {
                // Directory: expand/collapse arrow + checkbox + icon + name
                const hasChildren = item.children && item.children.length > 0;

                // Expand/collapse triangle
                const expandBtn = document.createElement('button');
                expandBtn.className = 'git-repo-expand-btn';
                expandBtn.innerHTML = hasChildren
                    ? '<span class="git-repo-expand-icon">▶</span>'
                    : '<span class="git-repo-expand-icon"></span>';
                expandBtn.dataset.path = fullPath;
                expandBtn.title = fullPath;
                expandBtn.disabled = !hasChildren;
                if (!hasChildren) {
                    expandBtn.style.visibility = 'hidden';
                }

                // Directory checkbox (selects all files in directory)
                const dirCheckbox = document.createElement('input');
                dirCheckbox.type = 'checkbox';
                dirCheckbox.id = `git-repo-dir-${fullPath.replace(/[^a-zA-Z0-9]/g, '_')}`;
                dirCheckbox.dataset.path = fullPath;
                dirCheckbox.dataset.type = 'directory';
                if (hideCheckboxes) {
                    dirCheckbox.style.display = 'none';
                }

                // Check if all files in directory are selected
                if (hasChildren) {
                    const allFilePaths = this.getAllFilePaths(item.children);
                    const allSelected = allFilePaths.length > 0 && allFilePaths.every((p) => selectedPaths.has(p));
                    const someSelected = allFilePaths.some((p) => selectedPaths.has(p));
                    dirCheckbox.checked = allSelected;
                    dirCheckbox.indeterminate = someSelected && !allSelected;
                }

                // Directory label with icon
                const label = document.createElement('label');
                label.htmlFor = dirCheckbox.id;
                label.className = 'git-repo-dir-label';
                label.title = fullPath; // Tooltip with full path
                label.innerHTML = `<span class="git-repo-folder-icon">📁</span> ${displayName}`;

                // Handle expand/collapse
                expandBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const childrenUl = li.querySelector('ul');
                    if (childrenUl) {
                        const isCurrentlyExpanded = childrenUl.style.display !== 'none';
                        const willBeExpanded = !isCurrentlyExpanded;

                        // Toggle display
                        childrenUl.style.display = willBeExpanded ? 'block' : 'none';

                        // Update arrow icon to match new state
                        const icon = expandBtn.querySelector('.git-repo-expand-icon');
                        if (icon) {
                            icon.textContent = willBeExpanded ? '▼' : '▶';
                        }
                        expandBtn.classList.toggle('expanded', willBeExpanded);
                    }
                });

                // Handle directory checkbox (select/deselect all children)
                dirCheckbox.addEventListener('change', (e) => {
                    e.stopPropagation();
                    if (hasChildren) {
                        dirCheckbox.indeterminate = false;
                        // Update all child file checkboxes (recursively)
                        const childrenUl = li.querySelector('ul');
                        if (childrenUl) {
                            const updateChildren = (ul) => {
                                const fileCheckboxes = ul.querySelectorAll('input[data-type="file"]');
                                fileCheckboxes.forEach((cb) => {
                                    cb.checked = dirCheckbox.checked;
                                });
                                // Also update nested directory checkboxes
                                const dirCheckboxes = ul.querySelectorAll('input[data-type="directory"]');
                                dirCheckboxes.forEach((dcb) => {
                                    dcb.checked = dirCheckbox.checked;
                                    dcb.indeterminate = false;
                                    const nestedUl = dcb.closest('.git-repo-file-tree-item')?.querySelector('ul');
                                    if (nestedUl) {
                                        updateChildren(nestedUl);
                                    }
                                });
                            };
                            updateChildren(childrenUl);
                        }
                        // Update parent directory checkboxes
                        const treeContainer = container.closest('.git-repo-file-tree') || container;
                        this.updateParentDirectoryCheckboxes(treeContainer);
                    }
                });

                // Wrap content in a container so nested ul appears below
                const contentWrapper = document.createElement('span');
                contentWrapper.className = 'git-repo-file-tree-item-content';
                contentWrapper.style.display = 'inline-flex';
                contentWrapper.style.alignItems = 'center';
                contentWrapper.appendChild(expandBtn);
                contentWrapper.appendChild(dirCheckbox);
                contentWrapper.appendChild(label);
                li.appendChild(contentWrapper);

                // Render children (collapsed by default, auto-expand only if contains selected files)
                if (hasChildren) {
                    const childrenUl = document.createElement('ul');
                    childrenUl.className = 'git-repo-file-tree-list';

                    // Check if directory should be auto-expanded (contains selected files)
                    // Default to collapsed - only expand if it contains selected files
                    const shouldExpand = this.shouldAutoExpandDirectory(item, selectedPaths);

                    // Set initial display state (collapsed by default)
                    childrenUl.style.display = shouldExpand ? 'block' : 'none';

                    // Update arrow icon to match initial state
                    const icon = expandBtn.querySelector('.git-repo-expand-icon');
                    if (icon) {
                        icon.textContent = shouldExpand ? '▼' : '▶';
                    }
                    if (shouldExpand) {
                        expandBtn.classList.add('expanded');
                    } else {
                        expandBtn.classList.remove('expanded');
                    }

                    this.renderFileTree(item.children, selectedPaths, childrenUl, depth + 1, options);
                    li.appendChild(childrenUl);
                }
            }

            ul.appendChild(li);
        }

        // Only append if we created a new ul (container wasn't already a ul)
        if (container.tagName !== 'UL') {
            container.appendChild(ul);
        }
    }

    /**
     * Update parent directory checkboxes based on child selection state
     * @param {HTMLElement} container - Tree container
     */
    updateParentDirectoryCheckboxes(container) {
        const treeContainer = container.closest('.git-repo-file-tree') || container;
        const allSelectedFilePaths = new Set(
            Array.from(treeContainer.querySelectorAll('input[data-type="file"]:checked') || []).map(
                (cb) => cb.dataset.path
            )
        );

        const dirCheckboxes = treeContainer.querySelectorAll('input[data-type="directory"]');
        dirCheckboxes.forEach((dirCheckbox) => {
            const li = dirCheckbox.closest('.git-repo-file-tree-item');
            const childrenUl = li?.querySelector('ul');
            if (childrenUl) {
                const allFilePaths = Array.from(childrenUl.querySelectorAll('input[data-type="file"]')).map(
                    (cb) => cb.dataset.path
                );
                const allSelected = allFilePaths.length > 0 && allFilePaths.every((p) => allSelectedFilePaths.has(p));
                const someSelected = allFilePaths.some((p) => allSelectedFilePaths.has(p));
                dirCheckbox.checked = allSelected;
                dirCheckbox.indeterminate = someSelected && !allSelected;
            }
        });
    }

    /**
     * Determine smart defaults for file selection
     * @param {Array} fileTree - File tree structure (paths are full paths from repo root)
     * @returns {Set<string>} Set of file paths to select by default
     */
    getSmartDefaultFiles(fileTree) {
        const selected = new Set();

        // README files
        const readmePatterns = ['README.md', 'README.rst', 'README.txt', 'README'];
        // Config files
        const configFiles = [
            '.gitignore',
            'pyproject.toml',
            'package.json',
            'requirements.txt',
            'Cargo.toml',
            'go.mod',
        ];
        // Main entry points
        const mainFiles = ['main.py', 'index.js', 'index.ts', 'app.py'];

        const findFiles = (items) => {
            for (const item of items) {
                // Backend stores full paths from repo root, use directly
                const fullPath = item.path;
                if (item.type === 'file') {
                    const name = fullPath.split('/').pop();
                    if (
                        readmePatterns.includes(name) ||
                        configFiles.includes(name) ||
                        mainFiles.includes(name) ||
                        fullPath.startsWith('src/') ||
                        fullPath.startsWith('lib/')
                    ) {
                        selected.add(fullPath);
                    }
                } else if (item.type === 'directory' && item.children) {
                    findFiles(item.children);
                }
            }
        };

        findFiles(fileTree);
        return selected;
    }

    /**
     * Setup event listeners for modal
     * @param {HTMLElement} modal - Modal element
     * @param {string} url - Git repository URL
     * @param {string} nodeId - Node ID to update
     */
    setupModalEventListeners(modal, url, nodeId) {
        // Close button
        const closeBtn = modal.querySelector('#git-repo-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.modalManager.hidePluginModal('git-repo', 'file-selection');
            });
        }

        // Cancel button
        const cancelBtn = modal.querySelector('#git-repo-cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.modalManager.hidePluginModal('git-repo', 'file-selection');
            });
        }

        // Select All / Deselect All
        const selectAllBtn = modal.querySelector('#git-repo-select-all-btn');
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', () => {
                const checkboxes = modal.querySelectorAll('input[type="checkbox"]');
                const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
                checkboxes.forEach((cb) => {
                    cb.checked = !allChecked;
                });
                this.updateSelectionCount(modal);
            });
        }

        // Fetch button
        const fetchBtn = modal.querySelector('#git-repo-fetch-btn');
        if (fetchBtn) {
            fetchBtn.addEventListener('click', async () => {
                await this.fetchSelectedFiles(modal, url, nodeId);
            });
        }

        // Update selection count and parent directory checkboxes when checkboxes change
        const treeContainer = modal.querySelector('#git-repo-file-tree');
        if (treeContainer) {
            treeContainer.addEventListener('change', (e) => {
                if (e.target.type === 'checkbox') {
                    if (e.target.dataset.type === 'file') {
                        // Update parent directory checkboxes when file selection changes
                        this.updateParentDirectoryCheckboxes(treeContainer);
                    }
                    this.updateSelectionCount(modal);
                }
            });
        }
    }

    /**
     * Update selection count display and show warnings
     * @param {HTMLElement} modal - Modal element
     * @param {number} count - Optional count to set (otherwise counts checkboxes)
     */
    updateSelectionCount(modal, count = null) {
        const countDisplay = modal.querySelector('#git-repo-selection-count');
        const warningDisplay = modal.querySelector('#git-repo-warning');

        if (count === null) {
            const checkboxes = modal.querySelectorAll('input[type="checkbox"]:checked');
            count = checkboxes.length;
        }

        if (countDisplay) {
            countDisplay.textContent = `${count} file${count !== 1 ? 's' : ''} selected`;
        }

        // Show warnings for large selections
        if (warningDisplay) {
            if (count > 50) {
                warningDisplay.textContent = `⚠️ Selecting ${count} files may take a while and create a large node. Consider selecting fewer files.`;
                warningDisplay.style.display = 'block';
            } else if (count > 20) {
                warningDisplay.textContent = `⚠️ Selecting ${count} files may create a large node.`;
                warningDisplay.style.display = 'block';
            } else {
                warningDisplay.style.display = 'none';
            }
        }

        // Enable/disable fetch button
        const fetchBtn = modal.querySelector('#git-repo-fetch-btn');
        if (fetchBtn) {
            fetchBtn.disabled = count === 0;
        }
    }

    /**
     * Fetch selected files and update node
     * @param {HTMLElement} modal - Modal element
     * @param {string} url - Git repository URL
     * @param {string} nodeId - Node ID to update
     */
    async fetchSelectedFiles(modal, url, nodeId) {
        const isEdit = modal.dataset.isEdit === 'true';
        const fetchBtn = modal.querySelector('#git-repo-fetch-btn');
        const checkboxes = modal.querySelectorAll('input[type="checkbox"]:checked');
        const selectedFilePaths = new Set();

        // Collect selected file paths, expanding directories to their file children
        checkboxes.forEach((cb) => {
            const path = cb.dataset.path;
            const type = cb.dataset.type;
            if (!path || !type) {
                return;
            }

            if (type === 'file') {
                selectedFilePaths.add(path);
                return;
            }

            if (type === 'directory') {
                const li = cb.closest('.git-repo-file-tree-item');
                if (!li) {
                    return;
                }
                const childFiles = li.querySelectorAll('input[data-type="file"][data-path]');
                childFiles.forEach((child) => {
                    selectedFilePaths.add(child.dataset.path);
                });
            }
        });

        const selectedPaths = Array.from(selectedFilePaths);

        if (selectedPaths.length === 0) {
            this.showToast?.('Please select at least one file', 'warning');
            return;
        }

        // Use streaming fetch for progress display
        await this.fetchSelectedFilesStreaming(modal, url, nodeId, selectedPaths, isEdit);
    }

    /**
     * Fetch selected files with streaming progress displayed in node drawer.
     * @param {HTMLElement} modal - The modal element
     * @param {string} url - Repository URL
     * @param {string} nodeId - Node ID to update
     * @param {string[]} selectedPaths - Selected file paths
     * @param {boolean} isEdit - Whether this is editing an existing node
     */
    async fetchSelectedFilesStreaming(modal, url, nodeId, selectedPaths, isEdit) {
        const _fetchBtn = modal.querySelector('#git-repo-fetch-btn');
        const gitCreds = this.getGitCredentialsForUrl(url);

        // Disable button and show spinner
        if (_fetchBtn) {
            _fetchBtn.disabled = true;
            _fetchBtn.innerHTML =
                '<span class="git-repo-fetch-spinner"></span><span class="git-repo-fetch-text">Fetching...</span>';
            _fetchBtn.classList.add('loading');
        }

        // Close modal immediately - no need to keep it open during fetch
        this.modalManager.hidePluginModal('git-repo', 'file-selection');

        const repoName = url.split('/').pop();

        const node = this.graph.getNode(nodeId);
        const gitRepoData = {
            url,
            title: `Git: ${repoName || 'Repository'}`,
            fileTree: [],
            selectedFiles: selectedPaths,
            fetchedFilePaths: [],
            files: {},
        };

        const updateData = {
            content: `**[${repoName}](${url})**\n\nFetching selected files...`,
            gitRepoData,
        };

        if (!isEdit && node) {
            updateData.versions = [
                {
                    content: node?.content || `**[${repoName}](${url})**`,
                    timestamp: node?.createdAt || Date.now(),
                    reason: 'initial',
                },
            ];
        }

        this.graph.updateNode(nodeId, updateData);

        try {
            // Get temp_dir from modal (set during list-files) to avoid double clone
            const tempDir = modal.dataset.tempDir || null;

            // Use fetch with ReadableStream for POST-based streaming
            const response = await fetch(apiUrl('/api/url-fetch/fetch-files-stream'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url,
                    file_paths: selectedPaths,
                    git_credentials: gitCreds,
                    temp_dir: tempDir,
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            // Stream processing loop
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                let currentEventType = 'message';

                for (const line of lines) {
                    const cleanLine = line.replace(/\r$/, '');

                    if (cleanLine.startsWith('event:')) {
                        currentEventType = cleanLine.substring(6).trim();
                        continue;
                    }

                    if (cleanLine.startsWith('data:')) {
                        const eventData = cleanLine.substring(5).trim();

                        // Handle both JSON format and plain text format
                        let parsed;
                        let eventName;
                        let message;

                        try {
                            // Try parsing as JSON first
                            parsed = JSON.parse(eventData);
                            eventName = parsed.event;
                            message = parsed.data;
                        } catch {
                            // Plain text format - use currentEventType as event name
                            eventName = currentEventType;
                            message = eventData;
                        }

                        if (eventName === 'complete') {
                            // Process complete data - data might be JSON string or object
                            const completeData =
                                typeof parsed?.data === 'string' ? JSON.parse(parsed.data) : parsed?.data;
                            await this.processFetchComplete(nodeId, url, selectedPaths, isEdit, completeData);
                            return;
                        } else if (eventName === 'error') {
                            throw new Error(message);
                        }
                    }
                }

                // No progress updates needed - just wait for complete
            }
        } catch (err) {
            console.error('[GitRepoFeature] Fetch error:', err);
            this.showToast?.(`Failed to fetch files: ${err.message}`, 'error');

            // Update node with error
            const errorContent = `**Failed to fetch repository files**\n\n${url}\n\n*Error: ${err.message}*`;
            this.canvas.updateNodeContent(nodeId, errorContent, false);
            this.graph.updateNode(nodeId, { content: errorContent });
            this.saveSession?.();
        }
    }

    /**
     * Process completed fetch and update node with results.
     * @param nodeId
     * @param url
     * @param selectedPaths
     * @param isEdit
     * @param data
     */
    async processFetchComplete(nodeId, url, selectedPaths, isEdit, data) {
        // Store git repo data in node
        const metadata = data.metadata || {};
        const files = metadata.files || {};

        const fetchedFilePaths = Object.keys(files);
        const gitRepoData = {
            url: metadata.git_repo_data?.url || url,
            title: metadata.git_repo_data?.repo_name || 'Git Repository',
            fileTree: [],
            selectedFiles: selectedPaths,
            fetchedFilePaths,
            files: files,
        };

        const updateData = {
            content: data.content || `**[${metadata.git_repo_data?.repo_name || 'Git Repository'}](${url})**`,
            gitRepoData,
        };

        if (!isEdit) {
            const node = this.graph.getNode(nodeId);
            updateData.versions = [
                {
                    content: node?.content || `**[${metadata.git_repo_data?.repo_name || 'Git Repository'}](${url})**`,
                    timestamp: node?.createdAt || Date.now(),
                    reason: 'initial',
                },
            ];
        }

        this.graph.updateNode(nodeId, updateData);
        this.saveSession?.();

        // Select first file if available
        if (fetchedFilePaths.length > 0) {
            this.canvas.selectGitRepoFile(nodeId, fetchedFilePaths[0]);
        }
    }

    /**
     * Lifecycle hook: called when plugin is loaded
     */
    async onLoad() {
        console.log('[GitRepoFeature] Loaded');

        // Inject plugin CSS dynamically (self-contained plugin)
        await this.injectPluginCSS();

        // Register file selection modal
        const modalTemplate = `
            <div id="git-repo-file-selection-modal" class="modal" style="display: none">
                <div class="modal-content modal-wide">
                    <div class="modal-header">
                        <h2>Select Files from Repository</h2>
                        <button class="modal-close" id="git-repo-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="git-repo-url-display">
                            <label>Repository URL:</label>
                            <div id="git-repo-url" class="git-repo-url-text"></div>
                        </div>

                        <div id="git-repo-loading" class="git-repo-loading" style="display: none">
                            <div class="loading-spinner"></div>
                            <span>Loading repository files...</span>
                        </div>

                        <div id="git-repo-error" class="git-repo-error" style="display: none"></div>

                        <div class="git-repo-file-selection-controls">
                            <button id="git-repo-select-all-btn" class="secondary-btn">Select All / Deselect All</button>
                            <span id="git-repo-selection-count" class="git-repo-selection-count">0 files selected</span>
                        </div>

                        <div id="git-repo-warning" class="git-repo-warning" style="display: none"></div>

                        <div id="git-repo-file-tree" class="git-repo-file-tree">
                            <!-- File tree will be rendered here -->
                        </div>

                        <div class="modal-actions">
                            <button id="git-repo-cancel-btn" class="secondary-btn">Cancel</button>
                            <button id="git-repo-fetch-btn" class="primary-btn" disabled>Fetch Selected Files</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.modalManager.registerModal('git-repo', 'file-selection', modalTemplate);

        // Capture reference to this (GitRepoFeature instance) for use in protocol class
        const gitRepoFeatureInstance = this;

        // Register custom node protocol for git repository nodes
        // Uses BaseNode as base (no need to extend FetchResultNode since we have our own node type)
        const GitRepoProtocol = class extends BaseNode {
            /**
             * Get the type label for this node
             * @returns {string}
             */
            getTypeLabel() {
                return 'Git Repository';
            }

            /**
             * Get the type icon for this node
             * @returns {string}
             */
            getTypeIcon() {
                return '📦';
            }

            /**
             * Get additional action buttons for this node
             * @returns {Array<string>}
             */
            getAdditionalActions() {
                return [Actions.SUMMARIZE, Actions.CREATE_FLASHCARDS];
            }

            // Uses default actions [Reply, Edit, Copy] from BaseNode
            // Edit is handled specially via nodeEditContent event listener

            /**
             * Copy all fetched files to clipboard with format:
             * [filename]\ncontent\n========\n[filename2]\ncontent2\n...
             * @param {Canvas} canvas - Canvas instance
             * @param {Object} _app - App instance (unused, kept for interface)
             * @returns {Promise<void>}
             */
            async copyToClipboard(canvas, _app) {
                if (!this.node.gitRepoData || !this.node.gitRepoData.files) {
                    return;
                }

                const files = this.node.gitRepoData.files;
                const filePaths = Object.keys(files).sort(); // Sort for consistent order

                const parts = [];
                for (const filePath of filePaths) {
                    const fileData = files[filePath];
                    if (fileData && fileData.content && fileData.status === 'success') {
                        parts.push(`[${filePath}]`);
                        parts.push(fileData.content);
                        parts.push('========');
                    }
                }

                // Remove trailing separator
                if (parts.length > 0 && parts[parts.length - 1] === '========') {
                    parts.pop();
                }

                const text = parts.join('\n');
                if (text) {
                    await navigator.clipboard.writeText(text);
                    canvas.showCopyFeedback(this.node.id);
                }
            }

            /**
             * Check if this git repo node has output to display (selected file in drawer)
             * @returns {boolean}
             */
            hasOutput() {
                // Only show drawer when a file is selected (not by default)
                // This keeps the drawer closed initially until user clicks on a file
                if (this.node.gitRepoData && this.node.gitRepoData.files && this.node.selectedFilePath) {
                    return !!this.node.gitRepoData.files[this.node.selectedFilePath];
                }
                return false;
            }

            /**
             * Render the output panel content (called by canvas for the slide-out panel)
             * @param {Canvas} canvas - Canvas instance for helper methods
             * @returns {string} HTML string
             */
            renderOutputPanel(canvas) {
                // Handle git repo file selection
                if (!this.node.gitRepoData || !this.node.gitRepoData.files) {
                    return '<div class="git-repo-file-panel-content">No repository data</div>';
                }

                const filePath = this.node.selectedFilePath;

                // If a specific file is selected, show it
                if (filePath && this.node.gitRepoData.files[filePath]) {
                    const fileData = this.node.gitRepoData.files[filePath];

                    const { content, lang, status } = fileData;
                    const escapedPath = canvas.escapeHtml(filePath);

                    let html = `<div class="git-repo-file-panel-content">`;
                    html += `<div class="git-repo-file-panel-header">`;
                    html += `<strong>${escapedPath}</strong>`;
                    if (lang) {
                        html += ` <span class="git-repo-file-panel-lang">(${canvas.escapeHtml(lang)})</span>`;
                    }
                    html += `</div>`;

                    if (status === 'not_found') {
                        html += `<div class="git-repo-file-panel-error">File not found</div>`;
                    } else if (status === 'permission_denied') {
                        html += `<div class="git-repo-file-panel-error">Permission denied</div>`;
                    } else if (status === 'error') {
                        html += `<div class="git-repo-file-panel-error">Failed to read file</div>`;
                    } else if (fileData.is_image && content) {
                        // Render image with base64 data URL
                        const mimeType = fileData.mime_type || 'image/png';
                        html += `<div class="git-repo-file-panel-image-container">`;
                        html += `<img src="data:${mimeType};base64,${content}"
                                      class="git-repo-file-panel-image"
                                      alt="${escapedPath}" />`;
                        html += `</div>`;
                    } else if (fileData.is_binary) {
                        // Non-image binary file
                        html += `<div class="git-repo-file-panel-binary">Binary file not displayed</div>`;
                    } else if (content) {
                        // Syntax-highlighted code display (same pattern as code node)
                        // Escape HTML to prevent XSS, highlight.js will handle the rest
                        const escapedContent = canvas.escapeHtml(content);
                        const codeClass = lang ? `language-${lang}` : '';
                        html += `<pre class="git-repo-file-panel-code"><code class="${codeClass}" data-highlight="true">${escapedContent}</code></pre>`;
                    } else {
                        html += `<div class="git-repo-file-panel-error">No content available</div>`;
                    }

                    html += `</div>`;
                    return html;
                }

                // No file selected - drawer shouldn't be open (hasOutput returns false)
                // This is a fallback in case it's called anyway
                return '<div class="git-repo-file-panel-content"><em>Click a file in the tree to view its contents</em></div>';
            }

            /**
             * Get event bindings for syntax highlighting initialization
             * @returns {Array} Array of event binding objects
             */
            getEventBindings() {
                return [
                    {
                        selector: '.git-repo-file-panel-code',
                        event: 'init', // Special event: called after render, not a DOM event
                        handler: (_nodeId, e, _canvas) => {
                            // Initialize syntax highlighting after render
                            if (window.hljs) {
                                const codeEl = e.currentTarget.querySelector('code[data-highlight="true"]');
                                if (codeEl) {
                                    window.hljs.highlightElement(codeEl);
                                }
                            }
                        },
                    },
                ];
            }

            /**
             * Render the content for the git repo node
             * @param {Canvas} canvas
             * @returns {string}
             */
            renderContent(canvas) {
                // Render git repo file tree if available
                if (!this.node.gitRepoData) {
                    // Fallback to markdown content
                    return canvas.renderMarkdown(this.node.content || '');
                }

                // Check if this is a git repo node with file tree data
                if (Array.isArray(this.node.gitRepoData.fileTree) && this.node.gitRepoData.fileTree.length > 0) {
                    try {
                        const { fileTree, url, title, selectedFiles, fetchedFilePaths, files } = this.node.gitRepoData;
                        const container = document.createElement('div');
                        container.className = 'git-repo-node-tree';

                        // Render header
                        const header = document.createElement('div');
                        header.className = 'git-repo-node-header';
                        header.style.marginBottom = '8px';
                        header.style.paddingBottom = '8px';
                        header.style.borderBottom = '1px solid var(--bg-secondary)';
                        const escapedUrl = this.escapeHtml(url);
                        const escapedTitle = this.escapeHtml(title || url);
                        header.innerHTML = `<strong><a href="${escapedUrl}" target="_blank" style="color: var(--accent-primary); text-decoration: none;">${escapedTitle}</a></strong>`;
                        container.appendChild(header);

                        // Render file tree using the same function as modal, but with checkboxes hidden
                        const treeContainer = document.createElement('div');
                        treeContainer.className = 'git-repo-node-tree-container';
                        const selectedPathsSet = new Set(selectedFiles || []);
                        const fetchedFilesSet = new Set(
                            fetchedFilePaths && fetchedFilePaths.length > 0
                                ? fetchedFilePaths
                                : Object.keys(files || {})
                        );
                        // Use the captured GitRepoFeature instance to call renderFileTree
                        gitRepoFeatureInstance.renderFileTree(fileTree, selectedPathsSet, treeContainer, 0, {
                            hideCheckboxes: true,
                            fetchedFiles: fetchedFilesSet,
                            selectedFilePath: this.node.selectedFilePath || null,
                        });
                        container.appendChild(treeContainer);

                        return container.outerHTML;
                    } catch (err) {
                        console.error('[GitRepoFeature] Error rendering file tree:', err);
                        // Fallback to default rendering on error
                    }
                }
                // Fallback to original protocol rendering for non-git-repo nodes or nodes without file tree
                try {
                    return super.renderContent(canvas);
                } catch (err) {
                    console.error('[GitRepoFeature] Error in super.renderContent, using BaseNode fallback:', err);
                    // Ultimate fallback to BaseNode rendering
                    return canvas.renderMarkdown(this.node.content || '');
                }
            }

            /**
             * Escape HTML special characters
             * @param {string} text
             * @returns {string}
             */
            escapeHtml(text) {
                if (!text) return '';
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }

            /**
             * Update fetch progress display in the drawer.
             * Called during streaming fetch to show progress.
             * @param {Array} progressLog - Array of progress entries
             */
            updateFetchProgress(progressLog) {
                if (!this.node.gitRepoData) return;
                this.node.gitRepoData.fetchProgress = progressLog;
                const panelWrapper = gitRepoFeatureInstance.canvas.outputPanels.get(this.node.id);
                if (panelWrapper) {
                    gitRepoFeatureInstance.canvas.updateOutputPanelContent(this.node.id, this.node);
                }
            }
        };

        // Register for GIT_REPO node type
        NodeRegistry.register({
            type: NodeType.GIT_REPO,
            protocol: GitRepoProtocol,
        });
        console.log('[GitRepoFeature] Registered custom protocol for', NodeType.GIT_REPO);

        // Hook into settings modal lifecycle
        this.setupSettingsModalHooks();
    }

    /**
     * Setup hooks for settings modal to manage git credentials UI
     */
    setupSettingsModalHooks() {
        // Hook into settings modal show event
        const originalShowSettings = this.modalManager.showSettingsModal.bind(this.modalManager);
        this.modalManager.showSettingsModal = () => {
            originalShowSettings();
            this.injectGitCredentialsUI();
        };
    }

    /**
     * Inject git credentials UI section into settings modal
     */
    injectGitCredentialsUI() {
        const container = document.getElementById('plugin-settings-container');
        if (!container) {
            console.warn('[GitRepoFeature] plugin-settings-container not found');
            return;
        }

        // Check if already injected (avoid duplicates)
        if (container.querySelector('#git-repo-credentials-section')) {
            this.loadGitCredentialsUI();
            return;
        }

        // Create and inject the settings section
        const section = document.createElement('div');
        section.id = 'git-repo-credentials-section';
        section.className = 'settings-section';
        section.innerHTML = `
            <h3>Git Repository Credentials</h3>
            <p class="settings-note">
                Personal Access Tokens (PATs) for accessing private repositories.
                Leave empty for public repositories.
            </p>

            <div class="api-key-group">
                <label for="git-github-cred">GitHub (github.com)</label>
                <input type="password" id="git-github-cred" placeholder="ghp_... or github_pat_..." />
                <small class="key-hint"
                    >PAT with <code>repo</code> scope for private repos.
                    <a href="https://github.com/settings/tokens" target="_blank">Create token</a></small
                >
            </div>

            <div class="api-key-group">
                <label for="git-gitlab-cred">GitLab (gitlab.com)</label>
                <input type="password" id="git-gitlab-cred" placeholder="glpat-..." />
                <small class="key-hint"
                    >Personal Access Token with <code>read_repository</code> scope.
                    <a href="https://gitlab.com/-/user_settings/personal_access_tokens" target="_blank">Create token</a></small
                >
            </div>

            <div class="api-key-group">
                <label for="git-bitbucket-cred">Bitbucket (bitbucket.org)</label>
                <input type="password" id="git-bitbucket-cred" placeholder="App password..." />
                <small class="key-hint"
                    >App password with <code>Repositories: Read</code> permission.
                    <a href="https://bitbucket.org/account/settings/app-passwords/" target="_blank">Create password</a></small
                >
            </div>

            <div class="api-key-group">
                <label for="git-generic-cred">Other Git Hosts</label>
                <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                    <input type="text" id="git-generic-host" placeholder="example.com" style="flex: 1;" />
                    <input type="password" id="git-generic-cred" placeholder="Token or password" style="flex: 1;" />
                    <button id="git-add-cred-btn" class="secondary-btn">Add</button>
                </div>
                <div id="git-custom-creds-list" style="margin-top: 8px;"></div>
            </div>
        `;

        container.appendChild(section);
        this.loadGitCredentialsUI();
    }

    /**
     * Load git credentials UI when settings modal is shown
     */
    loadGitCredentialsUI() {
        const gitCreds = this.getGitCredentials();

        // Load standard hosts
        const githubInput = document.getElementById('git-github-cred');
        const gitlabInput = document.getElementById('git-gitlab-cred');
        const bitbucketInput = document.getElementById('git-bitbucket-cred');

        if (githubInput) githubInput.value = gitCreds['github.com'] || '';
        if (gitlabInput) gitlabInput.value = gitCreds['gitlab.com'] || '';
        if (bitbucketInput) bitbucketInput.value = gitCreds['bitbucket.org'] || '';

        // Render custom git credentials
        this.renderCustomGitCreds(gitCreds);

        // Setup "Add" button for custom git credentials
        const addCredBtn = document.getElementById('git-add-cred-btn');
        if (addCredBtn) {
            // Remove existing listener if any (clone to remove old listeners)
            const newBtn = addCredBtn.cloneNode(true);
            addCredBtn.parentNode.replaceChild(newBtn, addCredBtn);

            newBtn.addEventListener('click', () => {
                const hostInput = document.getElementById('git-generic-host');
                const credInput = document.getElementById('git-generic-cred');
                const host = hostInput.value.trim();
                const cred = credInput.value.trim();

                if (!host || !cred) {
                    this.showToast?.('Please enter both host and credential', 'warning');
                    return;
                }

                // Validate host format (basic check)
                if (!/^[\w\.-]+$/.test(host)) {
                    this.showToast?.('Invalid host format', 'error');
                    return;
                }

                const creds = this.getGitCredentials();
                creds[host] = cred;
                this.saveGitCredentials(creds);

                // Clear inputs
                hostInput.value = '';
                credInput.value = '';

                // Refresh list
                this.renderCustomGitCreds(creds);
                this.showToast?.(`Added credential for ${host}`, 'success');
            });
        }
    }

    /**
     * Render custom git credentials list
     * @param {Object<string, string>} gitCreds - Map of host to credential
     */
    renderCustomGitCreds(gitCreds) {
        const listContainer = document.getElementById('git-custom-creds-list');
        if (!listContainer) return;

        listContainer.innerHTML = '';

        // Filter out standard hosts (github.com, gitlab.com, bitbucket.org)
        const standardHosts = ['github.com', 'gitlab.com', 'bitbucket.org'];
        const customCreds = Object.entries(gitCreds).filter(([host]) => !standardHosts.includes(host));

        if (customCreds.length === 0) {
            return;
        }

        customCreds.forEach(([host, cred]) => {
            const item = document.createElement('div');
            item.className = 'api-key-group';
            item.style.marginTop = '8px';
            const escapedHost = this.canvas.escapeHtml(host);
            const escapedCred = this.canvas.escapeHtml(cred);
            item.innerHTML = `
                <label>${escapedHost}</label>
                <div style="display: flex; gap: 8px;">
                    <input type="password" class="git-custom-cred-input" data-host="${escapedHost}"
                           value="${escapedCred}" placeholder="Token" style="flex: 1;" />
                    <button class="secondary-btn git-remove-cred-btn" data-host="${escapedHost}">Remove</button>
                </div>
            `;
            listContainer.appendChild(item);
        });

        // Add remove button handlers
        listContainer.querySelectorAll('.git-remove-cred-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const host = btn.dataset.host;
                const creds = this.getGitCredentials();
                delete creds[host];
                this.saveGitCredentials(creds);
                this.renderCustomGitCreds(creds);
            });
        });
    }

    /**
     * Save git credentials from settings modal
     * Called by app.saveSettings()
     */
    saveGitCredentialsFromModal() {
        const gitCreds = {
            'github.com': document.getElementById('git-github-cred')?.value.trim() || '',
            'gitlab.com': document.getElementById('git-gitlab-cred')?.value.trim() || '',
            'bitbucket.org': document.getElementById('git-bitbucket-cred')?.value.trim() || '',
        };

        // Add custom git credentials
        document.querySelectorAll('.git-custom-cred-input').forEach((input) => {
            const host = input.dataset.host;
            const cred = input.value.trim();
            if (host && cred) {
                gitCreds[host] = cred;
            }
        });

        // Remove empty credentials
        Object.keys(gitCreds).forEach((host) => {
            if (!gitCreds[host]) {
                delete gitCreds[host];
            }
        });

        // Save using the storage method
        this.saveGitCredentials(gitCreds);
    }

    /**
     * Handle edit button click for git repo nodes
     * Opens file selection modal instead of content edit modal
     * @param {string} nodeId - Node ID to edit
     * @returns {Promise<boolean>}
     */
    async handleEditGitRepoNode(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node || !node.gitRepoData || !node.gitRepoData.url) {
            // Not a git repo node, let default handler take over
            return false;
        }

        // Show file selection modal with existing URL and pre-selected files
        const url = node.gitRepoData.url;
        const existingSelectedFiles = node.gitRepoData.selectedFiles || [];

        const modal = this.modalManager.getPluginModal('git-repo', 'file-selection');
        if (!modal) {
            this.showToast?.('File selection modal not found', 'error');
            return true; // Handled (even though it failed)
        }

        // Show modal
        this.modalManager.showPluginModal('git-repo', 'file-selection');

        // Set URL in modal
        const urlInput = modal.querySelector('#git-repo-url');
        if (urlInput) {
            urlInput.textContent = url;
        }

        // Store current URL and node ID (for updating existing node)
        modal.dataset.url = url;
        modal.dataset.nodeId = nodeId;
        modal.dataset.isEdit = 'true'; // Flag to indicate this is an edit, not a new fetch

        // Load file tree
        await this.loadFileTree(url, modal);

        // Pre-select existing files
        if (existingSelectedFiles.length > 0) {
            const checkboxes = modal.querySelectorAll('input[type="checkbox"][data-type="file"]');
            checkboxes.forEach((checkbox) => {
                if (existingSelectedFiles.includes(checkbox.dataset.path)) {
                    checkbox.checked = true;
                }
            });
            // Update parent directory checkboxes
            this.updateParentDirectoryCheckboxes(modal);
            // Update selection count
            this.updateSelectionCount(modal, existingSelectedFiles.length);
        }

        // Setup event listeners (will update existing node instead of creating new one)
        this.setupModalEventListeners(modal, url, nodeId);

        return true; // Handled
    }

    /**
     * Inject plugin CSS dynamically for self-contained plugin architecture
     */
    async injectPluginCSS() {
        try {
            // Fetch CSS file and inject it
            const cssUrl = apiUrl('/static/css/git-repo.css');
            const response = await fetch(cssUrl);
            if (!response.ok) {
                throw new Error(`Failed to load CSS: ${response.statusText}`);
            }
            const css = await response.text();
            this.injectCSS(css, 'git-repo-plugin-styles');
            console.log('[GitRepoFeature] CSS injected successfully');
        } catch (err) {
            console.error('[GitRepoFeature] Failed to inject CSS:', err);
            // Fallback: inject minimal CSS inline if fetch fails
            const fallbackCSS = `
                /* Git Repo Plugin - Fallback styles */
                .git-repo-file-tree { max-height: 400px; overflow-y: auto; padding: 8px; }
                .git-repo-file-tree-item { padding: 2px 0; display: block; }
                .git-repo-file-tree-item > ul { margin-left: 20px; }
                /* Display is controlled by inline style from JS */
            `;
            this.injectCSS(fallbackCSS, 'git-repo-plugin-styles');
        }
    }
}

console.log('[GitRepoFeature] Plugin loaded');
