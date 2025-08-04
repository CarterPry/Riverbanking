const WebSocket = require('ws');

const workflowId = process.argv[2] || 'ccd0360f-85f7-4982-bd40-3a935829fe7a';
const wsUrl = `ws://localhost:3000/ws?workflowId=${workflowId}`;

console.log(`Testing WebSocket connection to: ${wsUrl}`);

const ws = new WebSocket(wsUrl);

let messageCount = 0;
const startTime = Date.now();

ws.on('open', () => {
  console.log('✅ WebSocket connected successfully');
});

ws.on('message', (data) => {
  messageCount++;
  const message = JSON.parse(data.toString());
  console.log(`📨 Message ${messageCount}:`, message.type);
  console.log('   Content:', JSON.stringify(message, null, 2).substring(0, 200) + '...');
  
  if (message.type === 'workflow-status' && message.status === 'completed') {
    console.log('✅ Received completed workflow status with results');
    console.log(`   Score: ${message.result?.overallScore || 'N/A'}`);
    console.log(`   Findings: ${message.result?.totalFindings || 'N/A'}`);
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

ws.on('close', () => {
  const duration = Date.now() - startTime;
  console.log(`🔌 WebSocket disconnected after ${duration}ms`);
  console.log(`   Total messages received: ${messageCount}`);
  
  if (duration < 1000 && messageCount === 0) {
    console.log('❌ Connection closed too quickly - likely an error');
    process.exit(1);
  } else if (messageCount > 0) {
    console.log('✅ Test completed successfully');
    process.exit(0);
  }
});

// Keep connection open for 5 seconds to test stability
setTimeout(() => {
  console.log('✅ Connection stable for 5 seconds - closing test');
  ws.close();
}, 5000);