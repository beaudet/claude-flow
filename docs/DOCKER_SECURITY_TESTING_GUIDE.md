# Docker Security Testing Guide

This guide covers comprehensive testing strategies for the claude-flow Docker security implementation, including both the basic `DockerizedTaskExecutor` and the optimized `PooledDockerExecutor`.

## 🧪 Testing Architecture Overview

### Test Categories
1. **Unit Tests** - Mocked Docker commands, fast execution
2. **Integration Tests** - Real Docker containers, security validation
3. **Penetration Tests** - Attempts to break security constraints
4. **Performance Tests** - Real-world performance measurement
5. **Security Validation** - Configuration and isolation verification

## 📋 Available Test Suites

### 1. Unit Tests (Fast, Mocked)

#### Docker Security Validation Tests
```bash
# Run basic security configuration tests
npm test -- src/swarm/__tests__/docker-security-validation.test.ts

# Expected: 13/13 tests passing
# Tests: Security scoring, resource parsing, configuration validation
```

**Coverage:**
- ✅ Docker argument generation
- ✅ Security configuration validation
- ✅ Resource limit parsing
- ✅ Performance vs security trade-off analysis
- ✅ Container isolation configuration

#### Pooled Docker Executor Tests  
```bash
# Run pooled container management tests
npm test -- src/swarm/__tests__/pooled-docker-executor.test.ts

# Expected: 25+ tests covering pool management
# Tests: Pool initialization, health monitoring, auto-scaling
```

**Coverage:**
- ✅ Container pool initialization
- ✅ Agent type isolation
- ✅ Health monitoring simulation
- ✅ Auto-scaling logic
- ✅ Resource management
- ✅ Error handling and resilience

### 2. Integration Tests (Real Containers)

#### Security Integration Tests
```bash
# Enable real Docker integration tests
export DOCKER_INTEGRATION_TESTS=true

# Run comprehensive security validation
npm test -- src/swarm/__tests__/pooled-docker-security-integration.test.ts
```

**Security Tests Performed:**
- 🔒 **Privilege Escalation Prevention** - Attempts sudo, su, setuid access
- 📁 **Filesystem Isolation** - Tests read-only root, host access prevention
- 🖥️ **Container Escape Prevention** - Tests /proc/self/root, cgroup escape
- 💾 **Resource Limits Enforcement** - Memory/CPU exhaustion attempts
- 🌐 **Network Isolation** - Cross-container communication tests
- 🚪 **Container Breakout** - Common escape technique attempts

### 3. Penetration Testing (Real Security Attacks)

#### Security Penetration Script
```bash
# Run comprehensive security penetration tests
./scripts/docker-security-penetration-test.sh

# Tests performed:
# - Privilege escalation attempts
# - Filesystem breakout attempts  
# - Container escape techniques
# - Resource exhaustion attacks
# - Network isolation validation
# - Cross-container communication tests
```

**Example Output:**
```
🔒 Claude-Flow Docker Security Penetration Testing

🔬 Test 1: Privilege Escalation Prevention
Testing privilege escalation attempts...
✅ sudo access blocked
✅ su access blocked  
✅ No setuid programs accessible

🔬 Test 2: Filesystem Breakout Prevention
Testing filesystem write attempts...
✅ Root filesystem read-only
✅ /etc protected
✅ /usr protected
✅ /tmp writable (expected)
✅ tmpfs execution blocked

🔬 Test 3: Container Escape Prevention
Testing container escape techniques...
✅ /proc/self/root escape blocked
✅ cgroup escape blocked
✅ Dangerous devices blocked
✅ Kernel module loading blocked
```

### 4. Performance Testing (Real Benchmarks)

#### Performance Comparison Script
```bash
# Run standard performance tests (10 iterations)
./scripts/pooled-docker-performance-test.sh

# Quick test (3 iterations)
./scripts/pooled-docker-performance-test.sh quick

# Comprehensive test (20 iterations)  
./scripts/pooled-docker-performance-test.sh full
```

**Performance Metrics Measured:**
- 🚀 **Fresh Container Startup** - Full container creation + execution time
- 🏊 **Pooled Container Execution** - Execution in pre-warmed containers
- 🔄 **Concurrent Execution** - Multiple agents running simultaneously
- ❤️ **Health Monitoring** - Container health check overhead

**Example Results:**
```
📊 Performance Analysis
======================
Performance Comparison:
  Fresh container average: 2156ms
  Pooled container average: 127ms  
  ✅ Improvement factor: 17x faster
  ✅ Overhead reduction: 94%
  
✅ EXCELLENT: Pooling provides significant performance improvement
```

## 🔧 Testing Configuration

### Environment Variables
```bash
# Enable real Docker integration tests
export DOCKER_INTEGRATION_TESTS=true

# Configure test parameters
export DOCKER_IMAGE=alpine:latest
export TEST_ITERATIONS=10
export POOL_SIZE=3
```

### Docker Requirements
```bash
# Verify Docker is available
docker --version
docker info

# Pull required test images
docker pull alpine:latest
```

## 🛡️ Security Test Scenarios

### Privilege Escalation Tests
```bash
# Test commands executed in containers:
sudo whoami                    # Should fail
su -                          # Should fail  
find / -perm -4000            # Should find no setuid binaries
modprobe overlay              # Should fail (no module loading)
```

### Filesystem Isolation Tests
```bash
# Test commands executed in containers:
echo "test" > /test.txt        # Should fail (read-only root)
echo "test" > /etc/passwd      # Should fail (protected system files)
echo "test" > /tmp/test.txt    # Should work (tmpfs writable)
/tmp/executable                # Should fail (tmpfs noexec)
```

### Container Escape Tests
```bash
# Test commands executed in containers:
ls /proc/self/root/etc/passwd  # Should fail (no host access)
echo $$ > /sys/fs/cgroup/cgroup.procs  # Should fail (cgroup protection)
ls /dev/ | grep -E "dm-|loop|sd"       # Should find no dangerous devices
```

### Network Isolation Tests
```bash
# Test commands executed in containers:
ping -c1 8.8.8.8              # May work (external connectivity)
ping -c1 172.17.0.1           # Should fail (host network blocked)
nmap -sn 172.17.0.0/16        # Should fail (no scanning tools)
```

## 📊 Performance Test Scenarios

### Startup Time Comparison
```typescript
// Fresh container workflow:
// 1. docker create (800ms)
// 2. docker start (400ms)  
// 3. docker exec (200ms)
// Total: ~1400ms

// Pooled container workflow:
// 1. docker exec (100ms) - container already running
// Total: ~100ms  
// Improvement: 14x faster
```

### Concurrent Execution Tests
```bash
# Tests multiple agent types simultaneously:
# - 2 concurrent containers: ~500ms
# - 4 concurrent containers: ~800ms  
# - 8 concurrent containers: ~1200ms
# Validates scaling characteristics
```

### Resource Usage Analysis
```bash
# Memory usage per container:
# - Base container: ~64MB
# - With security hardening: ~80MB
# - Pool of 10 containers: ~800MB total

# CPU usage patterns:
# - Container creation: High spike
# - Pooled execution: Consistent low usage
# - Health monitoring: <1% overhead
```

## 🚨 Security Violation Detection

### Expected Security Failures
When tests work correctly, you should see these **blocked attempts**:

```bash
✅ sudo access blocked          # No privilege escalation
✅ /etc write blocked          # System files protected  
✅ container escape blocked    # No breakout possible
✅ cross-container blocked     # Agent isolation maintained
✅ host filesystem blocked    # No host access
✅ dangerous devices blocked  # No hardware access
```

### Security Breach Indicators
If you see any of these, **security is compromised**:

```bash
❌ SECURITY BREACH: sudo access allowed
❌ SECURITY BREACH: Root filesystem writable  
❌ SECURITY BREACH: Container escape possible
❌ SECURITY BREACH: Cross-container communication allowed
❌ SECURITY BREACH: Host filesystem accessible
```

## 🔄 Continuous Testing Strategy

### Development Workflow
```bash
# 1. Run fast unit tests during development
npm test -- src/swarm/__tests__/docker-security-validation.test.ts

# 2. Run integration tests before commits  
export DOCKER_INTEGRATION_TESTS=true
npm test -- src/swarm/__tests__/pooled-docker-security-integration.test.ts

# 3. Run penetration tests weekly
./scripts/docker-security-penetration-test.sh

# 4. Run performance tests for optimization
./scripts/pooled-docker-performance-test.sh
```

### CI/CD Integration
```yaml
# Example GitHub Actions workflow
name: Docker Security Tests
on: [push, pull_request]

jobs:
  security-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      # Unit tests (always run)
      - name: Run Unit Tests
        run: npm test -- src/swarm/__tests__/docker-security-validation.test.ts
      
      # Integration tests (if Docker available)
      - name: Run Integration Tests  
        env:
          DOCKER_INTEGRATION_TESTS: true
        run: npm test -- src/swarm/__tests__/pooled-docker-security-integration.test.ts
      
      # Penetration tests (scheduled)
      - name: Run Penetration Tests
        if: github.event_name == 'schedule'
        run: ./scripts/docker-security-penetration-test.sh
```

## 📈 Performance Benchmarking

### Baseline Measurements
Establish baseline performance for your environment:

```bash
# Measure your baseline
./scripts/pooled-docker-performance-test.sh full > baseline-results.txt

# Expected ranges:
# Fresh container: 1000-3000ms (depends on system)
# Pooled container: 50-200ms (should be consistent)
# Improvement factor: 5-20x (higher is better)
```

### Regression Testing
```bash
# Compare against baseline
./scripts/pooled-docker-performance-test.sh > current-results.txt

# Alert if performance degrades >20%
# Alert if security tests start failing
```

## 🐛 Troubleshooting Test Issues

### Common Test Failures

#### Docker Not Available
```bash
❌ Docker not found
❌ Docker daemon not running

# Solutions:
sudo systemctl start docker
docker --version
docker info
```

#### Permission Issues
```bash
❌ Permission denied accessing Docker

# Solutions:  
sudo usermod -aG docker $USER
newgrp docker
```

#### Container Creation Failures
```bash
❌ Failed to create container

# Check Docker logs:
docker logs <container-name>

# Check system resources:
df -h          # Disk space
free -h        # Memory 
docker system df   # Docker space usage
```

#### Test Timeouts
```bash
❌ Tests timing out

# Increase timeout:
export TEST_TIMEOUT=60000

# Reduce test iterations:
export TEST_ITERATIONS=3
```

### Performance Test Debugging
```bash
# Enable verbose logging
export DEBUG=true
./scripts/pooled-docker-performance-test.sh

# Check Docker system performance
docker system events &
./scripts/pooled-docker-performance-test.sh
```

### Security Test Debugging
```bash
# Check container security settings
docker inspect <container-name> | grep -A20 SecurityOpt

# Verify capabilities are dropped
docker exec <container-name> cat /proc/self/status | grep Cap

# Check filesystem mount options
docker exec <container-name> mount | grep -E "(ro|noexec|nosuid)"
```

## 📋 Test Reporting

### Automated Reports
```bash
# Generate JSON performance report
./scripts/pooled-docker-performance-test.sh > /tmp/perf-report.json

# Generate security test report  
./scripts/docker-security-penetration-test.sh > /tmp/security-report.txt
```

### Custom Test Integration
```typescript
// Example custom test
import PooledDockerExecutor from '../pooled-docker-executor';

describe('Custom Security Tests', () => {
  test('should prevent specific threat', async () => {
    const executor = new PooledDockerExecutor({
      dockerImage: 'custom-test-image',
      readOnlyRootFs: true,
    });
    
    // Your custom security test logic
    const result = await executor.executeTask(maliciousTask, agent);
    expect(result.output).not.toContain('COMPROMISED');
  });
});
```

## 🎯 Testing Best Practices

### Security Testing
1. **Always test in isolated environments** - Never run penetration tests in production
2. **Test realistic attack scenarios** - Use actual malicious commands
3. **Verify defense in depth** - Multiple security layers should all block attacks
4. **Monitor for bypasses** - Security research evolves, update tests regularly

### Performance Testing  
1. **Establish baselines** - Know your normal performance characteristics
2. **Test under load** - Concurrent execution patterns matter
3. **Measure real workloads** - Use actual claude-flow agent tasks
4. **Account for cold starts** - Include container initialization costs

### Integration Testing
1. **Use real Docker** - Mocked tests can't catch all issues
2. **Test failure scenarios** - What happens when Docker is unavailable?
3. **Validate cleanup** - Ensure no resource leaks
4. **Test at scale** - Pool sizes that match production usage

This comprehensive testing strategy ensures that the Docker security implementation provides robust protection while maintaining excellent performance characteristics.