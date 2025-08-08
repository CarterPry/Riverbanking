#!/usr/bin/env node

/**
 * AI Test Report Parser
 * Converts the JSON test output into a readable markdown report
 */

const fs = require('fs');
const path = require('path');

// Input file (can be passed as argument or use default)
const inputFile = process.argv[2] || './ai-test-outputs/ai-first-step-test-1754538954-95305.json';
const outputFile = process.argv[3] || './ai-test-report-parsed.md';

// Clean up garbled text
function cleanText(text) {
  if (!text) return text;
  // Remove unicode null characters and other artifacts
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
             .replace(/\u0001.*?�/g, '')
             .trim();
}

// Format timestamp
function formatTime(timestamp) {
  if (!timestamp) return 'N/A';
  return new Date(timestamp).toLocaleString();
}

// Format duration
function formatDuration(ms) {
  if (!ms) return 'N/A';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

// Parse the report
function parseReport(data) {
  let md = '# AI Security Test Report\n\n';
  
  // Header info
  md += '## Test Summary\n\n';
  md += `- **Workflow ID**: ${data.initialResponse?.result?.workflowId || 'N/A'}\n`;
  md += `- **Status**: ${data.initialResponse?.result?.status || 'N/A'}\n`;
  md += `- **Start Time**: ${formatTime(data.initialResponse?.result?.startTime)}\n`;
  md += `- **End Time**: ${formatTime(data.initialResponse?.result?.endTime)}\n`;
  md += `- **Total Duration**: ${formatDuration(data.initialResponse?.result?.duration)}\n`;
  md += `- **Test Target**: ${data.request?.target || 'N/A'}\n\n`;
  
  // User Intent
  md += '## User Intent\n\n';
  md += `> "${data.request?.userIntent || 'N/A'}"\n\n`;
  
  // AI Reasoning
  const phases = data.initialResponse?.result?.phases || [];
  
  md += '## AI Strategy & Reasoning\n\n';
  phases.forEach(phase => {
    if (phase.aiReasoning) {
      md += `### ${phase.phase.charAt(0).toUpperCase() + phase.phase.slice(1)} Phase\n`;
      md += `${phase.aiReasoning}\n\n`;
    }
  });
  
  // Test Phases
  md += '## Test Execution Phases\n\n';
  
  phases.forEach((phase, index) => {
    md += `### Phase ${index + 1}: ${phase.phase.charAt(0).toUpperCase() + phase.phase.slice(1)}\n\n`;
    md += `- **Duration**: ${formatDuration(phase.duration)}\n`;
    md += `- **Tools Used**: ${phase.results.length}\n`;
    md += `- **Findings**: ${phase.findingSummary?.total || 0}\n`;
    md += `- **Proceeded to Next**: ${phase.proceedToNext ? 'Yes' : 'No'}\n\n`;
    
    // Tools and results
    if (phase.results.length > 0) {
      md += '#### Tools Executed:\n\n';
      phase.results.forEach(result => {
        md += `**${result.tool}**\n`;
        md += `- Target: ${result.target}\n`;
        md += `- Status: ${result.status}\n`;
        md += `- Duration: ${formatDuration(new Date(result.endTime) - new Date(result.startTime))}\n`;
        
        if (result.tool === 'subdomain-scanner' && result.findings.length > 0) {
          md += `- Subdomains Found: ${result.findings.length}\n`;
          md += '  - ' + result.findings.map(f => cleanText(f.data?.domain)).filter(d => d).join('\n  - ') + '\n';
        } else if (result.tool === 'tech-fingerprint' && result.rawOutput) {
          // Extract tech stack from raw output
          const techMatches = result.rawOutput.match(/"tech":\[(.*?)\]/g);
          if (techMatches) {
            md += '- Technologies Detected:\n';
            techMatches.forEach(match => {
              const techs = match.match(/"([^"]+)"/g);
              if (techs) {
                md += '  - ' + techs.map(t => t.replace(/"/g, '')).join(', ') + '\n';
              }
            });
          }
        }
        md += '\n';
      });
    }
  });
  
  // Findings Summary
  const totalFindings = data.initialResponse?.result?.totalFindings || [];
  if (totalFindings.length > 0) {
    md += '## Detailed Findings\n\n';
    md += `Total findings: ${totalFindings.length}\n\n`;
    
    // Group findings by type
    const findingsByType = {};
    totalFindings.forEach(finding => {
      const type = finding.type || 'unknown';
      if (!findingsByType[type]) {
        findingsByType[type] = [];
      }
      findingsByType[type].push(finding);
    });
    
    Object.entries(findingsByType).forEach(([type, findings]) => {
      md += `### ${type.charAt(0).toUpperCase() + type.slice(1)} (${findings.length})\n\n`;
      findings.forEach(finding => {
        const domain = cleanText(finding.data?.domain || finding.target);
        if (domain) {
          md += `- **${domain}**\n`;
          md += `  - Severity: ${finding.severity}\n`;
          md += `  - Confidence: ${finding.confidence}\n\n`;
        }
      });
    });
  }
  
  // OWASP Coverage
  const owaspCoverage = data.initialResponse?.result?.owaspCoverage;
  if (owaspCoverage) {
    md += '## OWASP Coverage\n\n';
    Object.entries(owaspCoverage).forEach(([category, count]) => {
      if (count > 0) {
        md += `- **${category}**: ${count} tests\n`;
      }
    });
    md += '\n';
  }
  
  // Executive Summary
  if (data.initialResponse?.result?.executiveSummary) {
    md += '## Executive Summary\n\n';
    md += data.initialResponse.result.executiveSummary.replace(/\n/g, '\n\n') + '\n\n';
  }
  
  // Recommendations
  const recommendations = data.initialResponse?.result?.recommendations || [];
  if (recommendations.length > 0) {
    md += '## Recommendations\n\n';
    recommendations.forEach(rec => {
      md += `- ${rec}\n`;
    });
    md += '\n';
  }
  
  // Audit Report
  const audit = data.initialResponse?.result?.auditReport;
  if (audit) {
    md += '## AI Decision Audit\n\n';
    md += `- **Total Decisions**: ${audit.totalDecisions}\n`;
    md += `- **Average Confidence**: ${audit.averageConfidence}\n`;
    md += `- **Low Confidence Decisions**: ${audit.lowConfidenceDecisions?.length || 0}\n`;
    md += `- **Critical Decisions**: ${audit.criticalDecisions?.length || 0}\n\n`;
    
    if (audit.timeline && audit.timeline.length > 0) {
      md += '### Decision Timeline\n\n';
      audit.timeline.forEach(decision => {
        md += `- **${formatTime(decision.timestamp)}**: ${decision.summary} (Confidence: ${decision.confidence})\n`;
      });
      md += '\n';
    }
  }
  
  return md;
}

// Main function
function main() {
  try {
    // Read the JSON file
    console.log(`📖 Reading: ${inputFile}`);
    const jsonData = fs.readFileSync(inputFile, 'utf8');
    const data = JSON.parse(jsonData);
    
    // Parse and generate markdown
    console.log('🔄 Parsing report...');
    const markdown = parseReport(data);
    
    // Write the markdown file
    console.log(`📝 Writing: ${outputFile}`);
    fs.writeFileSync(outputFile, markdown);
    
    console.log('✅ Report parsed successfully!');
    console.log(`\nView the report with: cat ${outputFile}`);
    
  } catch (error) {
    console.error('❌ Error parsing report:', error.message);
    process.exit(1);
  }
}

// Run the parser
main();