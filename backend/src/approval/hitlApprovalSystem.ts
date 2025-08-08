import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger.js';
import axios from 'axios';

const logger = createLogger('HITLApprovalSystem');

export interface ApprovalRequest {
  id: string;
  workflowId: string;
  type: 'test-execution' | 'phase-transition' | 'restraint-override' | 'data-access' | 'exploitation';
  requester: {
    component: string;
    timestamp: Date;
  };
  context: {
    test?: any;
    phase?: string;
    target?: string;
    findings?: any[];
    reason: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  };
  metadata: {
    ccControls?: string[];
    owaspCategories?: string[];
    estimatedImpact?: string;
    alternatives?: string[];
  };
  timeout: number;
  status: 'pending' | 'approved' | 'denied' | 'timeout' | 'escalated';
  response?: {
    approved: boolean;
    approver: string;
    timestamp: Date;
    reason?: string;
    conditions?: string[];
  };
  escalation?: {
    level: number;
    reason: string;
    escalatedTo: string;
    timestamp: Date;
  };
}

export interface ApprovalPolicy {
  id: string;
  name: string;
  description: string;
  applies: (request: ApprovalRequest) => boolean;
  autoApprove?: (request: ApprovalRequest) => boolean;
  requiresEscalation?: (request: ApprovalRequest) => boolean;
  approvers: string[];
  escalationPath: string[];
  timeout: number;
  notifications: NotificationConfig[];
}

export interface NotificationConfig {
  channel: 'slack' | 'teams' | 'email' | 'webhook';
  recipients: string[];
  template: string;
  urgency: 'low' | 'normal' | 'high';
}

export interface ApprovalStats {
  total: number;
  approved: number;
  denied: number;
  timeout: number;
  avgResponseTime: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
}

export class HITLApprovalSystem extends EventEmitter {
  private pendingApprovals: Map<string, ApprovalRequest> = new Map();
  private approvalHistory: Map<string, ApprovalRequest[]> = new Map();
  private policies: Map<string, ApprovalPolicy> = new Map();
  private approvalCallbacks: Map<string, (approved: boolean, reason?: string) => void> = new Map();
  private stats: ApprovalStats = {
    total: 0,
    approved: 0,
    denied: 0,
    timeout: 0,
    avgResponseTime: 0,
    byType: {},
    bySeverity: {}
  };

  constructor() {
    super();
    this.initializeDefaultPolicies();
    this.startTimeoutChecker();
  }

  private initializeDefaultPolicies(): void {
    // Production Environment Policy
    this.registerPolicy({
      id: 'production-safety',
      name: 'Production Environment Safety',
      description: 'Requires approval for all production tests',
      applies: (request) => request.context.target?.includes('prod') || 
                           request.context.target?.includes('production'),
      requiresEscalation: (request) => request.context.severity === 'critical',
      approvers: ['security-team', 'ops-lead'],
      escalationPath: ['security-manager', 'cto'],
      timeout: 300000, // 5 minutes
      notifications: [
        {
          channel: 'slack',
          recipients: ['#security-approvals'],
          template: 'production-approval',
          urgency: 'high'
        }
      ]
    });

    // Data Access Policy
    this.registerPolicy({
      id: 'data-protection',
      name: 'Sensitive Data Protection',
      description: 'Requires approval for tests that may expose sensitive data',
      applies: (request) => request.type === 'data-access' || 
                           request.context.test?.tool?.includes('extract') ||
                           request.context.test?.tool?.includes('dump'),
      autoApprove: (request) => request.context.test?.parameters?.limit <= 10,
      approvers: ['data-protection-officer', 'security-team'],
      escalationPath: ['legal-team', 'ciso'],
      timeout: 600000, // 10 minutes
      notifications: [
        {
          channel: 'email',
          recipients: ['dpo@company.com'],
          template: 'data-access-request',
          urgency: 'high'
        }
      ]
    });

    // Exploitation Policy
    this.registerPolicy({
      id: 'exploitation-control',
      name: 'Exploitation Control',
      description: 'Controls exploitation attempts',
      applies: (request) => request.type === 'exploitation' || 
                           request.context.phase === 'exploit',
      requiresEscalation: (request) => request.context.findings?.some(f => f.severity === 'critical'),
      approvers: ['security-lead', 'pen-test-lead'],
      escalationPath: ['security-manager', 'ciso'],
      timeout: 900000, // 15 minutes
      notifications: [
        {
          channel: 'slack',
          recipients: ['#security-critical'],
          template: 'exploitation-request',
          urgency: 'high'
        },
        {
          channel: 'teams',
          recipients: ['SecurityTeam'],
          template: 'exploitation-alert',
          urgency: 'high'
        }
      ]
    });

    // Authentication Testing Policy
    this.registerPolicy({
      id: 'auth-testing',
      name: 'Authentication Testing',
      description: 'Controls authentication bypass attempts',
      applies: (request) => request.context.test?.requiresAuth || 
                           request.context.test?.tool === 'auth-bypass',
      autoApprove: (request) => request.context.test?.parameters?.useTestCredentials === true,
      approvers: ['security-team', 'identity-team'],
      escalationPath: ['security-manager'],
      timeout: 300000, // 5 minutes
      notifications: [
        {
          channel: 'slack',
          recipients: ['#auth-security'],
          template: 'auth-test-request',
          urgency: 'normal'
        }
      ]
    });

    logger.info('Default approval policies initialized', {
      policyCount: this.policies.size
    });
  }

  async requestApproval(params: {
    workflowId: string;
    type: ApprovalRequest['type'];
    context: ApprovalRequest['context'];
    metadata?: ApprovalRequest['metadata'];
    timeout?: number;
    callback?: (approved: boolean, reason?: string) => void;
  }): Promise<string> {
    const request: ApprovalRequest = {
      id: uuidv4(),
      workflowId: params.workflowId,
      type: params.type,
      requester: {
        component: 'system',
        timestamp: new Date()
      },
      context: params.context,
      metadata: params.metadata || {},
      timeout: params.timeout || 300000,
      status: 'pending'
    };

    // Find applicable policies
    const applicablePolicies = Array.from(this.policies.values()).filter(
      policy => policy.applies(request)
    );

    if (applicablePolicies.length === 0) {
      logger.warn('No approval policy found, using default', {
        requestId: request.id,
        type: request.type
      });
      // Use a default policy
      applicablePolicies.push(this.getDefaultPolicy());
    }

    // Check for auto-approval
    for (const policy of applicablePolicies) {
      if (policy.autoApprove && policy.autoApprove(request)) {
        logger.info('Auto-approving request', {
          requestId: request.id,
          policyId: policy.id
        });
        
        request.status = 'approved';
        request.response = {
          approved: true,
          approver: 'system-auto',
          timestamp: new Date(),
          reason: 'Auto-approved by policy'
        };
        
        this.recordApproval(request);
        if (params.callback) {
          params.callback(true, 'Auto-approved');
        }
        
        return request.id;
      }
    }

    // Check if escalation is required
    const needsEscalation = applicablePolicies.some(
      policy => policy.requiresEscalation && policy.requiresEscalation(request)
    );

    if (needsEscalation) {
      request.escalation = {
        level: 1,
        reason: 'Policy requires escalation for this request type',
        escalatedTo: applicablePolicies[0].escalationPath[0],
        timestamp: new Date()
      };
    }

    // Store the request
    this.pendingApprovals.set(request.id, request);
    if (params.callback) {
      this.approvalCallbacks.set(request.id, params.callback);
    }

    // Update stats
    this.updateStats(request, 'requested');

    // Send notifications
    for (const policy of applicablePolicies) {
      await this.sendNotifications(request, policy);
    }

    logger.info('Approval requested', {
      requestId: request.id,
      workflowId: request.workflowId,
      type: request.type,
      severity: request.context.severity,
      escalated: needsEscalation
    });

    this.emit('approval:requested', {
      requestId: request.id,
      request,
      policies: applicablePolicies.map(p => p.id)
    });

    return request.id;
  }

  async processApproval(
    requestId: string,
    decision: {
      approved: boolean;
      approver: string;
      reason?: string;
      conditions?: string[];
    }
  ): Promise<void> {
    const request = this.pendingApprovals.get(requestId);
    if (!request) {
      throw new Error(`Approval request ${requestId} not found`);
    }

    if (request.status !== 'pending') {
      throw new Error(`Request ${requestId} is no longer pending (status: ${request.status})`);
    }

    // Update request
    request.status = decision.approved ? 'approved' : 'denied';
    request.response = {
      ...decision,
      timestamp: new Date()
    };

    // Calculate response time
    const responseTime = Date.now() - request.requester.timestamp.getTime();

    // Remove from pending
    this.pendingApprovals.delete(requestId);
    
    // Add to history
    this.recordApproval(request);

    // Update stats
    this.updateStats(request, 'completed', responseTime);

    // Execute callback if exists
    const callback = this.approvalCallbacks.get(requestId);
    if (callback) {
      callback(decision.approved, decision.reason);
      this.approvalCallbacks.delete(requestId);
    }

    logger.info('Approval processed', {
      requestId,
      approved: decision.approved,
      approver: decision.approver,
      responseTime
    });

    this.emit('approval:processed', {
      requestId,
      request,
      decision,
      responseTime
    });

    // Send follow-up notifications
    if (!decision.approved && request.context.severity === 'critical') {
      await this.sendEscalationNotification(request, decision);
    }
  }

  async escalateRequest(requestId: string, reason: string): Promise<void> {
    const request = this.pendingApprovals.get(requestId);
    if (!request) {
      throw new Error(`Approval request ${requestId} not found`);
    }

    const policies = Array.from(this.policies.values()).filter(
      policy => policy.applies(request)
    );

    if (policies.length === 0) return;

    const currentLevel = request.escalation?.level || 0;
    const escalationPath = policies[0].escalationPath;

    if (currentLevel >= escalationPath.length - 1) {
      logger.warn('Cannot escalate further', {
        requestId,
        currentLevel,
        maxLevel: escalationPath.length - 1
      });
      return;
    }

    request.escalation = {
      level: currentLevel + 1,
      reason,
      escalatedTo: escalationPath[currentLevel + 1],
      timestamp: new Date()
    };

    request.status = 'escalated';

    logger.info('Request escalated', {
      requestId,
      level: request.escalation.level,
      escalatedTo: request.escalation.escalatedTo
    });

    this.emit('approval:escalated', {
      requestId,
      request,
      escalation: request.escalation
    });

    // Send escalation notifications
    await this.sendEscalationNotification(request);
  }

  private async sendNotifications(
    request: ApprovalRequest,
    policy: ApprovalPolicy
  ): Promise<void> {
    for (const config of policy.notifications) {
      try {
        switch (config.channel) {
          case 'slack':
            await this.sendSlackNotification(request, config);
            break;
          case 'teams':
            await this.sendTeamsNotification(request, config);
            break;
          case 'email':
            await this.sendEmailNotification(request, config);
            break;
          case 'webhook':
            await this.sendWebhookNotification(request, config);
            break;
        }
      } catch (error) {
        logger.error('Failed to send notification', {
          channel: config.channel,
          requestId: request.id,
          error
        });
      }
    }
  }

  private async sendSlackNotification(
    request: ApprovalRequest,
    config: NotificationConfig
  ): Promise<void> {
    const slackWebhook = process.env.SLACK_WEBHOOK_URL;
    if (!slackWebhook) return;

    const urgencyEmoji = {
      low: ':information_source:',
      normal: ':warning:',
      high: ':rotating_light:'
    };

    const message = {
      text: `${urgencyEmoji[config.urgency]} Approval Required`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `Approval Request: ${request.type}`
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Request ID:*\n${request.id}`
            },
            {
              type: 'mrkdwn',
              text: `*Workflow:*\n${request.workflowId}`
            },
            {
              type: 'mrkdwn',
              text: `*Severity:*\n${request.context.severity}`
            },
            {
              type: 'mrkdwn',
              text: `*Reason:*\n${request.context.reason}`
            }
          ]
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Approve'
              },
              style: 'primary',
              action_id: `approve_${request.id}`
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Deny'
              },
              style: 'danger',
              action_id: `deny_${request.id}`
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'View Details'
              },
              action_id: `details_${request.id}`
            }
          ]
        }
      ]
    };

    await axios.post(slackWebhook, message);
  }

  private async sendTeamsNotification(
    request: ApprovalRequest,
    config: NotificationConfig
  ): Promise<void> {
    const teamsWebhook = process.env.TEAMS_WEBHOOK_URL;
    if (!teamsWebhook) return;

    const card = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      themeColor: config.urgency === 'high' ? 'FF0000' : 'FFA500',
      summary: `Approval Required: ${request.type}`,
      sections: [
        {
          activityTitle: 'Security Test Approval Required',
          activitySubtitle: `Request ID: ${request.id}`,
          facts: [
            {
              name: 'Type',
              value: request.type
            },
            {
              name: 'Severity',
              value: request.context.severity
            },
            {
              name: 'Reason',
              value: request.context.reason
            }
          ]
        }
      ],
      potentialAction: [
        {
          '@type': 'ActionCard',
          name: 'Approve',
          actions: [
            {
              '@type': 'HttpPOST',
              name: 'Approve',
              target: `${process.env.API_URL}/api/approvals/${request.id}/approve`
            }
          ]
        },
        {
          '@type': 'ActionCard',
          name: 'Deny',
          actions: [
            {
              '@type': 'HttpPOST',
              name: 'Deny',
              target: `${process.env.API_URL}/api/approvals/${request.id}/deny`
            }
          ]
        }
      ]
    };

    await axios.post(teamsWebhook, card);
  }

  private async sendEmailNotification(
    request: ApprovalRequest,
    config: NotificationConfig
  ): Promise<void> {
    // Email implementation would go here
    logger.info('Email notification would be sent', {
      recipients: config.recipients,
      requestId: request.id
    });
  }

  private async sendWebhookNotification(
    request: ApprovalRequest,
    config: NotificationConfig
  ): Promise<void> {
    const webhookUrl = config.recipients[0]; // URL in recipients
    if (!webhookUrl) return;

    await axios.post(webhookUrl, {
      type: 'approval_request',
      request,
      urgency: config.urgency,
      timestamp: new Date()
    });
  }

  private async sendEscalationNotification(
    request: ApprovalRequest,
    decision?: any
  ): Promise<void> {
    const message = decision
      ? `Approval denied for critical request ${request.id} by ${decision.approver}. Escalation may be required.`
      : `Request ${request.id} has been escalated to level ${request.escalation?.level}`;

    // Send to escalation path
    logger.info('Sending escalation notification', {
      requestId: request.id,
      message
    });

    // Implementation would send to appropriate channels
  }

  private recordApproval(request: ApprovalRequest): void {
    const history = this.approvalHistory.get(request.workflowId) || [];
    history.push(request);
    this.approvalHistory.set(request.workflowId, history);
  }

  private updateStats(request: ApprovalRequest, event: string, responseTime?: number): void {
    if (event === 'requested') {
      this.stats.total++;
      this.stats.byType[request.type] = (this.stats.byType[request.type] || 0) + 1;
      this.stats.bySeverity[request.context.severity] = 
        (this.stats.bySeverity[request.context.severity] || 0) + 1;
    } else if (event === 'completed' && responseTime) {
      if (request.status === 'approved') {
        this.stats.approved++;
      } else if (request.status === 'denied') {
        this.stats.denied++;
      }
      
      // Update average response time
      const totalResponseTime = this.stats.avgResponseTime * (this.stats.approved + this.stats.denied - 1);
      this.stats.avgResponseTime = (totalResponseTime + responseTime) / (this.stats.approved + this.stats.denied);
    }
  }

  private startTimeoutChecker(): void {
    setInterval(() => {
      const now = Date.now();
      
      for (const [requestId, request] of this.pendingApprovals) {
        const elapsed = now - request.requester.timestamp.getTime();
        
        if (elapsed > request.timeout) {
          logger.warn('Approval request timed out', {
            requestId,
            elapsed,
            timeout: request.timeout
          });
          
          request.status = 'timeout';
          this.pendingApprovals.delete(requestId);
          this.recordApproval(request);
          this.stats.timeout++;
          
          const callback = this.approvalCallbacks.get(requestId);
          if (callback) {
            callback(false, 'Request timed out');
            this.approvalCallbacks.delete(requestId);
          }
          
          this.emit('approval:timeout', { requestId, request });
        }
      }
    }, 10000); // Check every 10 seconds
  }

  private getDefaultPolicy(): ApprovalPolicy {
    return {
      id: 'default',
      name: 'Default Approval Policy',
      description: 'Default policy when no specific policy applies',
      applies: () => true,
      approvers: ['security-team'],
      escalationPath: ['security-manager'],
      timeout: 600000, // 10 minutes
      notifications: [
        {
          channel: 'slack',
          recipients: ['#security-general'],
          template: 'default-approval',
          urgency: 'normal'
        }
      ]
    };
  }

  public registerPolicy(policy: ApprovalPolicy): void {
    this.policies.set(policy.id, policy);
    logger.info('Approval policy registered', {
      policyId: policy.id,
      policyName: policy.name
    });
  }

  public getStats(): ApprovalStats {
    return { ...this.stats };
  }

  public getPendingApprovals(workflowId?: string): ApprovalRequest[] {
    const pending = Array.from(this.pendingApprovals.values());
    return workflowId 
      ? pending.filter(r => r.workflowId === workflowId)
      : pending;
  }

  public getApprovalHistory(workflowId: string): ApprovalRequest[] {
    return this.approvalHistory.get(workflowId) || [];
  }
}