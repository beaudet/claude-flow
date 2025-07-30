/**
 * Host Attack Prevention Tests
 * Tests malicious agents attempting to attack the HOST SYSTEM
 * This is the critical security concern - preventing container-to-host attacks
 */

import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import PooledDockerExecutor, { PooledDockerConfig } from '../pooled-docker-executor';
import { TaskDefinition, AgentState } from '../types';

// HOST ATTACK TEST CONFIGURATION
const HOST_ATTACK_CONFIG = {
  enabled: process.env.HOST_ATTACK_TESTS === 'true',
  dockerAvailable: false,
  testImage: 'alpine:latest',
  tempDir: '',
  hostIP: '172.17.0.1', // Default Docker bridge gateway
};

describe('Host Attack Prevention Tests (MALICIOUS AGENTS)', () => {
  let pooledExecutor: PooledDockerExecutor;
  let testTempDir: string;
  let maliciousTask: TaskDefinition;
  let maliciousAgent: AgentState;

  beforeAll(async () => {
    // Skip if host attack tests not enabled
    if (!HOST_ATTACK_CONFIG.enabled) {
      console.log('⚠️  Host attack tests disabled. Set HOST_ATTACK_TESTS=true to enable.');
      return;
    }

    // Check if Docker is available
    try {
      await runCommand('docker', ['--version']);
      HOST_ATTACK_CONFIG.dockerAvailable = true;
      console.log('🚨 Docker detected - running host attack prevention tests');
    } catch (error) {
      console.log('❌ Docker not available - skipping host attack tests');
      return;
    }

    // Create temp directory
    testTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-host-attack-test-'));
    HOST_ATTACK_CONFIG.tempDir = testTempDir;

    // Create highly restricted configuration to prevent host attacks
    const config: Partial<PooledDockerConfig> = {
      dockerImage: HOST_ATTACK_CONFIG.testImage,
      poolSize: 1,
      warmupAgentTypes: ['malicious-agent'],
      timeoutMs: 30000,
      
      // Maximum security hardening
      readOnlyRootFs: true,
      noNewPrivileges: true,
      user: 'nobody:nobody',
      
      // Strict resource limits
      resourceLimits: {
        maxMemory: 64 * 1024 * 1024, // 64MB
        maxCpuTime: 5000, // 5 seconds
        maxDiskSpace: 50 * 1024 * 1024, // 50MB
        maxNetworkConnections: 0, // No network access
        maxFileHandles: 10,
        priority: 1,
      },
      
      // Security hardening
      securityOpts: [
        'no-new-privileges:true',
        'seccomp:unconfined', // We need to monitor syscalls
      ],
      
      // Minimal capabilities
      capabilities: {
        add: [],
        drop: ['ALL'],
      },
      
      autoScaling: false,
      logLevel: 'debug',
    };

    pooledExecutor = new PooledDockerExecutor(config);
    await pooledExecutor.initialize();

    // Create malicious task and agent
    maliciousTask = {
      id: { id: 'host-attack-001', swarmId: 'attack-swarm' },
      name: 'Malicious Host Attack Task',
      type: 'host-attack',
      description: 'Malicious agent attempting to attack host system',
      instructions: 'Execute host attack attempts',
      priority: 'high',
      status: 'pending',
      context: { attackType: 'host-compromise' },
      input: { target: 'host-system' },
      examples: [],
      requirements: {
        tools: [],
        memoryRequired: 32 * 1024 * 1024,
        maxDuration: 30000,
        minReliability: 0.1, // Malicious agents are unreliable
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

    maliciousAgent = {
      id: { id: 'malicious-agent-001', swarmId: 'attack-swarm' },
      name: 'Malicious Attack Agent',
      type: 'malicious-agent',
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
        specialization: 'host-attacks',
        trustLevel: 0.0, // Zero trust for malicious agents
        lastUpdated: new Date(),
      },
      environment: {
        nodeVersion: '20.0.0',
        platform: 'linux',
        credentials: {},
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

    // Emergency cleanup of any remaining containers
    try {
      const result = await runCommand('docker', ['ps', '-aq', '--filter', 'label=claude-flow.attack-test=true']);
      if (result.stdout.trim()) {
        await runCommand('docker', ['rm', '-f', ...result.stdout.trim().split('\n')]);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Host Filesystem Attack Prevention', () => {
    test('should block access to host root filesystem', async () => {
      if (!HOST_ATTACK_CONFIG.dockerAvailable) return;

      const filesystemAttackTask = {
        ...maliciousTask,
        name: 'Host Filesystem Attack',
        instructions: 'Attempt to access host filesystem',
      };

      // Mock malicious command that tries to access host files
      pooledExecutor['buildAgentTypeExecutionCommand'] = () => [
        'sh', '-c',
        'echo "=== HOST FILESYSTEM ATTACK ATTEMPTS ===" && ' +
        'echo "Attempting to read host /etc/passwd:" && ' +
        '(cat /etc/passwd 2>&1 | head -3) && ' +
        'echo "User count in /etc/passwd:" && ' +
        '(cat /etc/passwd 2>/dev/null | wc -l) && ' +
        'echo "Attempting to access host via /proc/1/root:" && ' +
        '(ls /proc/1/root/etc/passwd 2>&1 || echo "blocked") && ' +
        'echo "Attempting to access host via common mount points:" && ' +
        '(ls /host/etc/passwd 2>&1 || echo "no /host mount") && ' +
        '(ls /rootfs/etc/passwd 2>&1 || echo "no /rootfs mount") && ' +
        'echo "Checking for dangerous mounts:" && ' +
        'mount | grep -E "(host|root)" || echo "no dangerous mounts found"'
      ];

      const result = await pooledExecutor.executeTask(filesystemAttackTask, maliciousAgent);

      expect(result.success).toBe(true);
      
      // Should only see container's minimal /etc/passwd, not host's
      const userCount = parseInt(result.output.match(/User count in \/etc\/passwd:\s*(\d+)/)?.[1] || '999');
      expect(userCount).toBeLessThan(20); // Container should have minimal users
      
      // Should not access host filesystem
      expect(result.output).toContain('blocked');
      expect(result.output).toContain('no /host mount');
      expect(result.output).toContain('no /rootfs mount');
      expect(result.output).toContain('no dangerous mounts found');

      console.log('🛡️ Host filesystem attack prevention result:', result.output.substring(0, 300));
    });

    test('should prevent host file system writes', async () => {
      if (!HOST_ATTACK_CONFIG.dockerAvailable) return;

      const writeAttackTask = {
        ...maliciousTask,
        name: 'Host Write Attack',
        instructions: 'Attempt to write to host filesystem',
      };

      pooledExecutor['buildAgentTypeExecutionCommand'] = () => [
        'sh', '-c',
        'echo "=== HOST WRITE ATTACK ATTEMPTS ===" && ' +
        'echo "Attempting to write to root:" && ' +
        '(echo "malicious" > /evil.txt 2>&1 || echo "root write blocked") && ' +
        'echo "Attempting to write to /etc:" && ' +
        '(echo "malicious" > /etc/evil.conf 2>&1 || echo "/etc write blocked") && ' +
        'echo "Attempting to write to /usr:" && ' +
        '(echo "malicious" > /usr/bin/evil 2>&1 || echo "/usr write blocked") && ' +
        'echo "Testing /tmp write (should work):" && ' +
        '(echo "test" > /tmp/test.txt && echo "/tmp write allowed" || echo "/tmp write failed") && ' +
        'echo "Attempting to modify system files:" && ' +
        '(echo "hacked" >> /etc/passwd 2>&1 || echo "passwd modification blocked")'
      ];

      const result = await pooledExecutor.executeTask(writeAttackTask, maliciousAgent);

      expect(result.success).toBe(true);
      expect(result.output).toContain('root write blocked');
      expect(result.output).toContain('/etc write blocked');
      expect(result.output).toContain('/usr write blocked');
      expect(result.output).toContain('passwd modification blocked');
      
      // /tmp should be writable (but with noexec)
      expect(result.output).toContain('/tmp write allowed');

      console.log('📝 Host write attack prevention result:', result.output.substring(0, 300));
    });
  });

  describe('Docker Socket Attack Prevention', () => {
    test('should prevent Docker daemon access', async () => {
      if (!HOST_ATTACK_CONFIG.dockerAvailable) return;

      const dockerAttackTask = {
        ...maliciousTask,
        name: 'Docker Socket Attack',
        instructions: 'Attempt to access Docker daemon',
      };

      pooledExecutor['buildAgentTypeExecutionCommand'] = () => [
        'sh', '-c',
        'echo "=== DOCKER SOCKET ATTACK ATTEMPTS ===" && ' +
        'echo "Checking for Docker socket:" && ' +
        '(ls -la /var/run/docker.sock 2>&1 || echo "docker socket not accessible") && ' +
        'echo "Attempting docker commands:" && ' +
        '(docker ps 2>&1 || echo "docker command blocked") && ' +
        'echo "Attempting to create containers:" && ' +
        '(docker run hello-world 2>&1 || echo "container creation blocked") && ' +
        'echo "Checking container information:" && ' +
        '(cat /proc/self/cgroup | grep docker | head -1 || echo "no docker cgroup info") && ' +
        'echo "Attempting to access Docker API:" && ' +
        '(curl -s --unix-socket /var/run/docker.sock http://localhost/containers/json 2>&1 || echo "docker api blocked")'
      ];

      const result = await pooledExecutor.executeTask(dockerAttackTask, maliciousAgent);

      expect(result.success).toBe(true);
      expect(result.output).toContain('docker socket not accessible');
      expect(result.output).toContain('docker command blocked');
      expect(result.output).toContain('container creation blocked');
      expect(result.output).toContain('docker api blocked');

      console.log('🐋 Docker socket attack prevention result:', result.output.substring(0, 300));
    });
  });

  describe('Host Network Attack Prevention', () => {
    test('should restrict host network access', async () => {
      if (!HOST_ATTACK_CONFIG.dockerAvailable) return;

      const networkAttackTask = {
        ...maliciousTask,
        name: 'Host Network Attack',
        instructions: 'Attempt to attack host network services',
      };

      pooledExecutor['buildAgentTypeExecutionCommand'] = () => [
        'sh', '-c',
        'echo "=== HOST NETWORK ATTACK ATTEMPTS ===" && ' +
        'echo "Attempting to ping host:" && ' +
        '(timeout 3 ping -c 1 ' + HOST_ATTACK_CONFIG.hostIP + ' 2>&1 || echo "host ping blocked") && ' +
        'echo "Scanning for host SSH:" && ' +
        '(timeout 2 nc -z ' + HOST_ATTACK_CONFIG.hostIP + ' 22 2>&1 || echo "ssh port blocked") && ' +
        'echo "Scanning common ports:" && ' +
        'for port in 21 22 23 25 80 443 3306 5432; do ' +
        '  timeout 1 nc -z ' + HOST_ATTACK_CONFIG.hostIP + ' $port 2>/dev/null && echo "Port $port accessible" || true; ' +
        'done && ' +
        'echo "Network scanning complete" && ' +
        'echo "Checking for network tools:" && ' +
        '(command -v nmap && echo "nmap available" || echo "nmap blocked") && ' +
        '(command -v netcat && echo "netcat available" || echo "netcat blocked")'
      ];

      const result = await pooledExecutor.executeTask(networkAttackTask, maliciousAgent);

      expect(result.success).toBe(true);
      
      // Network access should be limited/blocked
      expect(result.output).toContain('Network scanning complete');
      expect(result.output).toContain('nmap blocked');

      // Log accessible ports for security review
      const accessiblePorts = result.output.match(/Port (\d+) accessible/g);
      if (accessiblePorts) {
        console.warn('⚠️ Host ports accessible from container:', accessiblePorts);
      }

      console.log('🌐 Host network attack prevention result:', result.output.substring(0, 300));
    });

    test('should prevent network reconnaissance', async () => {
      if (!HOST_ATTACK_CONFIG.dockerAvailable) return;

      const reconTask = {
        ...maliciousTask,
        name: 'Network Reconnaissance Attack',
        instructions: 'Attempt network reconnaissance',
      };

      pooledExecutor['buildAgentTypeExecutionCommand'] = () => [
        'sh', '-c',
        'echo "=== NETWORK RECONNAISSANCE ATTEMPTS ===" && ' +
        'echo "Container network info:" && ' +
        '(ip addr show 2>&1 | grep inet || echo "network info limited") && ' +
        'echo "Attempting to discover other containers:" && ' +
        'for i in $(seq 2 10); do ' +
        '  timeout 1 ping -c 1 172.17.0.$i 2>/dev/null && echo "Container 172.17.0.$i found" || true; ' +
        'done && ' +
        'echo "Container discovery complete" && ' +
        'echo "Checking routing table:" && ' +
        '(route -n 2>&1 || ip route 2>&1 || echo "routing info blocked")'
      ];

      const result = await pooledExecutor.executeTask(reconTask, maliciousAgent);

      expect(result.success).toBe(true);
      expect(result.output).toContain('Container discovery complete');

      // Log discovered containers for security review
      const discoveredContainers = result.output.match(/Container 172\.17\.0\.\d+ found/g);
      if (discoveredContainers && discoveredContainers.length > 0) {
        console.warn('⚠️ Other containers discoverable:', discoveredContainers);
      }

      console.log('🔍 Network reconnaissance prevention result:', result.output.substring(0, 300));
    });
  });

  describe('Host Process Attack Prevention', () => {
    test('should isolate container processes from host', async () => {
      if (!HOST_ATTACK_CONFIG.dockerAvailable) return;

      const processAttackTask = {
        ...maliciousTask,
        name: 'Host Process Attack',
        instructions: 'Attempt to access host processes',
      };

      pooledExecutor['buildAgentTypeExecutionCommand'] = () => [
        'sh', '-c',
        'echo "=== HOST PROCESS ATTACK ATTEMPTS ===" && ' +
        'echo "Process list:" && ' +
        '(ps aux | wc -l) && ' +
        'echo "Checking PID 1:" && ' +
        '(cat /proc/1/comm 2>&1 || echo "pid 1 info blocked") && ' +
        'echo "Attempting to signal PID 1:" && ' +
        '(kill -0 1 2>&1 || echo "cannot signal host init") && ' +
        'echo "Checking for host processes:" && ' +
        '(ps aux | grep -E "(systemd|init|sshd|dockerd)" | head -3 || echo "no host processes visible") && ' +
        'echo "Attempting to access host process info:" && ' +
        '(ls /proc/1/exe 2>&1 || echo "host process exe blocked")'
      ];

      const result = await pooledExecutor.executeTask(processAttackTask, maliciousAgent);

      expect(result.success).toBe(true);
      expect(result.output).toContain('cannot signal host init');
      expect(result.output).toContain('host process exe blocked');

      // Check process isolation - should see very few processes
      const processCount = parseInt(result.output.match(/Process list:\s*(\d+)/)?.[1] || '999');
      expect(processCount).toBeLessThan(20); // Container should have minimal processes

      console.log('⚙️ Host process attack prevention result:', result.output.substring(0, 300));
    });
  });

  describe('Malicious Code Execution Prevention', () => {
    test('should prevent malicious script execution', async () => {
      if (!HOST_ATTACK_CONFIG.dockerAvailable) return;

      const codeAttackTask = {
        ...maliciousTask,
        name: 'Malicious Code Execution',
        instructions: 'Attempt to execute malicious code',
      };

      pooledExecutor['buildAgentTypeExecutionCommand'] = () => [
        'sh', '-c',
        'echo "=== MALICIOUS CODE EXECUTION ATTEMPTS ===" && ' +
        'echo "Attempting to create executable in /tmp:" && ' +
        '(echo "#!/bin/sh\\necho PWNED" > /tmp/malware && chmod +x /tmp/malware && echo "executable created") && ' +
        'echo "Attempting to execute malware:" && ' +
        '(/tmp/malware 2>&1 || echo "execution blocked by noexec") && ' +
        'echo "Testing script interpretation:" && ' +
        '(echo "echo SCRIPT_EXEC" | sh 2>&1) && ' +
        'echo "Checking available interpreters:" && ' +
        'for interp in python python3 perl ruby node java; do ' +
        '  command -v $interp >/dev/null && echo "$interp available" || true; ' +
        'done && ' +
        'echo "Interpreter check complete"'
      ];

      const result = await pooledExecutor.executeTask(codeAttackTask, maliciousAgent);

      expect(result.success).toBe(true);
      
      // Executable creation might work, but execution should be blocked
      if (result.output.includes('executable created')) {
        expect(result.output).toContain('execution blocked by noexec');
      }
      
      expect(result.output).toContain('Interpreter check complete');

      // Log available interpreters for security review
      const availableInterpreters = result.output.match(/(\w+) available/g);
      if (availableInterpreters && availableInterpreters.length > 0) {
        console.warn('⚠️ Interpreters available for code execution:', availableInterpreters);
      }

      console.log('💀 Malicious code execution prevention result:', result.output.substring(0, 300));
    });
  });

  describe('Resource-based Host Attack Prevention', () => {
    test('should prevent resource exhaustion attacks', async () => {
      if (!HOST_ATTACK_CONFIG.dockerAvailable) return;

      const resourceAttackTask = {
        ...maliciousTask,
        name: 'Resource Exhaustion Attack',
        instructions: 'Attempt to exhaust host resources',
      };

      pooledExecutor['buildAgentTypeExecutionCommand'] = () => [
        'sh', '-c',
        'echo "=== RESOURCE EXHAUSTION ATTACK ATTEMPTS ===" && ' +
        'echo "Attempting memory bomb:" && ' +
        '(timeout 5 dd if=/dev/zero of=/dev/shm/membomb bs=1M count=100 2>&1 || echo "memory bomb blocked") && ' +
        'echo "Attempting disk bomb:" && ' +
        '(timeout 5 dd if=/dev/zero of=/tmp/diskbomb bs=1M count=100 2>&1 || echo "disk bomb blocked") && ' +
        'echo "Attempting fork bomb:" && ' +
        '(timeout 3 sh -c ":(){ :|:& };:" 2>&1 || echo "fork bomb blocked") && ' +
        'echo "Resource attack attempts complete"'
      ];

      const result = await pooledExecutor.executeTask(resourceAttackTask, maliciousAgent);

      expect(result.success).toBe(true);
      expect(result.output).toContain('Resource attack attempts complete');
      
      // Resource limits should prevent these attacks
      expect(result.output).toMatch(/(memory bomb blocked|disk bomb blocked|fork bomb blocked)/);

      console.log('💥 Resource attack prevention result:', result.output.substring(0, 300));
    });
  });

  describe('Container Escape Prevention', () => {
    test('should prevent common container escape techniques', async () => {
      if (!HOST_ATTACK_CONFIG.dockerAvailable) return;

      const escapeTask = {
        ...maliciousTask,
        name: 'Container Escape Attempt',
        instructions: 'Attempt to escape container isolation',
      };

      pooledExecutor['buildAgentTypeExecutionCommand'] = () => [
        'sh', '-c',
        'echo "=== CONTAINER ESCAPE ATTEMPTS ===" && ' +
        'echo "Attempting /proc/self/root escape:" && ' +
        '(ls /proc/self/root/etc/passwd 2>&1 || echo "proc escape blocked") && ' +
        'echo "Attempting cgroup manipulation:" && ' +
        '(echo $$ > /sys/fs/cgroup/cgroup.procs 2>&1 || echo "cgroup escape blocked") && ' +
        'echo "Checking device access:" && ' +
        '(ls /dev/ | grep -E "^(dm-|loop|sd)" || echo "no dangerous devices") && ' +
        'echo "Attempting capability usage:" && ' +
        '(capsh --print 2>&1 || echo "capability info blocked") && ' +
        'echo "Container escape attempts complete"'
      ];

      const result = await pooledExecutor.executeTask(escapeTask, maliciousAgent);

      expect(result.success).toBe(true);
      expect(result.output).toContain('proc escape blocked');
      expect(result.output).toContain('cgroup escape blocked');
      expect(result.output).toContain('no dangerous devices');
      expect(result.output).toContain('Container escape attempts complete');

      console.log('🚪 Container escape prevention result:', result.output.substring(0, 300));
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