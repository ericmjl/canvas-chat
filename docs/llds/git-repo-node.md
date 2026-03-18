# GitRepoNode Low-Level Design

**Project:** Canvas-Chat
**Created:** 2026-03-16
**Status:** Implementation
**Related HLD:** [High-Level Design](../high-level-design.md)

## Context and Design Philosophy

The GitRepoNode exists to enable users to fetch and explore git repositories directly within the canvas environment. This node type addresses a common workflow in LLM-assisted development: analyzing codebases, reading documentation, and incorporating repository context into conversations.

The design philosophy centers on several key principles that guide its implementation and user experience.

First, interactive file selection distinguishes this node from simple URL fetch results. Rather than downloading an entire repository blindly, users can browse the file tree and select specific files they want to analyze. This approach respects bandwidth and API limits while giving users precise control over what content enters their conversation context.

Second, the node stores the complete repository state including file tree structure, selected files, and fetched content. This persistent storage enables users to revisit their selections, modify file choices through an edit workflow, and reference specific files later without re-fetching from the remote repository.

Third, private repository support through Personal Access Tokens extends functionality beyond public repositories. Users can securely store credentials for GitHub, GitLab, and Bitbucket, enabling the same interactive workflow for private codebases they host on these platforms.

Fourth, native integration with the canvas ecosystem allows git repo nodes to participate fully in the conversation graph. Users can reply to specific repository nodes, branch conversations from file selections, and use repository content as context for subsequent LLM queries.

This node type supports the broader application philosophy of treating repositories as first-class content sources that can be queried, analyzed, and integrated into conversational workflows. The HLD establishes that Canvas-Chat is fundamentally a chat application with visual representation as a secondary concern. The GitRepoNode extends this foundation by introducing repository content as a structured data source that users can explore and reference within their conversations.

## Technical Details

### Architecture Overview

The GitRepoNode implementation combines frontend and backend components that work together to provide a complete repository fetching and browsing experience. The architecture follows the plugin-based design pattern established by other features in the application, with clear separation between node rendering logic and feature workflow management.

```text
GitRepoNode Architecture:
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                │
├─────────────────────────────────────────────────────────────────┤
│  plugins/git-repo.js                                           │
│  ├── GitRepoNode (node protocol) - Rendering, file tree, drawer│
│  └── GitRepoFeature (feature plugin) - /git cmd, modal, creds  │
├─────────────────────────────────────────────────────────────────┤
│  Modal System                                                  │
│  └── File Selection Modal - Tree browser, checkboxes, fetch    │
├─────────────────────────────────────────────────────────────────┤
│  Settings Integration                                          │
│  └── Git Credentials UI - PAT management for private repos     │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Backend                                 │
├─────────────────────────────────────────────────────────────────┤
│  plugins/git_repo_handler.py                                    │
│  ├── GitRepoHandler - Clone, file tree, content extraction     │
│  └── Endpoints: /api/url-fetch/list-files, fetch-files        │
├─────────────────────────────────────────────────────────────────┤
│  Git Operations                                                │
│  └── subprocess.run(['git', 'clone', ...])                    │
└─────────────────────────────────────────────────────────────────┘
```

### Node Data Structure

Git repository nodes store their state in the graph's Yjs CRDT, maintaining both the repository metadata and the complete file tree structure. The data structure enables full reconstruction of the node's state from persisted storage.

```javascript
{
    id: string,                      // UUID
    type: 'git_repo',
    content: string,                 // Markdown content with all file contents
    gitRepoData: {
        url: string,                 // Original repository URL
        title: string,               // Repository name
        fileTree: Array,             // Complete file tree structure
        selectedFiles: string[],     // User-selected file paths
        fetchedFilePaths: string[],  // Actually fetched file paths
        files: {                      // Map of file paths to file data
            [filePath: string]: {
                content: string | null,
                lang: string | null,
                status: string,       // 'success', 'not_found', 'permission_denied', 'error'
                isBinary: boolean,
                isSvg: boolean,
                imageData: string,    // Base64 for binary images
                mimeType: string,
                error: string
            }
        }
    },
    selectedFilePath: string | null, // Currently viewed file in drawer
    position: { x: number, y: number },
    width: number,
    height: number,
    created_at: number,
    tags: string[],
    title: string | null,
    summary: string | null,
    model: string | null,
    versions: Array                  // Version history for undo
}
```

### Two-Component Architecture

Similar to the MatrixNode implementation, the GitRepoNode combines two distinct plugin concepts within a single file.

GitRepoNode operates as a Level 1 custom node type, extending the BaseNode protocol to handle rendering logic, file tree display within the node, drawer panel content for viewing individual files, and clipboard operations for copying file contents. This component manages how the node appears visually and how users interact with its content.

GitRepoFeature functions as a Level 2 feature plugin, extending FeaturePlugin to handle the /git slash command processing, file selection modal management including tree rendering and checkbox handling, repository fetching coordination with the backend, credentials management for private repositories, and edit workflow for modifying previously fetched repositories. This component manages the complex workflows that surround repository interaction.

This separation follows the established plugin architecture guidelines where node rendering logic remains with the node type while complex workflows stay with the feature plugin. The GitRepoFeature is self-contained and injects its own CSS rather than requiring modifications to the core application.

### URL Pattern Matching

The backend uses URL pattern matching to identify git repository URLs and route them to the appropriate handler. The UrlFetchRegistry in the backend contains patterns that recognize various git hosting platforms.

```python
UrlFetchRegistry.register(
    id="git-repo",
    url_patterns=[
        r"^https?://(github|gitlab|bitbucket|gitea|codeberg)\.(com|org)/[\w\-\.]+/[\w\-\.]+(?:\.git)?/?$",
        r"^git@[\w\-\.]+:[\w\-\.]+/[\w\-\.]+(?:\.git)?$",
    ],
    handler=GitRepoHandler,
    priority=PRIORITY["BUILTIN"],
)
```

This pattern recognizes HTTPS URLs for GitHub, GitLab, Bitbucket, Gitea, and Codeberg, along with SSH URLs in the git@host:user/repo format. When a user enters a repository URL in the chat input, the NoteFeature detects the URL pattern and delegates handling to the GitRepoFeature.

### Backend Git Operations

The GitRepoHandler in the backend performs several critical operations that enable the repository fetching functionality. Each operation serves a specific purpose in the overall workflow.

The clone operation uses git subprocess to create a shallow clone of the repository. The implementation uses depth=1 to minimize download size and transfer time since only the latest commit is needed for file access. When credentials are provided, they are embedded in the HTTPS URL as a token for authentication. Error handling covers timeouts, permission denied scenarios, and invalid repository URLs.

The file tree building operation recursively traverses the cloned repository to construct a hierarchical structure representing directories and files. The backend skips the .git directory to avoid unnecessary data. Each item includes the path, type (file or directory), size for files, and children arrays for directories.

The content extraction operation reads selected files from the cloned repository. Binary images are handled specially with PIL-based resizing and base64 encoding to enable inline display in the canvas. SVGs are sanitized using defusedxml to remove potentially dangerous content like script tags and event handlers before being rendered natively. Text files are read with UTF-8 encoding and errors ignored to handle encoding edge cases gracefully.

### File Selection Modal

The file selection modal provides the primary interface for browsing and selecting repository files. This modal appears after entering a repository URL and enables users to explore the file tree before committing to fetching content.

The modal displays the repository URL at the top for reference, a loading indicator during tree fetching, an error message area for failure notifications, selection controls including a Select All / Deselect All button and a running count of selected files, a warning area that appears for large selections over 20 files, the scrollable file tree with expand/collapse functionality for directories, and action buttons for Cancel and Fetch Selected Files.

The file tree renders with a classic OS-style appearance where directories show expand/collapse triangles and files display checkboxes. Directories can be expanded or collapsed by clicking the triangle, and checking a directory checkbox selects all files within it recursively. Parent directory checkboxes update to reflect the selection state of their children, showing indeterminate state when some but not all children are selected.

Smart defaults automatically select README files, configuration files like .gitignore, pyproject.toml, package.json, requirements.txt, Cargo.toml, and go.mod, and main entry points such as main.py, index.js, index.ts, and app.py. Files in src/ and lib/ directories are also included by default. This approach ensures users get meaningful content immediately without needing to manually select common files.

### Drawer Panel for File Viewing

When users click on fetched files in the node's file tree, a drawer panel slides out to display the file's content. This design allows users to browse multiple files without cluttering the canvas with multiple nodes.

The drawer content varies based on file type. For regular text files, syntax highlighting applies using highlight.js with language detection based on file extension. For binary images, the image displays inline after base64 decoding and resizing. For SVG files, the sanitized content renders natively through a blob URL. For files with errors, appropriate error messages display including not_found, permission_denied, and generic error states.

The drawer panel integrates with the node protocol system through the hasOutput() method, which returns true only when a file is selected for viewing. This prevents the drawer from appearing by default and ensures it opens only when users explicitly click on a file.

### Credentials Management

Private repository support requires secure storage and retrieval of Personal Access Tokens. The GitRepoFeature manages credentials through a dedicated settings section in the Settings modal.

The credentials system supports multiple git hosting platforms. GitHub credentials use either classic PATs with repo scope or fine-grained tokens. GitLab credentials require PATs with read_repository scope. Bitbucket credentials use app passwords with repository read permission. Additionally, a generic credential system allows users to add tokens for other git hosts by specifying the hostname and token pair.

Credentials store in localStorage under the key git-repo-plugin-credentials as a JSON object mapping hostnames to tokens. This storage is plugin-specific and separate from other application settings, allowing users to manage git credentials independently from API keys and other configuration.

The settings UI provides inline help with links to each platform's token creation pages, making it easy for users to generate appropriate credentials. When fetching from a private repository, the plugin automatically includes the relevant credential based on the repository's hostname.

### Edit Workflow

Users can modify their file selection for previously fetched repositories through an edit workflow. This enables iterative refinement where users might initially select certain files, use them in conversation, then decide to add or remove files based on their needs.

The edit workflow begins when users click the Edit button on a git repo node. The GitRepoFeature detects that the node has gitRepoData and opens the file selection modal in edit mode. The modal loads with the original repository URL, fetches the current file tree, and pre-selects files that were previously selected. Users can then modify their selections and click Fetch to update the node with new file contents.

The edit workflow updates the existing node rather than creating a new one, preserving the node's position in the canvas and its connections to other nodes. The node's versions array tracks the history of edits for potential undo functionality.

## Extension Hooks

The GitRepoNode participates in the extension hook system, though it currently emits fewer events than features like the matrix. The node primarily interacts with the broader canvas ecosystem through its node protocol and the modal system.

Future plugins could extend GitRepoNode functionality by hooking into events like before:fetch to modify file selections before fetching, after:fetch to perform additional processing on fetched content, or node:fileSelected to react when users click files in the drawer.

## Limits and Constraints

| Limit                      | Value                                      | Rationale                                                         |
| -------------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| Clone depth                | 1                                          | Shallow clone minimizes bandwidth and time for large repositories |
| Max selected files warning | 20                                         | Warns users about large selections that may slow down fetching    |
| Hard selection limit       | 50+                                        | Display warning but allow exceeding to support larger codebases   |
| Max image size             | 5MB                                        | Prevents memory issues with very large binary files               |
| Image max dimension        | 1920px                                     | Balances display quality with memory usage for images             |
| Clone timeout              | 60 seconds                                 | Prevents hanging on slow or unresponsive repositories             |
| Supported hosts            | GitHub, GitLab, Bitbucket, Gitea, Codeberg | Covers major git hosting platforms plus self-hosted Gitea         |

## Open Questions and Future Decisions

### Resolved Implementation Decisions

Several design decisions were made during implementation that are now settled.

The first decision concerned where to store file contents. The implementation stores all file contents in the node's gitRepoData.files object, enabling drawer display and offline access. An alternative approach of storing only references and fetching on demand would reduce node size but require network access for every file view.

The second decision involved clone depth. Using depth=1 provides fast clones but means historical commits are not accessible. For most use cases involving reading current code, this trade-off is acceptable.

The third decision covered image handling. Binary images are resized server-side and embedded as base64, providing reliable display at the cost of increased node size. Alternative approaches like blob URLs or external hosting were considered but would complicate the offline-first architecture.

### Deferred Considerations

Several features remain unimplemented but could enhance the node in future iterations.

Branch and commit selection would allow users to specify which branch or commit to fetch rather than always using the default branch. This would require additional UI for branch selection and potentially deeper git clones.

Repository search within fetched repos would enable users to search across all files in a repository using semantic or keyword search. This could surface relevant code without requiring users to manually browse the entire tree.

Partial directory fetching would allow users to fetch only specific subdirectories rather than cloning the entire repository. This optimization could significantly reduce bandwidth for large monorepos.

Git history integration would display commit history, blame information, or diffs between commits. This would appeal to users interested in understanding code evolution rather than just current state.

Large file handling improvements could add pagination or streaming for very large files, better error messages for binary files, or selective display of large files in chunks.

Multi-repository nodes could link multiple repositories in a single node for comparing or cross-referencing code across projects.

## References

### High-Level Design

The main architectural document covering canvas-chat's design principles, plugin system, and node type categorization is available at /docs/high-level-design.md.

### User Guides

End-user documentation for the git repository feature is located at /docs/how-to/git-repo-fetch.md, providing instructions on entering repository URLs, selecting files, and managing credentials.

### Implementation Details

Frontend implementation resides in src/canvas_chat/static/js/plugins/git-repo.js, containing both the GitRepoNode protocol and GitRepoFeature plugin classes. The node protocol handles rendering and drawer display while the feature manages commands, modals, and credentials.

Backend implementation is in src/canvas_chat/plugins/git_repo_handler.py, implementing the GitRepoHandler class that performs repository cloning, file tree construction, and content extraction.

Styling is in src/canvas_chat/static/css/git-repo.css, providing the visual appearance for file trees, modals, and the drawer panel.

The node type is defined in src/canvas_chat/static/js/graph-types.js with the NodeType.GIT_REPO constant and corresponding default dimensions.

### Testing

The implementation is tested through the overall application. Unit tests for file tree rendering and selection logic could be added to tests/test_git_repo.js in the future.

### Related Features

The git repository feature interacts with several other components in the application. The NoteFeature provides URL detection and delegates to GitRepoFeature for git URLs. The modal system handles the file selection dialog. The Settings modal integrates the credentials management UI. The node protocol system provides the rendering infrastructure.
