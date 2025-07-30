#!/bin/bash

# Docker Security Penetration Testing Script
# Tests the actual security boundaries of the pooled Docker executor
# WARNING: Only run in isolated test environments

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOCKER_IMAGE="${DOCKER_IMAGE:-alpine:latest}"
TEST_CONTAINER_PREFIX="claude-flow-security-test"
TEMP_DIR=$(mktemp -d)
LOG_FILE="$TEMP_DIR/security-test.log"

echo -e "${BLUE}🔒 Claude-Flow Docker Security Penetration Testing${NC}"
echo "Log file: $LOG_FILE"
echo "Temp dir: $TEMP_DIR"
echo ""

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
    
    echo -e "${GREEN}✅ Docker available${NC}"
    docker --version
    echo ""
}

# Pull required images
prepare_images() {
    echo -e "${BLUE}Preparing test images...${NC}"
    
    if ! docker pull "$DOCKER_IMAGE" >> "$LOG_FILE" 2>&1; then
        echo -e "${RED}❌ Failed to pull $DOCKER_IMAGE${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Images prepared${NC}"
    echo ""
}

# Test 1: Privilege Escalation
test_privilege_escalation() {
    echo -e "${BLUE}🔬 Test 1: Privilege Escalation Prevention${NC}"
    
    local container_name="${TEST_CONTAINER_PREFIX}-privilege"
    
    # Create container with security constraints
    docker run -d --name "$container_name" \
        --read-only \
        --security-opt no-new-privileges:true \
        --cap-drop ALL \
        --user nobody:nobody \
        --memory 128m \
        --cpus 0.5 \
        "$DOCKER_IMAGE" sleep infinity >> "$LOG_FILE" 2>&1
    
    echo "Testing privilege escalation attempts..."
    
    # Test sudo access
    if docker exec "$container_name" sudo whoami 2>/dev/null; then
        echo -e "${RED}❌ SECURITY BREACH: sudo access allowed${NC}"
    else
        echo -e "${GREEN}✅ sudo access blocked${NC}"
    fi
    
    # Test su access
    if docker exec "$container_name" su - 2>/dev/null; then
        echo -e "${RED}❌ SECURITY BREACH: su access allowed${NC}"
    else
        echo -e "${GREEN}✅ su access blocked${NC}"
    fi
    
    # Test setuid programs
    local setuid_found=$(docker exec "$container_name" find / -perm -4000 2>/dev/null | wc -l)
    if [ "$setuid_found" -gt 0 ]; then
        echo -e "${YELLOW}⚠️  Warning: $setuid_found setuid programs found${NC}"
        docker exec "$container_name" find / -perm -4000 2>/dev/null | head -5
    else
        echo -e "${GREEN}✅ No setuid programs accessible${NC}"
    fi
    
    # Cleanup
    docker rm -f "$container_name" >> "$LOG_FILE" 2>&1
    echo ""
}

# Test 2: Filesystem Breakout
test_filesystem_breakout() {
    echo -e "${BLUE}🔬 Test 2: Filesystem Breakout Prevention${NC}"
    
    local container_name="${TEST_CONTAINER_PREFIX}-filesystem"
    
    # Create container with read-only filesystem
    docker run -d --name "$container_name" \
        --read-only \
        --tmpfs /tmp:rw,noexec,nosuid,size=100m \
        --security-opt no-new-privileges:true \
        --cap-drop ALL \
        --user nobody:nobody \
        "$DOCKER_IMAGE" sleep infinity >> "$LOG_FILE" 2>&1
    
    echo "Testing filesystem write attempts..."
    
    # Test root filesystem write
    if docker exec "$container_name" sh -c 'echo "test" > /test.txt' 2>/dev/null; then
        echo -e "${RED}❌ SECURITY BREACH: Root filesystem writable${NC}"
    else
        echo -e "${GREEN}✅ Root filesystem read-only${NC}"
    fi
    
    # Test /etc write
    if docker exec "$container_name" sh -c 'echo "malicious" >> /etc/passwd' 2>/dev/null; then
        echo -e "${RED}❌ SECURITY BREACH: /etc writable${NC}"
    else
        echo -e "${GREEN}✅ /etc protected${NC}"
    fi
    
    # Test /usr write
    if docker exec "$container_name" sh -c 'echo "malicious" > /usr/bin/malware' 2>/dev/null; then
        echo -e "${RED}❌ SECURITY BREACH: /usr writable${NC}"
    else
        echo -e "${GREEN}✅ /usr protected${NC}"
    fi
    
    # Test tmpfs constraints
    if docker exec "$container_name" sh -c 'echo "test" > /tmp/test.txt' 2>/dev/null; then
        echo -e "${GREEN}✅ /tmp writable (expected)${NC}"
        
        # Test tmpfs execution prevention
        if docker exec "$container_name" sh -c 'echo "#!/bin/sh\necho pwned" > /tmp/malware && chmod +x /tmp/malware && /tmp/malware' 2>/dev/null; then
            echo -e "${RED}❌ SECURITY BREACH: tmpfs execution allowed${NC}"
        else
            echo -e "${GREEN}✅ tmpfs execution blocked${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  /tmp not writable${NC}"
    fi
    
    # Cleanup
    docker rm -f "$container_name" >> "$LOG_FILE" 2>&1
    echo ""
}

# Test 3: Container Escape
test_container_escape() {
    echo -e "${BLUE}🔬 Test 3: Container Escape Prevention${NC}"
    
    local container_name="${TEST_CONTAINER_PREFIX}-escape"
    
    # Create hardened container
    docker run -d --name "$container_name" \
        --read-only \
        --security-opt no-new-privileges:true \
        --security-opt seccomp:unconfined \
        --cap-drop ALL \
        --user nobody:nobody \
        --pid=container \
        --network none \
        "$DOCKER_IMAGE" sleep infinity >> "$LOG_FILE" 2>&1
    
    echo "Testing container escape techniques..."
    
    # Test /proc/self/root escape
    if docker exec "$container_name" ls /proc/self/root/etc/passwd 2>/dev/null; then
        echo -e "${RED}❌ SECURITY BREACH: /proc/self/root escape possible${NC}"
    else
        echo -e "${GREEN}✅ /proc/self/root escape blocked${NC}"
    fi
    
    # Test cgroup escape
    if docker exec "$container_name" sh -c 'echo $$ > /sys/fs/cgroup/cgroup.procs' 2>/dev/null; then
        echo -e "${RED}❌ SECURITY BREACH: cgroup escape possible${NC}"
    else
        echo -e "${GREEN}✅ cgroup escape blocked${NC}"
    fi
    
    # Test device access
    local dangerous_devices=$(docker exec "$container_name" ls /dev/ 2>/dev/null | grep -E '^(dm-|loop|sd|hd|vd|nvme)' | wc -l)
    if [ "$dangerous_devices" -gt 0 ]; then
        echo -e "${RED}❌ SECURITY BREACH: Dangerous devices accessible${NC}"
        docker exec "$container_name" ls /dev/ | grep -E '^(dm-|loop|sd|hd|vd|nvme)' | head -3
    else
        echo -e "${GREEN}✅ Dangerous devices blocked${NC}"
    fi
    
    # Test kernel module loading
    if docker exec "$container_name" modprobe overlay 2>/dev/null; then
        echo -e "${RED}❌ SECURITY BREACH: Kernel module loading allowed${NC}"
    else
        echo -e "${GREEN}✅ Kernel module loading blocked${NC}"
    fi
    
    # Cleanup
    docker rm -f "$container_name" >> "$LOG_FILE" 2>&1
    echo ""
}

# Test 4: Resource Exhaustion
test_resource_exhaustion() {
    echo -e "${BLUE}🔬 Test 4: Resource Exhaustion Prevention${NC}"
    
    local container_name="${TEST_CONTAINER_PREFIX}-resources"
    
    # Create container with strict resource limits
    docker run -d --name "$container_name" \
        --memory 64m \
        --memory-swap 64m \
        --cpus 0.25 \
        --pids-limit 32 \
        --read-only \
        --security-opt no-new-privileges:true \
        --cap-drop ALL \
        --user nobody:nobody \
        "$DOCKER_IMAGE" sleep infinity >> "$LOG_FILE" 2>&1
    
    echo "Testing resource exhaustion attempts..."
    
    # Test memory bomb
    if timeout 10 docker exec "$container_name" sh -c 'dd if=/dev/zero of=/dev/shm/membomb bs=1M count=100' 2>/dev/null; then
        echo -e "${RED}❌ SECURITY BREACH: Memory exhaustion not prevented${NC}"
    else
        echo -e "${GREEN}✅ Memory exhaustion prevented${NC}"
    fi
    
    # Test fork bomb (process limit)
    if timeout 5 docker exec "$container_name" sh -c ':(){ :|:& };:' 2>/dev/null; then
        echo -e "${RED}❌ SECURITY BREACH: Fork bomb not prevented${NC}"
    else
        echo -e "${GREEN}✅ Fork bomb prevented${NC}"
    fi
    
    # Test disk exhaustion (should fail due to read-only filesystem)
    if timeout 10 docker exec "$container_name" sh -c 'dd if=/dev/zero of=/diskbomb bs=1M count=100' 2>/dev/null; then
        echo -e "${RED}❌ SECURITY BREACH: Disk exhaustion possible${NC}"
    else
        echo -e "${GREEN}✅ Disk exhaustion prevented${NC}"
    fi
    
    # Cleanup
    docker rm -f "$container_name" >> "$LOG_FILE" 2>&1
    echo ""
}

# Test 5: Network Isolation
test_network_isolation() {
    echo -e "${BLUE}🔬 Test 5: Network Isolation${NC}"
    
    local container_name="${TEST_CONTAINER_PREFIX}-network"
    
    # Create container with custom isolated network
    docker network create "${TEST_CONTAINER_PREFIX}-net" >> "$LOG_FILE" 2>&1 || true
    
    docker run -d --name "$container_name" \
        --network "${TEST_CONTAINER_PREFIX}-net" \
        --read-only \
        --security-opt no-new-privileges:true \
        --cap-drop ALL \
        --user nobody:nobody \
        "$DOCKER_IMAGE" sleep infinity >> "$LOG_FILE" 2>&1
    
    echo "Testing network isolation..."
    
    # Test external connectivity (should work in isolated network)
    if timeout 5 docker exec "$container_name" ping -c 1 8.8.8.8 2>/dev/null; then
        echo -e "${YELLOW}⚠️  External connectivity allowed (may be intended)${NC}"
    else
        echo -e "${GREEN}✅ External connectivity blocked${NC}"
    fi
    
    # Test host network access
    if timeout 5 docker exec "$container_name" ping -c 1 172.17.0.1 2>/dev/null; then
        echo -e "${YELLOW}⚠️  Host network accessible${NC}"
    else
        echo -e "${GREEN}✅ Host network blocked${NC}"
    fi
    
    # Test port scanning capabilities
    if docker exec "$container_name" command -v nmap >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  nmap available in container${NC}"
    else
        echo -e "${GREEN}✅ Network scanning tools not available${NC}"
    fi
    
    # Cleanup
    docker rm -f "$container_name" >> "$LOG_FILE" 2>&1
    docker network rm "${TEST_CONTAINER_PREFIX}-net" >> "$LOG_FILE" 2>&1 || true
    echo ""
}

# Test 6: Cross-Container Communication
test_cross_container_isolation() {
    echo -e "${BLUE}🔬 Test 6: Cross-Container Isolation${NC}"
    
    local container1="${TEST_CONTAINER_PREFIX}-isolated1"
    local container2="${TEST_CONTAINER_PREFIX}-isolated2"
    local network1="${TEST_CONTAINER_PREFIX}-net1"
    local network2="${TEST_CONTAINER_PREFIX}-net2"
    
    # Create separate networks
    docker network create "$network1" >> "$LOG_FILE" 2>&1 || true
    docker network create "$network2" >> "$LOG_FILE" 2>&1 || true
    
    # Create containers in different networks
    docker run -d --name "$container1" \
        --network "$network1" \
        --read-only \
        --security-opt no-new-privileges:true \
        --cap-drop ALL \
        --user nobody:nobody \
        "$DOCKER_IMAGE" sleep infinity >> "$LOG_FILE" 2>&1
    
    docker run -d --name "$container2" \
        --network "$network2" \
        --read-only \
        --security-opt no-new-privileges:true \
        --cap-drop ALL \
        --user nobody:nobody \
        "$DOCKER_IMAGE" sleep infinity >> "$LOG_FILE" 2>&1
    
    echo "Testing cross-container isolation..."
    
    # Get IP addresses
    local ip1=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$container1")
    local ip2=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$container2")
    
    echo "Container 1 IP: $ip1"
    echo "Container 2 IP: $ip2"
    
    # Test cross-container communication
    if timeout 5 docker exec "$container1" ping -c 1 "$ip2" 2>/dev/null; then
        echo -e "${RED}❌ SECURITY BREACH: Cross-container communication allowed${NC}"
    else
        echo -e "${GREEN}✅ Cross-container communication blocked${NC}"
    fi
    
    # Test container discovery
    if docker exec "$container1" ps aux | grep -v grep | grep -q "$container2"; then
        echo -e "${RED}❌ SECURITY BREACH: Container processes visible${NC}"
    else
        echo -e "${GREEN}✅ Container processes isolated${NC}"
    fi
    
    # Cleanup
    docker rm -f "$container1" "$container2" >> "$LOG_FILE" 2>&1
    docker network rm "$network1" "$network2" >> "$LOG_FILE" 2>&1 || true
    echo ""
}

# Performance impact measurement
measure_performance_impact() {
    echo -e "${BLUE}📊 Performance Impact Measurement${NC}"
    
    local baseline_container="${TEST_CONTAINER_PREFIX}-baseline"
    local secured_container="${TEST_CONTAINER_PREFIX}-secured"
    
    echo "Creating baseline container (minimal security)..."
    docker run -d --name "$baseline_container" \
        "$DOCKER_IMAGE" sleep infinity >> "$LOG_FILE" 2>&1
    
    echo "Creating secured container (full security hardening)..."
    docker run -d --name "$secured_container" \
        --read-only \
        --tmpfs /tmp:rw,noexec,nosuid,size=50m \
        --security-opt no-new-privileges:true \
        --security-opt seccomp:unconfined \
        --cap-drop ALL \
        --user nobody:nobody \
        --memory 128m \
        --cpus 0.5 \
        --pids-limit 32 \
        "$DOCKER_IMAGE" sleep infinity >> "$LOG_FILE" 2>&1
    
    echo "Running performance tests..."
    
    # CPU performance test
    echo "Testing CPU performance..."
    local baseline_cpu_time=$(docker exec "$baseline_container" time sh -c 'for i in $(seq 1 1000); do echo $((i*i)) > /dev/null; done' 2>&1 | grep real | awk '{print $2}' || echo "0m0.000s")
    local secured_cpu_time=$(docker exec "$secured_container" time sh -c 'for i in $(seq 1 1000); do echo $((i*i)) > /dev/null; done' 2>&1 | grep real | awk '{print $2}' || echo "0m0.000s")
    
    echo "Baseline CPU time: $baseline_cpu_time"
    echo "Secured CPU time: $secured_cpu_time"
    
    # Memory allocation test
    echo "Testing memory allocation..."
    local baseline_mem_time=$(docker exec "$baseline_container" time sh -c 'dd if=/dev/zero of=/tmp/memtest bs=1M count=10 2>/dev/null; rm -f /tmp/memtest' 2>&1 | grep real | awk '{print $2}' || echo "0m0.000s")
    local secured_mem_time=$(docker exec "$secured_container" time sh -c 'dd if=/dev/zero of=/tmp/memtest bs=1M count=10 2>/dev/null; rm -f /tmp/memtest' 2>&1 | grep real | awk '{print $2}' || echo "0m0.000s")
    
    echo "Baseline memory time: $baseline_mem_time"
    echo "Secured memory time: $secured_mem_time"
    
    # Cleanup
    docker rm -f "$baseline_container" "$secured_container" >> "$LOG_FILE" 2>&1
    echo ""
}

# Cleanup function
cleanup() {
    echo -e "${BLUE}🧹 Cleaning up test resources...${NC}"
    
    # Remove any remaining test containers
    docker ps -aq --filter "name=${TEST_CONTAINER_PREFIX}" | xargs -r docker rm -f >> "$LOG_FILE" 2>&1 || true
    
    # Remove test networks
    docker network ls --filter "name=${TEST_CONTAINER_PREFIX}" -q | xargs -r docker network rm >> "$LOG_FILE" 2>&1 || true
    
    echo -e "${GREEN}✅ Cleanup completed${NC}"
    echo "Full log available at: $LOG_FILE"
}

# Generate security report
generate_report() {
    echo -e "${BLUE}📋 Security Test Report${NC}"
    echo "=========================="
    echo "Test Date: $(date)"
    echo "Docker Version: $(docker --version)"
    echo "Image Used: $DOCKER_IMAGE"
    echo ""
    echo "For detailed logs, see: $LOG_FILE"
    echo ""
    echo -e "${GREEN}Security testing completed!${NC}"
    echo -e "${YELLOW}Review the above results and logs for any security concerns.${NC}"
}

# Main execution
main() {
    trap cleanup EXIT
    
    check_prerequisites
    prepare_images
    
    test_privilege_escalation
    test_filesystem_breakout
    test_container_escape
    test_resource_exhaustion
    test_network_isolation
    test_cross_container_isolation
    measure_performance_impact
    
    generate_report
}

# Handle command line arguments
case "${1:-run}" in
    "run")
        main
        ;;
    "clean")
        cleanup
        ;;
    "help")
        echo "Usage: $0 [run|clean|help]"
        echo "  run   - Run security penetration tests (default)"
        echo "  clean - Clean up test resources"
        echo "  help  - Show this help message"
        ;;
    *)
        echo "Unknown command: $1"
        echo "Use '$0 help' for usage information"
        exit 1
        ;;
esac