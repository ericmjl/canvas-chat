describe('Tag System', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.wait(1000); // Wait for app to initialize
    });

    it('creates tag and assigns to single node', () => {
        // Create a note node
        cy.get('#chat-input').type('/note Test node for tagging{enter}');
        cy.get('.node').should('exist').and('be.visible');

        // Select the node so tag gets assigned to it
        cy.get('.node').first().click({ force: true });
        cy.get('.node').first().should('have.class', 'selected');

        // Open tag drawer
        cy.get('#tags-btn').click();
        cy.get('#tag-drawer').should('be.visible').and('have.class', 'open');

        // Find first empty tag slot (should have "Add tag" text)
        cy.get('.tag-slot-empty').first().parent().as('emptySlot');

        // Click empty slot to create new tag (will auto-assign to selected node)
        cy.get('@emptySlot').click();

        // Verify input field appears
        cy.get('.tag-slot-input').should('be.visible').and('have.focus');

        // Enter tag name
        cy.get('.tag-slot-input').type('Important{enter}');

        // Wait for tag slot to re-render with the tag name
        cy.wait(200); // Allow DOM to update
        cy.get('.tag-slot-name', { timeout: 5000 }).should('contain', 'Important');

        // Verify tag appears on the node
        cy.get('.node').first().within(() => {
            cy.get('.node-tag').should('be.visible');
            cy.get('.node-tag-name').should('contain', 'Important');
        });
    });

    it('assigns tag to multiple selected nodes', () => {
        // Create two note nodes
        cy.get('#chat-input').type('/note First node{enter}');
        cy.get('#chat-input').type('/note Second node{enter}');

        // Verify both nodes exist
        cy.get('.node').should('have.length', 2);

        // Select first node
        cy.get('.node').first().click({ force: true });
        cy.get('.node').first().should('have.class', 'selected');

        // Select second node with Cmd/Ctrl+Click (multi-select)
        cy.get('.node').eq(1).click({ force: true, metaKey: true });
        cy.get('.node').eq(1).should('have.class', 'selected');

        // Verify both nodes are selected
        cy.get('.node.selected').should('have.length', 2);

        // Tag drawer should auto-open when 2+ nodes selected
        cy.get('#tag-drawer').should('be.visible').and('have.class', 'open');

        // Verify tag drawer shows selection status
        cy.get('#tag-selection-status').should('contain', '2 node');

        // Find first empty tag slot and click to create tag
        cy.get('.tag-slot-empty').first().parent().click();

        // Enter tag name
        cy.get('.tag-slot-input').type('Grouped{enter}');

        // Wait for tag assignment to complete
        cy.wait(200);

        // Zoom out canvas to make all nodes visible
        cy.get('#canvas').trigger('wheel', { deltaY: 100 });

        // Verify both nodes have the tag
        cy.get('.node').each(($node) => {
            cy.wrap($node).within(() => {
                cy.get('.node-tag').should('be.visible');
                cy.get('.node-tag-name').should('contain', 'Grouped');
            });
        });

        // Verify tag slot shows both nodes have the tag (active state)
        cy.get('.tag-slot.active').should('exist');
    });

    it('highlights nodes by tag', () => {
        // Create three note nodes
        cy.get('#chat-input').type('/note Node A{enter}');
        cy.get('#chat-input').type('/note Node B{enter}');
        cy.get('#chat-input').type('/note Node C{enter}');

        // Verify all nodes exist
        cy.get('.node').should('have.length', 3);

        // Zoom out canvas to make all nodes visible
        cy.get('#canvas').trigger('wheel', { deltaY: 100 });

        // Open tag drawer
        cy.get('#tags-btn').click();
        cy.get('#tag-drawer').should('be.visible');

        // Create first tag and assign to first two nodes
        cy.get('.tag-slot-empty').first().parent().click();
        cy.get('.tag-slot-input').type('Tag1{enter}');
        cy.wait(200);

        // Select first two nodes
        cy.get('.node').first().click({ force: true });
        cy.get('.node').eq(1).click({ force: true, metaKey: true });

        // Assign tag to selected nodes
        cy.get('.tag-slot').first().click();
        cy.wait(200); // Wait for tag assignment

        // Clear selection
        cy.get('#canvas').click({ force: true });

        // Create second tag and assign to third node
        cy.get('.tag-slot-empty').first().parent().click();
        cy.get('.tag-slot-input').type('Tag2{enter}');
        cy.wait(200);

        // Select third node
        cy.get('.node').eq(2).click({ force: true });
        cy.get('.tag-slot').eq(1).click();
        cy.wait(200); // Wait for tag assignment

        // Clear selection (no nodes selected)
        cy.get('#canvas').click({ force: true });

        // Zoom out canvas for visibility checks
        cy.get('#canvas').trigger('wheel', { deltaY: 100 });

        // Click tag chip in drawer to highlight nodes with that tag
        cy.get('.tag-slot-name').first().click();

        // Verify only nodes with Tag1 are visible (not faded)
        cy.get('.node').first().should('not.have.class', 'faded');
        cy.get('.node').eq(1).should('not.have.class', 'faded');
        cy.get('.node').eq(2).should('have.class', 'faded');

        // Click tag chip again to toggle off highlighting
        cy.get('.tag-slot-name').first().click();

        // Verify all nodes are visible again
        cy.get('.node').each(($node) => {
            cy.wrap($node).should('not.have.class', 'faded');
        });
    });

    it('removes tag from node', () => {
        // Create a note node
        cy.get('#chat-input').type('/note Node with tag{enter}');

        // Select the node so tag gets assigned to it
        cy.get('.node').first().click({ force: true });
        cy.get('.node').first().should('have.class', 'selected');

        // Open tag drawer and create a tag
        cy.get('#tags-btn').click();
        cy.get('#tag-drawer').should('be.visible');

        cy.get('.tag-slot-empty').first().parent().click();
        cy.get('.tag-slot-input').type('Removable{enter}');
        cy.wait(200); // Wait for tag creation and assignment

        // Zoom out canvas to ensure node is visible
        cy.get('#canvas').trigger('wheel', { deltaY: 100 });

        // Verify tag appears on node
        cy.get('.node').first().within(() => {
            cy.get('.node-tag').should('be.visible');
            cy.get('.node-tag-name').should('contain', 'Removable');
        });

        // Click X button on tag chip to remove tag from node
        cy.get('.node').first().within(() => {
            cy.get('.node-tag-remove').click({ force: true });
        });

        // Wait for removal animation
        cy.wait(500);

        // Verify tag is removed from node
        cy.get('.node').first().within(() => {
            cy.get('.node-tag').should('not.exist');
        });

        // Verify tag still exists in tag drawer (not deleted)
        cy.get('.tag-slot-name').should('contain', 'Removable');
    });

    it('deletes tag from system', () => {
        // Create a note node
        cy.get('#chat-input').type('/note Node with tag{enter}');

        // Select the node so tag gets assigned to it
        cy.get('.node').first().click({ force: true });
        cy.get('.node').first().should('have.class', 'selected');

        // Open tag drawer and create a tag
        cy.get('#tags-btn').click();
        cy.get('#tag-drawer').should('be.visible');

        cy.get('.tag-slot-empty').first().parent().click();
        cy.get('.tag-slot-input').type('ToDelete{enter}');
        cy.wait(200); // Wait for tag creation and assignment

        // Zoom out canvas to ensure node is visible
        cy.get('#canvas').trigger('wheel', { deltaY: 100 });

        // Verify tag appears on node
        cy.get('.node').first().within(() => {
            cy.get('.node-tag').should('be.visible');
            cy.get('.node-tag-name').should('contain', 'ToDelete');
        });

        // Find the tag slot with delete button (find by tag name, then navigate to parent slot)
        cy.get('.tag-slot-name')
            .contains('ToDelete')
            .parent()
            .parent()
            .as('tagSlot');

        // Click delete button on tag slot
        cy.get('@tagSlot').find('.tag-slot-btn.delete').click({ force: true });

        // Wait for deletion and re-render
        cy.wait(500);

        // Verify tag is removed from tag drawer (slot is now empty - re-query after re-render)
        cy.get('.tag-slot-empty').should('be.visible');

        // Verify tag is removed from the node
        cy.get('.node').first().within(() => {
            cy.get('.node-tag').should('not.exist');
        });
    });
});
