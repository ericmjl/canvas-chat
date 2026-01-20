/**
 * Git Repository Feature Plugin
 *
 * Handles git repository URL fetching with interactive file selection.
 * Fully self-contained plugin that demonstrates plugin architecture.
 *
 * TypeScript migration from git-repo.js
 */

import { FeaturePlugin } from '../feature-plugin.js';
import { createNode, NodeType } from '../graph-types.js';
import { createEdge, EdgeType } from '../graph-types.js';
import { isUrlContent, apiUrl } from '../utils.js';
import { BaseNode, Actions } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';

/**
 * File tree item structure from backend
 * @typedef {Object} FileTreeItem
 * @property {string} path - Full path from repo root
 * @property {string} type - 'file' or 'directory'
 * @property {number} [size] - File size in bytes
 * @property {FileTreeItem[]} [children] - Child items (directories only)
 */

/**
 * Git repo data stored in node
 * @typedef {Object} GitRepoData
 * @property {string} url - Repository URL
 * @property {string} title - Repository title
 * @property {FileTreeItem[]} fileTree - File tree structure
 * @property {string[]} selectedFiles - Selected file paths
 * @property {string[]} fetchedFilePaths - Actually fetched file paths
 * @property {Object<string, FileData>} files - Map of file paths to file data
 */

/**
 * File data from backend
 * @typedef {Object} FileData
 * @property {string} [content] - File content (text) or null
 * @property {string} [lang] - Language for syntax highlighting
 * @property {string} status - 'success', 'not_found', 'permission_denied', or 'error'
 * @property {boolean} [is_binary] - Whether file is binary
 * @property {boolean} [is_image] - Whether file is an image
 * @property {string} [mime_type] - MIME type for images
 */

/**
 * GitRepoFeature class manages git repository URL fetching.
 * Extends FeaturePlugin to integrate with the plugin architecture.
 */
export class GitRepoFeature extends FeaturePlugin {
    /**
     * @param {Object} context - Application context with injected dependencies
     */
    constructor(context) {
        super(context);
    }

    /**
     * Get slash commands for this feature
     * @returns {Array<Object>} Array of slash command definitions
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

        if (!isUrlContent(url)) {
            this.showToast?.('Please provide a valid URL', 'warning');
            return;
        }

        await this.handleGitUrl(url);
    }

    /**
     * Extract git host from URL
     * @param {string} url - Git repository URL
     * @returns {string|null} Host (e.g., 'github.com') or null
     */
    extractGitHost(url) {
        try {
            if (url.startsWith('git@')) {
                const match = url.match(/git@([^:]+):/);
                if (match) {
                    return match[1].toLowerCase();
                }
            }

            const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
            let host = urlObj.hostname.toLowerCase();
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

        const parentIds = this.canvas.getSelectedNodeIds();

        const fetchNode = createNode(NodeType.GIT_REPO, `Loading repository files:\n${url}...`, {
            position: this.graph.autoPosition(parentIds),
        });

        this.graph.addNode(fetchNode);
        this.canvas.clearSelection();

        for (const parentId of parentIds) {
            const edge = createEdge(parentId, fetchNode.id, parentIds.length > 1 ? EdgeType.MERGE : EdgeType.REPLY);
            this.graph.addEdge(edge);
        }

        this.chatInput.value = '';
        this.chatInput.style.height = 'auto';
        this.saveSession?.();
        this.updateEmptyState?.();

        this.modalManager.showPluginModal('git-repo', 'file-selection');

        const urlInput = modal.querySelector('#git-repo-url');
        if (urlInput) {
            urlInput.textContent = url;
        }

        modal.dataset.url = url;
        modal.dataset.nodeId = fetchNode.id;

        await this.loadFileTree(url, modal);
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

            const defaultFiles = this.getSmartDefaultFiles(data.files);

            if (treeContainer) {
                this.renderFileTree(data.files, defaultFiles, treeContainer);
            }

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
     * @param {FileTreeItem[]} items - File tree items
     * @returns {string[]} Array of file paths
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
     * @param {FileTreeItem} item - Directory item from file tree
     * @param {Set<string>} selectedPaths - Set of selected file paths
     * @returns {boolean} True if directory should be auto-expanded
     */
    shouldAutoExpandDirectory(item, selectedPaths) {
        if (item.type !== 'directory' || !item.children) {
            return false;
        }

        for (const child of item.children) {
            if (child.type === 'file' && selectedPaths.has(child.path)) {
                return true;
            }
            if (child.type === 'directory' && this.shouldAutoExpandDirectory(child, selectedPaths)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Render file tree recursively with classic OS-style tree view
     * @param {FileTreeItem[]} files - File tree items
     * @param {Set<string>} selectedPaths - Set of selected file paths
     * @param {HTMLElement} container - Container element
     * @param {number} depth - Current nesting depth
     * @param {Object} options - Rendering options
     */
    renderFileTree(files, selectedPaths, container, depth = 0, options = {}) {
        const { hideCheckboxes = false, fetchedFiles = null, selectedFilePath = null } = options;
        const ul = container.tagName === 'UL' ? container : document.createElement('ul');
        if (container.tagName !== 'UL') {
            ul.className = 'git-repo-file-tree-list';
        }

        for (const item of files) {
            const li = document.createElement('li');
            li.className = 'git-repo-file-tree-item';

            const fullPath = item.path;
            const isSelected = selectedPaths.has(fullPath);
            const displayName = fullPath.split('/').pop();

            if (item.type === 'file') {
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

                const isFetched = fetchedFiles ? fetchedFiles.has(fullPath) : false;
                if (isFetched) {
                    li.classList.add('git-repo-file-fetched');
                }

                if (isSelected) {
                    li.classList.add('git-repo-file-selected');
                }

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
                label.title = fullPath;

                // Determine icon based on file extension
                const fileExt = fullPath.split('.').pop()?.toLowerCase() || '';
                const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'];
                const fileIcon = imageExts.includes(fileExt) ? '🖼️' : '📄';
                label.innerHTML = `<span class="git-repo-file-icon">${fileIcon}</span> ${displayName}`;

                // Make fetched files clickable to open drawer
                if (isFetched) {
                    label.classList.add('git-repo-file-fetched-label');
                    label.style.cursor = 'pointer';
                    let filePathForLookup = fullPath;
                    if (fetchedFiles) {
                        if (fetchedFiles.has(fullPath)) {
                            filePathForLookup = fullPath;
                        } else {
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

                const contentWrapper = document.createElement('span');
                contentWrapper.className = 'git-repo-file-tree-item-content';
                contentWrapper.style.display = 'inline-flex';
                contentWrapper.style.alignItems = 'center';
                contentWrapper.appendChild(spacer);
                contentWrapper.appendChild(checkbox);
                contentWrapper.appendChild(label);
                li.appendChild(contentWrapper);
            } else if (item.type === 'directory') {
                const hasChildren = item.children && item.children.length > 0;

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

                const dirCheckbox = document.createElement('input');
                dirCheckbox.type = 'checkbox';
                dirCheckbox.id = `git-repo-dir-${fullPath.replace(/[^a-zA-Z0-9]/g, '_')}`;
                dirCheckbox.dataset.path = fullPath;
                dirCheckbox.dataset.type = 'directory';
                if (hideCheckboxes) {
                    dirCheckbox.style.display = 'none';
                }

                if (hasChildren) {
                    const allFilePaths = this.getAllFilePaths(item.children);
                    const allSelected = allFilePaths.length > 0 && allFilePaths.every((p) => selectedPaths.has(p));
                    const someSelected = allFilePaths.some((p) => selectedPaths.has(p));
                    dirCheckbox.checked = allSelected;
                    dirCheckbox.indeterminate = someSelected && !allSelected;
                }

                const label = document.createElement('label');
                label.htmlFor = dirCheckbox.id;
                label.className = 'git-repo-dir-label';
                label.title = fullPath;
                label.innerHTML = `<span class="git-repo-folder-icon">📁</span> ${displayName}`;

                expandBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const childrenUl = li.querySelector('ul');
                    if (childrenUl) {
                        const isCurrentlyExpanded = childrenUl.style.display !== 'none';
                        const willBeExpanded = !isCurrentlyExpanded;
                        childrenUl.style.display = willBeExpanded ? 'block' : 'none';
                        const icon = expandBtn.querySelector('.git-repo-expand-icon');
                        if (icon) {
                            icon.textContent = willBeExpanded ? '▼' : '▶';
                        }
                        expandBtn.classList.toggle('expanded', willBeExpanded);
                    }
                });

                dirCheckbox.addEventListener('change', (e) => {
                    e.stopPropagation();
                    if (hasChildren) {
                        dirCheckbox.indeterminate = false;
                        const childrenUl = li.querySelector('ul');
                        if (childrenUl) {
                            const updateChildren = (ul) => {
                                const fileCheckboxes = ul.querySelectorAll('input[data-type="file"]');
                                fileCheckboxes.forEach((cb) => {
                                    cb.checked = dirCheckbox.checked;
                                });
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
                        const treeContainer = container.closest('.git-repo-file-tree') || container;
                        this.updateParentDirectoryCheckboxes(treeContainer);
                    }
                });

                const contentWrapper = document.createElement('span');
                contentWrapper.className = 'git-repo-file-tree-item-content';
                contentWrapper.style.display = 'inline-flex';
                contentWrapper.style.alignItems = 'center';
                contentWrapper.appendChild(expandBtn);
                contentWrapper.appendChild(dirCheckbox);
                contentWrapper.appendChild(label);
                li.appendChild(contentWrapper);

                if (hasChildren) {
                    const childrenUl = document.createElement('ul');
                    childrenUl.className = 'git-repo-file-tree-list';

                    const shouldExpand = this.shouldAutoExpandDirectory(item, selectedPaths);
                    childrenUl.style.display = shouldExpand ? 'block' : 'none';

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
     * @param {FileTreeItem[]} fileTree - File tree structure
     * @returns {Set<string>} Set of file paths to select by default
     */
    getSmartDefaultFiles(fileTree) {
        const selected = new Set();

        const readmePatterns = ['README.md', 'README.rst', 'README.txt', 'README'];
        const configFiles = [
            '.gitignore',
            'pyproject.toml',
            'package.json',
            'requirements.txt',
            'Cargo.toml',
            'go.mod',
        ];
        const mainFiles = ['main.py', 'index.js', 'index.ts', 'app.py'];

        const findFiles = (items) => {
            for (const item of items) {
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
        const closeBtn = modal.querySelector('#git-repo-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.modalManager.hidePluginModal('git-repo', 'file-selection');
            });
        }

        const cancelBtn = modal.querySelector('#git-repo-cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.modalManager.hidePluginModal('git-repo', 'file-selection');
            });
        }

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

        const fetchBtn = modal.querySelector('#git-repo-fetch-btn');
        if (fetchBtn) {
            fetchBtn.addEventListener('click', async () => {
                await this.fetchSelectedFiles(modal, url, nodeId);
            });
        }

        const treeContainer = modal.querySelector('#git-repo-file-tree');
        if (treeContainer) {
            treeContainer.addEventListener('change', (e) => {
                if (e.target.type === 'checkbox') {
                    if (e.target.dataset.type === 'file') {
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
     * @param {number|null} count - Optional count to set (otherwise counts checkboxes)
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

        if (warningDisplay) {
            if (count > 50) {
                warningDisplay.textContent = `Selecting ${count} files may take a while and create a large node. Consider selecting fewer files.`;
                warningDisplay.style.display = 'block';
            } else if (count > 20) {
                warningDisplay.textContent = `Selecting ${count} files may create a large node.`;
                warningDisplay.style.display = 'block';
            } else {
                warningDisplay.style.display = 'none';
            }
        }

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

        if (fetchBtn) {
            fetchBtn.disabled = true;
            fetchBtn.textContent = 'Fetching...';
        }

        const gitCreds = this.getGitCredentialsForUrl(url);

        try {
            const response = await fetch(apiUrl('/api/url-fetch/fetch-files'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url,
                    file_paths: selectedPaths,
                    git_credentials: gitCreds,
                }),
            });

            if (!response.ok) {
                let errorDetail = 'Failed to fetch files';
                try {
                    const error = await response.json();
                    errorDetail = error.detail || error.message || errorDetail;
                } catch (e) {
                    const text = await response.text();
                    errorDetail = `HTTP ${response.status}: ${text.substring(0, 200)}`;
                }
                throw new Error(errorDetail);
            }

            const data = await response.json();

            let fileTree = null;
            try {
                const gitCreds = this.getGitCredentialsForUrl(url);
                const treeResponse = await fetch(apiUrl('/api/url-fetch/list-files'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url,
                        git_credentials: gitCreds,
                    }),
                });
                if (treeResponse.ok) {
                    const treeData = await treeResponse.json();
                    fileTree = treeData.files;
                }
            } catch (err) {
                console.warn('[GitRepoFeature] Failed to fetch file tree for rendering:', err);
            }

            const metadata = data.metadata || {};
            const files = metadata.files || {};
            const fetchedFilePaths = Object.keys(files);

            const gitRepoData = {
                url,
                title: data.title,
                fileTree: fileTree || [],
                selectedFiles: selectedPaths,
                fetchedFilePaths,
                files,
            };

            const updateData = {
                content: data.content || `**[${data.title}](${url})**`,
                gitRepoData,
            };

            if (!isEdit) {
                const node = this.graph.getNode(nodeId);
                updateData.versions = [
                    {
                        content: node?.content || `**[${data.title}](${url})**`,
                        timestamp: node?.createdAt || Date.now(),
                        reason: 'initial',
                    },
                ];
            }

            this.graph.updateNode(nodeId, updateData);

            const node = this.graph.getNode(nodeId);
            if (node) {
                this.canvas.renderNode(node);
            }

            this.saveSession?.();
            this.modalManager.hidePluginModal('git-repo', 'file-selection');
            this.canvas.panToNodeAnimated(nodeId);
        } catch (err) {
            this.showToast?.(`Failed to fetch files: ${err.message}`, 'error');
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

        const gitRepoFeatureInstance = this;

        const GitRepoProtocol = class extends BaseNode {
            getTypeLabel() {
                return 'Git Repository';
            }

            getTypeIcon() {
                return '📦';
            }

            getAdditionalActions() {
                return [Actions.SUMMARIZE, Actions.CREATE_FLASHCARDS];
            }

            async copyToClipboard(canvas, _app) {
                if (!this.node.gitRepoData || !this.node.gitRepoData.files) {
                    return;
                }

                const files = this.node.gitRepoData.files;
                const filePaths = Object.keys(files).sort();

                const parts = [];
                for (const filePath of filePaths) {
                    const fileData = files[filePath];
                    if (fileData && fileData.content && fileData.status === 'success') {
                        parts.push(`[${filePath}]`);
                        parts.push(fileData.content);
                        parts.push('========');
                    }
                }

                if (parts.length > 0 && parts[parts.length - 1] === '========') {
                    parts.pop();
                }

                const text = parts.join('\n');
                if (text) {
                    await navigator.clipboard.writeText(text);
                    canvas.showCopyFeedback(this.node.id);
                }
            }

            hasOutput() {
                if (this.node.gitRepoData && this.node.gitRepoData.files && this.node.selectedFilePath) {
                    return !!this.node.gitRepoData.files[this.node.selectedFilePath];
                }
                return false;
            }

            renderOutputPanel(canvas) {
                if (!this.node.gitRepoData || !this.node.gitRepoData.files) {
                    return '<div class="git-repo-file-panel-content">No repository data</div>';
                }

                const filePath = this.node.selectedFilePath;

                if (filePath && this.node.gitRepoData.files[filePath]) {
                    const fileData = this.node.gitRepoData.files[filePath];
                    const { content, lang, status, is_image, mime_type } = fileData;
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
                    } else if (is_image && content) {
                        // Render image from base64 data
                        const mime = mime_type || 'image/png';
                        html += `<div class="git-repo-file-panel-image-container">`;
                        html += `<img src="data:${mime};base64,${content}" alt="${escapedPath}" class="git-repo-file-panel-image" />`;
                        html += `</div>`;
                    } else if (content) {
                        const escapedContent = canvas.escapeHtml(content);
                        const codeClass = lang ? `language-${lang}` : '';
                        html += `<pre class="git-repo-file-panel-code"><code class="${codeClass}" data-highlight="true">${escapedContent}</code></pre>`;
                    } else {
                        html += `<div class="git-repo-file-panel-error">No content available</div>`;
                    }

                    html += `</div>`;
                    return html;
                }

                return '<div class="git-repo-file-panel-content"><em>Click a file in the tree to view its contents</em></div>';
            }

            getEventBindings() {
                return [
                    {
                        selector: '.git-repo-file-panel-code',
                        event: 'init',
                        handler: (_nodeId, e, _canvas) => {
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

            renderContent(canvas) {
                if (!this.node.gitRepoData) {
                    return canvas.renderMarkdown(this.node.content || '');
                }

                if (Array.isArray(this.node.gitRepoData.fileTree) && this.node.gitRepoData.fileTree.length > 0) {
                    const { fileTree, url, title, selectedFiles, fetchedFilePaths, files } = this.node.gitRepoData;
                    const container = document.createElement('div');
                    container.className = 'git-repo-node-tree';

                    const header = document.createElement('div');
                    header.className = 'git-repo-node-header';
                    header.style.marginBottom = '8px';
                    header.style.paddingBottom = '8px';
                    header.style.borderBottom = '1px solid var(--bg-secondary)';
                    const escapedUrl = canvas.escapeHtml(url);
                    const escapedTitle = canvas.escapeHtml(title || url);
                    header.innerHTML = `<strong><a href="${escapedUrl}" target="_blank" style="color: var(--accent-primary); text-decoration: none;">${escapedTitle}</a></strong>`;
                    container.appendChild(header);

                    const treeContainer = document.createElement('div');
                    treeContainer.className = 'git-repo-node-tree-container';
                    const selectedPathsSet = new Set(selectedFiles || []);
                    const fetchedFilesSet = new Set(
                        fetchedFilePaths && fetchedFilePaths.length > 0 ? fetchedFilePaths : []
                    );

                    gitRepoFeatureInstance.renderFileTree(fileTree, selectedPathsSet, treeContainer, 0, {
                        hideCheckboxes: true,
                        fetchedFiles: fetchedFilesSet,
                        selectedFilePath: this.node.selectedFilePath || null,
                    });

                    container.appendChild(treeContainer);

                    const fileCount = Object.keys(files || {}).length;
                    if (fileCount > 0) {
                        const stats = document.createElement('div');
                        stats.className = 'git-repo-node-stats';
                        stats.style.marginTop = '8px';
                        stats.style.fontSize = '12px';
                        stats.style.color = 'var(--text-secondary)';
                        stats.textContent = `${fileCount} file${fileCount !== 1 ? 's' : ''} fetched`;
                        container.appendChild(stats);
                    }

                    return container.innerHTML;
                }

                return canvas.renderMarkdown(this.node.content || '');
            }

            escapeHtml(text) {
                if (!text) return '';
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }

            getActions() {
                return [Actions.REPLY, Actions.EDIT_CONTENT, Actions.COPY];
            }

            getSummaryText() {
                if (this.node.gitRepoData && this.node.gitRepoData.title) {
                    return this.node.gitRepoData.title;
                }
                if (this.node.content) {
                    const urlMatch = this.node.content.match(/\[(.*?)\]\(.*?\)/);
                    if (urlMatch) {
                        return urlMatch[1];
                    }
                    return this.node.content.substring(0, 100);
                }
                return 'Git Repository';
            }

            isScrollable() {
                return true;
            }
        };

        NodeRegistry.register({
            type: NodeType.GIT_REPO,
            protocol: GitRepoProtocol,
        });
    }
}
