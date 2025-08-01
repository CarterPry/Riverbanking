// backend/src/compliance/mappings/evidence-rules.ts
export interface EvidenceRule {
  required: string[];
  optional?: string[];
  format?: string[];
  retention?: number; // days
}

export const evidenceRules: { [ccCode: string]: EvidenceRule } = {
  // CC1: Control Environment
  'CC1.1': { 
    required: ['code_of_conduct', 'ethics_training_records', 'policy_acknowledgments'],
    optional: ['ethics_hotline_logs'],
    format: ['pdf', 'docx'],
    retention: 365
  },
  'CC1.2': { 
    required: ['board_meeting_minutes', 'oversight_reports', 'independence_declarations'],
    format: ['pdf'],
    retention: 2555 // 7 years
  },
  'CC1.3': { 
    required: ['org_chart', 'role_descriptions', 'authority_matrix'],
    format: ['pdf', 'xlsx'],
    retention: 365
  },
  'CC1.4': { 
    required: ['training_records', 'competency_assessments', 'certification_tracking'],
    format: ['xlsx', 'csv'],
    retention: 1095 // 3 years
  },
  'CC1.5': { 
    required: ['performance_reviews', 'accountability_reports', 'disciplinary_actions'],
    format: ['pdf'],
    retention: 1095
  },

  // CC2: Communication and Information
  'CC2.1': { 
    required: ['information_flow_diagrams', 'data_quality_reports', 'system_logs'],
    optional: ['data_validation_rules'],
    format: ['pdf', 'json', 'log'],
    retention: 90
  },
  'CC2.2': { 
    required: ['internal_communications', 'control_notifications', 'training_materials'],
    format: ['pdf', 'email'],
    retention: 365
  },
  'CC2.3': { 
    required: ['external_communications', 'vendor_notifications', 'customer_alerts'],
    format: ['pdf', 'email'],
    retention: 365
  },

  // CC3: Risk Assessment
  'CC3.1': { 
    required: ['objective_definitions', 'risk_criteria', 'assessment_methodology'],
    format: ['pdf', 'docx'],
    retention: 365
  },
  'CC3.2': { 
    required: ['risk_register', 'risk_assessments', 'mitigation_plans'],
    optional: ['risk_heat_maps'],
    format: ['xlsx', 'pdf'],
    retention: 365
  },
  'CC3.3': { 
    required: ['fraud_risk_assessment', 'fraud_scenarios', 'anti_fraud_controls'],
    format: ['pdf', 'xlsx'],
    retention: 365
  },
  'CC3.4': { 
    required: ['change_impact_assessments', 'environment_scans', 'threat_intelligence'],
    format: ['pdf', 'json'],
    retention: 180
  },

  // CC4: Monitoring Controls
  'CC4.1': { 
    required: ['monitoring_logs', 'evaluation_reports', 'control_test_results'],
    optional: ['penetration_test_reports', 'vulnerability_scans'],
    format: ['log', 'pdf', 'json'],
    retention: 365
  },
  'CC4.2': { 
    required: ['deficiency_reports', 'remediation_plans', 'communication_logs'],
    format: ['pdf', 'email'],
    retention: 365
  },

  // CC5: Control Activities
  'CC5.1': { 
    required: ['control_matrices', 'process_flowcharts', 'control_descriptions'],
    format: ['xlsx', 'pdf'],
    retention: 365
  },
  'CC5.2': { 
    required: ['it_controls', 'access_logs', 'change_logs', 'security_configs'],
    format: ['json', 'log', 'pdf'],
    retention: 365
  },
  'CC5.3': { 
    required: ['policies', 'procedures', 'deployment_evidence'],
    format: ['pdf', 'docx'],
    retention: 365
  },

  // CC6: Logical and Physical Access
  'CC6.1': { 
    required: ['asset_inventory', 'data_classification', 'ownership_matrix'],
    optional: ['screenshots', 'access_logs'],
    format: ['xlsx', 'csv', 'json'],
    retention: 365
  },
  'CC6.2': { 
    required: ['user_registrations', 'account_requests', 'approval_records'],
    format: ['csv', 'pdf'],
    retention: 1095
  },
  'CC6.3': { 
    required: ['role_definitions', 'access_matrices', 'privilege_assignments'],
    format: ['xlsx', 'json'],
    retention: 365
  },
  'CC6.4': { 
    required: ['access_reviews', 'revocation_logs', 'termination_checklists'],
    format: ['xlsx', 'log', 'pdf'],
    retention: 1095
  },
  'CC6.5': { 
    required: ['physical_access_logs', 'badge_records', 'visitor_logs'],
    format: ['csv', 'log'],
    retention: 365
  },
  'CC6.6': { 
    required: ['firewall_configs', 'encryption_evidence', 'network_diagrams'],
    optional: ['boundary_test_results'],
    format: ['json', 'pdf', 'png'],
    retention: 365
  },

  // CC7: System Operations
  'CC7.1': { 
    required: ['change_logs', 'configuration_baselines', 'approval_records'],
    optional: ['monitoring_logs'],
    format: ['log', 'json', 'pdf'],
    retention: 365
  },
  'CC7.2': { 
    required: ['security_event_logs', 'anomaly_reports', 'alert_notifications'],
    format: ['log', 'json', 'email'],
    retention: 365
  },
  'CC7.3': { 
    required: ['incident_tickets', 'response_timelines', 'containment_evidence'],
    format: ['json', 'pdf', 'log'],
    retention: 1095
  },
  'CC7.4': { 
    required: ['incident_reports', 'resolution_logs', 'communication_records'],
    format: ['pdf', 'email', 'log'],
    retention: 1095
  },
  'CC7.5': { 
    required: ['recovery_plans', 'test_results', 'root_cause_analyses'],
    format: ['pdf', 'xlsx'],
    retention: 1095
  },

  // CC8: Change Management
  'CC8.1': { 
    required: ['change_requests', 'test_results', 'approval_documentation', 'implementation_logs'],
    optional: ['rollback_plans', 'post_implementation_reviews'],
    format: ['pdf', 'json', 'log'],
    retention: 1095
  },

  // CC9: Risk Mitigation
  'CC9.1': { 
    required: ['risk_mitigation_plans', 'monitoring_reports', 'insurance_policies'],
    optional: ['business_continuity_plans', 'disaster_recovery_tests'],
    format: ['pdf', 'xlsx'],
    retention: 365
  },
  'CC9.2': { 
    required: ['vendor_assessments', 'contracts', 'performance_reports', 'sla_monitoring'],
    optional: ['vendor_audits', 'security_questionnaires'],
    format: ['pdf', 'xlsx', 'docx'],
    retention: 1095
  }
};

// Helper function to get evidence requirements for multiple CC codes
export function getEvidenceRequirements(ccCodes: string[]): string[] {
  const allEvidence = new Set<string>();
  
  ccCodes.forEach(cc => {
    if (evidenceRules[cc]) {
      evidenceRules[cc].required.forEach(item => allEvidence.add(item));
    }
  });
  
  return Array.from(allEvidence);
}

// Helper function to check if evidence meets requirements
export function validateEvidence(ccCode: string, providedEvidence: string[]): {
  valid: boolean;
  missing: string[];
  extra: string[];
} {
  const rule = evidenceRules[ccCode];
  if (!rule) {
    return { valid: false, missing: [], extra: providedEvidence };
  }
  
  const missing = rule.required.filter(req => !providedEvidence.includes(req));
  const allAccepted = [...rule.required, ...(rule.optional || [])];
  const extra = providedEvidence.filter(ev => !allAccepted.includes(ev));
  
  return {
    valid: missing.length === 0,
    missing,
    extra
  };
}