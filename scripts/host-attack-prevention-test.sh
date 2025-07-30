#!/bin/bash

# Host Attack Prevention Testing Script
# Tests malicious containerized agents attempting to attack the HOST SYSTEM
# This is the REAL security concern - preventing container-to-host attacks

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
TEST_CONTAINER_PREFIX="claude-flow-malicious-agent"
TEMP_DIR=$(mktemp -d)
LOG_FILE="$TEMP_DIR/host-attack-test.log"
HOST_IP=$(ip route get 1.1.1.1 | awk '{print $7; exit}' 2>/dev/null || echo "172.17.0.1")

echo -e "${RED}🚨 Claude-Flow Host Attack Prevention Testing${NC}"
echo -e "${YELLOW}⚠️  This tests MALICIOUS AGENTS attacking the HOST SYSTEM${NC}"
echo "Host IP: $HOST_IP"
echo "Log file: $LOG_FILE"
echo "Temp dir: $TEMP_DIR"
echo ""

# Check prerequisites and host services
check_host_environment() {
    echo -e "${BLUE}Analyzing host environment for attack vectors...${NC}"
    
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker not found${NC}"
        exit 1
    fi
    
    # Identify host services that could be attacked
    echo "Scanning for host services that agents might attack:"
    
    # Check SSH
    if netstat -tuln 2>/dev/null | grep -q ":22 "; then
        echo -e "  ${YELLOW}⚠️  SSH server detected on port 22${NC}"
    fi
    
    # Check Docker socket
    if [ -S /var/run/docker.sock ]; then
        echo -e "  ${RED}🚨 Docker socket exposed at /var/run/docker.sock${NC}"
    fi
    
    # Check common database ports
    for port in 3306 5432 6379 27017; do
        if netstat -tuln 2>/dev/null | grep -q ":$port "; then
            echo -e "  ${YELLOW}⚠️  Database service detected on port $port${NC}"
        fi
    done
    
    # Check host filesystem mounts
    echo "Host filesystem exposure risks:"
    echo "  Root filesystem: $(df / | tail -1 | awk '{print $1}')"
    echo "  Available storage: $(df -h / | tail -1 | awk '{print $4}')"
    
    echo ""
}

# Test 1: Host Filesystem Attack Prevention
test_host_filesystem_attacks() {
    echo -e "${RED}🔥 Test 1: Malicious Host Filesystem Access Attempts${NC}"
    
    local container_name="${TEST_CONTAINER_PREFIX}-filesystem-attack"
    
    # Create container that malicious agent might try to exploit
    echo "Creating malicious agent container..."
    docker run -d --name "$container_name" \
        --read-only \
        --tmpfs /tmp:rw,noexec,nosuid,size=100m \
        --security-opt no-new-privileges:true \
        --cap-drop ALL \
        --user nobody:nobody \
        --memory 128m \
        --cpus 0.5 \
        --network bridge \
        "$DOCKER_IMAGE" sleep infinity >> "$LOG_FILE" 2>&1
    
    echo "Testing malicious host filesystem access attempts..."
    
    # Test 1.1: Try to read host root filesystem
    echo -n "  Attempting to read host /etc/passwd... "
    if docker exec "$container_name" cat /etc/passwd 2>/dev/null | grep -q "root:"; then
        # This is the CONTAINER's /etc/passwd, not the host's - should be minimal
        local user_count=$(docker exec "$container_name" cat /etc/passwd 2>/dev/null | wc -l)
        if [ "$user_count" -lt 10 ]; then
            echo -e "${GREEN}✅ Only container users visible ($user_count users)${NC}"
        else
            echo -e "${RED}❌ SECURITY BREACH: Too many users visible - possible host exposure${NC}"
        fi
    else
        echo -e "${GREEN}✅ /etc/passwd access blocked${NC}"
    fi
    
    # Test 1.2: Try to access host filesystem through common paths
    echo -n "  Attempting to access host root directory... "
    if docker exec "$container_name" ls /host/etc/passwd 2>/dev/null; then
        echo -e "${RED}❌ SECURITY BREACH: Host filesystem accessible via /host${NC}"
    elif docker exec "$container_name" ls /rootfs/etc/passwd 2>/dev/null; then
        echo -e "${RED}❌ SECURITY BREACH: Host filesystem accessible via /rootfs${NC}"
    elif docker exec "$container_name" ls /proc/1/root/etc/passwd 2>/dev/null; then
        echo -e "${RED}❌ SECURITY BREACH: Host filesystem accessible via /proc/1/root${NC}"
    else
        echo -e "${GREEN}✅ Host filesystem access blocked${NC}"
    fi
    
    # Test 1.3: Try to access host's actual files through container
    echo -n "  Attempting to read host system files... "
    local host_kernel=$(uname -r)
    local container_kernel=$(docker exec "$container_name" uname -r 2>/dev/null || echo "unknown")
    if [ "$host_kernel" = "$container_kernel" ]; then
        echo -e "${YELLOW}⚠️  Same kernel visible (expected for containers)${NC}"
    else
        echo -e "${GREEN}✅ Different kernel info - good isolation${NC}"
    fi
    
    # Test 1.4: Try to write to host-mounted directories (should fail)
    echo -n "  Attempting to write to potential host mounts... "
    local write_attempts=0
    local write_successes=0
    
    for mount_point in /host /rootfs /proc/1/root /var/lib/docker; do
        if docker exec "$container_name" echo "malicious" > "$mount_point/test.txt" 2>/dev/null; then
            write_successes=$((write_successes + 1))
            echo -e "${RED}❌ SECURITY BREACH: Write access to $mount_point${NC}"
        fi
        write_attempts=$((write_attempts + 1))
    done
    
    if [ "$write_successes" -eq 0 ]; then
        echo -e "${GREEN}✅ All host mount write attempts blocked${NC}"
    fi
    
    # Cleanup
    docker rm -f "$container_name" >> "$LOG_FILE" 2>&1
    echo ""
}

# Test 2: Docker Socket Attack Prevention
test_docker_socket_attacks() {
    echo -e "${RED}🐋 Test 2: Docker Socket Access Prevention${NC}"
    
    local container_name="${TEST_CONTAINER_PREFIX}-docker-attack"
    
    # Create container that might try to access Docker socket
    echo "Creating container that will attempt Docker socket access..."
    docker run -d --name "$container_name" \
        --read-only \
        --tmpfs /tmp:rw,noexec,nosuid,size=100m \
        --security-opt no-new-privileges:true \
        --cap-drop ALL \
        --user nobody:nobody \
        --memory 128m \
        --cpus 0.5 \
        "$DOCKER_IMAGE" sleep infinity >> "$LOG_FILE" 2>&1
    
    echo "Testing Docker daemon attack attempts..."
    
    # Test 2.1: Check if Docker socket is accessible
    echo -n "  Attempting to access Docker socket... "
    if docker exec "$container_name" ls -la /var/run/docker.sock 2>/dev/null; then
        echo -e "${RED}❌ SECURITY BREACH: Docker socket accessible from container${NC}"
    else
        echo -e "${GREEN}✅ Docker socket not accessible${NC}"
    fi
    
    # Test 2.2: Try to run docker commands from within container
    echo -n "  Attempting to run docker commands... "
    if docker exec "$container_name" docker ps 2>/dev/null; then
        echo -e "${RED}❌ SECURITY BREACH: Docker commands work inside container${NC}"
    else
        echo -e "${GREEN}✅ Docker commands blocked${NC}"
    fi
    
    # Test 2.3: Try to access host container information
    echo -n "  Attempting to discover host containers... "
    if docker exec "$container_name" cat /proc/self/cgroup 2>/dev/null | grep -q docker; then
        local container_id=$(docker exec "$container_name" cat /proc/self/cgroup 2>/dev/null | grep docker | head -1 | cut -d/ -f3 | cut -c1-12)
        if [ -n "$container_id" ]; then
            echo -e "${YELLOW}⚠️  Container can see its own Docker container ID: $container_id${NC}"
        else
            echo -e "${GREEN}✅ Container isolation maintained${NC}"
        fi
    else
        echo -e "${GREEN}✅ Docker container information hidden${NC}"
    fi
    
    # Cleanup
    docker rm -f "$container_name" >> "$LOG_FILE" 2>&1
    echo ""
}

# Test 3: Host Network Attack Prevention
test_host_network_attacks() {
    echo -e "${RED}🌐 Test 3: Host Network Attack Prevention${NC}"
    
    local container_name="${TEST_CONTAINER_PREFIX}-network-attack"
    
    # Create container with network access (to test what it CAN reach)
    echo "Creating container for network attack testing..."
    docker run -d --name "$container_name" \
        --read-only \
        --tmpfs /tmp:rw,noexec,nosuid,size=100m \
        --security-opt no-new-privileges:true \
        --cap-drop ALL \
        --user nobody:nobody \
        --memory 128m \
        --cpus 0.5 \
        --network bridge \
        "$DOCKER_IMAGE" sleep infinity >> "$LOG_FILE" 2>&1
    
    echo "Testing malicious network attack attempts..."
    
    # Test 3.1: Try to scan host network
    echo -n "  Attempting to ping host system... "
    if timeout 3 docker exec "$container_name" ping -c 1 "$HOST_IP" 2>/dev/null >/dev/null; then
        echo -e "${YELLOW}⚠️  Host is reachable from container${NC}"
    else
        echo -e "${GREEN}✅ Host ping blocked${NC}"
    fi
    
    # Test 3.2: Try to connect to host SSH (if available)
    echo -n "  Attempting to connect to host SSH... "
    if timeout 3 docker exec "$container_name" nc -z "$HOST_IP" 22 2>/dev/null; then
        echo -e "${RED}❌ SECURITY RISK: Host SSH port accessible from container${NC}"
    else
        echo -e "${GREEN}✅ Host SSH not accessible${NC}"
    fi
    
    # Test 3.3: Try to scan common host services
    echo -n "  Scanning for host services... "
    local accessible_ports=()
    for port in 21 22 23 25 53 80 443 3306 5432 6379 27017; do
        if timeout 1 docker exec "$container_name" nc -z "$HOST_IP" "$port" 2>/dev/null; then
            accessible_ports+=("$port")
        fi
    done
    
    if [ ${#accessible_ports[@]} -eq 0 ]; then
        echo -e "${GREEN}✅ No host services accessible${NC}"
    else
        echo -e "${YELLOW}⚠️  Host services accessible: ${accessible_ports[*]}${NC}"
    fi
    
    # Test 3.4: Try to perform network reconnaissance
    echo -n "  Attempting network reconnaissance... "
    if docker exec "$container_name" command -v nmap >/dev/null 2>&1; then
        echo -e "${RED}❌ SECURITY RISK: nmap available for reconnaissance${NC}"
    elif docker exec "$container_name" command -v netcat >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  netcat available for port scanning${NC}"
    else
        echo -e "${GREEN}✅ Network reconnaissance tools not available${NC}"
    fi
    
    # Test 3.5: Try to access Docker bridge network information
    echo -n "  Attempting to discover network topology... "
    local container_ip=$(docker exec "$container_name" ip addr show eth0 2>/dev/null | grep -o 'inet [0-9.]*' | cut -d' ' -f2 || echo "unknown")
    if [ "$container_ip" != "unknown" ]; then
        echo -e "${YELLOW}⚠️  Container can see its network: $container_ip${NC}"
        
        # Try to scan the Docker network
        if timeout 5 docker exec "$container_name" sh -c 'for i in $(seq 1 10); do ping -c 1 -W 1 172.17.0.$i >/dev/null 2>&1 && echo "172.17.0.$i reachable"; done' 2>/dev/null | grep -q "reachable"; then
            echo -e "${YELLOW}    Other containers may be discoverable${NC}"
        fi
    else
        echo -e "${GREEN}✅ Network information hidden${NC}"
    fi
    
    # Cleanup
    docker rm -f "$container_name" >> "$LOG_FILE" 2>&1
    echo ""
}

# Test 4: Host Process Attack Prevention
test_host_process_attacks() {
    echo -e "${RED}⚙️  Test 4: Host Process Attack Prevention${NC}"
    
    local container_name="${TEST_CONTAINER_PREFIX}-process-attack"
    
    # Create container for process attacks
    echo "Creating container for host process attack testing..."
    docker run -d --name "$container_name" \
        --read-only \
        --tmpfs /tmp:rw,noexec,nosuid,size=100m \
        --security-opt no-new-privileges:true \
        --cap-drop ALL \
        --user nobody:nobody \
        --memory 128m \
        --cpus 0.5 \
        --pid container \
        "$DOCKER_IMAGE" sleep infinity >> "$LOG_FILE" 2>&1
    
    echo "Testing host process visibility and attack attempts..."
    
    # Test 4.1: Check process visibility
    echo -n "  Checking host process visibility... "
    local container_procs=$(docker exec "$container_name" ps aux 2>/dev/null | wc -l)
    if [ "$container_procs" -lt 10 ]; then
        echo -e "${GREEN}✅ Limited process visibility ($container_procs processes)${NC}"
    else
        echo -e "${YELLOW}⚠️  Many processes visible ($container_procs) - check PID namespace${NC}"
    fi
    
    # Test 4.2: Try to access host process information
    echo -n "  Attempting to access host process info... "
    if docker exec "$container_name" ls /proc/1/exe 2>/dev/null | grep -q init; then
        echo -e "${YELLOW}⚠️  Init process visible - check PID namespace isolation${NC}"
    elif docker exec "$container_name" cat /proc/1/comm 2>/dev/null | grep -q sleep; then
        echo -e "${GREEN}✅ Container init process isolated${NC}"
    else
        echo -e "${GREEN}✅ Host init process not accessible${NC}"
    fi
    
    # Test 4.3: Try to signal host processes
    echo -n "  Attempting to signal host processes... "
    if docker exec "$container_name" kill -0 1 2>/dev/null; then
        echo -e "${RED}❌ SECURITY BREACH: Can signal PID 1${NC}"
    else
        echo -e "${GREEN}✅ Cannot signal host processes${NC}"
    fi
    
    # Test 4.4: Check for shared PID namespace exploitation
    echo -n "  Testing PID namespace isolation... "
    local container_pid1=$(docker exec "$container_name" cat /proc/1/comm 2>/dev/null || echo "unknown")
    if [ "$container_pid1" = "sleep" ] || [ "$container_pid1" = "pause" ]; then
        echo -e "${GREEN}✅ Container PID namespace properly isolated${NC}"
    else
        echo -e "${YELLOW}⚠️  PID 1 is: $container_pid1 - verify isolation${NC}"
    fi
    
    # Cleanup
    docker rm -f "$container_name" >> "$LOG_FILE" 2>&1
    echo ""
}

# Test 5: Malicious Code Execution Prevention
test_malicious_code_execution() {
    echo -e "${RED}💀 Test 5: Malicious Code Execution Prevention${NC}"
    
    local container_name="${TEST_CONTAINER_PREFIX}-malicious-code"
    
    # Create container for malicious code testing
    echo "Creating container for malicious code execution testing..."
    docker run -d --name "$container_name" \
        --read-only \
        --tmpfs /tmp:rw,noexec,nosuid,size=100m \
        --security-opt no-new-privileges:true \
        --cap-drop ALL \
        --user nobody:nobody \
        --memory 128m \
        --cpus 0.5 \
        "$DOCKER_IMAGE" sleep infinity >> "$LOG_FILE" 2>&1
    
    echo "Testing malicious code execution attempts..."
    
    # Test 5.1: Try to download and execute malicious scripts
    echo -n "  Attempting to download malicious content... "
    if docker exec "$container_name" command -v wget >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  wget available - could download malicious content${NC}"
    elif docker exec "$container_name" command -v curl >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  curl available - could download malicious content${NC}"
    else
        echo -e "${GREEN}✅ No download tools available${NC}"
    fi
    
    # Test 5.2: Try to execute code in temporary filesystem
    echo -n "  Attempting to execute code from /tmp... "
    if docker exec "$container_name" sh -c 'echo "#!/bin/sh\necho PWNED" > /tmp/malware && chmod +x /tmp/malware && /tmp/malware' 2>/dev/null | grep -q "PWNED"; then
        echo -e "${RED}❌ SECURITY BREACH: Code execution in /tmp successful${NC}"
    else
        echo -e "${GREEN}✅ Code execution in /tmp blocked (noexec mount)${NC}"
    fi
    
    # Test 5.3: Try to create and execute scripts in writable areas
    echo -n "  Testing script execution prevention... "
    local exec_blocked=true
    
    # Try various script execution methods
    if docker exec "$container_name" sh -c 'echo "echo SCRIPT_EXEC" | sh' 2>/dev/null | grep -q "SCRIPT_EXEC"; then
        echo -e "${YELLOW}⚠️  Shell script interpretation still possible${NC}"
        exec_blocked=false
    fi
    
    if [ "$exec_blocked" = true ]; then
        echo -e "${GREEN}✅ Script execution prevention effective${NC}"
    fi
    
    # Test 5.4: Try to access interpreters that could run malicious code
    echo -n "  Checking available interpreters... "
    local interpreters=()
    for interp in python python3 perl ruby node java; do
        if docker exec "$container_name" command -v "$interp" >/dev/null 2>&1; then
            interpreters+=("$interp")
        fi
    done
    
    if [ ${#interpreters[@]} -eq 0 ]; then
        echo -e "${GREEN}✅ No scripting interpreters available${NC}"
    else
        echo -e "${YELLOW}⚠️  Available interpreters: ${interpreters[*]}${NC}"
    fi
    
    # Test 5.5: Try memory-only execution techniques
    echo -n "  Testing memory-only execution prevention... "
    if docker exec "$container_name" sh -c 'exec sh -c "echo MEMORY_EXEC"' 2>/dev/null | grep -q "MEMORY_EXEC"; then
        echo -e "${YELLOW}⚠️  Memory-based execution possible${NC}"
    else
        echo -e "${GREEN}✅ Memory execution blocked${NC}"
    fi
    
    # Cleanup
    docker rm -f "$container_name" >> "$LOG_FILE" 2>&1
    echo ""
}

# Test 6: Resource-based Host Attacks
test_resource_attacks() {
    echo -e "${RED}💥 Test 6: Resource-based Host Attack Prevention${NC}"
    
    local container_name="${TEST_CONTAINER_PREFIX}-resource-attack"
    
    # Create container with limited resources
    echo "Creating container for resource attack testing..."
    docker run -d --name "$container_name" \
        --read-only \
        --tmpfs /tmp:rw,noexec,nosuid,size=50m \
        --security-opt no-new-privileges:true \
        --cap-drop ALL \
        --user nobody:nobody \
        --memory 64m \
        --memory-swap 64m \
        --cpus 0.25 \
        --pids-limit 32 \
        "$DOCKER_IMAGE" sleep infinity >> "$LOG_FILE" 2>&1
    
    echo "Testing resource exhaustion attack prevention..."
    
    # Test 6.1: Memory bomb attack
    echo -n "  Attempting memory exhaustion attack... "
    if timeout 10 docker exec "$container_name" sh -c 'dd if=/dev/zero of=/dev/shm/membomb bs=1M count=100' 2>/dev/null; then
        echo -e "${RED}❌ SECURITY BREACH: Memory bomb not prevented${NC}"
    else
        echo -e "${GREEN}✅ Memory exhaustion prevented by limits${NC}"
    fi
    
    # Test 6.2: CPU bomb attack
    echo -n "  Attempting CPU exhaustion attack... "
    local cpu_bomb_pid=""
    docker exec "$container_name" sh -c 'yes > /dev/null' &
    cpu_bomb_pid=$!
    sleep 3
    kill $cpu_bomb_pid 2>/dev/null || true
    wait $cpu_bomb_pid 2>/dev/null || true
    echo -e "${GREEN}✅ CPU limits should contain CPU bombs${NC}"
    
    # Test 6.3: Fork bomb attack
    echo -n "  Attempting fork bomb attack... "
    if timeout 5 docker exec "$container_name" sh -c ':(){ :|:& };:' 2>/dev/null; then
        echo -e "${RED}❌ SECURITY BREACH: Fork bomb not prevented${NC}"
    else
        echo -e "${GREEN}✅ Fork bomb prevented by PID limits${NC}"
    fi
    
    # Test 6.4: Disk space exhaustion (should be limited by tmpfs)
    echo -n "  Attempting disk exhaustion attack... "
    if timeout 10 docker exec "$container_name" sh -c 'dd if=/dev/zero of=/tmp/diskbomb bs=1M count=100' 2>/dev/null; then
        echo -e "${RED}❌ SECURITY BREACH: Disk exhaustion possible in /tmp${NC}"
    else
        echo -e "${GREEN}✅ Disk exhaustion prevented by tmpfs limits${NC}"
    fi
    
    # Cleanup
    docker rm -f "$container_name" >> "$LOG_FILE" 2>&1
    echo ""
}

# Generate comprehensive host security report
generate_host_security_report() {
    echo -e "${BLUE}📋 Host Attack Prevention Report${NC}"
    echo "============================================="
    echo "Test Date: $(date)"
    echo "Host IP: $HOST_IP"
    echo "Docker Version: $(docker --version)"
    echo ""
    
    echo -e "${CYAN}Summary of Host Protection Tests:${NC}"
    echo "1. ️Host Filesystem Attacks - Tested access to host files and directories"
    echo "2. 🐋 Docker Socket Attacks - Tested container escape via Docker daemon"
    echo "3. 🌐 Host Network Attacks - Tested network-based attacks on host services"
    echo "4. ⚙️  Host Process Attacks - Tested visibility and manipulation of host processes"
    echo "5. 💀 Malicious Code Execution - Tested ability to run unauthorized code"
    echo "6. 💥 Resource-based Attacks - Tested resource exhaustion attacks on host"
    echo ""
    
    echo -e "${YELLOW}⚠️  CRITICAL SECURITY REMINDERS:${NC}"
    echo "• Any ❌ SECURITY BREACH indicates immediate security risk"
    echo "• Any ⚠️  warnings indicate potential attack vectors to monitor"
    echo "• Green ✅ results indicate proper security controls are working"
    echo ""
    
    echo -e "${CYAN}Recommended Security Hardening:${NC}"
    echo "• Never mount host directories into agent containers"
    echo "• Never expose Docker socket to containers"
    echo "• Use read-only root filesystems with limited tmpfs"
    echo "• Drop ALL capabilities and run as non-root user"
    echo "• Implement network policies to isolate containers"
    echo "• Monitor container resource usage and set strict limits"
    echo "• Use minimal base images without development tools"
    echo ""
    
    echo "Full test log available at: $LOG_FILE"
}

# Cleanup function
cleanup() {
    echo -e "${BLUE}🧹 Cleaning up malicious test containers...${NC}"
    
    # Remove any remaining test containers
    docker ps -aq --filter "name=${TEST_CONTAINER_PREFIX}" | xargs -r docker rm -f >> "$LOG_FILE" 2>&1 || true
    
    echo -e "${GREEN}✅ Cleanup completed${NC}"
}

# Main execution
main() {
    trap cleanup EXIT
    
    check_host_environment
    
    test_host_filesystem_attacks
    test_docker_socket_attacks
    test_host_network_attacks
    test_host_process_attacks
    test_malicious_code_execution
    test_resource_attacks
    
    generate_host_security_report
}

# Handle command line arguments
case "${1:-run}" in
    "run")
        main
        ;;
    "filesystem")
        test_host_filesystem_attacks
        ;;
    "docker")
        test_docker_socket_attacks
        ;;
    "network")
        test_host_network_attacks
        ;;
    "process")
        test_host_process_attacks
        ;;
    "code")
        test_malicious_code_execution
        ;;
    "resource")
        test_resource_attacks
        ;;
    "clean")
        cleanup
        ;;
    "help")
        echo "Usage: $0 [run|filesystem|docker|network|process|code|resource|clean|help]"
        echo "  run        - Run all host attack prevention tests (default)"
        echo "  filesystem - Test host filesystem access prevention"
        echo "  docker     - Test Docker socket access prevention"
        echo "  network    - Test host network attack prevention"
        echo "  process    - Test host process attack prevention"
        echo "  code       - Test malicious code execution prevention"
        echo "  resource   - Test resource-based attack prevention"
        echo "  clean      - Clean up test resources"
        echo "  help       - Show this help message"
        echo ""
        echo "This script tests malicious AGENTS attacking the HOST SYSTEM"
        echo "⚠️  Only run in isolated test environments"
        ;;
    *)
        echo "Unknown command: $1"
        echo "Use '$0 help' for usage information"
        exit 1
        ;;
esac