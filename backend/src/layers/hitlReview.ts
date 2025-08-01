// backend/src/layers/hitlReview.ts
import { Attack } from '../compliance/mappings/attack-mapping.js';
import { getCCDescription } from '../compliance/mappings/soc2-controls.js';
import { createLogger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('HITLReview');

export interface HITLRequest {
  id: string;
  workflowId: string;
  timestamp: Date;
  reasons: string[];
  attacks: {
    critical: Attack[];
    standard: Attack[];
  };
  context: {
    authenticated: boolean;
    target: string;
    tsc: string[];
    cc: string[];
  };
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
  expiresAt: Date;
}

export interface HITLResponse {
  approved: boolean;
  modifiedAttacks?: Attack[];
  excludedAttacks?: string[];
  conditions?: string[];
  reviewNotes: string;
}

export class HITLReview {
  private pendingRequests: Map<string, HITLRequest> = new Map();
  private reviewCallbacks: Map<string, (response: HITLResponse) => void> = new Map();
  
  /**
   * Request Human-in-the-Loop approval
   */
  async requestApproval(
    workflowId: string,
    reasons: string[],
    attacks: { critical: Attack[]; standard: Attack[] },
    context: HITLRequest['context']
  ): Promise<HITLRequest> {
    const request: HITLRequest = {
      id: uuidv4(),
      workflowId,
      timestamp: new Date(),
      reasons,
      attacks,
      context,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
    };
    
    this.pendingRequests.set(request.id, request);
    
    logger.info('HITL approval requested', {
      requestId: request.id,
      workflowId,
      reasons: reasons.length,
      criticalAttacks: attacks.critical.length,
      standardAttacks: attacks.standard.length
    });
    
    // Send notification (implement based on notification service)
    await this.sendNotification(request);
    
    return request;
  }
  
  /**
   * Wait for approval with timeout
   */
  async waitForApproval(
    requestId: string,
    timeoutMs: number = 30 * 60 * 1000
  ): Promise<HITLResponse> {
    return new Promise((resolve, reject) => {
      const request = this.pendingRequests.get(requestId);
      if (!request) {
        reject(new Error('HITL request not found'));
        return;
      }
      
      // Set up timeout
      const timeout = setTimeout(() => {
        this.reviewCallbacks.delete(requestId);
        request.status = 'expired';
        reject(new Error('HITL approval timeout'));
      }, timeoutMs);
      
      // Set up callback
      this.reviewCallbacks.set(requestId, (response) => {
        clearTimeout(timeout);
        this.reviewCallbacks.delete(requestId);
        resolve(response);
      });
      
      // Check if already reviewed
      if (request.status !== 'pending') {
        clearTimeout(timeout);
        this.reviewCallbacks.delete(requestId);
        if (request.status === 'approved') {
          resolve({
            approved: true,
            reviewNotes: request.reviewNotes || ''
          });
        } else {
          resolve({
            approved: false,
            reviewNotes: request.reviewNotes || 'Request rejected or expired'
          });
        }
      }
    });
  }
  
  /**
   * Process review response
   */
  processReview(requestId: string, response: HITLResponse): void {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      logger.error('HITL request not found', { requestId });
      return;
    }
    
    request.status = response.approved ? 'approved' : 'rejected';
    request.reviewedAt = new Date();
    request.reviewNotes = response.reviewNotes;
    
    logger.info('HITL review processed', {
      requestId,
      approved: response.approved,
      hasModifications: !!response.modifiedAttacks,
      excludedCount: response.excludedAttacks?.length || 0
    });
    
    // Trigger callback if waiting
    const callback = this.reviewCallbacks.get(requestId);
    if (callback) {
      callback(response);
    }
  }
  
  /**
   * Generate review summary for notification
   */
  generateReviewSummary(request: HITLRequest): string {
    let summary = `🔍 Security Testing Approval Request\n\n`;
    summary += `Workflow ID: ${request.workflowId}\n`;
    summary += `Target: ${request.context.target}\n`;
    summary += `Authenticated: ${request.context.authenticated ? 'Yes' : 'No'}\n\n`;
    
    summary += `📋 Approval Reasons:\n`;
    request.reasons.forEach((reason, idx) => {
      summary += `${idx + 1}. ${reason}\n`;
    });
    
    summary += `\n🎯 Proposed Attacks:\n`;
    
    if (request.attacks.critical.length > 0) {
      summary += `\nCritical (${request.attacks.critical.length}):\n`;
      request.attacks.critical.forEach(attack => {
        summary += `- ${attack.name} (${attack.cc.join(', ')})\n`;
        summary += `  ${attack.description}\n`;
      });
    }
    
    if (request.attacks.standard.length > 0) {
      summary += `\nStandard (${request.attacks.standard.length}):\n`;
      request.attacks.standard.slice(0, 5).forEach(attack => {
        summary += `- ${attack.name} (${attack.cc.join(', ')})\n`;
      });
      if (request.attacks.standard.length > 5) {
        summary += `... and ${request.attacks.standard.length - 5} more\n`;
      }
    }
    
    summary += `\n📊 Compliance Coverage:\n`;
    const allCC = new Set<string>();
    [...request.attacks.critical, ...request.attacks.standard].forEach(attack => {
      attack.cc.forEach(cc => allCC.add(cc));
    });
    
    const ccBySeries = Array.from(allCC).reduce((acc, cc) => {
      const series = cc.split('.')[0];
      if (!acc[series]) acc[series] = [];
      acc[series].push(cc);
      return acc;
    }, {} as Record<string, string[]>);
    
    Object.entries(ccBySeries).forEach(([series, codes]) => {
      summary += `- ${series}: ${codes.join(', ')}\n`;
    });
    
    summary += `\n⏱️ Expires at: ${request.expiresAt.toLocaleString()}\n`;
    summary += `\nReview at: ${this.getReviewURL(request.id)}`;
    
    return summary;
  }
  
  /**
   * Send notification for approval request
   */
  private async sendNotification(request: HITLRequest): Promise<void> {
    const summary = this.generateReviewSummary(request);
    
    // Implementation depends on notification service (Slack, email, etc.)
    // For now, just log
    logger.info('HITL notification', { 
      requestId: request.id,
      summary: summary.substring(0, 200) + '...'
    });
    
    // TODO: Implement actual notification service
    // await notificationService.send({
    //   channel: 'security-approvals',
    //   message: summary,
    //   priority: request.attacks.critical.length > 0 ? 'high' : 'normal'
    // });
  }
  
  /**
   * Get review URL for the request
   */
  private getReviewURL(requestId: string): string {
    // TODO: Configure based on environment
    const baseURL = process.env.FRONTEND_URL || 'http://localhost:3001';
    return `${baseURL}/hitl/review/${requestId}`;
  }
  
  /**
   * Clean up expired requests
   */
  cleanupExpired(): void {
    const now = new Date();
    let cleaned = 0;
    
    this.pendingRequests.forEach((request, id) => {
      if (request.status === 'pending' && request.expiresAt < now) {
        request.status = 'expired';
        
        // Trigger callback if waiting
        const callback = this.reviewCallbacks.get(id);
        if (callback) {
          callback({
            approved: false,
            reviewNotes: 'Request expired'
          });
          this.reviewCallbacks.delete(id);
        }
        
        cleaned++;
      }
    });
    
    if (cleaned > 0) {
      logger.info('Cleaned up expired HITL requests', { count: cleaned });
    }
  }
  
  /**
   * Get pending requests for a workflow
   */
  getPendingRequests(workflowId?: string): HITLRequest[] {
    const pending = Array.from(this.pendingRequests.values())
      .filter(req => req.status === 'pending');
    
    if (workflowId) {
      return pending.filter(req => req.workflowId === workflowId);
    }
    
    return pending;
  }
}