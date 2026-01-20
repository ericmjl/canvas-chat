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
 * Git repository data stored in node.
 */
interface GitRepoData {
    url: string;
    title: string;
    fileTree: FileTreeItem[];
    selectedFiles: string[];
    fetchedFilePaths: string[];
    files: Record<string, FileData>;
    isFetching?: boolean;
    fetchProgress?: Array<{ type: string; text: string }>;
}

/**
 * File tree item structure.
 */
interface FileTreeItem {
    path: string;
    type: 'file' | 'directory';
    size?: number;
    children?: FileTreeItem[];
}

/**
 * File data for drawer display.
 */
interface FileData {
    content: string;
    lang: string;
    status: 'success' | 'not_found' | 'permission_denied' | 'error';
    is_binary: boolean;
    is_image: boolean;
    mime_type?: string;
}

/**
 * GitRepoFeature class manages git repository URL fetching.
 * Extends FeaturePlugin to integrate with the plugin architecture.
 */
export class GitRepoFeature extends FeaturePlugin {
    /**
     * @param {AppContext} context - Application context with injected dependencies
     */
    constructor(context: any) {
        super(context);
    }

    /**
     * Get slash commands for this feature
     * @returns {Array} Array of slash command definitions
     */
    getSlashCommands(): Array<{ command: string; description: string; placeholder: string }> {
        return [
            {
                command: '/git',
                description: 'Clone a git repository with file selection',
                placeholder: 'https://github.com/user/repo',
            },
        ];
    }

    /**
     * Handle /git slash command
     * @param {string} command - The slash command (e.g., '/git')
     * @param {string} args - Arguments after the command (URL)
     * @param {Object} _contextObj - Context object (unused)
     */
    async handleCommand(command: string, args: string, _contextObj: any): Promise<void> {
        // Use existing handleGitUrl() logic
        await this.handleGitUrl(args);
    }

    /**
     * Handle a git URL - create a git repo node and open file selection
     * @param {string} url - The git repository URL
     */
    async handleGitUrl(url: string): Promise<void> {
        // Create a new node for the git repo
        const nodeId = `git-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        // Normalize the URL (add .git suffix if missing, convert SSH to HTTPS)
        const normalizedUrl = this.normalizeGitUrl(url);

        // Get repo name from URL for the node title
        let repoName = normalizedUrl.split('/').pop();
        if (repoName?.endsWith('.git')) {
            repoName = repoName.slice(0, -4);
        }

        // Create the node at the center of the visible area with default positioning
        // Use the visible center from canvas state
        const position = this.graph.getNewNodePosition();

        // Create git repo data
        const gitRepoData: GitRepoData = {
            url: normalizedUrl,
            title: repoName || 'Git Repository',
            fileTree: [],
            selectedFiles: [],
            fetchedFilePaths: [],
            files: {},
        };

        // Create a unique node ID with timestamp and random suffix
        const node = createNode(NodeType.GIT_REPO, `**[${repoName}](${normalizedUrl})**`, {
            position: position,
        });

        // Add gitRepoData to the node (cast to any since node type is generic)
        (node as any).gitRepoData = gitRepoData;

        this.graph.addNode(node);
        this.canvas.renderNode(node);

        // Pan to show the node
        this.canvas.panToNodeAnimated(nodeId);

        // Show file selection modal
        await this.showFileSelectionModal(nodeId, normalizedUrl);
    }

    /**
     * Normalize a git URL
     * @param {string} url - The git repository URL
     * @returns {string} Normalized URL
     */
    normalizeGitUrl(url: string): string {
        let normalizedUrl = url.trim();

        // Convert SSH URLs to HTTPS
        if (normalizedUrl.startsWith('git@')) {
            normalizedUrl = 'https://' + normalizedUrl.slice(4).replace(':', '/');
        }

        // Add .git suffix if missing and no trailing slash
        if (!normalizedUrl.endsWith('.git') && !normalizedUrl.endsWith('/')) {
            normalizedUrl = normalizedUrl + '.git';
        }

        return normalizedUrl;
    }

    /**
     * Show the file selection modal for a git repository
     * @param {string} nodeId - The node ID
     * @param {string} url - The git repository URL
     */
    async showFileSelectionModal(nodeId: string, url: string): Promise<void> {
        const modal = this.modalManager.getPluginModal('git-repo', 'file-selection');

        if (!modal) {
            this.showToast?.('File selection modal not found', 'error');
            return;
        }

        // Show modal
        this.modalManager.showPluginModal('git-repo', 'file-selection');

        // Set URL in modal
        const urlInput = modal.querySelector('#git-repo-url');
        if (urlInput) {
            urlInput.textContent = url;
        }

        // Store current URL and node ID (for creating new node)
        modal.dataset.url = url;
        modal.dataset.nodeId = nodeId;
        modal.dataset.isEdit = 'false';

        // Load file tree
        await this.loadFileTree(url, modal);

        // Setup event listeners
        this.setupModalEventListeners(modal, url, nodeId);
    }

    /**
     * Load the file tree for a git repository
     * @param {string} url - The git repository URL
     * @param {HTMLElement} modal - The modal element
     */
    async loadFileTree(url: string, modal: HTMLElement): Promise<void> {
        const treeContainer = modal.querySelector('#git-repo-file-tree-container');
        const loadingIndicator = modal.querySelector('#git-repo-loading');
        const errorContainer = modal.querySelector('#git-repo-error');

        if (!treeContainer || !loadingIndicator || !errorContainer) {
            console.error('[GitRepoFeature] Required modal elements not found');
            return;
        }

        // Clear previous content and show loading
        treeContainer.innerHTML = '';
        errorContainer.innerHTML = '';
        (loadingIndicator as HTMLElement).style.display = 'block';

        try {
            const response = await fetch(apiUrl('/api/url-fetch/list-files'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, git_credentials: this.getGitCredentials() }),
            });

            if (!response.ok) {
                let errorDetail = 'Failed to list files';
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

            // Store file tree for use during selection
            const fileTree = data.files || [];

            // Debug: Log file tree structure
            console.log('[GitRepoFeature] File tree:', {
                totalItems: this.countItems(fileTree),
                items: fileTree.slice(0, 3),
            });

            // Render the file tree
            const selectedPaths = new Set<string>();
            const fetchedFiles = new Set<string>();

            // Use the renderFileTree function from the class
            this.renderFileTree(
                fileTree,
                selectedPaths,
                treeContainer as HTMLElement,
                0,
                {
                    hideCheckboxes: false,
                    fetchedFiles: fetchedFiles,
                    selectedFilePath: null,
                },
                modal
            );

            // Update selection count on load
            this.updateSelectionCount(modal, 0);
        } catch (err: any) {
            console.error('[GitRepoFeature] Failed to load file tree:', err);
            (errorContainer as HTMLElement).innerHTML =
                `<div class="git-repo-error">${this.escapeHtml(err.message)}</div>`;
        } finally {
            (loadingIndicator as HTMLElement).style.display = 'none';
        }
    }

    /**
     * Recursively count items in file tree
     * @param {Array} items - File tree items
     * @returns {number} Total count
     */
    countItems(items: any[]): number {
        let count = 0;
        for (const item of items) {
            count++;
            if (item.children) {
                count += this.countItems(item.children);
            }
        }
        return count;
    }

    /**
     * Setup event listeners for the file selection modal
     * @param {HTMLElement} modal - The modal element
     * @param {string} url - The git repository URL
     * @param {string} nodeId - The node ID
     */
    setupModalEventListeners(modal: HTMLElement, url: string, nodeId: string): void {
        // Handle close button
        const closeBtn = modal.querySelector('#git-repo-close');
        if (closeBtn) {
            // Clone to remove old event listeners
            const newCloseBtn = closeBtn.cloneNode(true) as HTMLElement;
            closeBtn.parentNode?.replaceChild(newCloseBtn, closeBtn);

            newCloseBtn.addEventListener('click', () => {
                this.modalManager.hidePluginModal('git-repo', 'file-selection');
            });
        }

        // Handle fetch button
        const fetchBtn = modal.querySelector('#git-repo-fetch-btn');
        if (fetchBtn) {
            // Clone to remove old event listeners
            const newFetchBtn = fetchBtn.cloneNode(true) as HTMLElement;
            fetchBtn.parentNode?.replaceChild(newFetchBtn, fetchBtn);

            newFetchBtn.addEventListener('click', () => {
                this.fetchSelectedFiles(modal, url, nodeId);
            });
        }

        // Handle select all checkbox
        const selectAllCheckbox = modal.querySelector('#git-repo-select-all');
        if (selectAllCheckbox) {
            const newSelectAll = selectAllCheckbox.cloneNode(true) as HTMLElement;
            selectAllCheckbox.parentNode?.replaceChild(newSelectAll, selectAllCheckbox);

            newSelectAll.addEventListener('change', (e: Event) => {
                const target = e.target as HTMLInputElement;
                const checkboxes = modal.querySelectorAll('input[type="checkbox"][data-type="file"]');
                checkboxes.forEach((cb) => {
                    (cb as HTMLInputElement).checked = target.checked;
                });
                const checkedCount = target.checked
                    ? modal.querySelectorAll('input[type="checkbox"][data-type="file"]').length
                    : 0;
                this.updateSelectionCount(modal, checkedCount);
            });
        }
    }

    /**
     * Update the selection count display
     * @param {HTMLElement} modal - The modal element
     * @param {number} count - Number of selected files
     */
    updateSelectionCount(modal: HTMLElement, count: number): void {
        const countElement = modal.querySelector('#git-repo-selection-count');
        if (countElement) {
            countElement.textContent = `${count} file${count !== 1 ? 's' : ''} selected`;
        }
    }

    /**
     * Recursively render a file tree
     * @param {Array} items - File tree items to render
     * @param {Set} selectedPaths - Set of selected file paths
     * @param {HTMLElement} container - Container element
     * @param {number} depth - Current depth for indentation
     * @param {Object} options - Rendering options
     * @param {HTMLElement} modal - Modal element for event handling
     */
    renderFileTree(
        items: any[],
        selectedPaths: Set<string>,
        container: HTMLElement,
        depth: number,
        options: {
            hideCheckboxes: boolean;
            fetchedFiles: Set<string>;
            selectedFilePath: string | null;
        },
        modal: HTMLElement
    ): void {
        const ul = document.createElement('ul');
        ul.className = 'git-repo-file-tree-list';
        ul.style.marginLeft = depth > 0 ? '20px' : '0';

        for (const item of items) {
            const fullPath = item.path;
            const isFetched = options.fetchedFiles.has(fullPath);

            const li = document.createElement('li');
            li.className = 'git-repo-file-tree-item';
            if (isFetched) {
                li.classList.add('git-repo-file-fetched');
            }

            const contentWrapper = document.createElement('span');
            contentWrapper.className = 'git-repo-file-tree-item-content';

            const checkboxId = `git-repo-cb-${Math.random().toString(36).substring(2, 10)}`;

            if (!options.hideCheckboxes) {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = checkboxId;
                (checkbox as HTMLInputElement).dataset.path = fullPath;
                (checkbox as HTMLInputElement).dataset.type = item.type;
                (checkbox as HTMLInputElement).dataset.checked = 'false';

                // Add change listener
                checkbox.addEventListener('change', (e: Event) => {
                    const target = e.target as HTMLInputElement;
                    const checkedCount = modal.querySelectorAll(
                        'input[type="checkbox"][data-type="file"]:checked'
                    ).length;
                    this.updateSelectionCount(modal, checkedCount);

                    // Handle directory checkbox
                    if (item.type === 'directory') {
                        const childLi = target.closest('.git-repo-file-tree-item');
                        if (childLi) {
                            const childCheckboxes = childLi.querySelectorAll('input[data-type="file"]');
                            childCheckboxes.forEach((child) => {
                                (child as HTMLInputElement).checked = target.checked;
                            });
                        }
                    }

                    // Update parent directory checkboxes
                    this.updateParentDirectoryCheckboxes(modal);
                });

                contentWrapper.appendChild(checkbox);
            }

            if (item.type === 'directory') {
                // Directory: expand/collapse button + icon + name
                const hasChildren = item.children && item.children.length > 0;

                // Expand/collapse button
                const expandBtn = document.createElement('button');
                expandBtn.className = 'git-repo-expand-btn';
                expandBtn.innerHTML = hasChildren
                    ? '<span class="git-repo-expand-icon">▶</span>'
                    : '<span class="git-repo-expand-icon"></span>';
                (expandBtn as HTMLButtonElement).dataset.path = fullPath;
                expandBtn.disabled = !hasChildren;

                if (hasChildren) {
                    expandBtn.addEventListener('click', (e: Event) => {
                        const target = e.currentTarget as HTMLButtonElement;
                        const isExpanded = target.classList.contains('expanded');
                        const childUl = target.closest('.git-repo-file-tree-item')?.querySelector('ul');
                        if (childUl) {
                            if (isExpanded) {
                                childUl.style.display = 'none';
                                target.classList.remove('expanded');
                            } else {
                                childUl.style.display = 'block';
                                target.classList.add('expanded');
                            }
                        }
                    });
                }

                contentWrapper.appendChild(expandBtn);

                // Folder icon and name
                const label = document.createElement('label');
                label.htmlFor = checkboxId;
                label.className = 'git-repo-dir-label';
                label.title = fullPath;
                label.innerHTML = `<span class="git-repo-folder-icon">📁</span> ${this.escapeHtml(item.name || fullPath.split('/').pop())}`;
                contentWrapper.appendChild(label);

                li.appendChild(contentWrapper);

                // Recursively render children
                if (hasChildren && item.children) {
                    const childUl = document.createElement('ul');
                    childUl.className = 'git-repo-file-tree-list';
                    childUl.style.display = 'none'; // Start collapsed
                    this.renderFileTree(item.children, selectedPaths, childUl, 0, options, modal);
                    li.appendChild(childUl);
                }
            } else {
                // File: checkbox + icon + name
                // Determine icon based on file extension
                const fileExt = fullPath.split('.').pop()?.toLowerCase() || '';
                const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'];
                const fileIcon = imageExts.includes(fileExt) ? '🖼️' : '📄';

                const label = document.createElement('label');
                label.htmlFor = checkboxId;
                label.className = 'git-repo-file-label';
                label.title = fullPath;

                if (isFetched) {
                    label.classList.add('git-repo-file-fetched-label');
                    label.style.cursor = 'pointer';
                    (label as HTMLElement).dataset.filePath = fullPath;
                }
                label.innerHTML = `<span class="git-repo-file-icon">${fileIcon}</span> ${this.escapeHtml(item.name || fullPath.split('/').pop())}`;

                // Add click handler to open file in drawer
                if (isFetched && (label as HTMLElement).dataset.filePath) {
                    const nodeId = this.graph.getCurrentNodeId?.() || '';
                    if (nodeId) {
                        label.addEventListener('click', () => {
                            this.canvas.selectGitRepoFile(nodeId, fullPath);
                        });
                    }
                }

                contentWrapper.appendChild(label);
                li.appendChild(contentWrapper);
            }

            ul.appendChild(li);
        }

        container.appendChild(ul);
    }

    /**
     * Update parent directory checkboxes based on child states
     * @param {HTMLElement} modal - The modal element
     */
    updateParentDirectoryCheckboxes(modal: HTMLElement): void {
        const dirItems = modal.querySelectorAll('.git-repo-file-tree-item:has(ul)');

        dirItems.forEach((dirItem) => {
            const dirCheckbox = dirItem.querySelector('input[type="checkbox"]') as HTMLInputElement;
            if (!dirCheckbox) return;

            const childFileCheckboxes = dirItem.querySelectorAll('input[data-type="file"]');
            const childDirCheckboxes = dirItem.querySelectorAll(':scope > ul input[data-type="directory"]');

            const checkedCount = Array.from(childFileCheckboxes).filter(
                (cb) => (cb as HTMLInputElement).checked
            ).length;
            const indeterminateCount = Array.from(childDirCheckboxes).filter(
                (cb) => (cb as HTMLInputElement).indeterminate
            ).length;
            const totalChildren = childFileCheckboxes.length + childDirCheckboxes.length;

            // Determine checkbox state
            if (checkedCount === 0 && indeterminateCount === 0) {
                dirCheckbox.checked = false;
                dirCheckbox.indeterminate = false;
            } else if (checkedCount === totalChildren && indeterminateCount === 0) {
                dirCheckbox.checked = true;
                dirCheckbox.indeterminate = false;
            } else {
                dirCheckbox.checked = false;
                dirCheckbox.indeterminate = true;
            }
        });
    }

    /**
     * Get git credentials for a specific URL
     * @param {string} url - The git repository URL
     * @returns {Object} Git credentials by host
     */
    getGitCredentialsForUrl(url: string): Record<string, string> {
        try {
            const hostname = new URL(url).hostname;
            const allCreds = this.getGitCredentials();
            if (hostname in allCreds) {
                return { [hostname]: allCreds[hostname] };
            }
        } catch (e) {
            console.warn('[GitRepoFeature] Failed to extract hostname from URL:', e);
        }
        return {};
    }

    /**
     * Get stored git credentials
     * @returns {Object} Git credentials by host
     */
    getGitCredentials(): Record<string, string> {
        const stored = (this.storage as any).getGitCredentials?.();
        return stored || {};
    }

    /**
     * Save git credentials
     * @param {Object} creds - Git credentials to save
     */
    saveGitCredentials(creds: Record<string, string>): void {
        (this.storage as any).saveGitCredentials?.(creds);
    }

    /**
     * Escape HTML special characters
     * @param {string} text - Text to escape
     * @returns {string} Escaped HTML
     */
    escapeHtml(text: string): string {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Fetch selected files from the repository
     * @param {HTMLElement} modal - The modal element
     * @param {string} url - Repository URL
     * @param {string} nodeId - Node ID to update
     */
    async fetchSelectedFiles(modal: HTMLElement, url: string, nodeId: string): Promise<void> {
        const isEdit = modal.dataset.isEdit === 'true';
        const checkboxes = modal.querySelectorAll('input[type="checkbox"]:checked');
        const selectedFilePaths = new Set<string>();

        // Collect selected file paths, expanding directories to their file children
        checkboxes.forEach((cb) => {
            const path = (cb as HTMLElement).dataset.path;
            const type = (cb as HTMLElement).dataset.type;
            if (!path || !type) return;

            if (type === 'file') {
                selectedFilePaths.add(path);
            } else if (type === 'directory') {
                const li = cb.closest('.git-repo-file-tree-item');
                if (!li) return;
                const childFiles = li.querySelectorAll('input[data-type="file"][data-path]');
                childFiles.forEach((child) => {
                    selectedFilePaths.add((child as HTMLElement).dataset.path || '');
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
    async fetchSelectedFilesStreaming(
        modal: HTMLElement,
        url: string,
        nodeId: string,
        selectedPaths: string[],
        isEdit: boolean
    ): Promise<void> {
        const fetchBtn = modal.querySelector('#git-repo-fetch-btn');
        const gitCreds = this.getGitCredentialsForUrl(url);

        // Disable button temporarily
        if (fetchBtn) {
            (fetchBtn as HTMLButtonElement).disabled = true;
            (fetchBtn as HTMLElement).innerHTML =
                '<span class="git-repo-fetch-spinner"></span><span class="git-repo-fetch-text">Starting...</span>';
            (fetchBtn as HTMLElement).classList.add('loading');
        }

        // Close modal and open drawer for progress
        this.modalManager.hidePluginModal('git-repo', 'file-selection');

        // Extract repo name from URL (simplified version of Python's _extract_repo_name)
        let repoName = url.split('/').pop();
        if (repoName?.endsWith('.git')) {
            repoName = repoName.slice(0, -4);
        }

        const node = this.graph.getNode(nodeId);
        const gitRepoData: GitRepoData = {
            url,
            title: `Git: ${repoName || 'Repository'}`,
            fileTree: [],
            selectedFiles: selectedPaths,
            fetchedFilePaths: [],
            files: {},
            isFetching: true,
            fetchProgress: [],
        };

        const updateData: any = {
            content: `**Fetching repository...**\n\n${url}\n\nSelect files to view content after fetch completes.`,
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
        const updatedNode = this.graph.getNode(nodeId);
        if (updatedNode) {
            this.canvas.renderNode(updatedNode);
        }

        // Open the drawer for this node
        this.canvas.selectGitRepoFile(nodeId, null);

        try {
            // Use fetch with ReadableStream for POST-based streaming
            const response = await fetch(apiUrl('/api/url-fetch/fetch-files-stream'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url,
                    file_paths: selectedPaths,
                    git_credentials: gitCreds,
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('Response body is null');
            }

            const decoder = new TextDecoder();
            let buffer = '';
            const progressLog: Array<{ type: string; text: string }> = [];

            // Stream processing loop
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        try {
                            // Extract event type from separate event line
                            const eventTypeMatch = line.match(/event:\s*(\w+)/);
                            const eventType = eventTypeMatch ? eventTypeMatch[1] : 'message';

                            const eventData = line.substring(line.indexOf(':') + 1);
                            const parsed = JSON.parse(eventData);

                            if (eventType === 'status') {
                                progressLog.push({ type: 'info', text: parsed.data });
                            } else if (eventType === 'log') {
                                progressLog.push({ type: 'log', text: parsed.data });
                            } else if (eventType === 'complete') {
                                progressLog.push({ type: 'success', text: 'Complete!' });

                                // Update drawer with final progress
                                this.updateDrawerProgress(nodeId, progressLog);

                                // Process complete data
                                const completeData = parsed.data;
                                await this.processFetchComplete(
                                    nodeId,
                                    url,
                                    selectedPaths,
                                    isEdit,
                                    completeData,
                                    gitCreds
                                );
                                return;
                            } else if (eventType === 'error') {
                                throw new Error(parsed.data);
                            }
                        } catch (e) {
                            if (e instanceof SyntaxError) {
                                // Incomplete JSON, wait for more data
                                continue;
                            }
                            throw e;
                        }
                    }
                }

                // Update drawer with progress
                this.updateDrawerProgress(nodeId, progressLog);
            }
        } catch (err: any) {
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
     * Update drawer progress display
     * @param {string} nodeId - Node ID
     * @param {Array} progressLog - Progress log entries
     */
    updateDrawerProgress(nodeId: string, progressLog: Array<{ type: string; text: string }>): void {
        const wrapped = wrapNode(this.graph.getNode(nodeId));
        if (wrapped && typeof (wrapped as any).updateFetchProgress === 'function') {
            (wrapped as any).updateFetchProgress(progressLog);
        }
    }

    /**
     * Process completed fetch and update node with results.
     */
    async processFetchComplete(
        nodeId: string,
        url: string,
        selectedPaths: string[],
        isEdit: boolean,
        data: any,
        gitCreds: Record<string, string>
    ): Promise<void> {
        // Get the file tree structure
        let fileTree: any[] | null = null;
        try {
            const treeResponse = await fetch(apiUrl('/api/url-fetch/list-files'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, git_credentials: gitCreds }),
            });
            if (treeResponse.ok) {
                const treeData = await treeResponse.json();
                fileTree = treeData.files;
            }
        } catch (err) {
            console.warn('[GitRepoFeature] Failed to fetch file tree:', err);
        }

        // Store git repo data in node
        const metadata = data.metadata || {};
        const files = metadata.files || {};

        const fetchedFilePaths = Object.keys(files);
        const gitRepoData: GitRepoData = {
            url: data.metadata?.git_repo_data?.url || url,
            title: data.title || 'Git Repository',
            fileTree: fileTree || [],
            selectedFiles: selectedPaths,
            fetchedFilePaths,
            files: files,
            isFetching: false,
            fetchProgress: [],
        };

        const updateData: any = {
            content: data.content || `**[${data.title || 'Git Repository'}](${url})**`,
            gitRepoData,
        };

        if (!isEdit) {
            const node = this.graph.getNode(nodeId);
            updateData.versions = [
                {
                    content: node?.content || `**[${data.title || 'Git Repository'}](${url})**`,
                    timestamp: node?.createdAt || Date.now(),
                    reason: 'initial',
                },
            ];
        }

        this.graph.updateNode(nodeId, updateData);
        const updatedNode = this.graph.getNode(nodeId);
        if (updatedNode) {
            this.canvas.renderNode(updatedNode);
        }
        this.saveSession?.();

        // Select first file if available
        if (fetchedFilePaths.length > 0) {
            this.canvas.selectGitRepoFile(nodeId, fetchedFilePaths[0]);
        }
    }

    /**
     * Lifecycle hook: called when plugin is loaded
     */
    async onLoad(): Promise<void> {
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
                        <div id="git-repo-url-display" class="git-repo-url-display">
                            <label>Repository URL</label>
                            <div id="git-repo-url" class="git-repo-url-text"></div>
                        </div>

                        <div id="git-repo-file-selection-controls" class="git-repo-file-selection-controls">
                            <label class="select-all-label">
                                <input type="checkbox" id="git-repo-select-all" />
                                Select All
                            </label>
                            <span id="git-repo-selection-count" class="git-repo-selection-count">0 files selected</span>
                        </div>

                        <div id="git-repo-file-tree-container" class="git-repo-file-tree">
                            <div id="git-repo-loading" class="git-repo-loading" style="display: none">
                                <span class="spinner"></span>
                                Loading file tree...
                            </div>
                            <div id="git-repo-error" class="git-repo-error" style="display: none"></div>
                        </div>

                        <div class="modal-actions" style="margin-top: 16px">
                            <button id="git-repo-fetch-btn" class="primary-btn">
                                Fetch Selected Files
                            </button>
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
            declare node: any;
            declare canvas: any;

            getTypeLabel(): string {
                return 'Git Repository';
            }

            getTypeIcon(): string {
                return '📦';
            }

            getAdditionalActions(): Array<{ id: string; label: string; title: string }> {
                return [
                    { id: Actions.SUMMARIZE.id, label: 'Summarize', title: 'Summarize this repository' },
                    {
                        id: Actions.CREATE_FLASHCARDS.id,
                        label: 'Flashcards',
                        title: 'Create flashcards from repository',
                    },
                ];
            }

            async copyToClipboard(_canvas: any, _app: any): Promise<void> {
                if (!this.node.gitRepoData || !this.node.gitRepoData.files) {
                    return;
                }
                const files = this.node.gitRepoData.files;
                const paths = Object.keys(files);

                if (paths.length === 0) {
                    return;
                }

                const lines: string[] = [];
                for (const path of paths) {
                    const fileData = files[path];
                    if (fileData.status !== 'success') continue;

                    const content = fileData.content || '';
                    lines.push(`[${path}]`);
                    lines.push(content);
                    lines.push('========');
                }

                const text = lines.join('\n');
                await navigator.clipboard.writeText(text);

                this.canvas.showCopyFeedback(this.node.id);
            }

            hasOutput(): boolean {
                // Show drawer when fetching is in progress
                if (this.node.gitRepoData && this.node.gitRepoData.isFetching) {
                    return true;
                }
                // Only show drawer when a file is selected (not by default)
                if (this.node.gitRepoData && this.node.gitRepoData.files && this.node.selectedFilePath) {
                    return !!this.node.gitRepoData.files[this.node.selectedFilePath];
                }
                return false;
            }

            renderOutputPanel(canvas: any): string {
                // Show progress while fetching
                if (this.node.gitRepoData && this.node.gitRepoData.isFetching) {
                    const progressLog = this.node.gitRepoData.fetchProgress || [];
                    const logHtml = progressLog
                        .slice(-50)
                        .map((entry: { type: string; text: string }) => {
                            let icon = '📋';
                            if (entry.type === 'log') icon = '📥';
                            else if (entry.type === 'success') icon = '✅';
                            else if (entry.type === 'info') icon = 'ℹ️';
                            return `<div class="git-repo-progress-log-entry ${entry.type}">${icon} ${this.escapeHtml(entry.text)}</div>`;
                        })
                        .join('');

                    return `
                        <div class="git-repo-file-panel-content">
                            <div class="git-repo-progress-panel">
                                <div class="git-repo-progress-header">
                                    <span class="git-repo-progress-spinner-large"></span>
                                    <span>Fetching repository...</span>
                                </div>
                                <div class="git-repo-progress-log">
                                    ${logHtml || '<div class="git-repo-progress-log-entry info">Initializing...</div>'}
                                </div>
                                <div class="git-repo-progress-status">This may take a moment for large repositories</div>
                            </div>
                        </div>
                    `;
                }

                // Handle git repo file selection
                if (!this.node.gitRepoData || !this.node.gitRepoData.files) {
                    return '<div class="git-repo-file-panel-content">No repository data</div>';
                }

                const filePath = this.node.selectedFilePath;

                // If a specific file is selected, show it
                if (filePath && this.node.gitRepoData.files[filePath]) {
                    const fileData = this.node.gitRepoData.files[filePath];

                    const { content, lang, status } = fileData;
                    const escapedPath = this.escapeHtml(filePath);

                    let html = `<div class="git-repo-file-panel-content">`;
                    html += `<div class="git-repo-file-panel-header">`;
                    html += `<strong>${escapedPath}</strong>`;
                    if (lang) {
                        html += ` <span class="git-repo-file-panel-lang">(${this.escapeHtml(lang)})</span>`;
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
                        const escapedContent = this.escapeHtml(content);
                        const codeClass = lang ? `language-${lang}` : '';
                        html += `<pre class="git-repo-file-panel-code"><code class="${codeClass}" data-highlight="true">${escapedContent}</code></pre>`;
                    } else {
                        html += `<div class="git-repo-file-panel-error">No content available</div>`;
                    }

                    html += `</div>`;
                    return html;
                }

                // No file selected - drawer shouldn't be open (hasOutput returns false)
                return '<div class="git-repo-file-panel-content"><em>Click a file in the tree to view its contents</em></div>';
            }

            getEventBindings(): Array<{ selector: string; event: string; handler: Function }> {
                return [
                    {
                        selector: '.git-repo-file-panel-code',
                        event: 'init',
                        handler: (_nodeId: string, e: Event, _canvas: any) => {
                            // Initialize syntax highlighting after render
                            if (typeof window !== 'undefined' && (window as any).hljs) {
                                const codeEl = (e.currentTarget as HTMLElement).querySelector(
                                    'code[data-highlight="true"]'
                                );
                                if (codeEl) {
                                    (window as any).hljs.highlightElement(codeEl);
                                }
                            }
                        },
                    },
                ];
            }

            renderContent(canvas: any): string {
                // Render git repo file tree if available
                if (!this.node.gitRepoData) {
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
                        const selectedPathsSet = new Set<string>(selectedFiles || []);
                        const fetchedFilesSet = new Set<string>(
                            fetchedFilePaths && fetchedFilePaths.length > 0
                                ? fetchedFilePaths
                                : Object.keys(files || {})
                        );
                        // Use the captured GitRepoFeature instance to call renderFileTree
                        gitRepoFeatureInstance.renderFileTree(
                            fileTree,
                            selectedPathsSet,
                            treeContainer,
                            0,
                            {
                                hideCheckboxes: true,
                                fetchedFiles: fetchedFilesSet,
                                selectedFilePath: this.node.selectedFilePath || null,
                            },
                            document.body as HTMLElement
                        );
                        container.appendChild(treeContainer);

                        return container.outerHTML;
                    } catch (err) {
                        console.error('[GitRepoFeature] Error rendering file tree:', err);
                    }
                }
                // Fallback to original protocol rendering for non-git-repo nodes or nodes without file tree
                try {
                    return super.renderContent(canvas);
                } catch (err) {
                    console.error('[GitRepoFeature] Error in super.renderContent, using BaseNode fallback:', err);
                    return canvas.renderMarkdown(this.node.content || '');
                }
            }

            escapeHtml(text: string): string {
                if (!text) return '';
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }

            updateFetchProgress(progressLog: Array<{ type: string; text: string }>): void {
                if (!this.node.gitRepoData) return;
                this.node.gitRepoData.fetchProgress = progressLog;
                // Re-render the drawer panel if it's open
                if (this.canvas.drawerPanel && this.canvas.drawerPanel.dataset.nodeId === this.node.id) {
                    this.canvas.renderDrawerPanel();
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
    setupSettingsModalHooks(): void {
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
    injectGitCredentialsUI(): void {
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
    loadGitCredentialsUI(): void {
        const gitCreds = this.getGitCredentials();

        // Load standard hosts
        const githubInput = document.getElementById('git-github-cred') as HTMLInputElement | null;
        const gitlabInput = document.getElementById('git-gitlab-cred') as HTMLInputElement | null;
        const bitbucketInput = document.getElementById('git-bitbucket-cred') as HTMLInputElement | null;

        if (githubInput) githubInput.value = gitCreds['github.com'] || '';
        if (gitlabInput) gitlabInput.value = gitCreds['gitlab.com'] || '';
        if (bitbucketInput) bitbucketInput.value = gitCreds['bitbucket.org'] || '';

        // Render custom git credentials
        this.renderCustomGitCreds(gitCreds);

        // Setup "Add" button for custom git credentials
        const addCredBtn = document.getElementById('git-add-cred-btn');
        if (addCredBtn) {
            // Remove existing listener if any (clone to remove old listeners)
            const newBtn = addCredBtn.cloneNode(true) as HTMLButtonElement;
            addCredBtn.parentNode?.replaceChild(newBtn, addCredBtn);

            newBtn.addEventListener('click', () => {
                const hostInput = document.getElementById('git-generic-host') as HTMLInputElement | null;
                const credInput = document.getElementById('git-generic-cred') as HTMLInputElement | null;
                const host = hostInput?.value.trim() || '';
                const cred = credInput?.value.trim() || '';

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
                if (hostInput) hostInput.value = '';
                if (credInput) credInput.value = '';

                // Refresh list
                this.renderCustomGitCreds(creds);
                this.showToast?.(`Added credential for ${host}`, 'success');
            });
        }
    }

    /**
     * Render custom git credentials list
     * @param {Object} gitCreds - Map of host to credential
     */
    renderCustomGitCreds(gitCreds: Record<string, string>): void {
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
            const escapedHost = this.escapeHtml(host);
            const escapedCred = this.escapeHtml(cred);
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
                const host = (btn as HTMLElement).dataset.host;
                const creds = this.getGitCredentials();
                if (host) {
                    delete creds[host];
                }
                this.saveGitCredentials(creds);
                this.renderCustomGitCreds(creds);
            });
        });
    }

    /**
     * Save git credentials from settings modal
     * Called by app.saveSettings()
     */
    saveGitCredentialsFromModal(): void {
        const gitCreds: Record<string, string> = {
            'github.com': (document.getElementById('git-github-cred') as HTMLInputElement)?.value.trim() || '',
            'gitlab.com': (document.getElementById('git-gitlab-cred') as HTMLInputElement)?.value.trim() || '',
            'bitbucket.org': (document.getElementById('git-bitbucket-cred') as HTMLInputElement)?.value.trim() || '',
        };

        // Add custom git credentials
        document.querySelectorAll('.git-custom-cred-input').forEach((input) => {
            const host = (input as HTMLInputElement).dataset.host;
            const cred = (input as HTMLInputElement).value.trim();
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
     * Inject plugin CSS dynamically for self-contained plugin architecture
     */
    async injectPluginCSS(): Promise<void> {
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
            `;
            this.injectCSS(fallbackCSS, 'git-repo-plugin-styles');
        }
    }
}

console.log('[GitRepoFeature] Plugin loaded');
