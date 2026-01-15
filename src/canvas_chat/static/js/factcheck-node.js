/**
 * Factcheck Node Plugin (Built-in)
 *
 * Provides factcheck nodes for claim verification with verdicts.
 * Factcheck nodes display claims in an accordion-style UI with
 * status badges, explanations, and source links.
 */
import { BaseNode, Actions } from './node-protocols.js';
import { NodeRegistry } from './node-registry.js';

class FactcheckNode extends BaseNode {
    getTypeLabel() {
        return 'Factcheck';
    }

    getTypeIcon() {
        return '🔍';
    }

    getSummaryText(canvas) {
        const claims = this.node.claims || [];
        const count = claims.length;
        if (count === 0) return 'Fact Check';
        return `Fact Check · ${count} claim${count !== 1 ? 's' : ''}`;
    }

    renderContent(canvas) {
        const claims = this.node.claims || [];
        if (claims.length === 0) {
            return canvas.renderMarkdown(this.node.content || 'No claims to verify.');
        }

        // Render accordion-style claims
        const claimsHtml = claims
            .map((claim, index) => {
                const badge = this.getVerdictBadge(claim.status);
                const statusClass = claim.status || 'checking';
                const isChecking = claim.status === 'checking';

                let detailsHtml = '';
                if (!isChecking && claim.explanation) {
                    const sourcesHtml = (claim.sources || [])
                        .map(
                            (s) =>
                                `<a href="${canvas.escapeHtml(s.url)}" target="_blank" rel="noopener">${canvas.escapeHtml(s.title || s.url)}</a>`
                        )
                        .join(', ');

                    detailsHtml = `
                    <div class="factcheck-details">
                        <p>${canvas.escapeHtml(claim.explanation)}</p>
                        ${sourcesHtml ? `<div class="factcheck-sources"><strong>Sources:</strong> ${sourcesHtml}</div>` : ''}
                    </div>
                `;
                }

                return `
                <div class="factcheck-claim ${statusClass}" data-claim-index="${index}">
                    <div class="factcheck-claim-header">
                        <span class="factcheck-badge">${badge}</span>
                        <span class="factcheck-claim-text">${canvas.escapeHtml(claim.text)}</span>
                        ${isChecking ? '<span class="factcheck-spinner">⟳</span>' : '<span class="factcheck-toggle">▼</span>'}
                    </div>
                    ${detailsHtml}
                </div>
            `;
            })
            .join('');

        return `<div class="factcheck-claims">${claimsHtml}</div>`;
    }

    getVerdictBadge(status) {
        const badges = {
            checking: '🔄',
            verified: '✅',
            partially_true: '⚠️',
            misleading: '🔶',
            false: '❌',
            unverifiable: '❓',
            error: '⚠️',
        };
        return badges[status] || '❓';
    }

    getActions() {
        return [Actions.COPY];
    }

    getContentClasses() {
        return 'factcheck-content';
    }

    /**
     * Factcheck-specific event bindings for claim accordion
     */
    getEventBindings() {
        return [
            {
                selector: '.factcheck-claim-header',
                multiple: true,
                handler: (nodeId, e, canvas) => {
                    const claimEl = e.currentTarget.closest('.factcheck-claim');
                    if (claimEl && !claimEl.classList.contains('checking')) {
                        // Toggle expanded state (multiple can be open)
                        claimEl.classList.toggle('expanded');
                    }
                },
            },
        ];
    }
}

NodeRegistry.register({
    type: 'factcheck',
    protocol: FactcheckNode,
    defaultSize: { width: 640, height: 480 },
});

export { FactcheckNode };
console.log('Factcheck node plugin loaded');
