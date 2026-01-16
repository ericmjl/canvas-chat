/**
 * Flashcard Node Plugin (Built-in)
 *
 * Provides flashcard nodes for spaced repetition learning.
 * Flashcard nodes display question/answer pairs with SRS (Spaced Repetition System)
 * status indicators showing when cards are due for review.
 */
import { BaseNode, Actions } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';

class FlashcardNode extends BaseNode {
    getTypeLabel() {
        return 'Flashcard';
    }

    getTypeIcon() {
        return '🎴';
    }

    getSummaryText(canvas) {
        // Priority: user-set title > question content truncated
        if (this.node.title) return this.node.title;
        const plainText = (this.node.content || '').replace(/[#*_`>\[\]()!]/g, '').trim();
        return canvas.truncate(plainText, 60);
    }

    renderContent(canvas) {
        const front = canvas.escapeHtml(this.node.content || 'No question');
        const back = canvas.escapeHtml(this.node.back || 'No answer');

        // Determine SRS status for display
        let statusClass = 'new';
        let statusText = 'New';
        if (this.node.srs) {
            const { nextReviewDate } = this.node.srs;
            if (nextReviewDate) {
                const now = new Date();
                const reviewDate = new Date(nextReviewDate);
                if (reviewDate <= now) {
                    statusClass = 'due';
                    statusText = 'Due';
                } else {
                    // Card has been reviewed and has a future due date
                    statusClass = 'learning';
                    const daysUntil = Math.ceil((reviewDate - now) / 86400000);
                    statusText = daysUntil === 1 ? 'Due tomorrow' : `Due in ${daysUntil} days`;
                }
            }
        }

        return `
            <div class="flashcard-container">
                <div class="flashcard-status ${statusClass}">${statusText}</div>
                <div class="flashcard-card">
                    <div class="flashcard-front">
                        <div class="flashcard-label">Question</div>
                        <div class="flashcard-text">${front}</div>
                    </div>
                    <div class="flashcard-back">
                        <div class="flashcard-label">Answer</div>
                        <div class="flashcard-text">${back}</div>
                    </div>
                </div>
            </div>
        `;
    }

    getHiddenActionIds() {
        return ['edit-content']; // Hide default edit, we add it back in additional actions for custom edit
    }

    getAdditionalActions() {
        return [Actions.FLIP_CARD, Actions.REVIEW_CARD, Actions.EDIT_CONTENT];
    }

    getKeyboardShortcuts() {
        const shortcuts = super.getKeyboardShortcuts();
        // Remove edit shortcut (cards aren't edited via keyboard)
        delete shortcuts['e'];
        // Add 'f' for flip card
        shortcuts['f'] = { action: 'flip-card', handler: 'nodeFlipCard' };
        return shortcuts;
    }

    /**
     * Override to provide two edit fields: question and answer
     */
    getEditFields() {
        return [
            {
                id: 'content',
                label: 'Question',
                value: this.node.content || '',
                placeholder: 'Edit the question...',
            },
            {
                id: 'back',
                label: 'Answer',
                value: this.node.back || '',
                placeholder: 'Edit the answer...',
            },
        ];
    }

    /**
     * Override to save both question and answer fields
     */
    handleEditSave(fields, app) {
        return {
            content: fields.content || '',
            back: fields.back || '',
        };
    }

    /**
     * Override to render flashcard preview with both question and answer
     */
    renderEditPreview(fields, canvas) {
        const front = canvas.escapeHtml(fields.content || 'No question');
        const back = canvas.escapeHtml(fields.back || 'No answer');

        return `
            <div class="flashcard-container">
                <div class="flashcard-status new">New</div>
                <div class="flashcard-card">
                    <div class="flashcard-front">
                        <div class="flashcard-label">Question</div>
                        <div class="flashcard-text">${front}</div>
                    </div>
                    <div class="flashcard-back">
                        <div class="flashcard-label">Answer</div>
                        <div class="flashcard-text">${back}</div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Override to customize modal title
     */
    getEditModalTitle() {
        return 'Edit Flashcard';
    }
}

NodeRegistry.register({
    type: 'flashcard',
    protocol: FlashcardNode,
    defaultSize: { width: 400, height: 280 },
});

export { FlashcardNode };
console.log('Flashcard node plugin loaded');
