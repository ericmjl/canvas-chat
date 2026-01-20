/**
 * Flashcard Feature Module
 *
 * Handles flashcard creation, spaced repetition review, and SRS (SM-2 algorithm).
 *
 * Dependencies:
 * - utils.js (applySM2, isFlashcardDue, getDueFlashcards)
 * - graph-types.js (NodeType, EdgeType, createNode, createEdge)
 * - chat.js (chat.sendMessage, chat.getApiKeyForModel)
 * - storage.js (storage.getFlashcardStrictness)
 */

import { NodeType, EdgeType, createNode, createEdge } from '../graph-types.js';
import { storage } from '../storage.js';
import { chat } from '../chat.js';
import { applySM2, isFlashcardDue, getDueFlashcards } from '../utils.js';
import { FeaturePlugin } from '../feature-plugin.js';

/**
 * FlashcardFeature class manages all flashcard-related functionality.
 * Extends FeaturePlugin to integrate with the plugin architecture.
 */
class FlashcardFeature extends FeaturePlugin {
    /**
     * @param {AppContext} context - Application context with injected dependencies
     */
    constructor(context) {
        super(context);

        // Review state
        this.reviewState = null;
        this.dueToastTimeout = null;
    }

    /**
     * Lifecycle hook called when the plugin is loaded.
     */
    async onLoad() {
        console.log('[FlashcardFeature] Loaded');

        // Register generation modal
        const generationModalTemplate = `
            <div id="flashcard-generation-main-modal" class="modal" style="display: none">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>Generate Flashcards</h2>
                        <button class="modal-close" id="flashcard-generation-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div id="flashcard-generation-status" class="flashcard-status-message">
                            Generating flashcards...
                        </div>
                        <div id="flashcard-candidates" class="flashcard-candidates-list">
                            <!-- Candidate cards listed here -->
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button class="secondary-btn" id="flashcard-cancel">Cancel</button>
                        <button class="primary-btn" id="flashcard-accept-selected" disabled>Accept Selected</button>
                    </div>
                </div>
            </div>
        `;
        this.modalManager.registerModal('flashcard', 'generation', generationModalTemplate);

        // Register review modal
        const reviewModalTemplate = `
            <div id="flashcard-review-main-modal" class="modal" style="display: none">
                <div class="modal-content review-modal-content">
                    <div class="modal-header">
                        <h2>Review Flashcards <span id="review-progress" class="review-progress">1/5</span></h2>
                        <button class="modal-close" id="flashcard-review-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div id="review-question" class="review-question"></div>
                        <textarea
                            id="review-answer-input"
                            class="review-answer-input"
                            placeholder="Type your answer..."
                        ></textarea>
                        <button id="review-submit" class="primary-btn review-submit-btn">Submit Answer</button>

                        <!-- Shown after submit -->
                        <div id="review-result" class="review-result" style="display: none">
                            <div class="review-correct-answer">
                                <div class="review-label">Correct Answer:</div>
                                <div id="review-correct-answer-text"></div>
                            </div>
                            <div id="review-verdict" class="review-verdict"></div>
                            <div id="review-explanation" class="review-explanation"></div>
                            <div class="review-override-buttons">
                                <button id="review-override-correct" class="override-btn correct">I knew this</button>
                                <button id="review-override-incorrect" class="override-btn incorrect">
                                    I didn't know this
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="modal-actions review-actions">
                        <button class="secondary-btn" id="review-end">End Review</button>
                        <button class="primary-btn" id="review-next" style="display: none">Next Card</button>
                    </div>
                </div>
            </div>
        `;
        this.modalManager.registerModal('flashcard', 'review', reviewModalTemplate);
    }

    /**
     * Handle creating flashcards from a content node.
     * Shows modal with generated flashcard candidates for user selection.
     * @param {string} nodeId - ID of the source node
     */
    async handleCreateFlashcards(nodeId) {
        const sourceNode = this.graph.getNode(nodeId);
        if (!sourceNode) {
            console.log('[FlashcardFeature] handleCreateFlashcards: source node not found', nodeId);
            return;
        }

        const model = this.modelPicker.value;

        // In normal mode, check for API key. In admin mode, backend handles credentials.
        const request = this.buildLLMRequest({});
        if (!request.api_key && !request.model) {
            // No model selected (neither admin mode nor user-configured)
            alert('Please select a model in the toolbar.');
            return;
        }

        // Get modal elements
        const modal = this.modalManager.getPluginModal('flashcard', 'generation');
        const statusEl = modal.querySelector('#flashcard-generation-status');
        const candidatesEl = modal.querySelector('#flashcard-candidates');
        const acceptBtn = modal.querySelector('#flashcard-accept-selected');
        const cancelBtn = modal.querySelector('#flashcard-cancel');
        const closeBtn = modal.querySelector('#flashcard-generation-close');

        // Reset modal state
        statusEl.textContent = 'Generating flashcards...';
        statusEl.style.display = 'block';
        candidatesEl.innerHTML = '';
        acceptBtn.disabled = true;

        // Show modal
        this.modalManager.showPluginModal('flashcard', 'generation');

        // Close handlers
        const closeModal = () => {
            this.modalManager.hidePluginModal('flashcard', 'generation');
        };

        // Remove previous handlers to avoid duplicates
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        const newAcceptBtn = acceptBtn.cloneNode(true);
        acceptBtn.parentNode.replaceChild(newAcceptBtn, acceptBtn);

        newCloseBtn.addEventListener('click', closeModal);
        newCancelBtn.addEventListener('click', closeModal);

        // Generate flashcards via LLM
        const nodeContent = sourceNode.content || '';
        const prompt = `Based on the following content, generate 3-5 flashcards for spaced repetition learning.
Each flashcard should test a key concept, fact, or relationship.

Return ONLY a JSON array with no additional text: [{"front": "question", "back": "concise answer"}, ...]

Content:
${nodeContent}`;

        const messages = [{ role: 'user', content: prompt }];

        try {
            let fullResponse = '';

            await new Promise((resolve, reject) => {
                chat.sendMessage(
                    messages,
                    model,
                    // onChunk
                    (chunk) => {
                        fullResponse += chunk;
                    },
                    // onDone
                    () => {
                        resolve();
                    },
                    // onError
                    (err) => {
                        reject(err);
                    }
                );
            });

            // Parse JSON response - extract JSON array from response
            let flashcards;
            try {
                // Try to find JSON array in the response (handle markdown code blocks)
                const jsonMatch = fullResponse.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    flashcards = JSON.parse(jsonMatch[0]);
                } else {
                    throw new Error('No JSON array found in response');
                }
            } catch (parseError) {
                statusEl.textContent = 'Error parsing flashcards. Please try again.';
                console.error('Failed to parse flashcard JSON:', parseError, fullResponse);
                return;
            }

            if (!Array.isArray(flashcards) || flashcards.length === 0) {
                statusEl.textContent = 'No flashcards generated. Try with different content.';
                return;
            }

            // Hide status and show candidates
            statusEl.style.display = 'none';

            // Render candidate cards with checkboxes
            flashcards.forEach((card, idx) => {
                const candidateEl = document.createElement('div');
                candidateEl.className = 'flashcard-candidate';
                candidateEl.innerHTML = `
                    <input type="checkbox" id="flashcard-check-${idx}" checked data-index="${idx}">
                    <div class="flashcard-candidate-content">
                        <div class="flashcard-candidate-question">${this.canvas.escapeHtml(card.front || '')}</div>
                        <div class="flashcard-candidate-answer">${this.canvas.escapeHtml(card.back || '')}</div>
                    </div>
                `;
                candidatesEl.appendChild(candidateEl);
            });

            // Enable accept button and update based on checkbox state
            newAcceptBtn.disabled = false;

            const updateAcceptButton = () => {
                const checkedCount = candidatesEl.querySelectorAll('input[type="checkbox"]:checked').length;
                newAcceptBtn.disabled = checkedCount === 0;
                newAcceptBtn.textContent = checkedCount > 0 ? `Accept Selected (${checkedCount})` : 'Accept Selected';
            };

            candidatesEl.addEventListener('change', updateAcceptButton);
            updateAcceptButton();

            // Accept handler
            newAcceptBtn.addEventListener('click', () => {
                const selectedCards = [];
                candidatesEl.querySelectorAll('input[type="checkbox"]:checked').forEach((checkbox) => {
                    const idx = parseInt(checkbox.dataset.index, 10);
                    if (flashcards[idx]) {
                        selectedCards.push(flashcards[idx]);
                    }
                });

                if (selectedCards.length > 0) {
                    this.acceptFlashcards(selectedCards, nodeId);
                }

                closeModal();
            });
        } catch (err) {
            statusEl.textContent = `Error: ${err.message}`;
            console.error('Flashcard generation error:', err);
        }
    }

    /**
     * Create flashcard nodes from selected candidates.
     * @param {Array} cards - Array of {front, back} objects
     * @param {string} sourceNodeId - ID of the source node
     */
    acceptFlashcards(cards, sourceNodeId) {
        const sourceNode = this.graph.getNode(sourceNodeId);
        if (!sourceNode || cards.length === 0) {
            console.log('[FlashcardFeature] acceptFlashcards: no source node or no cards', {
                sourceNodeId,
                cardCount: cards?.length,
            });
            return;
        }

        // Position flashcards below source node in a row
        const startX = sourceNode.position.x;
        const startY = sourceNode.position.y + (sourceNode.height || 200) + 60;
        const cardWidth = 400;
        const cardGap = 30;

        const createdNodes = [];

        cards.forEach((card, idx) => {
            // Create flashcard node with SRS metadata
            const flashcardNode = createNode(NodeType.FLASHCARD, card.front, {
                position: {
                    x: startX + idx * (cardWidth + cardGap),
                    y: startY,
                },
                back: card.back,
                srs: {
                    easeFactor: 2.5, // SM-2 default
                    interval: 0, // Days until next review
                    repetitions: 0, // Number of successful reviews
                    nextReviewDate: null, // Will be set on first review
                },
            });

            this.graph.addNode(flashcardNode);

            // Create edge from source to flashcard
            const edge = createEdge(sourceNodeId, flashcardNode.id, EdgeType.GENERATES);
            this.graph.addEdge(edge);

            createdNodes.push(flashcardNode);
        });

        // Update collapse button for source node (now has flashcard children)
        this.updateCollapseButtonForNode(sourceNodeId);

        // Pan to first created flashcard
        if (createdNodes.length > 0) {
            this.canvas.centerOnAnimated(createdNodes[0].position.x + 200, createdNodes[0].position.y + 100, 300);
        }

        this.saveSession();
        this.updateEmptyState();
    }

    /**
     * Show the flashcard review modal with due cards.
     * @param {string[]} dueCardIds - Array of flashcard node IDs to review
     */
    showReviewModal(dueCardIds) {
        if (!dueCardIds || dueCardIds.length === 0) {
            this.showToast('No cards due for review', 'info');
            return;
        }

        // Store review state
        this.reviewState = {
            cardIds: dueCardIds,
            currentIndex: 0,
            currentQuality: null, // Will be set by grading
            hasSubmitted: false,
        };

        // Set up event listeners (clone to remove previous)
        // IMPORTANT: This must be called BEFORE getting element references
        // because it replaces elements with clones
        this.setupReviewModalListeners();

        // Get modal elements AFTER setupReviewModalListeners has cloned them
        const modal = this.modalManager.getPluginModal('flashcard', 'review');
        const progressEl = modal.querySelector('#review-progress');
        const answerInput = modal.querySelector('#review-answer-input');
        const submitBtn = modal.querySelector('#review-submit');
        const resultEl = modal.querySelector('#review-result');
        const nextBtn = modal.querySelector('#review-next');

        // Show first card
        this.displayReviewCard(0);

        // Reset state
        answerInput.value = '';
        answerInput.style.display = 'block';
        submitBtn.style.display = 'block';
        submitBtn.textContent = 'Submit Answer';
        submitBtn.disabled = false;
        resultEl.style.display = 'none';
        nextBtn.style.display = 'none';

        // Update progress
        progressEl.textContent = `1/${dueCardIds.length}`;

        // Show modal
        this.modalManager.showPluginModal('flashcard', 'review');
        answerInput.focus();
    }

    /**
     * Set up event listeners for review modal.
     */
    setupReviewModalListeners() {
        const modal = this.modalManager.getPluginModal('flashcard', 'review');
        const closeBtn = modal.querySelector('#flashcard-review-close');
        const submitBtn = modal.querySelector('#review-submit');
        const nextBtn = modal.querySelector('#review-next');
        const endBtn = modal.querySelector('#review-end');
        const overrideCorrectBtn = modal.querySelector('#review-override-correct');
        const overrideIncorrectBtn = modal.querySelector('#review-override-incorrect');

        // Clone buttons to remove previous listeners
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        const newSubmitBtn = submitBtn.cloneNode(true);
        submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
        const newNextBtn = nextBtn.cloneNode(true);
        nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
        const newEndBtn = endBtn.cloneNode(true);
        endBtn.parentNode.replaceChild(newEndBtn, endBtn);
        const newOverrideCorrect = overrideCorrectBtn.cloneNode(true);
        overrideCorrectBtn.parentNode.replaceChild(newOverrideCorrect, overrideCorrectBtn);
        const newOverrideIncorrect = overrideIncorrectBtn.cloneNode(true);
        overrideIncorrectBtn.parentNode.replaceChild(newOverrideIncorrect, overrideIncorrectBtn);

        // Add listeners
        newCloseBtn.addEventListener('click', () => this.closeReviewModal());
        newEndBtn.addEventListener('click', () => this.closeReviewModal());
        newSubmitBtn.addEventListener('click', () => this.handleReviewSubmit());
        newNextBtn.addEventListener('click', () => this.handleReviewNext());
        newOverrideCorrect.addEventListener('click', () => this.handleReviewOverride(true));
        newOverrideIncorrect.addEventListener('click', () => this.handleReviewOverride(false));

        // Enter key submits
        const answerInput = modal.querySelector('#review-answer-input');
        const newAnswerInput = answerInput.cloneNode(true);
        answerInput.parentNode.replaceChild(newAnswerInput, answerInput);
        newAnswerInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!this.reviewState.hasSubmitted) {
                    this.handleReviewSubmit();
                }
            }
        });
    }

    /**
     * Display a specific card in the review modal.
     * @param {number} index - Index of card in reviewState.cardIds
     */
    displayReviewCard(index) {
        const cardId = this.reviewState.cardIds[index];
        const card = this.graph.getNode(cardId);

        if (!card) return;

        const modal = this.modalManager.getPluginModal('flashcard', 'review');
        const questionEl = modal.querySelector('#review-question');
        const progressEl = modal.querySelector('#review-progress');

        questionEl.textContent = card.content || 'No question';
        progressEl.textContent = `${index + 1}/${this.reviewState.cardIds.length}`;
    }

    /**
     * Close the review modal.
     */
    closeReviewModal() {
        this.modalManager.hidePluginModal('flashcard', 'review');
        this.reviewState = null;
    }

    /**
     * Handle submit button in review modal - grade the answer.
     */
    async handleReviewSubmit() {
        if (!this.reviewState || this.reviewState.hasSubmitted) return;

        const modal = this.modalManager.getPluginModal('flashcard', 'review');
        const answerInput = modal.querySelector('#review-answer-input');
        const submitBtn = modal.querySelector('#review-submit');
        const resultEl = modal.querySelector('#review-result');
        const correctAnswerText = modal.querySelector('#review-correct-answer-text');
        const verdictEl = modal.querySelector('#review-verdict');
        const explanationEl = modal.querySelector('#review-explanation');
        const nextBtn = modal.querySelector('#review-next');

        const userAnswer = answerInput.value.trim();
        if (!userAnswer) {
            this.showToast('Please enter an answer', 'warning');
            return;
        }

        const cardId = this.reviewState.cardIds[this.reviewState.currentIndex];
        const card = this.graph.getNode(cardId);
        if (!card) return;

        // Show loading state
        submitBtn.textContent = 'Grading...';
        submitBtn.disabled = true;

        try {
            // Grade the answer using LLM
            const grading = await this.gradeAnswer(card, userAnswer);

            // Update display
            correctAnswerText.textContent = card.back || 'No answer provided';

            // Set verdict based on grading
            verdictEl.className = 'review-verdict';
            if (grading.correct) {
                verdictEl.classList.add('correct');
                verdictEl.textContent = '✓ Correct';
                this.reviewState.currentQuality = 4; // Good
            } else if (grading.partial) {
                verdictEl.classList.add('partial');
                verdictEl.textContent = '⚠ Partially Correct';
                this.reviewState.currentQuality = 3; // Hard
            } else {
                verdictEl.classList.add('incorrect');
                verdictEl.textContent = '✗ Incorrect';
                this.reviewState.currentQuality = 1; // Fail
            }

            explanationEl.textContent = grading.explanation || '';

            // Show result and hide input
            this.reviewState.hasSubmitted = true;
            answerInput.style.display = 'none';
            submitBtn.style.display = 'none';
            resultEl.style.display = 'block';
            nextBtn.style.display = 'inline-block';

            // Check if this is the last card
            if (this.reviewState.currentIndex >= this.reviewState.cardIds.length - 1) {
                nextBtn.textContent = 'Finish Review';
            } else {
                nextBtn.textContent = 'Next Card';
            }
        } catch (err) {
            console.error('Grading error:', err);
            // Fallback: show result without grading
            correctAnswerText.textContent = card.back || 'No answer provided';
            verdictEl.className = 'review-verdict';
            verdictEl.textContent = 'Could not auto-grade - please self-assess';
            explanationEl.textContent = '';
            this.reviewState.currentQuality = 4; // Default to good

            this.reviewState.hasSubmitted = true;
            answerInput.style.display = 'none';
            submitBtn.style.display = 'none';
            resultEl.style.display = 'block';
            nextBtn.style.display = 'inline-block';
        }
    }

    /**
     * Grade a user's answer using LLM.
     * @param {Object} card - Flashcard node
     * @param {string} userAnswer - User's typed answer
     * @returns {Promise<{correct: boolean, partial: boolean, explanation: string}>}
     */
    async gradeAnswer(card, userAnswer) {
        const model = this.modelPicker.value;

        // Check if we have a valid model (in admin mode, backend handles credentials)
        const request = this.buildLLMRequest({});
        if (!request.model) {
            throw new Error('No model selected');
        }

        // Get strictness setting and build appropriate grading rules
        const strictness = storage.getFlashcardStrictness();
        let gradingRules;

        if (strictness === 'lenient') {
            gradingRules = `Rules (LENIENT grading - be generous):
- "correct": true if the answer captures the general gist or idea, even with different wording, synonyms, or minor inaccuracies
- "partial": true only if the answer is mostly off-topic but shows some related understanding
- Accept paraphrasing, informal language, and answers that demonstrate understanding without exact terminology
- When in doubt, mark as correct`;
        } else if (strictness === 'strict') {
            gradingRules = `Rules (STRICT grading - be demanding):
- "correct": true only if the answer closely matches the expected answer with accurate terminology and complete coverage of key points
- "partial": true if the answer shows understanding but is missing important details, uses imprecise language, or has minor errors
- Require precise terminology and complete explanations
- Penalize vague or incomplete answers`;
        } else {
            // Default: medium
            gradingRules = `Rules (MEDIUM grading - balanced):
- "correct": true if the answer captures the key concepts, even if wording differs
- "partial": true if some key elements are correct but others are missing or wrong
- Accept reasonable paraphrasing but require core concepts to be present
- Minor terminology differences are OK, but major conceptual gaps are not`;
        }

        const prompt = `You are grading a flashcard answer. Compare the user's answer to the correct answer and determine if it's correct, partially correct, or incorrect.

Question: ${card.content}
Correct Answer: ${card.back}
User's Answer: ${userAnswer}

Respond with ONLY a JSON object (no markdown code blocks):
{"correct": true/false, "partial": true/false, "explanation": "brief explanation"}

${gradingRules}
- Both "correct" and "partial" cannot be true at the same time
- Keep explanation under 50 words`;

        const messages = [{ role: 'user', content: prompt }];

        return new Promise((resolve, reject) => {
            let fullResponse = '';

            chat.sendMessage(
                messages,
                model,
                (chunk) => {
                    fullResponse += chunk;
                },
                () => {
                    try {
                        // Extract JSON from response
                        const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            const result = JSON.parse(jsonMatch[0]);
                            resolve({
                                correct: result.correct === true,
                                partial: result.partial === true && result.correct !== true,
                                explanation: result.explanation || '',
                            });
                        } else {
                            reject(new Error('No JSON in response'));
                        }
                    } catch (e) {
                        reject(e);
                    }
                },
                (err) => {
                    reject(err);
                }
            );
        });
    }

    /**
     * Handle override button - user manually marks as correct/incorrect.
     * @param {boolean} wasCorrect - True if user says they knew it
     */
    handleReviewOverride(wasCorrect) {
        if (!this.reviewState) return;

        const modal = this.modalManager.getPluginModal('flashcard', 'review');
        const verdictEl = modal.querySelector('#review-verdict');

        // Update quality based on override
        if (wasCorrect) {
            this.reviewState.currentQuality = 4; // Good
            verdictEl.className = 'review-verdict correct';
            verdictEl.textContent = '✓ Marked as known';
        } else {
            this.reviewState.currentQuality = 1; // Fail
            verdictEl.className = 'review-verdict incorrect';
            verdictEl.textContent = '✗ Marked as unknown';
        }
    }

    /**
     * Handle Next button - apply SM-2 and show next card or finish.
     */
    handleReviewNext() {
        if (!this.reviewState) return;

        // Apply SM-2 to current card
        const cardId = this.reviewState.cardIds[this.reviewState.currentIndex];
        const card = this.graph.getNode(cardId);

        if (card) {
            const quality = this.reviewState.currentQuality || 4;
            const currentSrs = card.srs || {
                interval: 0,
                easeFactor: 2.5,
                repetitions: 0,
                nextReviewDate: null,
                lastReviewDate: null,
            };

            const newSrs = applySM2(currentSrs, quality);

            // Update node
            this.graph.updateNode(cardId, { srs: newSrs });

            // Re-render the card to update status display
            // Must re-fetch the node to get the updated reference
            const updatedCard = this.graph.getNode(cardId);
            this.canvas.renderNode(updatedCard);
        }

        // Move to next card or finish
        this.reviewState.currentIndex++;

        if (this.reviewState.currentIndex >= this.reviewState.cardIds.length) {
            // Finished review - save count before closing modal (which sets reviewState to null)
            const reviewedCount = this.reviewState.cardIds.length;
            this.closeReviewModal();
            this.saveSession();
            this.showToast(`Reviewed ${reviewedCount} cards`, 'success');
        } else {
            // Show next card
            this.reviewState.hasSubmitted = false;
            this.reviewState.currentQuality = null;

            const modal = this.modalManager.getPluginModal('flashcard', 'review');
            const answerInput = modal.querySelector('#review-answer-input');
            const submitBtn = modal.querySelector('#review-submit');
            const resultEl = modal.querySelector('#review-result');
            const nextBtn = modal.querySelector('#review-next');

            // Reset input
            answerInput.value = '';
            answerInput.style.display = 'block';
            submitBtn.style.display = 'block';
            submitBtn.textContent = 'Submit Answer';
            submitBtn.disabled = false;
            resultEl.style.display = 'none';
            nextBtn.style.display = 'none';

            // Display next card
            this.displayReviewCard(this.reviewState.currentIndex);
            answerInput.focus();
        }
    }

    /**
     * Start a review session with all due flashcards.
     */
    startFlashcardReview() {
        // Find all due flashcards
        const dueCardIds = this.graph.nodes.filter((node) => isFlashcardDue(node)).map((node) => node.id);

        if (dueCardIds.length === 0) {
            this.showToast('No flashcards due for review', 'info');
            return;
        }

        this.showReviewModal(dueCardIds);
    }

    /**
     * Review a single flashcard.
     * @param {string} cardId - Flashcard node ID
     */
    reviewSingleCard(cardId) {
        const card = this.graph.getNode(cardId);
        if (!card || card.type !== NodeType.FLASHCARD) return;

        this.showReviewModal([cardId]);
    }

    /**
     * Handle flipping a flashcard to show/hide the answer.
     * Toggles a CSS class on the node to reveal the back of the card.
     * @param {string} cardId - Flashcard node ID
     */
    handleFlipCard(cardId) {
        const card = this.graph.getNode(cardId);
        if (!card || card.type !== NodeType.FLASHCARD) return;

        // Toggle the flipped state on the node element
        const nodeWrapper = this.canvas.nodeElements.get(cardId);
        if (nodeWrapper) {
            const nodeDiv = nodeWrapper.querySelector('.node');
            if (nodeDiv) {
                nodeDiv.classList.toggle('flashcard-flipped');
            }
        }
    }

    /**
     * Check for due flashcards and show toast notification if any.
     */
    checkDueFlashcardsOnLoad() {
        const dueCards = getDueFlashcards(this.graph.getAllNodes());

        if (dueCards.length > 0) {
            const cardIds = dueCards.map((c) => c.id);
            this.showDueCardsToast(dueCards.length, cardIds);
        }
    }

    /**
     * Show a toast notification for due flashcards.
     * @param {number} count - Number of due cards
     * @param {string[]} cardIds - Array of due card IDs
     */
    showDueCardsToast(count, cardIds) {
        const toast = document.getElementById('flashcard-due-toast');
        const messageEl = document.getElementById('due-toast-message');
        const reviewBtn = document.getElementById('due-toast-review');
        const laterBtn = document.getElementById('due-toast-later');

        // Set message
        const cardWord = count === 1 ? 'card' : 'cards';
        messageEl.textContent = `You have ${count} ${cardWord} due for review`;

        // Clone buttons to remove previous listeners
        const newReviewBtn = reviewBtn.cloneNode(true);
        reviewBtn.parentNode.replaceChild(newReviewBtn, reviewBtn);
        const newLaterBtn = laterBtn.cloneNode(true);
        laterBtn.parentNode.replaceChild(newLaterBtn, laterBtn);

        // Add listeners
        newReviewBtn.addEventListener('click', () => {
            this.hideDueCardsToast();
            this.showReviewModal(cardIds);
        });

        newLaterBtn.addEventListener('click', () => {
            this.hideDueCardsToast();
        });

        // Show toast
        toast.classList.remove('hiding');
        toast.style.display = 'flex';

        // Auto-dismiss after 10 seconds
        this.dueToastTimeout = setTimeout(() => {
            this.hideDueCardsToast();
        }, 10000);
    }

    /**
     * Hide the due cards toast notification.
     */
    hideDueCardsToast() {
        const toast = document.getElementById('flashcard-due-toast');

        // Clear any pending timeout
        if (this.dueToastTimeout) {
            clearTimeout(this.dueToastTimeout);
            this.dueToastTimeout = null;
        }

        // Animate out
        toast.classList.add('hiding');
        setTimeout(() => {
            toast.style.display = 'none';
            toast.classList.remove('hiding');
        }, 300);
    }

    /**
     * Get canvas event handlers for flashcard functionality.
     * @returns {Object} Event name -> handler function mapping
     */
    getCanvasEventHandlers() {
        return {
            createFlashcards: this.handleCreateFlashcards.bind(this),
            reviewCard: this.reviewSingleCard.bind(this),
            flipCard: this.handleFlipCard.bind(this),
        };
    }
}

// =============================================================================
// Exports
// =============================================================================

export { FlashcardFeature };
