#!/bin/bash

# Development Helper Script for hackerton project
# Usage: ./scripts/dev-helper.sh [command]

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT=3000

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Kill all processes using the specified port
kill_port() {
    local port=${1:-$PORT}
    info "Checking for processes on port $port..."
    
    local pids=$(lsof -ti:$port 2>/dev/null || true)
    if [ -z "$pids" ]; then
        info "No processes found on port $port"
        return 0
    fi
    
    warn "Found processes on port $port: $pids"
    for pid in $pids; do
        if [ "$pid" != "$$" ]; then
            log "Killing process $pid on port $port"
            kill -9 $pid 2>/dev/null || warn "Could not kill process $pid"
        fi
    done
    
    sleep 1
    local remaining=$(lsof -ti:$port 2>/dev/null || true)
    if [ -n "$remaining" ]; then
        error "Some processes still running on port $port: $remaining"
        return 1
    else
        log "Port $port is now free"
        return 0
    fi
}

# Start development server safely
start_dev() {
    log "Starting development server..."
    kill_port $PORT
    
    cd "$PROJECT_ROOT"
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        warn "node_modules not found. Installing dependencies..."
        npm install
    fi
    
    # Run linting first
    info "Running linting..."
    npm run lint:check || {
        warn "Linting found issues. Auto-fixing..."
        npm run lint
    }
    
    log "Starting NestJS development server..."
    npm run start:dev
}

# Restart development server
restart_dev() {
    log "Restarting development server..."
    kill_port $PORT
    sleep 2
    start_dev
}

# Clean and rebuild
clean_rebuild() {
    log "Cleaning project..."
    cd "$PROJECT_ROOT"
    
    # Clean build artifacts
    rm -rf dist/
    rm -rf node_modules/.cache/
    
    # Clean TypeScript cache
    npx tsc --build --clean 2>/dev/null || true
    
    log "Rebuilding project..."
    npm run build
    
    log "Clean rebuild completed"
}

# Run tests with coverage
test_all() {
    log "Running all tests..."
    cd "$PROJECT_ROOT"
    
    npm run lint:check
    npm run test
    npm run test:e2e
    
    log "All tests completed"
}

# Health check
health_check() {
    local port=${1:-$PORT}
    info "Health checking application on port $port..."
    
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -s -f "http://localhost:$port/bedrock/health" > /dev/null 2>&1; then
            log "✅ Application is healthy on port $port"
            return 0
        fi
        
        attempt=$((attempt + 1))
        info "Attempt $attempt/$max_attempts - waiting for application..."
        sleep 1
    done
    
    error "❌ Application failed to respond after $max_attempts seconds"
    return 1
}

# Show usage
show_usage() {
    echo "Development Helper Script for hackerton project"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  start        Start development server (default)"
    echo "  restart      Restart development server"
    echo "  stop         Stop all processes on port $PORT"
    echo "  clean        Clean and rebuild project"
    echo "  test         Run all tests"
    echo "  health       Check application health"
    echo "  kill-port    Kill processes on port $PORT"
    echo "  help         Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start     # Start development server"
    echo "  $0 restart   # Restart development server"
    echo "  $0 clean     # Clean and rebuild"
    echo ""
}

# Main script logic
main() {
    local command=${1:-start}
    
    case $command in
        "start")
            start_dev
            ;;
        "restart")
            restart_dev
            ;;
        "stop"|"kill-port")
            kill_port $PORT
            ;;
        "clean")
            clean_rebuild
            ;;
        "test")
            test_all
            ;;
        "health")
            health_check $PORT
            ;;
        "help"|"-h"|"--help")
            show_usage
            ;;
        *)
            error "Unknown command: $command"
            show_usage
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"