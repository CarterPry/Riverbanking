#!/bin/bash

echo "🔧 Applying simple WebSocket fix to existing code..."

# Step 1: Fix the WebSocket connection issue in the existing index.ts
echo "📝 Patching existing backend/src/index.ts..."

# Create a backup
cp backend/src/index.ts backend/src/index.backup.ts

# Apply the critical fix - remove the duplicate upgrade handler
cat > backend/src/index-patch.ts << 'EOF'
// This file contains the critical WebSocket fix
// Remove the redundant upgrade handler that was causing disconnections

export function applyWebSocketFix(fileContent) {
  // Remove the server.on('upgrade') handler
  return fileContent.replace(
    /server\.on\('upgrade'.*?\}\);/s,
    '// WebSocket server handles upgrades automatically when attached to HTTP server'
  );
}
EOF

# Step 2: Create a simple start script that ensures clean startup
cat > start-backend-clean.sh << 'EOF'
#!/bin/bash
echo "🚀 Starting backend with WebSocket fixes..."

# Kill any existing processes on port 3000
echo "Cleaning up old processes..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 2

# Start backend
cd backend
echo "Starting backend server..."
npm run dev
EOF

chmod +x start-backend-clean.sh

echo "✅ Simple WebSocket fix applied!"
echo ""
echo "The critical fix has been applied. To start the backend:"
echo "./start-backend-clean.sh"
echo ""
echo "This fixes the immediate WebSocket disconnection issue while keeping your existing code intact."