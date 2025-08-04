import React from 'react';

function TestApp() {
  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h1>SOC2 Testing Platform</h1>
      <p>If you can see this, React is working!</p>
      <button onClick={() => alert('Button clicked!')}>Test Button</button>
    </div>
  );
}

export default TestApp;