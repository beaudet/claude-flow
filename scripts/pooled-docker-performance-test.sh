#!/bin/bash

# Pooled Docker Performance Testing Script
# Measures real-world performance improvements of container pooling

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
DOCKER_IMAGE="${DOCKER_IMAGE:-alpine:latest}"
TEST_ITERATIONS="${TEST_ITERATIONS:-10}"
POOL_SIZE="${POOL_SIZE:-3}"
AGENT_TYPES=("coder" "tester" "reviewer" "researcher" "planner")
TEMP_DIR=$(mktemp -d)
RESULTS_FILE="$TEMP_DIR/performance-results.json"
LOG_FILE="$TEMP_DIR/performance-test.log"

echo -e "${CYAN}⚡ Claude-Flow Pooled Docker Performance Testing${NC}"
echo "Results file: $RESULTS_FILE"
echo "Log file: $LOG_FILE"
echo "Temp dir: $TEMP_DIR"
echo ""

# JSON helper functions
json_init() {
    echo '{"test_run": {"timestamp": "'$(date -Iseconds)'", "config": {"iterations": '$TEST_ITERATIONS', "pool_size": '$POOL_SIZE', "docker_image": "'$DOCKER_IMAGE'"}, "results": {}}}' > "$RESULTS_FILE"
}

json_add_result() {
    local test_name="$1"
    local result="$2"
    
    # Use jq to add result if available, otherwise use sed
    if command -v jq >/dev/null 2>&1; then
        jq ".results.\"$test_name\" = $result" "$RESULTS_FILE" > "${RESULTS_FILE}.tmp" && mv "${RESULTS_FILE}.tmp" "$RESULTS_FILE"
    else
        # Fallback to basic JSON manipulation
        sed -i 's/"results": {}"/"results": {"'$test_name'": '$result'}"/' "$RESULTS_FILE"
    fi
}

# Check prerequisites
check_prerequisites() {
    echo -e "${BLUE}Checking prerequisites...${NC}"
    
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker not found${NC}"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        echo -e "${RED}❌ Docker daemon not running${NC}"
        exit 1
    fi
    
    # Check if image exists
    if ! docker image inspect "$DOCKER_IMAGE" &> /dev/null; then
        echo -e "${YELLOW}⏳ Pulling $DOCKER_IMAGE...${NC}"
        docker pull "$DOCKER_IMAGE" >> "$LOG_FILE" 2>&1
    fi
    
    echo -e "${GREEN}✅ Prerequisites checked${NC}"
    echo ""
}

# Measure fresh container startup time
measure_fresh_container_startup() {
    echo -e "${BLUE}🚀 Test 1: Fresh Container Startup Time${NC}"
    
    local total_time=0
    local successful_runs=0
    local startup_times=()
    
    for i in $(seq 1 "$TEST_ITERATIONS"); do
        echo -n "  Run $i/$TEST_ITERATIONS... "
        
        local container_name="fresh-test-$i"
        local start_time=$(date +%s%3N)
        
        # Create, start, and execute simple command
        if docker run --name "$container_name" \
            --read-only \
            --security-opt no-new-privileges:true \
            --cap-drop ALL \
            --user nobody:nobody \
            --memory 128m \
            --cpus 0.5 \
            "$DOCKER_IMAGE" \
            sh -c 'echo "Hello from fresh container"' >> "$LOG_FILE" 2>&1; then
            
            local end_time=$(date +%s%3N)
            local duration=$((end_time - start_time))
            startup_times+=("$duration")
            total_time=$((total_time + duration))
            successful_runs=$((successful_runs + 1))
            
            echo -e "${GREEN}${duration}ms${NC}"
        else
            echo -e "${RED}FAILED${NC}"
        fi
        
        # Cleanup
        docker rm -f "$container_name" >> "$LOG_FILE" 2>&1 || true
        
        # Small delay to avoid overwhelming Docker
        sleep 0.1
    done
    
    if [ "$successful_runs" -gt 0 ]; then
        local avg_time=$((total_time / successful_runs))
        local min_time=$(printf '%s\n' "${startup_times[@]}" | sort -n | head -1)
        local max_time=$(printf '%s\n' "${startup_times[@]}" | sort -n | tail -1)
        
        echo ""
        echo -e "${CYAN}Fresh Container Results:${NC}"
        echo "  Successful runs: $successful_runs/$TEST_ITERATIONS"
        echo "  Average time: ${avg_time}ms"
        echo "  Min time: ${min_time}ms"
        echo "  Max time: ${max_time}ms"
        
        # Save to JSON
        json_add_result "fresh_container_startup" "{\"average_ms\": $avg_time, \"min_ms\": $min_time, \"max_ms\": $max_time, \"successful_runs\": $successful_runs, \"total_runs\": $TEST_ITERATIONS}"
    else
        echo -e "${RED}❌ All fresh container tests failed${NC}"
    fi
    
    echo ""
}

# Measure pooled container performance
measure_pooled_container_performance() {
    echo -e "${BLUE}🏊 Test 2: Pooled Container Performance${NC}"
    
    local network_name="claude-flow-pool-test"
    local volume_prefix="claude-flow-pool-vol"
    local container_pools=()
    
    # Create test network
    docker network create "$network_name" >> "$LOG_FILE" 2>&1 || true
    
    echo "Creating container pools..."
    
    # Create pools for each agent type
    for agent_type in "${AGENT_TYPES[@]}"; do
        echo "  Creating pool for $agent_type..."
        
        for i in $(seq 1 "$POOL_SIZE"); do
            local container_name="pool-${agent_type}-${i}"
            local volume_name="${volume_prefix}-${agent_type}-${i}"
            
            # Create dedicated volume
            docker volume create "$volume_name" >> "$LOG_FILE" 2>&1
            
            # Create long-running container
            if docker run -d --name "$container_name" \
                --network "$network_name" \
                --read-only \
                --tmpfs /tmp:rw,noexec,nosuid,size=100m \
                --security-opt no-new-privileges:true \
                --cap-drop ALL \
                --user nobody:nobody \
                --memory 128m \
                --cpus 0.5 \
                -v "$volume_name:/workspace" \
                -e "AGENT_TYPE=$agent_type" \
                -e "CONTAINER_ID=$container_name" \
                --label "claude-flow.pool=true" \
                --label "claude-flow.agent-type=$agent_type" \
                "$DOCKER_IMAGE" sleep infinity >> "$LOG_FILE" 2>&1; then
                
                container_pools+=("$container_name")
                echo -e "    ✅ $container_name created"
            else
                echo -e "    ❌ Failed to create $container_name"
            fi
        done
    done
    
    echo ""
    echo "Testing pooled container execution..."
    
    local total_time=0
    local successful_runs=0
    local execution_times=()
    
    for i in $(seq 1 "$TEST_ITERATIONS"); do
        # Select random agent type and container
        local agent_type="${AGENT_TYPES[$((RANDOM % ${#AGENT_TYPES[@]}))]}"
        local container_num=$((RANDOM % POOL_SIZE + 1))
        local container_name="pool-${agent_type}-${container_num}"
        
        echo -n "  Run $i/$TEST_ITERATIONS ($agent_type-$container_num)... "
        
        local start_time=$(date +%s%3N)
        
        # Execute in existing container (no startup cost)
        if docker exec "$container_name" sh -c 'echo "Hello from pooled container '$container_name'" && whoami && echo "Agent type: $AGENT_TYPE"' >> "$LOG_FILE" 2>&1; then
            local end_time=$(date +%s%3N)
            local duration=$((end_time - start_time))
            execution_times+=("$duration")
            total_time=$((total_time + duration))
            successful_runs=$((successful_runs + 1))
            
            echo -e "${GREEN}${duration}ms${NC}"
        else
            echo -e "${RED}FAILED${NC}"
        fi
        
        # Small delay
        sleep 0.1
    done
    
    # Calculate statistics
    if [ "$successful_runs" -gt 0 ]; then
        local avg_time=$((total_time / successful_runs))
        local min_time=$(printf '%s\n' "${execution_times[@]}" | sort -n | head -1)
        local max_time=$(printf '%s\n' "${execution_times[@]}" | sort -n | tail -1)
        
        echo ""
        echo -e "${CYAN}Pooled Container Results:${NC}"
        echo "  Successful runs: $successful_runs/$TEST_ITERATIONS"
        echo "  Average time: ${avg_time}ms"
        echo "  Min time: ${min_time}ms"
        echo "  Max time: ${max_time}ms"
        echo "  Total containers created: ${#container_pools[@]}"
        
        # Save to JSON
        json_add_result "pooled_container_execution" "{\"average_ms\": $avg_time, \"min_ms\": $min_time, \"max_ms\": $max_time, \"successful_runs\": $successful_runs, \"total_runs\": $TEST_ITERATIONS, \"pool_size\": ${#container_pools[@]}}"
    else
        echo -e "${RED}❌ All pooled container tests failed${NC}"
    fi
    
    # Cleanup pools
    echo ""
    echo "Cleaning up container pools..."
    for container_name in "${container_pools[@]}"; do
        docker rm -f "$container_name" >> "$LOG_FILE" 2>&1 || true
    done
    
    # Cleanup volumes
    for agent_type in "${AGENT_TYPES[@]}"; do
        for i in $(seq 1 "$POOL_SIZE"); do
            local volume_name="${volume_prefix}-${agent_type}-${i}"
            docker volume rm "$volume_name" >> "$LOG_FILE" 2>&1 || true
        done
    done
    
    # Cleanup network
    docker network rm "$network_name" >> "$LOG_FILE" 2>&1 || true
    
    echo ""
}

# Test concurrent execution
measure_concurrent_execution() {
    echo -e "${BLUE}🔄 Test 3: Concurrent Execution Performance${NC}"
    
    local network_name="claude-flow-concurrent-test"
    local concurrent_containers=()
    local concurrency_levels=(2 4 8)
    
    # Create test network
    docker network create "$network_name" >> "$LOG_FILE" 2>&1 || true
    
    for concurrency in "${concurrency_levels[@]}"; do
        echo "Testing concurrency level: $concurrency"
        
        # Create pool of containers
        local containers=()
        for i in $(seq 1 "$concurrency"); do
            local container_name="concurrent-pool-$i"
            
            if docker run -d --name "$container_name" \
                --network "$network_name" \
                --read-only \
                --tmpfs /tmp:rw,noexec,nosuid,size=50m \
                --security-opt no-new-privileges:true \
                --cap-drop ALL \
                --user nobody:nobody \
                --memory 64m \
                --cpus 0.25 \
                "$DOCKER_IMAGE" sleep infinity >> "$LOG_FILE" 2>&1; then
                
                containers+=("$container_name")
            fi
        done
        
        if [ "${#containers[@]}" -eq "$concurrency" ]; then
            echo "  Created $concurrency containers"
            
            # Measure concurrent execution
            local start_time=$(date +%s%3N)
            
            # Execute in all containers simultaneously
            local pids=()
            for container_name in "${containers[@]}"; do
                (docker exec "$container_name" sh -c 'for i in $(seq 1 100); do echo $((i*i)) > /dev/null; done; echo "Task completed in '$container_name'"' >> "$LOG_FILE" 2>&1) &
                pids+=($!)
            done
            
            # Wait for all to complete
            for pid in "${pids[@]}"; do
                wait "$pid"
            done
            
            local end_time=$(date +%s%3N)
            local total_duration=$((end_time - start_time))
            
            echo -e "  Concurrent execution time: ${GREEN}${total_duration}ms${NC}"
            
            # Save result
            json_add_result "concurrent_execution_${concurrency}" "{\"duration_ms\": $total_duration, \"concurrency\": $concurrency}"
            
            # Cleanup containers
            for container_name in "${containers[@]}"; do
                docker rm -f "$container_name" >> "$LOG_FILE" 2>&1 || true
            done
        else
            echo -e "  ${RED}❌ Failed to create all containers for concurrency $concurrency${NC}"
        fi
        
        echo ""
    done
    
    # Cleanup network
    docker network rm "$network_name" >> "$LOG_FILE" 2>&1 || true
}

# Test container health monitoring
test_container_health_monitoring() {
    echo -e "${BLUE}❤️  Test 4: Container Health Monitoring${NC}"
    
    local healthy_containers=()
    local health_check_times=()
    
    echo "Creating containers with health monitoring..."
    
    # Create a few containers to monitor
    for i in $(seq 1 3); do
        local container_name="health-test-$i"
        
        if docker run -d --name "$container_name" \
            --read-only \
            --tmpfs /tmp:rw,noexec,nosuid,size=50m \
            --security-opt no-new-privileges:true \
            --cap-drop ALL \
            --user nobody:nobody \
            --memory 64m \
            --cpus 0.25 \
            --label "health-test=true" \
            "$DOCKER_IMAGE" sleep infinity >> "$LOG_FILE" 2>&1; then
            
            healthy_containers+=("$container_name")
            echo "  ✅ Created $container_name"
        fi
    done
    
    echo ""
    echo "Testing health check performance..."
    
    # Perform health checks
    for i in $(seq 1 5); do
        echo -n "  Health check round $i... "
        
        local start_time=$(date +%s%3N)
        local healthy_count=0
        
        for container_name in "${healthy_containers[@]}"; do
            if docker inspect "$container_name" --format '{{.State.Status}}' 2>/dev/null | grep -q "running"; then
                healthy_count=$((healthy_count + 1))
            fi
        done
        
        local end_time=$(date +%s%3N)
        local duration=$((end_time - start_time))
        health_check_times+=("$duration")
        
        echo -e "${GREEN}${healthy_count}/${#healthy_containers[@]} healthy (${duration}ms)${NC}"
        
        sleep 1
    done
    
    # Calculate health check statistics
    local total_time=0
    for time in "${health_check_times[@]}"; do
        total_time=$((total_time + time))
    done
    local avg_health_check_time=$((total_time / ${#health_check_times[@]}))
    
    echo ""
    echo -e "${CYAN}Health Monitoring Results:${NC}"
    echo "  Average health check time: ${avg_health_check_time}ms"
    echo "  Containers monitored: ${#healthy_containers[@]}"
    
    # Save result
    json_add_result "health_monitoring" "{\"average_check_time_ms\": $avg_health_check_time, \"containers_monitored\": ${#healthy_containers[@]}}"
    
    # Cleanup
    for container_name in "${healthy_containers[@]}"; do
        docker rm -f "$container_name" >> "$LOG_FILE" 2>&1 || true
    done
    
    echo ""
}

# Generate performance comparison report
generate_performance_report() {
    echo -e "${BLUE}📊 Performance Analysis${NC}"
    echo "=========================="
    
    # Try to parse results and generate comparison
    if command -v jq >/dev/null 2>&1 && [ -f "$RESULTS_FILE" ]; then
        local fresh_avg=$(jq -r '.results.fresh_container_startup.average_ms // 0' "$RESULTS_FILE")
        local pooled_avg=$(jq -r '.results.pooled_container_execution.average_ms // 0' "$RESULTS_FILE")
        
        if [ "$fresh_avg" -gt 0 ] && [ "$pooled_avg" -gt 0 ]; then
            local improvement_factor=$((fresh_avg / pooled_avg))
            local overhead_percentage=$(((fresh_avg - pooled_avg) * 100 / fresh_avg))
            
            echo -e "${CYAN}Performance Comparison:${NC}"
            echo "  Fresh container average: ${fresh_avg}ms"
            echo "  Pooled container average: ${pooled_avg}ms"
            echo -e "  ${GREEN}Improvement factor: ${improvement_factor}x faster${NC}"
            echo -e "  ${GREEN}Overhead reduction: ${overhead_percentage}%${NC}"
            echo ""
            
            # Performance assessment
            if [ "$improvement_factor" -ge 10 ]; then
                echo -e "${GREEN}✅ EXCELLENT: Pooling provides significant performance improvement${NC}"
            elif [ "$improvement_factor" -ge 5 ]; then
                echo -e "${GREEN}✅ GOOD: Pooling provides substantial performance improvement${NC}"
            elif [ "$improvement_factor" -ge 2 ]; then
                echo -e "${YELLOW}⚠️  MODERATE: Pooling provides noticeable improvement${NC}"
            else
                echo -e "${RED}❌ POOR: Pooling provides minimal improvement${NC}"
            fi
        fi
    fi
    
    echo ""
    echo -e "${CYAN}Resource Usage Analysis:${NC}"
    echo "  Docker images used: $DOCKER_IMAGE"
    echo "  Container pools created: $((${#AGENT_TYPES[@]} * POOL_SIZE))"
    echo "  Security features enabled: read-only, no-new-privileges, dropped capabilities"
    echo "  Resource limits: 128MB memory, 0.5 CPU per container"
    echo ""
    
    echo -e "${CYAN}Recommendations:${NC}"
    echo "  • Use pooled containers for frequently executed agent types"
    echo "  • Monitor pool utilization and adjust pool sizes accordingly"
    echo "  • Consider warm-up strategies for cold start scenarios"
    echo "  • Implement health monitoring for production deployments"
    echo ""
    
    echo "Detailed results saved to: $RESULTS_FILE"
    echo "Full logs available at: $LOG_FILE"
}

# Cleanup function
cleanup() {
    echo -e "${BLUE}🧹 Cleaning up test resources...${NC}"
    
    # Remove any remaining test containers
    docker ps -aq --filter "label=claude-flow.pool=true" | xargs -r docker rm -f >> "$LOG_FILE" 2>&1 || true
    docker ps -aq --filter "label=health-test=true" | xargs -r docker rm -f >> "$LOG_FILE" 2>&1 || true
    docker ps -aq --filter "name=fresh-test-" | xargs -r docker rm -f >> "$LOG_FILE" 2>&1 || true
    docker ps -aq --filter "name=pool-" | xargs -r docker rm -f >> "$LOG_FILE" 2>&1 || true
    docker ps -aq --filter "name=concurrent-pool-" | xargs -r docker rm -f >> "$LOG_FILE" 2>&1 || true
    
    # Remove test networks
    docker network ls --filter "name=claude-flow-" -q | xargs -r docker network rm >> "$LOG_FILE" 2>&1 || true
    
    # Remove test volumes
    docker volume ls --filter "name=claude-flow-pool-vol-" -q | xargs -r docker volume rm >> "$LOG_FILE" 2>&1 || true
    
    echo -e "${GREEN}✅ Cleanup completed${NC}"
}

# Main execution
main() {
    trap cleanup EXIT
    
    json_init
    check_prerequisites
    
    measure_fresh_container_startup
    measure_pooled_container_performance
    measure_concurrent_execution
    test_container_health_monitoring
    
    generate_performance_report
}

# Handle command line arguments
case "${1:-run}" in
    "run")
        main
        ;;
    "quick")
        TEST_ITERATIONS=3
        POOL_SIZE=2
        echo -e "${YELLOW}Running quick test (3 iterations, pool size 2)${NC}"
        main
        ;;
    "full")
        TEST_ITERATIONS=20
        POOL_SIZE=5
        echo -e "${YELLOW}Running full test (20 iterations, pool size 5)${NC}"
        main
        ;;
    "clean")
        cleanup
        ;;
    "help")
        echo "Usage: $0 [run|quick|full|clean|help]"
        echo "  run   - Run standard performance tests (default)"
        echo "  quick - Run quick tests (3 iterations, smaller pools)"
        echo "  full  - Run comprehensive tests (20 iterations, larger pools)"
        echo "  clean - Clean up test resources"
        echo "  help  - Show this help message"
        echo ""
        echo "Environment variables:"
        echo "  DOCKER_IMAGE=$DOCKER_IMAGE"
        echo "  TEST_ITERATIONS=$TEST_ITERATIONS"
        echo "  POOL_SIZE=$POOL_SIZE"
        ;;
    *)
        echo "Unknown command: $1"
        echo "Use '$0 help' for usage information"
        exit 1
        ;;
esac