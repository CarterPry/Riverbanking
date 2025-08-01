/// <reference types="cypress" />

// Custom commands for testing

declare global {
  namespace Cypress {
    interface Chainable {
      mockWorkflowResponse(requiresAuth?: boolean, requiresHITL?: boolean): void;
      waitForWebSocket(): void;
      submitWorkflowForm(description: string): void;
    }
  }
}

// Mock workflow API response
Cypress.Commands.add('mockWorkflowResponse', (requiresAuth = false, requiresHITL = false) => {
  cy.intercept('POST', '**/api/run-soc2-workflow', {
    statusCode: 202,
    body: {
      workflowId: 'test-workflow-123',
      status: 'accepted',
      message: 'Workflow started successfully',
      requiresAuth,
      requiresHITL,
      hitlReasons: requiresHITL ? ['Critical attacks require approval'] : []
    }
  }).as('workflowRequest');
});

// Wait for WebSocket connection
Cypress.Commands.add('waitForWebSocket', () => {
  cy.window().its('WebSocket').should('exist');
  cy.wait(1000); // Wait for connection to establish
});

// Submit workflow form
Cypress.Commands.add('submitWorkflowForm', (description: string) => {
  cy.get('input[name="target"]').type('https://example.com');
  cy.get('textarea[name="description"]').type(description);
  cy.get('select[name="template"]').select('security-comprehensive');
  cy.get('form').submit();
});

export {}; 