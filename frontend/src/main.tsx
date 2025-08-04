import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Add error boundary and console log for debugging
console.log('Main.tsx is loading...');

const root = document.getElementById('root');
if (!root) {
  console.error('Root element not found!');
} else {
  console.log('Root element found, rendering app...');
  try {
    ReactDOM.createRoot(root).render(
      <App />
    );
    console.log('App rendered successfully!');
  } catch (error) {
    console.error('Error rendering app:', error);
    root.innerHTML = '<h1>Error loading app. Check console for details.</h1>';
  }
} 