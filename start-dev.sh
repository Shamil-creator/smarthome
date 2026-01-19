#!/bin/bash

echo "🚀 Starting SmartHome Application (Development Mode)"
echo "=================================================="

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating with default values..."
    cat > .env << 'EOF'
# Development configuration
SKIP_AUTH_VALIDATION=true
FLASK_ENV=development
FLASK_DEBUG=true
EOF
    echo "✅ .env file created"
fi

# Function to check if port is in use
check_port() {
    lsof -ti:$1 >/dev/null 2>&1
}

# Start Backend
echo ""
echo "📦 Starting Backend on http://localhost:5001..."
if check_port 5001; then
    echo "⚠️  Port 5001 is already in use. Backend might already be running."
else
    cd backend
    if [ ! -d "venv" ]; then
        echo "Creating virtual environment..."
        python3 -m venv venv
    fi
    source venv/bin/activate 2>/dev/null || . venv/bin/activate
    pip install -q -r requirements.txt
    python app.py &
    BACKEND_PID=$!
    cd ..
    echo "✅ Backend started (PID: $BACKEND_PID)"
fi

# Wait for backend to start
echo "Waiting for backend to be ready..."
sleep 3

# Start Frontend
echo ""
echo "🎨 Starting Frontend on http://localhost:5173..."
if check_port 5173; then
    echo "⚠️  Port 5173 is already in use. Frontend might already be running."
else
    if [ ! -d "node_modules" ]; then
        echo "Installing npm dependencies..."
        npm install
    fi
    npm run dev &
    FRONTEND_PID=$!
    echo "✅ Frontend started (PID: $FRONTEND_PID)"
fi

echo ""
echo "=================================================="
echo "✅ Application is running!"
echo ""
echo "📱 Frontend: http://localhost:5173"
echo "🔧 Backend API: http://localhost:5001/api"
echo "🏥 Health Check: http://localhost:5001/api/health"
echo ""
echo "Press Ctrl+C to stop all services"
echo "=================================================="

# Wait for user interrupt
wait
