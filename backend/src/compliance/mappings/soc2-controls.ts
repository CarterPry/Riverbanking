// backend/src/compliance/mappings/soc2-controls.ts
export interface CCDefinition {
  description: string;
  subsections?: {
    [key: string]: {
      description: string;
    };
  };
}

export const ccDefinitions: { [key: string]: CCDefinition } = {
  CC1: {
    description: 'Control Environment - Aligned with the COSO framework and is divided into a series of subsections (often labeled CC1.1, CC1.2, etc.), each addressing a specific area of governance, ethics, and entity-level controls',
    subsections: {
      'CC1.1': { description: 'Commitment to Integrity and Ethical Values - The organization demonstrates a commitment to organizational integrity and ethical values.' },
      'CC1.2': { description: 'Board Oversight - The board of directors (where present) demonstrates independence and oversees internal controls.' },
      'CC1.3': { description: 'Establishes Structure, Authority, and Responsibility - Management establishes structures, reporting lines, and appropriate authority and responsibility.' },
      'CC1.4': { description: 'Commitment to Competence - The organization demonstrates a commitment to attract, develop, and retain competent individuals.' },
      'CC1.5': { description: 'Enforces Accountability - The organization holds individuals accountable for their internal control responsibilities.' }
    }
  },
  CC2: {
    description: 'Communication and Information - Organization\'s ability to gather, communicate, and share information internally and externally to support effective internal controls.',
    subsections: {
      'CC2.1': { description: 'Obtaining, Generating, and Using Relevant Information - The entity obtains or generates and uses relevant, quality information to support internal control.' },
      'CC2.2': { description: 'Internal Communication of Information - The entity internally communicates information, including objectives and responsibilities for internal control, necessary to support the functioning of internal control.' },
      'CC2.3': { description: 'External Communication of Information - The entity communicates with external parties regarding matters affecting the functioning of internal control.' }
    }
  },
  CC3: {
    description: 'Risk Assessment - Evaluates the organization\'s ability to identify, analyze, and manage risk.',
    subsections: {
      'CC3.1': { description: 'Specifies Objectives - The entity specifies objectives with sufficient clarity to enable the identification and assessment of risks relating to those objectives. This ensures operations, reporting, and compliance objectives are clearly defined and guide risk evaluation.' },
      'CC3.2': { description: 'Identifies and Analyzes Risks - The entity identifies risks to achieving its objectives across the organization and analyzes these risks as a basis for determining how they should be managed. This includes assessment at different organizational levels and considering both internal and external factors.' },
      'CC3.3': { description: 'Assesses Fraud Risk - The entity considers the potential for fraud when assessing risks to the achievement of objectives. This requires an understanding of both internal and external fraud risks and includes evaluating how these risks could impact the organization and its objectives.' },
      'CC3.4': { description: 'Identifies and Assesses Changes - The entity identifies and assesses changes that could significantly impact the system of internal control. This covers changes in the operating environment, business model, leadership, external threats, and other relevant areas.' }
    }
  },
  CC4: {
    description: 'Monitoring Controls - organization continuously evaluates the effectiveness of its controls and communicates any deficiencies in a timely manner',
    subsections: {
      'CC4.1': { description: 'Evaluation of Internal Controls - Organizations select, develop, and perform ongoing and/or separate evaluations to assess whether controls are present and functioning effectively. This includes using a mix of ongoing (continuous) and point-in-time evaluations. Examples include log analysis, sampling, penetration testing, and internal audits.' },
      'CC4.2': { description: 'Communication of Internal Control Deficiencies - The organization evaluates, communicates, and addresses internal control deficiencies promptly with responsible parties, including management and those charged with governance, to initiate corrective actions. Documentation and audit trails form an important part of this communication.' }
    }
  },
  CC5: {
    description: 'Control Activities - selection, development, and deployment of control activities throughout the organization\'s operations and technology',
    subsections: {
      'CC5.1': { description: 'Selection and Development of Control Activities - Requires the organization to select and develop control activities that mitigate risks to achieving objectives, including preventive and detective controls, segregation of duties, and controls applied at various organizational levels.' },
      'CC5.2': { description: 'General Control Activities over Technology - Requires the selection and development of general control activities over technology, covering areas such as technology infrastructure, security management, and the development, acquisition, and maintenance of technology.' },
      'CC5.3': { description: 'Deployment of Control Activities through Policies and Procedures - Ensures control activities are effectively deployed by means of policies defining expectations and procedures that put those policies into operation.' }
    }
  },
  CC6: {
    description: 'Logical and Physical Access - Examines access controls over systems and data, including encryption and physical safeguards.',
    subsections: {
      'CC6.1': { description: 'Inventory of Information Assets - Identify, inventory, and manage all information assets within the organization.' },
      'CC6.2': { description: 'User Registration - Register and manage all users and their access according to their responsibilities.' },
      'CC6.3': { description: 'Role-Based Access - Restrict system access based on job roles and enforce the minimum necessary principle.' },
      'CC6.4': { description: 'User Access Reviews & Revocation - Regularly review, update, and revoke user access as necessary (e.g., personnel changes).' },
      'CC6.5': { description: 'Physical Access Controls - Implement and maintain facility barriers and access controls.' },
      'CC6.6': { description: 'Boundary Protection - Protect both digital and physical system boundaries (e.g., firewalls, encryption, DMZs).' }
    }
  },
  CC7: {
    description: 'System Operations - Checks monitoring, incident detection, and disaster recovery procedures for IT systems.',
    subsections: {
      'CC7.1': { description: 'Configuration and Change Management - Ensures all system configurations and changes are documented, authorized, and monitored to prevent and detect unauthorized alterations or suspicious deviations.' },
      'CC7.2': { description: 'Security Event and Anomaly Detection - Requires monitoring of system activity to identify and analyze anomalies that could indicate security events, including malicious acts, errors, or new vulnerabilities.' },
      'CC7.3': { description: 'Incident Detection and Response - Establishes mechanisms for prompt identification and containment of security incidents to prevent impact on confidentiality, integrity, or availability of systems and data.' },
      'CC7.4': { description: 'Incident Management and Continuity - Outlines structured processes for handling, reporting, and resolving incidents, ensuring detailed documentation and swift restoration of system operations.' },
      'CC7.5': { description: 'Recovery from Security Incidents - Defines requirements for restoring affected environments, communicating about incidents, determining root causes, improving procedures, and testing recovery plans.' }
    }
  },
  CC8: {
    description: 'Change Management - Change Management, ensuring that all changes to infrastructure, data, software, and procedures are properly managed and controlled to protect organizational objectives',
    subsections: {
      'CC8.1': { description: 'The entity authorizes, designs, develops or acquires, configures, documents, tests, approves, and implements changes to infrastructure, data, software, and procedures to meet its objectives.' }
    }
  },
  CC9: {
    description: 'Risk Mitigation - Focuses on mitigating risks via strong business and vendor management practices.',
    subsections: {
      'CC9.1': { description: 'Risk Mitigation Activities - Identify, select, and develop risk mitigation activities for disruptions and threats to business objectives. This includes having strategies for ongoing monitoring, preparedness, and response to business disruptions, consideration of insurance, and proactive resilience planning.' },
      'CC9.2': { description: 'Vendor and Business Partner Risks - Assess and manage risks from vendors and business partners. Establish requirements for onboarding and offboarding, monitor performance, define roles, ensure contractual commitments (privacy/confidentiality), and manage third-party disruptions.' }
    }
  },
  // Trust Service Categories
  Security: { 
    description: 'Protection of information and systems from unauthorized access, disclosure, and damage. This is the only sector required in every SOC 2 report.' 
  },
  Availability: { 
    description: 'Ensures systems are operational and accessible as committed or agreed upon, including measures for disaster recovery and business continuity.' 
  },
  ProcessingIntegrity: { 
    description: 'Ensures that system processing is complete, valid, accurate, timely, and authorized, ensuring the system functions as intended without errors or delays.' 
  },
  Confidentiality: { 
    description: 'Restricts access to information that is designated as confidential, protecting sensitive data from unauthorized disclosure or use.' 
  },
  Privacy: { 
    description: 'Manages personal information in accordance with the organization\'s privacy policy and relevant regulatory requirements.' 
  }
};

// Helper function to get all CC codes
export function getAllCCCodes(): string[] {
  const codes: string[] = [];
  Object.keys(ccDefinitions).forEach(key => {
    if (key.startsWith('CC')) {
      codes.push(key);
      if (ccDefinitions[key].subsections) {
        codes.push(...Object.keys(ccDefinitions[key].subsections!));
      }
    }
  });
  return codes;
}

// Helper function to get CC description by code
export function getCCDescription(code: string): string | undefined {
  // Check if it's a main CC category
  if (ccDefinitions[code]) {
    return ccDefinitions[code].description;
  }
  
  // Check if it's a subsection
  const mainCategory = code.split('.')[0];
  if (ccDefinitions[mainCategory]?.subsections?.[code]) {
    return ccDefinitions[mainCategory].subsections[code].description;
  }
  
  return undefined;
}

// Helper function to get all Trust Service Categories
export function getTrustServiceCategories(): string[] {
  return ['Security', 'Availability', 'ProcessingIntegrity', 'Confidentiality', 'Privacy'];
}

// Helper function to validate if a CC code exists
export function isValidCCCode(code: string): boolean {
  return getAllCCCodes().includes(code);
}