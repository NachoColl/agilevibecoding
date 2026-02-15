#!/bin/bash

# Development startup script for AVC Kanban Board
# Starts both backend and frontend servers

echo "🚀 Starting AVC Kanban Board Development Servers..."
echo ""

# Check if .avc/project exists
if [ ! -d "../.avc/project" ]; then
  echo "⚠️  Warning: .avc/project directory not found"
  echo "   The backend will start but no work items will be available"
  echo ""
fi

# Start backend server in background
echo "📦 Starting backend server (port 4174)..."
cd server
node start.js .. 4174 &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"

# Wait for backend to be ready
sleep 2

# Start frontend dev server in background
echo ""
echo "🎨 Starting frontend dev server (port 5173)..."
cd ../client
npm run dev &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"

echo ""
echo "✅ Both servers started!"
echo ""
echo "📊 Backend API:  http://localhost:4174/api/health"
echo "🌐 Frontend UI:  http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Trap Ctrl+C and cleanup
trap "echo ''; echo '🛑 Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID; exit" INT

# Wait for both processes
wait
