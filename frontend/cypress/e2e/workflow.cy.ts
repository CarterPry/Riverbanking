describe('Full Workflow E2E Tests', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('submits form and processes workflow without restraints', () => {
    // Mock API responses
    cy.mockWorkflowResponse(false, false);
    
    // Fill and submit form
    cy.submitWorkflowForm('Test basic security scan');
    
    // Wait for API call
    cy.wait('@workflowRequest');
    
    // Verify redirect to results page
    cy.url().should('include', '/results');
    
    // Check dashboard is showing
    cy.get('[data-testid="dashboard"]').should('be.visible');
    cy.contains('Test Progress').should('be.visible');
    cy.contains('Attacks Tested').should('be.visible');
  });

  it('handles authentication requirement restraint', () => {
    // Mock API to require auth
    cy.mockWorkflowResponse(true, false);
    
    // Submit form with auth-required description
    cy.submitWorkflowForm('test SQL injection post-login');
    
    // Wait for API call
    cy.wait('@workflowRequest');
    
    // Should show auth dialog
    cy.on('window:confirm', (message) => {
      expect(message).to.include('requires authentication');
      return true; // Click OK
    });
    
    // Should prompt for credentials
    cy.on('window:prompt', (message) => {
      if (message.includes('Username')) return 'testuser';
      if (message.includes('Password')) return 'testpass';
      return null;
    });
    
    // Should retry with auth
    cy.intercept('POST', '**/api/run-soc2-workflow', (req) => {
      expect(req.body.auth).to.deep.equal({
        username: 'testuser',
        password: 'testpass'
      });
      req.reply({
        statusCode: 202,
        body: {
          workflowId: 'test-workflow-456',
          status: 'accepted',
          message: 'Workflow started with auth'
        }
      });
    }).as('authWorkflow');
    
    cy.wait('@authWorkflow');
  });

  it('handles HITL approval requirement', () => {
    // Mock API to require HITL
    cy.mockWorkflowResponse(false, true);
    
    // Submit form
    cy.submitWorkflowForm('test critical vulnerability scan');
    
    // Wait for API call
    cy.wait('@workflowRequest');
    
    // Should show HITL dialog
    cy.on('window:confirm', (message) => {
      expect(message).to.include('Human approval required');
      expect(message).to.include('Critical attacks require approval');
      return true; // Approve
    });
    
    // Mock approval endpoint
    cy.intercept('POST', '**/api/workflows/*/approve', {
      statusCode: 200,
      body: {
        workflowId: 'test-workflow-123',
        status: 'approved',
        message: 'Workflow approved and resumed'
      }
    }).as('approveWorkflow');
    
    cy.wait('@approveWorkflow');
  });

  it('shows real-time updates via WebSocket', () => {
    cy.mockWorkflowResponse(false, false);
    
    // Mock WebSocket messages
    cy.window().then((win) => {
      // Override WebSocket constructor
      const originalWS = win.WebSocket;
      cy.stub(win, 'WebSocket').callsFake((url) => {
        const ws = new originalWS(url);
        
        // Send mock messages after connection
        setTimeout(() => {
          if (ws.readyState === 1) {
            ws.dispatchEvent(new MessageEvent('message', {
              data: JSON.stringify({
                type: 'progress',
                data: {
                  phase: 'classification',
                  progress: 'Classifying intents...',
                  attacks: 5
                }
              })
            }));
            
            setTimeout(() => {
              ws.dispatchEvent(new MessageEvent('message', {
                data: JSON.stringify({
                  type: 'progress',
                  data: {
                    phase: 'enrichment',
                    progress: 'Enriching with RAG context...',
                    cc: ['CC6.1', 'CC6.2', 'CC6.7']
                  }
                })
              }));
            }, 1000);
          }
        }, 500);
        
        return ws;
      });
    });
    
    // Submit form
    cy.submitWorkflowForm('test security assessment');
    cy.wait('@workflowRequest');
    
    // Check for WebSocket updates
    cy.contains('Classifying intents...', { timeout: 5000 }).should('be.visible');
    cy.contains('5').should('be.visible'); // Attack count
    
    cy.contains('Enriching with RAG context...', { timeout: 5000 }).should('be.visible');
    
    // Check CC tags are displayed
    cy.contains('CC6.1').should('be.visible');
    cy.contains('CC6.2').should('be.visible');
    cy.contains('CC6.7').should('be.visible');
  });

  it('displays CC-tagged report after completion', () => {
    cy.mockWorkflowResponse(false, false);
    
    // Mock final results
    cy.intercept('GET', '**/api/workflows/*/results', {
      statusCode: 200,
      body: {
        id: 'result-123',
        workflowId: 'test-workflow-123',
        status: 'complete',
        score: 85,
        findings: [
          {
            title: 'SQL Injection Vulnerability',
            severity: 'high',
            control: 'CC6.1'
          },
          {
            title: 'Missing Rate Limiting',
            severity: 'medium',
            control: 'CC6.7'
          }
        ],
        controls: ['CC6.1', 'CC6.2', 'CC6.7', 'CC7.1'],
        summary: {
          totalTests: 15,
          passed: 13,
          failed: 2,
          coverage: {
            'Security': 90,
            'Availability': 75
          }
        }
      }
    }).as('getResults');
    
    // Submit and wait
    cy.submitWorkflowForm('test compliance scan');
    cy.wait('@workflowRequest');
    
    // Simulate completion
    cy.window().then((win) => {
      const event = new MessageEvent('message', {
        data: JSON.stringify({
          type: 'result',
          data: { status: 'complete' }
        })
      });
      win.dispatchEvent(event);
    });
    
    // Check report button appears
    cy.contains('View Report', { timeout: 5000 }).click();
    
    // Verify CC-tagged findings
    cy.wait('@getResults');
    cy.contains('SQL Injection Vulnerability').should('be.visible');
    cy.contains('CC6.1').should('be.visible');
    cy.contains('Missing Rate Limiting').should('be.visible');
    cy.contains('CC6.7').should('be.visible');
    
    // Verify CC appears in results (additional assertion)
    cy.get('#results').should('contain', 'CC6.1');
    cy.get('#results').should('contain', 'CC6.7');
    
    // Verify compliance score
    cy.contains('85%').should('be.visible');
  });

  it('handles workflow cancellation on HITL denial', () => {
    cy.mockWorkflowResponse(false, true);
    
    cy.submitWorkflowForm('test destructive scan');
    cy.wait('@workflowRequest');
    
    // Deny HITL approval
    cy.on('window:confirm', () => false);
    
    // Should show cancelled status
    cy.contains('Workflow rejected by user').should('be.visible');
  });
}); 