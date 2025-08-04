const puppeteer = require('puppeteer');

async function testDashboard() {
  const browser = await puppeteer.launch({ 
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // Enable console logging
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err));
  
  // Test with completed workflow
  console.log('Testing with completed workflow...');
  await page.goto('http://localhost:3001/dashboard?workflowId=0c171de4-e517-4d7c-92f2-d5afe0e06dbf');
  
  // Wait and observe
  await page.waitForTimeout(10000);
  
  // Check WebSocket state
  const wsState = await page.evaluate(() => {
    return window.ws ? window.ws.readyState : 'No WebSocket found';
  });
  
  console.log('WebSocket state after 10 seconds:', wsState);
  
  // Test with new workflow
  console.log('\nTesting with new workflow...');
  await page.goto('http://localhost:3001/dashboard?workflowId=c95ede55-92c5-4da5-bf46-50d10fc7ea5b');
  
  // Wait and observe
  await page.waitForTimeout(10000);
  
  const wsState2 = await page.evaluate(() => {
    return window.ws ? window.ws.readyState : 'No WebSocket found';
  });
  
  console.log('WebSocket state after 10 seconds:', wsState2);
  
  await browser.close();
}

testDashboard().catch(console.error);