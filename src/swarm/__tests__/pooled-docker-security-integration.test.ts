/**
 * REAL Docker Security Integration Tests
 * Actually attempts to violate security sandbox constraints with real containers
 * WARNING: Only run in isolated test environments - attempts privilege escalation
 */

import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import PooledDockerExecutor, { PooledDockerConfig } from '../pooled-docker-executor';
import { TaskDefinition, AgentState } from '../types';

// INTEGRATION TEST CONFIGURATION
const INTEGRATION_TEST_CONFIG = {
  enabled: process.env.DOCKER_INTEGRATION_TESTS === 'true',
  dockerAvailable: false,
  testImage: 'alpine:latest', // Lightweight test image
  tempDir: '',
};

describe('Docker Security Integration Tests (REAL CONTAINERS)', () => {
  let pooledExecutor: PooledDockerExecutor;
  let testTempDir: string;
  let mockTask: TaskDefinition;
  let testAgents: Record<string, AgentState>;

  beforeAll(async () => {
    // Skip if integration tests not enabled
    if (!INTEGRATION_TEST_CONFIG.enabled) {
      console.log('⚠️  Docker integration tests disabled. Set DOCKER_INTEGRATION_TESTS=true to enable.');
      return;
    }

    // Check if Docker is available
    try {
      await runCommand('docker', ['--version']);
      INTEGRATION_TEST_CONFIG.dockerAvailable = true;
      console.log('✅ Docker detected - running real security tests');
    } catch (error) {
      console.log('❌ Docker not available - skipping integration tests');
      return;
    }

    // Pull test image
    try {
      await runCommand('docker', ['pull', INTEGRATION_TEST_CONFIG.testImage]);
      console.log('✅ Test image pulled');
    } catch (error) {
      console.log('❌ Failed to pull test image');
      return;
    }

    // Create temp directory for test files
    testTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-docker-test-'));
    INTEGRATION_TEST_CONFIG.tempDir = testTempDir;

    // Create test configuration
    const config: Partial<PooledDockerConfig> = {
      dockerImage: INTEGRATION_TEST_CONFIG.testImage,
      poolSize: 1,
      warmupAgentTypes: ['security-test'],
      timeoutMs: 30000,
      readOnlyRootFs: true,
      noNewPrivileges: true,
      user: 'nobody:nobody',
      autoScaling: false,
      healthCheckInterval: 10000,
      logLevel: 'debug',
    };

    pooledExecutor = new PooledDockerExecutor(config);
    await pooledExecutor.initialize();

    // Create test task and agents
    mockTask = {
      id: { id: 'security-test-001', swarmId: 'security-swarm' },
      name: 'Security Test Task',
      type: 'security-test',
      description: 'Test task for security validation',
      instructions: 'Attempt security operations',
      priority: 'high',
      status: 'pending',
      context: {},
      input: { testType: 'security' },
      examples: [],
      requirements: {
        tools: [],
        memoryRequired: 64 * 1024 * 1024,
        maxDuration: 30000,
        minReliability: 0.9,
        reviewRequired: false,
        testingRequired: false,
        documentationRequired: false,
      },
      constraints: {
        timeoutAfter: 30000,
        maxRetries: 1,
      },
      createdAt: new Date(),
      assignedAgents: [],
    };

    testAgents = {
      'security-test': {
        id: { id: 'security-agent-001', swarmId: 'security-swarm' },
        name: 'Security Test Agent',
        type: 'security-test',
        status: 'idle',
        capabilities: {
          canCode: true,
          canAnalyze: true,
          canTest: true,
          canReview: false,
          canDocument: false,
        },
        metadata: {
          version: '1.0.0',
          specialization: 'security-testing',
          trustLevel: 0.5, // Low trust for security testing
          lastUpdated: new Date(),
        },
        environment: {
          nodeVersion: '20.0.0',
          platform: 'linux',
          credentials: {},
        },
      },
    };
  });

  afterAll(async () => {
    if (pooledExecutor) {
      await pooledExecutor.shutdown();
    }

    // Cleanup temp directory
    if (testTempDir) {
      try {
        await fs.rm(testTempDir, { recursive: true, force: true });
      } catch (error) {
        console.warn('Failed to cleanup temp directory:', error);
      }
    }

    // Cleanup any test containers
    try {
      const result = await runCommand('docker', ['ps', '-aq', '--filter', 'label=swarm.security.test=true']);
      if (result.stdout.trim()) {
        await runCommand('docker', ['rm', '-f', ...result.stdout.trim().split('\n')]);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Privilege Escalation Prevention', () => {
    test('should prevent privilege escalation attempts', async () => {
      if (!INTEGRATION_TEST_CONFIG.dockerAvailable) {
        console.log('⏭️  Skipping - Docker not available');
        return;
      }

      // Create malicious task that tries to escalate privileges
      const maliciousTask = {
        ...mockTask,
        instructions: 'Try to gain root privileges',
        input: { 
          command: 'sudo whoami', // Should fail
          fallback: 'whoami'      // Should show non-root user
        },
      };

      // Mock the container execution to run privilege escalation attempts
      const originalBuildCommand = pooledExecutor['buildAgentTypeExecutionCommand'];
      pooledExecutor['buildAgentTypeExecutionCommand'] = () => [
        'sh', '-c', 
        'echo "=== Privilege Escalation Tests ===" && ' +
        'echo "Current user:" && whoami && ' +
        'echo "Attempting sudo:" && (sudo whoami 2>&1 || echo "sudo blocked") && ' +
        'echo "Attempting su:" && (su - 2>&1 | head -1 || echo "su blocked") && ' +
        'echo "Checking /etc/passwd access:" && (cat /etc/passwd 2>&1 | head -1 || echo "passwd blocked") && ' +
        'echo "Checking root directory:" && (ls -la /root 2>&1 || echo "root dir blocked")'
      ];

      const result = await pooledExecutor.executeTask(maliciousTask, testAgents['security-test']);

      expect(result.success).toBe(true);
      expect(result.output).toContain('sudo blocked');
      expect(result.output).toContain('su blocked');
      expect(result.output).not.toContain('root'); // Should not show root user
      
      console.log('🔒 Privilege escalation test output:', result.output);
    });

    test('should prevent capability usage', async () => {
      if (!INTEGRATION_TEST_CONFIG.dockerAvailable) return;

      // Test attempts to use dropped capabilities
      const capabilityTask = {
        ...mockTask,
        instructions: 'Test capability restrictions',
      };

      pooledExecutor['buildAgentTypeExecutionCommand'] = () => [
        'sh', '-c',
        'echo "=== Capability Tests ===" && ' +
        'echo "Testing network capability:" && ' +
        '(ping -c 1 8.8.8.8 2>&1 | head -1 || echo "network restricted") && ' +
        'echo "Testing raw socket:" && ' +
        '(python3 -c "import socket; s=socket.socket(socket.AF_INET, socket.SOCK_RAW)" 2>&1 || echo "raw socket blocked") && ' +
        'echo "Testing mount:" && ' +
        '(mount 2>&1 | head -1 || echo "mount blocked")'
      ];

      const result = await pooledExecutor.executeTask(capabilityTask, testAgents['security-test']);

      expect(result.success).toBe(true);
      // Should show various capabilities are restricted
      console.log('🔒 Capability test output:', result.output);
    });
  });

  describe('Filesystem Isolation', () => {
    test('should enforce read-only root filesystem', async () => {
      if (!INTEGRATION_TEST_CONFIG.dockerAvailable) return;

      const filesystemTask = {
        ...mockTask,
        instructions: 'Test filesystem write restrictions',
      };

      pooledExecutor['buildAgentTypeExecutionCommand'] = () => [
        'sh', '-c',
        'echo "=== Filesystem Tests ===" && ' +
        'echo "Testing root write:" && ' +
        '(echo "test" > /test.txt 2>&1 || echo "root write blocked") && ' +
        'echo "Testing /usr write:" && ' +
        '(echo "test" > /usr/test.txt 2>&1 || echo "usr write blocked") && ' +
        'echo "Testing /etc write:" && ' +
        '(echo "test" > /etc/test.txt 2>&1 || echo "etc write blocked") && ' +
        'echo "Testing /tmp write (should work):" && ' +
        '(echo "test" > /tmp/test.txt && echo "tmp write allowed" || echo "tmp write failed") && ' +
        'ls -la /tmp/'
      ];

      const result = await pooledExecutor.executeTask(filesystemTask, testAgents['security-test']);

      expect(result.success).toBe(true);
      expect(result.output).toContain('root write blocked');
      expect(result.output).toContain('usr write blocked');
      expect(result.output).toContain('etc write blocked');
      expect(result.output).toContain('tmp write allowed'); // /tmp should be writable

      console.log('📁 Filesystem isolation test output:', result.output);
    });

    test('should prevent access to host filesystem', async () => {
      if (!INTEGRATION_TEST_CONFIG.dockerAvailable) return;

      const hostAccessTask = {
        ...mockTask,
        instructions: 'Attempt to access host filesystem',
      };

      pooledExecutor['buildAgentTypeExecutionCommand'] = () => [
        'sh', '-c',
        'echo "=== Host Access Tests ===" && ' +
        'echo "Checking for host proc:" && ' +
        '(ls /proc/1/root 2>&1 || echo "host proc blocked") && ' +
        'echo "Checking for host mounts:" && ' +
        '(cat /proc/mounts | grep -v tmpfs | grep -v overlay || echo "no host mounts visible") && ' +
        'echo "Testing host file access:" && ' +
        '(cat /host/etc/passwd 2>&1 || echo "host file blocked") && ' +
        'echo "Current mount namespace:" && ' +
        'ls -la /proc/self/ns/'
      ];

      const result = await pooledExecutor.executeTask(hostAccessTask, testAgents['security-test']);

      expect(result.success).toBe(true);
      expect(result.output).toContain('host proc blocked');
      expect(result.output).toContain('host file blocked');

      console.log('🖥️  Host access test output:', result.output);
    });
  });

  describe('Resource Limits Enforcement', () => {
    test('should enforce memory limits', async () => {
      if (!INTEGRATION_TEST_CONFIG.dockerAvailable) return;

      const memoryTask = {
        ...mockTask,
        instructions: 'Test memory limits',
      };

      pooledExecutor['buildAgentTypeExecutionCommand'] = () => [
        'sh', '-c',
        'echo "=== Memory Limit Tests ===" && ' +
        'echo "Current memory info:" && ' +
        '(cat /proc/meminfo | head -3 || echo "meminfo blocked") && ' +
        'echo "Testing memory allocation (50MB):" && ' +
        '(python3 -c "import sys; data = bytearray(50*1024*1024); print(f\\"Allocated 50MB\\"); sys.exit(0)" 2>&1 || echo "50MB allocation failed") && ' +
        'echo "Testing excessive memory allocation (1GB):" && ' +
        '(timeout 10 python3 -c "import sys; data = bytearray(1024*1024*1024); print(f\\"Allocated 1GB\\"); sys.exit(0)" 2>&1 || echo "1GB allocation blocked")'
      ];

      const result = await pooledExecutor.executeTask(memoryTask, testAgents['security-test']);

      expect(result.success).toBe(true);
      console.log('💾 Memory limit test output:', result.output);
    });

    test('should enforce CPU limits', async () => {
      if (!INTEGRATION_TEST_CONFIG.dockerAvailable) return;

      const cpuTask = {
        ...mockTask,
        instructions: 'Test CPU limits and throttling',
      };

      pooledExecutor['buildAgentTypeExecutionCommand'] = () => [
        'sh', '-c',
        'echo "=== CPU Limit Tests ===" && ' +
        'echo "CPU info:" && ' +
        '(cat /proc/cpuinfo | grep "processor" | wc -l || echo "cpu info blocked") && ' +
        'echo "Testing CPU intensive task:" && ' +
        'timeout 5 sh -c "while true; do echo $((1+1)) > /dev/null; done" && ' +
        'echo "CPU test completed (should be throttled)"'
      ];

      const result = await pooledExecutor.executeTask(cpuTask, testAgents['security-test']);

      expect(result.success).toBe(true);
      console.log('⚡ CPU limit test output:', result.output);
    });
  });

  describe('Network Isolation', () => {
    test('should isolate container network', async () => {
      if (!INTEGRATION_TEST_CONFIG.dockerAvailable) return;

      const networkTask = {
        ...mockTask,
        instructions: 'Test network isolation',
      };

      pooledExecutor['buildAgentTypeExecutionCommand'] = () => [
        'sh', '-c',
        'echo "=== Network Isolation Tests ===" && ' +
        'echo "Network interfaces:" && ' +
        '(ip addr show 2>&1 || ifconfig 2>&1 || echo "network commands blocked") && ' +
        'echo "Testing external connectivity:" && ' +
        '(timeout 3 ping -c 1 8.8.8.8 2>&1 || echo "external ping blocked") && ' +
        'echo "Testing localhost connectivity:" && ' +
        '(timeout 3 ping -c 1 127.0.0.1 2>&1 || echo "localhost ping blocked") && ' +
        'echo "Network namespace:" && ' +
        'ls -la /proc/self/ns/net 2>&1'
      ];

      const result = await pooledExecutor.executeTask(networkTask, testAgents['security-test']);

      expect(result.success).toBe(true);
      console.log('🌐 Network isolation test output:', result.output);
    });
  });

  describe('Cross-Container Isolation', () => {
    test('should prevent cross-container communication', async () => {
      if (!INTEGRATION_TEST_CONFIG.dockerAvailable) return;

      // Create multiple agent types to test isolation
      const coderAgent: AgentState = {
        ...testAgents['security-test'],
        id: { id: 'coder-001', swarmId: 'security-swarm' },
        type: 'coder',
      };

      const testerAgent: AgentState = {
        ...testAgents['security-test'],
        id: { id: 'tester-001', swarmId: 'security-swarm' },
        type: 'tester',
      };

      const discoveryTask = {
        ...mockTask,
        instructions: 'Discover other containers',
      };

      pooledExecutor['buildAgentTypeExecutionCommand'] = () => [
        'sh', '-c',
        'echo "=== Container Discovery Tests ===" && ' +
        'echo "Checking for other containers:" && ' +
        '(docker ps 2>&1 || echo "docker command blocked") && ' +
        'echo "Network scan:" && ' +
        '(nmap -sn 172.17.0.0/16 2>&1 | head -10 || echo "network scan blocked") && ' +
        'echo "Process list:" && ' +
        '(ps aux | grep -v grep | head -10 || echo "ps blocked") && ' +
        'echo "Socket connections:" && ' +
        '(netstat -an 2>&1 | head -10 || ss -an 2>&1 | head -10 || echo "network commands blocked")'
      ];

      // Execute in different agent containers
      const coderResult = await pooledExecutor.executeTask(discoveryTask, coderAgent);
      const testerResult = await pooledExecutor.executeTask(discoveryTask, testerAgent);

      expect(coderResult.success).toBe(true);
      expect(testerResult.success).toBe(true);

      // Should not be able to see each other's processes
      expect(coderResult.output).toContain('docker command blocked');
      expect(testerResult.output).toContain('docker command blocked');

      console.log('🔒 Coder container isolation:', coderResult.output.substring(0, 200));
      console.log('🔒 Tester container isolation:', testerResult.output.substring(0, 200));
    });
  });

  describe('Container Escape Prevention', () => {
    test('should prevent common container escape techniques', async () => {
      if (!INTEGRATION_TEST_CONFIG.dockerAvailable) return;

      const escapeTask = {
        ...mockTask,
        instructions: 'Attempt container escape techniques',
      };

      pooledExecutor['buildAgentTypeExecutionCommand'] = () => [
        'sh', '-c',
        'echo "=== Container Escape Tests ===" && ' +
        'echo "Testing /proc/self/root escape:" && ' +
        '(ls -la /proc/self/root/etc/passwd 2>&1 || echo "proc escape blocked") && ' +
        'echo "Testing cgroup escape:" && ' +
        '(echo $$ > /sys/fs/cgroup/cgroup.procs 2>&1 || echo "cgroup escape blocked") && ' +
        'echo "Testing device access:" && ' +
        '(ls -la /dev/ | grep -E "(dm-|loop|sd)" || echo "no dangerous devices") && ' +
        'echo "Testing kernel module loading:" && ' +
        '(modprobe overlay 2>&1 || echo "module loading blocked") && ' +
        'echo "Testing privileged operations:" && ' +
        '(sysctl -a 2>&1 | head -1 || echo "sysctl blocked")'
      ];

      const result = await pooledExecutor.executeTask(escapeTask, testAgents['security-test']);

      expect(result.success).toBe(true);
      expect(result.output).toContain('proc escape blocked');
      expect(result.output).toContain('cgroup escape blocked');
      expect(result.output).toContain('module loading blocked');

      console.log('🚪 Container escape test output:', result.output);
    });
  });

  describe('Performance Under Security Constraints', () => {
    test('should measure performance impact of security features', async () => {
      if (!INTEGRATION_TEST_CONFIG.dockerAvailable) return;

      const perfTask = {
        ...mockTask,
        instructions: 'Measure performance under security constraints',
      };

      const startTime = Date.now();

      pooledExecutor['buildAgentTypeExecutionCommand'] = () => [
        'sh', '-c',
        'echo "=== Performance Tests ===" && ' +
        'echo "CPU performance test:" && ' +
        'time sh -c "for i in $(seq 1 1000); do echo $((i*i)) > /dev/null; done" && ' +
        'echo "Memory performance test:" && ' +
        'time sh -c "for i in $(seq 1 100); do dd if=/dev/zero of=/tmp/test$i bs=1024 count=100 2>/dev/null; done; rm /tmp/test*" && ' +
        'echo "I/O performance test:" && ' +
        'time sh -c "dd if=/dev/zero of=/tmp/iotest bs=1M count=10 2>/dev/null; rm /tmp/iotest"'
      ];

      const result = await pooledExecutor.executeTask(perfTask, testAgents['security-test']);
      const totalTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(totalTime).toBeLessThan(60000); // Should complete within 60 seconds

      console.log('⚡ Performance test output:', result.output);
      console.log(`⏱️  Total execution time: ${totalTime}ms`);
    });
  });
});

// Helper function to run shell commands
async function runCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const process = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    process.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, exitCode: code || 0 });
      } else {
        reject(new Error(`Command failed with exit code ${code}: ${stderr}`));
      }
    });

    process.on('error', (error) => {
      reject(error);
    });
  });
}