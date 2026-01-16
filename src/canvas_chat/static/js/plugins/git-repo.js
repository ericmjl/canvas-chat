/**
 * Git Repository Feature Plugin
 *
 * Handles git repository URL fetching with interactive file selection.
 * Fully self-contained plugin that demonstrates plugin architecture.
 */

import { FeaturePlugin } from '../feature-plugin.js';
import { createNode, NodeType } from '../graph-types.js';
import { createEdge, EdgeType } from '../graph-types.js';
import { apiUrl } from '../utils.js';
import { BaseNode } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';


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
     * Check if URL is a git repository URL
     * @param {string} url - URL to check
     * @returns {boolean} True if URL matches git repository patterns
     */
    isGitRepositoryUrl(url) {
        const gitPatterns = [
            /^https?:\/\/(github|gitlab|bitbucket|gitea|codeberg)\.(com|org)\/[\w\-\.]+\/[\w\-\.]+(?:\.git)?\/?$/i,
            /^git@[\w\-\.]+:[\w\-\.]+\/[\w\-\.]+(?:\.git)?$/,
            /^https?:\/\/[\w\-\.]+\/([\w\-\.]+\/)+[\w\-\.]+(?:\.git)?\/?$/i,
        ];
        return gitPatterns.some((pattern) => pattern.test(url));
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
        const fetchNode = createNode(
            NodeType.FETCH_RESULT,
            `Loading repository files:\n${url}...`,
            {
                position: this.graph.autoPosition(parentIds),
            }
        );

        this.graph.addNode(fetchNode);
        this.canvas.clearSelection();

        // Create edges from parents (if replying to selected nodes)
        for (const parentId of parentIds) {
            const edge = createEdge(
                parentId,
                fetchNode.id,
                parentIds.length > 1 ? EdgeType.MERGE : EdgeType.REPLY
            );
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

        try {
            const response = await fetch(apiUrl('/api/url-fetch/list-files'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to list repository files');
            }

            const data = await response.json();

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
     */
    renderFileTree(files, selectedPaths, container, depth = 0) {
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

                const label = document.createElement('label');
                label.htmlFor = checkbox.id;
                label.className = 'git-repo-file-label';
                label.title = fullPath; // Tooltip with full path
                label.innerHTML = `<span class="git-repo-file-icon">📄</span> ${displayName}`;

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
                expandBtn.innerHTML = hasChildren ? '<span class="git-repo-expand-icon">▶</span>' : '<span class="git-repo-expand-icon"></span>';
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

                // Check if all files in directory are selected
                if (hasChildren) {
                    const allFilePaths = this.getAllFilePaths(item.children);
                    const allSelected = allFilePaths.length > 0 && allFilePaths.every(p => selectedPaths.has(p));
                    const someSelected = allFilePaths.some(p => selectedPaths.has(p));
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
                                fileCheckboxes.forEach(cb => {
                                    cb.checked = dirCheckbox.checked;
                                });
                                // Also update nested directory checkboxes
                                const dirCheckboxes = ul.querySelectorAll('input[data-type="directory"]');
                                dirCheckboxes.forEach(dcb => {
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

                    this.renderFileTree(item.children, selectedPaths, childrenUl, depth + 1);
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
            Array.from(treeContainer.querySelectorAll('input[data-type="file"]:checked') || [])
                .map(cb => cb.dataset.path)
        );

        const dirCheckboxes = treeContainer.querySelectorAll('input[data-type="directory"]');
        dirCheckboxes.forEach(dirCheckbox => {
            const li = dirCheckbox.closest('.git-repo-file-tree-item');
            const childrenUl = li?.querySelector('ul');
            if (childrenUl) {
                const allFilePaths = Array.from(childrenUl.querySelectorAll('input[data-type="file"]'))
                    .map(cb => cb.dataset.path);
                const allSelected = allFilePaths.length > 0 && allFilePaths.every(p => allSelectedFilePaths.has(p));
                const someSelected = allFilePaths.some(p => allSelectedFilePaths.has(p));
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
        const fetchBtn = modal.querySelector('#git-repo-fetch-btn');
        const checkboxes = modal.querySelectorAll('input[type="checkbox"]:checked');

        const selectedPaths = Array.from(checkboxes).map((cb) => cb.dataset.path);

        if (selectedPaths.length === 0) {
            this.showToast?.('Please select at least one file', 'warning');
            return;
        }

        // Disable button and show loading
        if (fetchBtn) {
            fetchBtn.disabled = true;
            fetchBtn.textContent = 'Fetching...';
        }

        try {
            const response = await fetch(apiUrl('/api/url-fetch/fetch-files'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, file_paths: selectedPaths }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to fetch files');
            }

            const data = await response.json();

            // Get the file tree structure (we need to fetch it again or store it)
            // For now, let's fetch it again to get the full tree
            let fileTree = null;
            try {
                const treeResponse = await fetch(apiUrl('/api/url-fetch/list-files'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url }),
                });
                if (treeResponse.ok) {
                    const treeData = await treeResponse.json();
                    fileTree = treeData.files;
                }
            } catch (err) {
                console.warn('[GitRepoFeature] Failed to fetch file tree for rendering:', err);
            }

            // Store git repo data in node instead of markdown content
            const gitRepoData = {
                url,
                title: data.title,
                fileTree: fileTree || [],
                selectedFiles: selectedPaths,
            };

            // Update node with git repo data
            this.graph.updateNode(nodeId, {
                content: `**[${data.title}](${url})**`, // Minimal content for fallback
                gitRepoData,
                versions: [
                    {
                        content: `**[${data.title}](${url})**`,
                        timestamp: Date.now(),
                        reason: 'fetched',
                    },
                ],
            });

            // Re-render the node to show the file tree
            const node = this.graph.getNode(nodeId);
            if (node) {
                this.canvas.renderNode(node);
            }

            this.saveSession?.();

            // Close modal
            this.modalManager.hidePluginModal('git-repo', 'file-selection');

            // Pan to the node
            this.canvas.panToNodeAnimated(nodeId);
        } catch (err) {
            this.showToast?.(`Failed to fetch files: ${err.message}`, 'error');
            // Update node with error message
            const errorContent = `**Failed to fetch repository files**\n\n${url}\n\n*Error: ${err.message}*`;
            this.canvas.updateNodeContent(nodeId, errorContent, false);
            this.graph.updateNode(nodeId, { content: errorContent });
            this.saveSession?.();
        } finally {
            if (fetchBtn) {
                fetchBtn.disabled = false;
                fetchBtn.textContent = 'Fetch Selected Files';
            }
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

        // Register custom node protocol for git repository nodes
        // Get original protocol if it exists (must be done before we override it)
        // Note: FetchResultNode registers as 'fetch_result' (string), not NodeType.FETCH_RESULT
        let OriginalProtocol = BaseNode;
        try {
            // Try both the enum value and the string
            const fetchResultType = NodeType.FETCH_RESULT || 'fetch_result';
            if (NodeRegistry.isRegistered(fetchResultType)) {
                OriginalProtocol = NodeRegistry.getProtocolClass(fetchResultType);
                console.log('[GitRepoFeature] Found original FETCH_RESULT protocol:', OriginalProtocol.name);
            } else {
                console.log('[GitRepoFeature] FETCH_RESULT protocol not registered yet, using BaseNode');
            }
        } catch (err) {
            console.warn('[GitRepoFeature] Could not get original FETCH_RESULT protocol, using BaseNode:', err);
        }

        // Register custom node protocol for git repository nodes
        // This extends the original protocol and adds git repo tree rendering
        const GitRepoProtocol = class extends OriginalProtocol {
            renderContent(canvas) {
                // Check if this is a git repo node with file tree data
                if (this.node.gitRepoData && Array.isArray(this.node.gitRepoData.fileTree) && this.node.gitRepoData.fileTree.length > 0) {
                    try {
                        const { fileTree, url, title } = this.node.gitRepoData;
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

                        // Render file tree
                        const treeHtml = this.renderFileTreeInNode(fileTree, 0);
                        container.innerHTML += `<div class="git-repo-node-tree-container"><ul class="git-repo-node-tree-list" style="margin: 0; padding-left: 0; list-style: none;">${treeHtml}</ul></div>`;

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
                 * Render file tree in node (read-only, no checkboxes)
                 * Returns HTML string (no event listeners - they'll be added after DOM insertion)
                 */
                renderFileTreeInNode(files, depth = 0) {
                    let html = '';
                    for (const item of files) {
                        const displayName = item.path.split('/').pop();
                        const escapedPath = this.escapeHtml(item.path);
                        const escapedName = this.escapeHtml(displayName);

                        if (item.type === 'file') {
                            html += `<li class="git-repo-node-tree-item" title="${escapedPath}"><span class="git-repo-node-file-icon">📄</span> <span>${escapedName}</span></li>`;
                        } else if (item.type === 'directory') {
                            const hasChildren = item.children && item.children.length > 0;
                            const expandIcon = hasChildren ? '<span class="git-repo-node-expand-icon">▶</span>' : '<span class="git-repo-node-expand-icon-empty"></span>';
                            const childrenHtml = hasChildren ? this.renderFileTreeInNode(item.children, depth + 1) : '';
                            html += `<li class="git-repo-node-tree-item git-repo-node-dir-item" title="${escapedPath}" data-has-children="${hasChildren}">${expandIcon}<span class="git-repo-node-folder-icon">📁</span> <span>${escapedName}</span>${hasChildren ? `<ul class="git-repo-node-tree-list git-repo-node-tree-nested">${childrenHtml}</ul>` : ''}</li>`;
                        }
                    }
                    return html;
                }

                escapeHtml(text) {
                    if (!text) return '';
                    const div = document.createElement('div');
                    div.textContent = text;
                    return div.innerHTML;
                }
            };

        // Register with both the enum value and string to be safe
        const fetchResultType = NodeType.FETCH_RESULT || 'fetch_result';
        NodeRegistry.register({
            type: fetchResultType,
            protocol: GitRepoProtocol,
        });
        console.log('[GitRepoFeature] Registered custom protocol for', fetchResultType);
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
