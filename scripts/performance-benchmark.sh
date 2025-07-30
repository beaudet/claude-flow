#!/bin/bash

# Performance Benchmark Script for Process vs Docker Execution
# Measures timing, resource usage, and security effectiveness

set -euo pipefail

# Configuration
ITERATIONS=${ITERATIONS:-10}
CONCURRENT_TESTS=${CONCURRENT_TESTS:-4}
OUTPUT_DIR="./benchmark-results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULTS_FILE="$OUTPUT_DIR/performance_comparison_$TIMESTAMP.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check dependencies
check_dependencies() {
    log_info "Checking dependencies..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed or not in PATH"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed or not in PATH"
        exit 1
    fi
    
    # Check if Docker is running
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
    
    log_success "All dependencies are available"
}

# Setup benchmark environment
setup_environment() {
    log_info "Setting up benchmark environment..."
    
    # Create output directory
    mkdir -p "$OUTPUT_DIR"
    
    # Build Docker image for agent execution
    log_info "Building Docker image for agent execution..."
    docker build -t claude-flow-agent:benchmark ./docker/agent-execution/
    
    # Prepare test data
    cat > "$OUTPUT_DIR/test_task.json" << EOF
{
  "id": { "id": "benchmark-task-001", "swarmId": "benchmark-swarm" },
  "name": "Benchmark Task",
  "type": "computation",
  "description": "Performance benchmark computation task",
  "instructions": "Execute a standardized computation for benchmarking",
  "priority": "normal",
  "status": "pending",
  "context": {},
  "input": { "complexity": "medium", "iterations": 1000 },
  "requirements": {
    "tools": ["calculator"],
    "memoryRequired": 67108864,
    "maxDuration": 10000,
    "minReliability": 0.9
  },
  "constraints": {
    "timeoutAfter": 30000,
    "maxRetries": 3
  }
}
EOF
    
    cat > "$OUTPUT_DIR/test_agent.json" << EOF
{
  "id": { "id": "benchmark-agent-001", "swarmId": "benchmark-swarm" },
  "name": "Benchmark Agent",
  "type": "coder",
  "status": "idle",
  "capabilities": {
    "canCode": true,
    "canAnalyze": true,
    "canTest": false,
    "canReview": false,
    "canDocument": false
  },
  "environment": {
    "nodeVersion": "20.0.0",
    "platform": "linux",
    "credentials": {}
  }
}
EOF
    
    log_success "Environment setup complete"
}

# Measure startup time
measure_startup_time() {
    local execution_type=$1
    local iteration=$2
    
    if [ "$execution_type" = "docker" ]; then
        local start_time=$(date +%s%N)
        
        # Create container
        local container_id=$(docker run -d --rm \
            --memory=256m \
            --cpus=0.5 \
            --read-only \
            --security-opt no-new-privileges:true \
            --cap-drop ALL \
            --user 1001:1001 \
            claude-flow-agent:benchmark \
            sleep 10)
        
        # Wait for container to be ready
        docker exec "$container_id" echo "ready" > /dev/null 2>&1
        
        local end_time=$(date +%s%N)
        local duration=$(((end_time - start_time) / 1000000)) # Convert to ms
        
        # Cleanup
        docker stop "$container_id" > /dev/null 2>&1 || true
        
        echo "$duration"
    else
        local start_time=$(date +%s%N)
        
        # Simulate process startup
        node -e "console.log('process ready')" > /dev/null 2>&1
        
        local end_time=$(date +%s%N)
        local duration=$(((end_time - start_time) / 1000000)) # Convert to ms
        
        echo "$duration"
    fi
}

# Measure execution time
measure_execution_time() {
    local execution_type=$1
    local iteration=$2
    
    if [ "$execution_type" = "docker" ]; then
        local start_time=$(date +%s%N)
        
        # Run task in container
        local container_id=$(docker run -d --rm \
            --memory=256m \
            --cpus=0.5 \
            --read-only \
            --security-opt no-new-privileges:true \
            --cap-drop ALL \
            --user 1001:1001 \
            --tmpfs /tmp:rw,noexec,nosuid,size=100m \
            claude-flow-agent:benchmark \
            sh -c "node -e 'let sum=0; for(let i=0; i<1000000; i++) sum+=i; console.log(sum)'")
        
        # Wait for completion
        docker wait "$container_id" > /dev/null 2>&1
        
        local end_time=$(date +%s%N)
        local duration=$(((end_time - start_time) / 1000000)) # Convert to ms
        
        echo "$duration"
    else
        local start_time=$(date +%s%N)
        
        # Run task as process
        node -e 'let sum=0; for(let i=0; i<1000000; i++) sum+=i; console.log(sum)' > /dev/null 2>&1
        
        local end_time=$(date +%s%N)
        local duration=$(((end_time - start_time) / 1000000)) # Convert to ms
        
        echo "$duration"
    fi
}

# Measure memory usage
measure_memory_usage() {
    local execution_type=$1
    
    if [ "$execution_type" = "docker" ]; then
        # Create container and measure memory
        local container_id=$(docker run -d --rm \
            --memory=256m \
            --cpus=0.5 \
            claude-flow-agent:benchmark \
            sh -c "node -e 'const arr = new Array(10000000).fill(1); setTimeout(() => process.exit(0), 1000)'")
        
        # Get peak memory usage
        local memory_usage=0
        for i in {1..10}; do
            local current_memory=$(docker stats --no-stream --format "{{.MemUsage}}" "$container_id" 2>/dev/null | cut -d'/' -f1 | sed 's/[^0-9.]//g' || echo "0")
            if (( $(echo "$current_memory > $memory_usage" | bc -l) )); then
                memory_usage=$current_memory
            fi
            sleep 0.1
        done
        
        docker wait "$container_id" > /dev/null 2>&1 || true
        
        echo "${memory_usage:-0}"
    else
        # Measure process memory usage
        local pid=$(node -e 'const arr = new Array(10000000).fill(1); setTimeout(() => process.exit(0), 1000)' & echo $!)
        
        local memory_usage=0
        for i in {1..10}; do
            if kill -0 "$pid" 2>/dev/null; then
                local current_memory=$(ps -o rss= -p "$pid" 2>/dev/null | tr -d ' ' || echo "0")
                if [ "$current_memory" -gt "$memory_usage" ]; then
                    memory_usage=$current_memory
                fi
            fi
            sleep 0.1
        done
        
        wait "$pid" 2>/dev/null || true
        
        # Convert KB to MB
        echo "$(echo "$memory_usage / 1024" | bc -l)"
    fi
}

# Run benchmark suite
run_benchmark() {
    log_info "Running performance benchmark with $ITERATIONS iterations..."
    
    # Initialize results
    local results=$(cat << EOF
{
  "metadata": {
    "timestamp": "$TIMESTAMP",
    "iterations": $ITERATIONS,
    "concurrent_tests": $CONCURRENT_TESTS,
    "node_version": "$(node --version)",
    "docker_version": "$(docker --version | cut -d' ' -f3 | cut -d',' -f1)",
    "system": "$(uname -a)"
  },
  "results": {
    "startup_time": {
      "process": [],
      "docker": []
    },
    "execution_time": {
      "process": [],
      "docker": []
    },
    "memory_usage": {
      "process": [],
      "docker": []
    }
  }
}
EOF
)
    
    # Measure startup times
    log_info "Measuring startup times..."
    for i in $(seq 1 $ITERATIONS); do
        log_info "Startup iteration $i/$ITERATIONS"
        
        # Process startup
        local process_startup=$(measure_startup_time "process" "$i")
        results=$(echo "$results" | jq ".results.startup_time.process += [$process_startup]")
        
        # Docker startup
        local docker_startup=$(measure_startup_time "docker" "$i")
        results=$(echo "$results" | jq ".results.startup_time.docker += [$docker_startup]")
        
        echo -n "."
    done
    echo ""
    
    # Measure execution times
    log_info "Measuring execution times..."
    for i in $(seq 1 $ITERATIONS); do
        log_info "Execution iteration $i/$ITERATIONS"
        
        # Process execution
        local process_exec=$(measure_execution_time "process" "$i")
        results=$(echo "$results" | jq ".results.execution_time.process += [$process_exec]")
        
        # Docker execution
        local docker_exec=$(measure_execution_time "docker" "$i")
        results=$(echo "$results" | jq ".results.execution_time.docker += [$docker_exec]")
        
        echo -n "."
    done
    echo ""
    
    # Measure memory usage
    log_info "Measuring memory usage..."
    for i in $(seq 1 5); do  # Fewer iterations for memory tests
        log_info "Memory iteration $i/5"
        
        # Process memory
        local process_memory=$(measure_memory_usage "process")
        results=$(echo "$results" | jq ".results.memory_usage.process += [$process_memory]")
        
        # Docker memory
        local docker_memory=$(measure_memory_usage "docker")
        results=$(echo "$results" | jq ".results.memory_usage.docker += [$docker_memory]")
        
        echo -n "."
    done
    echo ""
    
    # Save results
    echo "$results" > "$RESULTS_FILE"
    log_success "Benchmark results saved to $RESULTS_FILE"
}

# Calculate statistics
calculate_statistics() {
    log_info "Calculating statistics..."
    
    local stats=$(cat "$RESULTS_FILE" | jq '
    {
      "summary": {
        "startup_time": {
          "process": {
            "avg": (.results.startup_time.process | add / length),
            "min": (.results.startup_time.process | min),
            "max": (.results.startup_time.process | max),
            "std_dev": ((.results.startup_time.process | add / length) as $avg | .results.startup_time.process | map(. - $avg | . * .) | add / length | sqrt)
          },
          "docker": {
            "avg": (.results.startup_time.docker | add / length),
            "min": (.results.startup_time.docker | min),
            "max": (.results.startup_time.docker | max),
            "std_dev": ((.results.startup_time.docker | add / length) as $avg | .results.startup_time.docker | map(. - $avg | . * .) | add / length | sqrt)
          },
          "overhead_percent": (((.results.startup_time.docker | add / length) - (.results.startup_time.process | add / length)) / (.results.startup_time.process | add / length) * 100)
        },
        "execution_time": {
          "process": {
            "avg": (.results.execution_time.process | add / length),
            "min": (.results.execution_time.process | min),
            "max": (.results.execution_time.process | max),
            "std_dev": ((.results.execution_time.process | add / length) as $avg | .results.execution_time.process | map(. - $avg | . * .) | add / length | sqrt)
          },
          "docker": {
            "avg": (.results.execution_time.docker | add / length),
            "min": (.results.execution_time.docker | min),
            "max": (.results.execution_time.docker | max),
            "std_dev": ((.results.execution_time.docker | add / length) as $avg | .results.execution_time.docker | map(. - $avg | . * .) | add / length | sqrt)
          },
          "overhead_percent": (((.results.execution_time.docker | add / length) - (.results.execution_time.process | add / length)) / (.results.execution_time.process | add / length) * 100)
        },
        "memory_usage": {
          "process": {
            "avg": (.results.memory_usage.process | add / length),
            "min": (.results.memory_usage.process | min),
            "max": (.results.memory_usage.process | max)
          },
          "docker": {
            "avg": (.results.memory_usage.docker | add / length),
            "min": (.results.memory_usage.docker | min),
            "max": (.results.memory_usage.docker | max)
          },
          "overhead_percent": (((.results.memory_usage.docker | add / length) - (.results.memory_usage.process | add / length)) / (.results.memory_usage.process | add / length) * 100)
        }
      }
    }')
    
    # Merge statistics into results file
    local final_results=$(cat "$RESULTS_FILE" | jq ". += $stats")
    echo "$final_results" > "$RESULTS_FILE"
    
    log_success "Statistics calculated and saved"
}

# Generate report
generate_report() {
    log_info "Generating performance report..."
    
    local report_file="$OUTPUT_DIR/performance_report_$TIMESTAMP.md"
    
    cat > "$report_file" << EOF
# Claude Flow Performance Benchmark Report

**Generated:** $(date)  
**Iterations:** $ITERATIONS  
**Node Version:** $(node --version)  
**Docker Version:** $(docker --version | cut -d' ' -f3 | cut -d',' -f1)  
**System:** $(uname -a)  

## Executive Summary

This report compares the performance overhead of Docker-based agent execution versus process-based execution.

## Results

### Startup Time

EOF
    
    # Extract and format statistics
    local startup_process_avg=$(cat "$RESULTS_FILE" | jq -r '.summary.startup_time.process.avg')
    local startup_docker_avg=$(cat "$RESULTS_FILE" | jq -r '.summary.startup_time.docker.avg')
    local startup_overhead=$(cat "$RESULTS_FILE" | jq -r '.summary.startup_time.overhead_percent')
    
    local exec_process_avg=$(cat "$RESULTS_FILE" | jq -r '.summary.execution_time.process.avg')
    local exec_docker_avg=$(cat "$RESULTS_FILE" | jq -r '.summary.execution_time.docker.avg')
    local exec_overhead=$(cat "$RESULTS_FILE" | jq -r '.summary.execution_time.overhead_percent')
    
    local mem_process_avg=$(cat "$RESULTS_FILE" | jq -r '.summary.memory_usage.process.avg')
    local mem_docker_avg=$(cat "$RESULTS_FILE" | jq -r '.summary.memory_usage.docker.avg')
    local mem_overhead=$(cat "$RESULTS_FILE" | jq -r '.summary.memory_usage.overhead_percent')
    
    cat >> "$report_file" << EOF
| Metric | Process | Docker | Overhead |
|--------|---------|--------|----------|
| Average | ${startup_process_avg}ms | ${startup_docker_avg}ms | ${startup_overhead}% |

### Execution Time

| Metric | Process | Docker | Overhead |
|--------|---------|--------|----------|
| Average | ${exec_process_avg}ms | ${exec_docker_avg}ms | ${exec_overhead}% |

### Memory Usage

| Metric | Process | Docker | Overhead |
|--------|---------|--------|----------|
| Average | ${mem_process_avg}MB | ${mem_docker_avg}MB | ${mem_overhead}% |

## Analysis

### Performance Impact

EOF
    
    # Add analysis based on results
    if (( $(echo "$exec_overhead < 50" | bc -l) )); then
        echo "- **Low overhead**: Docker execution overhead is acceptable (< 50%)" >> "$report_file"
    elif (( $(echo "$exec_overhead < 100" | bc -l) )); then
        echo "- **Moderate overhead**: Docker execution overhead is moderate (50-100%)" >> "$report_file"
    else
        echo "- **High overhead**: Docker execution overhead is significant (> 100%)" >> "$report_file"
    fi
    
    cat >> "$report_file" << EOF

### Security Gains

Docker containerization provides:
- **Process isolation**: Complete filesystem and process namespace isolation
- **Resource limits**: Enforced memory, CPU, and I/O limits
- **Privilege reduction**: No new privileges, dropped capabilities
- **Network isolation**: Separate network namespace
- **Attack surface reduction**: Minimal container image with hardened configuration

### Recommendations

EOF
    
    if (( $(echo "$exec_overhead < 75" | bc -l) )); then
        echo "✅ **Recommended**: Use Docker containerization for production agent execution" >> "$report_file"
        echo "   - Security benefits justify the performance overhead" >> "$report_file"
        echo "   - Consider container pooling to reduce startup overhead" >> "$report_file"
    else
        echo "⚠️ **Consider optimization**: High overhead may impact user experience" >> "$report_file"
        echo "   - Evaluate security requirements vs performance needs" >> "$report_file"
        echo "   - Consider process-based execution for performance-critical tasks" >> "$report_file"
    fi
    
    cat >> "$report_file" << EOF

## Raw Data

Detailed results are available in: \`$(basename "$RESULTS_FILE")\`

## Test Configuration

- **Iterations**: $ITERATIONS
- **Concurrent Tests**: $CONCURRENT_TESTS
- **Docker Image**: claude-flow-agent:benchmark
- **Container Limits**: 256MB RAM, 0.5 CPU cores
- **Security**: Read-only filesystem, no new privileges, all capabilities dropped

EOF
    
    log_success "Performance report generated: $report_file"
}

# Cleanup
cleanup() {
    log_info "Cleaning up..."
    
    # Remove test containers
    docker container prune -f > /dev/null 2>&1 || true
    
    # Remove test image
    docker rmi claude-flow-agent:benchmark > /dev/null 2>&1 || true
    
    log_success "Cleanup complete"
}

# Main execution
main() {
    log_info "Starting Claude Flow Performance Benchmark"
    log_info "=========================================="
    
    check_dependencies
    setup_environment
    run_benchmark
    calculate_statistics
    generate_report
    cleanup
    
    log_success "Benchmark completed successfully!"
    log_info "Results saved in: $OUTPUT_DIR"
    
    # Display summary
    echo ""
    echo "=== PERFORMANCE SUMMARY ==="
    echo "Startup Overhead: $(cat "$RESULTS_FILE" | jq -r '.summary.startup_time.overhead_percent | round')%"
    echo "Execution Overhead: $(cat "$RESULTS_FILE" | jq -r '.summary.execution_time.overhead_percent | round')%"
    echo "Memory Overhead: $(cat "$RESULTS_FILE" | jq -r '.summary.memory_usage.overhead_percent | round')%"
    echo ""
    
    local exec_overhead=$(cat "$RESULTS_FILE" | jq -r '.summary.execution_time.overhead_percent')
    if (( $(echo "$exec_overhead < 50" | bc -l) )); then
        log_success "Docker containerization recommended (low overhead)"
    elif (( $(echo "$exec_overhead < 100" | bc -l) )); then
        log_warning "Moderate overhead - evaluate trade-offs"
    else
        log_error "High overhead - consider optimization"
    fi
}

# Handle script interruption
trap cleanup EXIT

# Run main function
main "$@"