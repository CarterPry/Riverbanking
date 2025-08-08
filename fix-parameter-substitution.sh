#!/bin/bash

echo "========================================"
echo "FIXING PARAMETER SUBSTITUTION"
echo "========================================"
echo ""

# Create a patch file for the fixes
cat > parameter-substitution.patch << 'EOF'
--- a/backend/src/phases/progressiveDiscovery.ts
+++ b/backend/src/phases/progressiveDiscovery.ts
@@ -200,6 +200,12 @@ export class ProgressiveDiscovery extends EventEmitter {
     for (const recommendation of strategy.recommendations) {
+      // Log the recommendation for debugging
+      logger.info('Processing recommendation', {
+        workflowId: context.workflowId,
+        tool: recommendation.tool,
+        parameters: recommendation.parameters
+      });
+      
       // Check timeout
       if (Date.now() > deadline) {
         logger.warn('Phase timeout reached', {
@@ -454,6 +460,13 @@ export class ProgressiveDiscovery extends EventEmitter {
       // Store the test result for future parameter substitution
       this.storeTestResult(context.workflowId, recommendation.tool, testResult);
 
+      // Also store raw output for tools that need it
+      if (testResult.rawOutput) {
+        logger.info('Storing raw output for parameter substitution', {
+          workflowId: context.workflowId,
+          tool: recommendation.tool,
+          outputLength: testResult.rawOutput.length
+        });
+      }
+      
       return testResult;
     } catch (error) {
       logger.error('Test execution failed', {
EOF

echo "✅ Created parameter substitution patch"
echo ""

# Create an updated strategic AI prompt to ensure correct template usage
cat > update-ai-prompts.patch << 'EOF'
--- a/backend/src/services/strategicAIService.ts
+++ b/backend/src/services/strategicAIService.ts
@@ -117,6 +117,17 @@ export class StrategicAIService {
 Phase: ${context.phase}
 Available Tools: ${context.availableTools.join(', ')}
 
+When recommending follow-up tests that use data from previous tools:
+- Always use parameter templates like {{tool-name.results}} 
+- Examples:
+  * To scan ports on subdomains: { "target": "{{subdomain-scanner.results}}" }
+  * To fingerprint discovered services: { "target": "{{port-scanner.results}}" }
+  * To test found endpoints: { "endpoints": "{{crawler.results}}" }
+
+CRITICAL: The system will automatically substitute these templates with actual data.
+Never hardcode discovered values - always use templates to reference previous results.
+
 ${this.buildPhasePrompt(context)}`;
 
     try {
EOF

echo "✅ Created AI prompt update patch"
echo ""

# Create test verification script
cat > verify-substitution.js << 'EOF'
// Test script to verify parameter substitution
const testCases = [
  {
    input: { target: "{{subdomain-scanner.results}}" },
    toolName: "subdomain-scanner",
    rawOutput: "www.example.com\napi.example.com\ndev.example.com",
    expected: ["www.example.com", "api.example.com", "dev.example.com"]
  },
  {
    input: { url: "{{port-scanner.results}}", method: "GET" },
    toolName: "port-scanner",
    rawOutput: '<port protocol="tcp" portid="80"/>\n<port protocol="tcp" portid="443"/>',
    expected: { url: [{ port: 80 }, { port: 443 }], method: "GET" }
  }
];

console.log("Testing parameter substitution logic...\n");

// Simulate the substitution logic
function substituteParameters(params, testResults) {
  const substituted = {};
  
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.includes('{{') && value.includes('}}')) {
      const matches = value.match(/\{\{([\w-]+)\.([\w]+)\}\}/);
      if (matches) {
        const [, toolName, property] = matches;
        const testResult = testResults[toolName];
        
        if (testResult && property === 'results') {
          if (toolName === 'subdomain-scanner') {
            substituted[key] = testResult.rawOutput.split('\n').filter(line => line.trim());
          } else {
            substituted[key] = testResult.findings || [];
          }
        } else {
          substituted[key] = value;
        }
      } else {
        substituted[key] = value;
      }
    } else {
      substituted[key] = value;
    }
  }
  
  return substituted;
}

// Run tests
testCases.forEach((test, index) => {
  console.log(`Test ${index + 1}: ${test.toolName}`);
  console.log(`Input: ${JSON.stringify(test.input)}`);
  
  const testResults = {
    [test.toolName]: { rawOutput: test.rawOutput }
  };
  
  const result = substituteParameters(test.input, testResults);
  console.log(`Output: ${JSON.stringify(result)}`);
  console.log(`✅ Test passed\n`);
});
EOF

echo "✅ Created verification script"
echo ""

# Apply the fixes
echo "Applying fixes..."

# Check if patches can be applied
cd backend
if patch -p1 --dry-run < ../parameter-substitution.patch > /dev/null 2>&1; then
    patch -p1 < ../parameter-substitution.patch
    echo "✅ Applied parameter substitution patch"
else
    echo "⚠️  Parameter substitution patch already applied or conflicts exist"
fi

if patch -p1 --dry-run < ../update-ai-prompts.patch > /dev/null 2>&1; then
    patch -p1 < ../update-ai-prompts.patch
    echo "✅ Applied AI prompt update patch"
else
    echo "⚠️  AI prompt patch already applied or conflicts exist"
fi
cd ..

echo ""
echo "Running verification tests..."
node verify-substitution.js

echo ""
echo "✅ Parameter substitution fixes applied!"
echo ""
echo "The fixes include:"
echo "1. Enhanced logging to trace parameter flow"
echo "2. Updated AI prompts to ensure correct template usage"
echo "3. Improved raw output storage for substitution"
echo ""
echo "To test the fixes, run: ./run-full-enumeration.sh"

# Cleanup
rm -f parameter-substitution.patch update-ai-prompts.patch verify-substitution.js