#!/usr/bin/env node

/**
 * Simplified AI Test Report Parser
 * Converts the JSON test output into a readable markdown report
 */

const fs = require('fs');

// Input/output files
const inputFile = process.argv[2] || './ai-test-outputs/ai-first-step-test-1754538954-95305.json';
const outputFile = process.argv[3] || './ai-test-report-parsed.md';

// Clean up text with unicode issues
function cleanText(text) {
  if (!text) return text;
  // Remove unicode characters and clean up
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
             .replace(/[�\u0001\u0002]/g, '')
             .replace(/\u0000{2,}/g, '')
             .trim();
}

// Format timestamp
function formatTime(timestamp) {
  if (!timestamp) return 'N/A';
  return new Date(timestamp).toLocaleString();
}

// Format duration in milliseconds to readable format
function formatDuration(ms) {
  if (!ms) return 'N/A';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

// Main parsing function
try {
  console.log(`📖 Reading: ${inputFile}`);
  const content = fs.readFileSync(inputFile, 'utf8');
  const data = JSON.parse(content);
  
  let md = '# AI Security Test Report\n\n';
  md += '## Test Overview\n\n';
  
  // Basic info
  if (data.request) {
    md += `- **Target**: ${data.request.target}\n`;
    md += `- **User Intent**: "${data.request.userIntent}"\n`;
    md += `- **Environment**: ${data.request.constraints?.environment || 'N/A'}\n\n`;
  }
  
  // Check if we have actual results
  const result = data.initialResponse?.result;
  if (!result) {
    md += '⚠️ No test results found in the report.\n';
    fs.writeFileSync(outputFile, md);
    console.log('✅ Basic report written (no results found)');
    process.exit(0);
  }
  
  // Test execution summary
  md += '## Test Execution Summary\n\n';
  md += `- **Workflow ID**: ${result.workflowId}\n`;
  md += `- **Status**: ${result.status}\n`;
  md += `- **Start Time**: ${formatTime(result.startTime)}\n`;
  md += `- **End Time**: ${formatTime(result.endTime)}\n`;
  md += `- **Total Duration**: ${formatDuration(result.duration)}\n\n`;
  
  // AI Strategy & Reasoning
  md += '## AI Strategy & Reasoning\n\n';
  if (result.phases) {
    result.phases.forEach(phase => {
      if (phase.aiReasoning) {
        md += `### ${phase.phase.charAt(0).toUpperCase() + phase.phase.slice(1)} Phase\n\n`;
        md += `> ${phase.aiReasoning}\n\n`;
      }
    });
  }
  
  // Test Phases
  md += '## Test Execution Details\n\n';
  if (result.phases) {
    result.phases.forEach((phase, idx) => {
      md += `### Phase ${idx + 1}: ${phase.phase.charAt(0).toUpperCase() + phase.phase.slice(1)}\n\n`;
      md += `- **Duration**: ${formatDuration(phase.duration)}\n`;
      md += `- **Total Findings**: ${phase.findingSummary?.total || 0}\n`;
      md += `- **Proceeded to Next Phase**: ${phase.proceedToNext ? 'Yes' : 'No'}\n\n`;
      
      // Tools used
      if (phase.results && phase.results.length > 0) {
        md += '#### Tools Executed:\n\n';
        phase.results.forEach(tool => {
          md += `**${tool.tool}**\n`;
          md += `- Status: ${tool.status}\n`;
          md += `- Target: ${tool.target}\n`;
          
          // Special handling for subdomain scanner
          if (tool.tool === 'subdomain-scanner' && tool.findings && tool.findings.length > 0) {
            md += `- Subdomains Found: ${tool.findings.length}\n`;
            const domains = tool.findings
              .map(f => cleanText(f.data?.domain || f.target))
              .filter(d => d && !d.includes('�'));
            md += '  - ' + domains.join('\n  - ') + '\n';
          }
          
          // Extract tech from tech-fingerprint raw output
          if (tool.tool === 'tech-fingerprint' && tool.rawOutput) {
            const techs = [];
            const techMatches = tool.rawOutput.match(/"tech":\[(.*?)\]/g);
            if (techMatches) {
              techMatches.forEach(match => {
                const techList = match.match(/"([^"]+)"/g);
                if (techList) {
                  techList.forEach(t => techs.push(t.replace(/"/g, '')));
                }
              });
            }
            if (techs.length > 0) {
              md += '- Technologies Detected:\n';
              md += '  - ' + [...new Set(techs)].join(', ') + '\n';
            }
          }
          
          md += '\n';
        });
      }
    });
  }
  
  // Findings Summary
  if (result.totalFindings && result.totalFindings.length > 0) {
    md += '## Findings Summary\n\n';
    md += `Total findings: ${result.totalFindings.length}\n\n`;
    
    const cleanFindings = result.totalFindings
      .filter(f => {
        const domain = cleanText(f.data?.domain || f.target);
        return domain && !domain.includes('�');
      })
      .map(f => ({
        ...f,
        cleanDomain: cleanText(f.data?.domain || f.target)
      }));
    
    md += '### Discovered Subdomains:\n\n';
    cleanFindings.forEach(finding => {
      md += `- **${finding.cleanDomain}**\n`;
    });
    md += '\n';
  }
  
  // OWASP Coverage
  if (result.owaspCoverage) {
    md += '## OWASP Coverage\n\n';
    const coveredCategories = Object.entries(result.owaspCoverage)
      .filter(([_, count]) => count > 0);
    
    if (coveredCategories.length > 0) {
      coveredCategories.forEach(([category, count]) => {
        md += `- **${category}**: ${count} tests\n`;
      });
    } else {
      md += 'No OWASP categories were tested.\n';
    }
    md += '\n';
  }
  
  // Executive Summary
  if (result.executiveSummary) {
    md += '## Executive Summary\n\n';
    const summary = result.executiveSummary
      .split('\n')
      .map(line => line.trim())
      .filter(line => line)
      .join('\n\n');
    md += summary + '\n\n';
  }
  
  // Recommendations
  if (result.recommendations && result.recommendations.length > 0) {
    md += '## Recommendations\n\n';
    result.recommendations.forEach(rec => {
      md += `- ${rec}\n`;
    });
    md += '\n';
  }
  
  // AI Decision Audit
  if (result.auditReport) {
    const audit = result.auditReport;
    md += '## AI Decision Audit\n\n';
    md += `- **Total Decisions**: ${audit.totalDecisions}\n`;
    md += `- **Average Confidence**: ${audit.averageConfidence}\n`;
    md += `- **Production Safety**: ${audit.complianceSummary?.productionSafety ? 'Yes' : 'No'}\n\n`;
    
    if (audit.timeline && audit.timeline.length > 0) {
      md += '### Decision Timeline:\n\n';
      audit.timeline.forEach(decision => {
        md += `- **${formatTime(decision.timestamp)}**: ${decision.summary}\n`;
      });
      md += '\n';
    }
  }
  
  // Write the file
  fs.writeFileSync(outputFile, md);
  console.log(`✅ Report successfully parsed!`);
  console.log(`📄 Output saved to: ${outputFile}`);
  console.log(`\nView with: cat ${outputFile}`);
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error('\nTrying to extract basic info...');
  
  // Try to at least extract some basic info
  try {
    const content = fs.readFileSync(inputFile, 'utf8');
    let basicMd = '# AI Security Test Report (Partial)\n\n';
    basicMd += '⚠️ Full parsing failed, showing available data:\n\n';
    
    // Extract what we can with regex
    const targetMatch = content.match(/"target":\s*"([^"]+)"/);
    const userIntentMatch = content.match(/"userIntent":\s*"([^"]+)"/);
    
    if (targetMatch) basicMd += `- **Target**: ${targetMatch[1]}\n`;
    if (userIntentMatch) basicMd += `- **User Intent**: "${userIntentMatch[1]}"\n`;
    
    fs.writeFileSync(outputFile, basicMd);
    console.log('📄 Basic report saved.');
  } catch (e) {
    console.error('❌ Could not create any report.');
  }
}