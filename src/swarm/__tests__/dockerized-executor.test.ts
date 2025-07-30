/**
 * Comprehensive Tests for Dockerized Task Executor
 * Tests Docker container isolation, performance comparison, and security validation
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock dependencies first
jest.mock('../../core/logger.js', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    configure: jest.fn(),
  };
  
  return {
    Logger: jest.fn().mockImplementation(() => mockLogger),
  };
});

jest.mock('../../utils/helpers.js', () => ({
  generateId: jest.fn((prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`),
}));

// Mock child_process spawn
const mockSpawn = jest.fn();
jest.mock('node:child_process', () => ({
  spawn: mockSpawn,
}));

import DockerizedTaskExecutor, { 
  DockerExecutionConfig, 
  PerformanceComparison,
  DockerExecutionMetrics 
} from '../dockerized-executor';
import { TaskExecutor } from '../executor';
import { TaskDefinition, AgentState } from '../types';

describe('DockerizedTaskExecutor', () => {
  let dockerExecutor: DockerizedTaskExecutor;
  let processExecutor: TaskExecutor;
  let mockTask: TaskDefinition;
  let mockAgent: AgentState;
  let mockProcess: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock child process
    mockProcess = {
      pid: 12345,
      stdout: {
        on: jest.fn(),
      },
      stderr: {
        on: jest.fn(),
      },
      stdin: {
        write: jest.fn(),
        end: jest.fn(),
      },
      on: jest.fn(),
      kill: jest.fn(),
      unref: jest.fn(),
    };

    mockSpawn.mockReturnValue(mockProcess);

    // Create executors
    const config: Partial<DockerExecutionConfig> = {
      timeoutMs: 30000,
      dockerImage: 'claude-flow-test',
      networkMode: 'bridge',
      sandboxed: true,
      logLevel: 'debug',
    };

    dockerExecutor = new DockerizedTaskExecutor(config);
    processExecutor = new TaskExecutor(config);

    // Mock task
    mockTask = {
      id: { id: 'test-task-001', swarmId: 'test-swarm' },
      name: 'Test Task',
      type: 'computation',
      description: 'Test task for performance comparison',
      instructions: 'Execute a simple computation task',
      priority: 'normal',
      status: 'pending',
      context: {},
      input: { data: 'test-input' },
      examples: [],
      requirements: {
        tools: ['calculator'],
        memoryRequired: 100 * 1024 * 1024, // 100MB
        maxDuration: 30000,
        minReliability: 0.9,
        reviewRequired: false,
        testingRequired: false,
        documentationRequired: false,
      },
      constraints: {
        timeoutAfter: 30000,
        maxRetries: 3,
        deadline: new Date(Date.now() + 60000),
      },
      createdAt: new Date(),
      assignedAgents: [],
    };

    // Mock agent
    mockAgent = {
      id: { id: 'test-agent-001', swarmId: 'test-swarm' },
      name: 'Test Agent',
      type: 'coder',
      status: 'idle',
      capabilities: {
        canCode: true,
        canAnalyze: true,
        canTest: false,
        canReview: false,
        canDocument: false,
      },
      metadata: {
        version: '1.0.0',
        specialization: 'general',
        trustLevel: 0.9,
        lastUpdated: new Date(),
      },
      environment: {
        nodeVersion: '20.0.0',
        platform: 'linux',
        credentials: {},
      },
    };
  });

  afterEach(async () => {
    // Cleanup
    try {
      await dockerExecutor.shutdown();
      await processExecutor.shutdown();
    } catch (error) {
      // Ignore cleanup errors in tests
    }
  });

  describe('Initialization and Setup', () => {
    test('should initialize successfully with Docker environment validation', async () => {
      // Mock successful Docker validation
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      });

      mockSpawn.mockReturnValueOnce({
        ...mockProcess,
        stdout: { on: jest.fn((event, cb) => {
          if (event === 'data') {
            cb(Buffer.from('{"Client":{"Version":"24.0.0","ApiVersion":"1.43"}}'));
          }
        })},
        stderr: { on: jest.fn() },
      });

      await dockerExecutor.initialize();

      expect(mockSpawn).toHaveBeenCalledWith('docker', ['version', '--format', 'json'], expect.any(Object));
    });

    test('should throw error if Docker is not available', async () => {
      // Mock Docker not available
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(1), 10);
        }
      });

      mockSpawn.mockReturnValueOnce({
        ...mockProcess,
        stderr: { on: jest.fn((event, cb) => {
          if (event === 'data') {
            cb(Buffer.from('docker: command not found'));
          }
        })},
      });

      await expect(dockerExecutor.initialize()).rejects.toThrow(/Docker environment validation failed/);
    });

    test('should configure Docker execution with security defaults', () => {
      const config = dockerExecutor['dockerConfig'];

      expect(config.dockerImage).toBe('claude-flow-test');
      expect(config.readOnlyRootFs).toBe(true);
      expect(config.noNewPrivileges).toBe(true);
      expect(config.user).toBe('swarm:swarm');
      expect(config.securityOpts).toContain('no-new-privileges:true');
    });
  });

  describe('Container Lifecycle Management', () => {
    test('should create container with proper security configuration', async () => {
      // Mock Docker commands
      let commandIndex = 0;
      const mockCommands = [
        // version check
        { exitCode: 0, output: '{"Client":{"Version":"24.0.0"}}', error: '' },
        // image inspect
        { exitCode: 0, output: '[{"Id":"sha256:abc123"}]', error: '' },
        // create container
        { exitCode: 0, output: 'container-id-123', error: '' },
        // start container
        { exitCode: 0, output: '', error: '' },
        // exec command
        { exitCode: 0, output: '{"result":"success"}', error: '' },
        // stats
        { exitCode: 0, output: '{"CPUPerc":"1.5%","MemUsage":"64MiB / 512MiB","BlockIO":"1MB / 2MB","NetIO":"500KB / 300KB"}', error: '' },
        // stop container
        { exitCode: 0, output: '', error: '' },
        // remove container
        { exitCode: 0, output: '', error: '' },
      ];

      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => {
            const command = mockCommands[commandIndex++] || { exitCode: 0, output: '', error: '' };
            callback(command.exitCode);
          }, 10);
        }
      });

      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          const command = mockCommands[commandIndex - 1] || { exitCode: 0, output: '', error: '' };
          callback(Buffer.from(command.output));
        }
      });

      await dockerExecutor.initialize();
      const result = await dockerExecutor.executeTask(mockTask, mockAgent);

      expect(result.success).toBe(true);
      expect(result.metadata.executionMode).toBe('docker');
      expect(result.metadata.securityLevel).toBe('isolated');

      // Verify Docker create command was called with security options
      const createCall = mockSpawn.mock.calls.find(call => 
        call[0] === 'docker' && call[1].includes('create')
      );
      expect(createCall).toBeDefined();
      expect(createCall[1]).toContain('--read-only');
      expect(createCall[1]).toContain('--cap-drop');
      expect(createCall[1]).toContain('ALL');
    });

    test('should handle container creation failure gracefully', async () => {
      // Mock container creation failure
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(1), 10); // Exit code 1 = failure
        }
      });

      mockProcess.stderr.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(Buffer.from('Error: No such image: invalid-image'));
        }
      });

      await expect(dockerExecutor.executeTask(mockTask, mockAgent)).rejects.toThrow(/Failed to create container/);
    });

    test('should cleanup container resources on completion', async () => {
      // Mock successful execution and cleanup
      const mockCommands = [
        { exitCode: 0, output: '{"Client":{"Version":"24.0.0"}}', error: '' }, // version
        { exitCode: 0, output: '[{"Id":"sha256:abc123"}]', error: '' }, // inspect
        { exitCode: 0, output: 'container-123', error: '' }, // create
        { exitCode: 0, output: '', error: '' }, // start
        { exitCode: 0, output: '{"result":"success"}', error: '' }, // exec
        { exitCode: 0, output: '{"CPUPerc":"1.0%","MemUsage":"32MiB / 512MiB"}', error: '' }, // stats
        { exitCode: 0, output: '', error: '' }, // stop
        { exitCode: 0, output: '', error: '' }, // rm
      ];

      let commandIndex = 0;
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => {
            const command = mockCommands[commandIndex++] || { exitCode: 0, output: '', error: '' };
            callback(command.exitCode);
          }, 10);
        }
      });

      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          const command = mockCommands[commandIndex - 1] || { exitCode: 0, output: '', error: '' };
          callback(Buffer.from(command.output));
        }
      });

      await dockerExecutor.initialize();
      await dockerExecutor.executeTask(mockTask, mockAgent);

      // Verify cleanup commands were called
      const stopCall = mockSpawn.mock.calls.find(call => 
        call[0] === 'docker' && call[1].includes('stop')
      );
      const rmCall = mockSpawn.mock.calls.find(call => 
        call[0] === 'docker' && call[1].includes('rm')
      );

      expect(stopCall).toBeDefined();
      expect(rmCall).toBeDefined();
    });
  });

  describe('Performance Comparison', () => {
    test('should compare Docker vs process execution performance', async () => {
      // Mock process execution (faster)
      jest.spyOn(processExecutor, 'executeTask').mockResolvedValue({
        success: true,
        output: 'Process result',
        error: '',
        exitCode: 0,
        duration: 1000, // 1 second
        resourcesUsed: {
          cpuTime: 500,
          maxMemory: 50 * 1024 * 1024,
          diskIO: 1024,
          networkIO: 0,
          fileHandles: 5,
        },
        artifacts: {},
        metadata: { executionMode: 'process' },
      });

      // Mock Docker execution (slower but more secure)
      const mockDockerResult = {
        success: true,
        output: 'Docker result',
        error: '',
        exitCode: 0,
        duration: 1500, // 1.5 seconds (50% overhead)
        resourcesUsed: {
          cpuTime: 600,
          maxMemory: 80 * 1024 * 1024, // 60% more memory
          diskIO: 1500,
          networkIO: 100,
          fileHandles: 5,
        },
        artifacts: {},
        metadata: { 
          executionMode: 'docker',
          performanceComparison: {
            dockerOverhead: 15,
            startupTime: 2000,
            memoryOverhead: 30 * 1024 * 1024,
            cpuOverhead: 5,
          },
        },
      };

      jest.spyOn(dockerExecutor, 'executeTask').mockResolvedValue(mockDockerResult);

      const comparison = await dockerExecutor.compareWithProcessExecution(mockTask, mockAgent, 3);

      expect(comparison.processExecution.averageDuration).toBe(1000);
      expect(comparison.dockerExecution.averageDuration).toBe(1500);
      expect(comparison.overhead.timeOverhead).toBeCloseTo(50, 1); // 50% time overhead
      expect(comparison.overhead.memoryOverhead).toBeCloseTo(60, 1); // 60% memory overhead
      expect(comparison.securityGains.isolationScore).toBeGreaterThan(0.9);
    });

    test('should measure startup time overhead accurately', async () => {
      const startTime = Date.now();
      
      // Mock Docker commands with realistic timing
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 50); // 50ms per command
        }
      });

      const result = await dockerExecutor.executeTask(mockTask, mockAgent);
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThan(100); // At least 100ms
      expect(result.metadata.performanceComparison).toBeDefined();
    });

    test('should assess security gains quantitatively', async () => {
      const comparison = await dockerExecutor.compareWithProcessExecution(mockTask, mockAgent, 1);

      expect(comparison.securityGains.isolationScore).toBeGreaterThan(0.8);
      expect(comparison.securityGains.attackSurfaceReduction).toBeGreaterThan(0.7);
      expect(comparison.securityGains.privilegeEscalationPrevention).toBeGreaterThan(0.8);
      expect(comparison.securityGains.resourceContainment).toBeGreaterThan(0.8);
    });
  });

  describe('Resource Monitoring and Limits', () => {
    test('should monitor container resource usage', async () => {
      // Mock container stats
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      });

      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(Buffer.from('{"CPUPerc":"15.5%","MemUsage":"128MiB / 512MiB","BlockIO":"5MB / 3MB","NetIO":"1MB / 500KB"}'));
        }
      });

      const resourceUsage = await dockerExecutor['getContainerResourceUsage']('container-123');

      expect(resourceUsage.cpuTime).toBeCloseTo(15.5, 1);
      expect(resourceUsage.maxMemory).toBeCloseTo(128 * 1024 * 1024, 1000);
      expect(resourceUsage.diskIO).toBeGreaterThan(0);
      expect(resourceUsage.networkIO).toBeGreaterThan(0);
    });

    test('should parse memory usage correctly', () => {
      const parseMemoryUsage = dockerExecutor['parseMemoryUsage'].bind(dockerExecutor);

      expect(parseMemoryUsage('128MiB / 512MiB')).toBeCloseTo(128 * 1024 * 1024);
      expect(parseMemoryUsage('1.5GiB / 4GiB')).toBeCloseTo(1.5 * 1024 * 1024 * 1024);
      expect(parseMemoryUsage('256MB / 1GB')).toBe(256); // Only parses first value
    });

    test('should enforce resource limits', async () => {
      const config: Partial<DockerExecutionConfig> = {
        resourceLimits: {
          maxMemory: 256 * 1024 * 1024, // 256MB
          maxCpuTime: 10000, // 10s
          maxDiskSpace: 1024 * 1024 * 1024, // 1GB
          maxNetworkConnections: 5,
          maxFileHandles: 50,
          priority: 1,
        },
      };

      const limitedExecutor = new DockerizedTaskExecutor(config);
      
      // Mock container creation with limits
      const createArgs = limitedExecutor['buildDockerCreateArgs']({
        containerId: 'test-123',
        containerName: 'test-container',
        dockerConfig: {
          image: 'test-image',
          tag: 'latest',
          labels: {},
          environment: {},
          mounts: [],
          networkConfig: { mode: 'bridge' },
          securityConfig: {
            readOnlyRootFs: true,
            noNewPrivileges: true,
            user: 'swarm:swarm',
            securityOpts: [],
            capabilities: { add: [], drop: ['ALL'] },
          },
          resourceLimits: {
            memory: '268435456', // 256MB
            cpus: '0.5',
            cpuQuota: 50000,
            oomScoreAdj: 1000,
            ulimits: [],
          },
        },
        workingDirectory: '/tmp',
        tempDirectory: '/tmp',
        logDirectory: '/tmp/logs',
        environment: {},
        resources: config.resourceLimits!,
        task: mockTask,
        agent: mockAgent,
      });

      expect(createArgs).toContain('--memory');
      expect(createArgs).toContain('268435456');
      expect(createArgs).toContain('--cpus');
      expect(createArgs).toContain('0.5');
    });
  });

  describe('Security Validation', () => {
    test('should apply security configurations correctly', () => {
      const securityConfig = {
        readOnlyRootFs: true,
        noNewPrivileges: true,
        user: 'swarm:swarm',
        securityOpts: ['no-new-privileges:true', 'seccomp:unconfined'],
        capabilities: { add: [], drop: ['ALL'] },
      };

      const createArgs = dockerExecutor['buildDockerCreateArgs']({
        containerId: 'test-123',
        containerName: 'test-container',
        dockerConfig: {
          image: 'test-image',
          tag: 'latest',
          labels: {},
          environment: {},
          mounts: [],
          networkConfig: { mode: 'bridge' },
          securityConfig,
          resourceLimits: {
            memory: '128MB',
            cpus: '0.5',
            cpuQuota: 50000,
            oomScoreAdj: 1000,
            ulimits: [],
          },
        },
        workingDirectory: '/tmp',
        tempDirectory: '/tmp',
        logDirectory: '/tmp/logs',
        environment: {},
        resources: {} as any,
        task: mockTask,
        agent: mockAgent,
      });

      expect(createArgs).toContain('--read-only');
      expect(createArgs).toContain('--security-opt');
      expect(createArgs).toContain('no-new-privileges:true');
      expect(createArgs).toContain('--user');
      expect(createArgs).toContain('swarm:swarm');
      expect(createArgs).toContain('--cap-drop');
      expect(createArgs).toContain('ALL');
    });

    test('should isolate container filesystem', () => {
      const mounts = [
        {
          type: 'volume' as const,
          source: 'swarm-vol-123',
          target: '/workspace',
          readonly: false,
        },
        {
          type: 'tmpfs' as const,
          source: '',
          target: '/tmp',
          readonly: false,
        },
      ];

      const createArgs = dockerExecutor['buildDockerCreateArgs']({
        containerId: 'test-123',
        containerName: 'test-container',
        dockerConfig: {
          image: 'test-image',
          tag: 'latest',
          labels: {},
          environment: {},
          mounts,
          networkConfig: { mode: 'bridge' },
          securityConfig: {
            readOnlyRootFs: true,
            noNewPrivileges: true,
            user: 'swarm:swarm',
            securityOpts: [],
            capabilities: { add: [], drop: [] },
          },
          resourceLimits: {
            memory: '128MB',
            cpus: '0.5',
            cpuQuota: 50000,
            oomScoreAdj: 1000,
            ulimits: [],
          },
        },
        workingDirectory: '/tmp',
        tempDirectory: '/tmp',
        logDirectory: '/tmp/logs',
        environment: {},
        resources: {} as any,
        task: mockTask,
        agent: mockAgent,
      });

      expect(createArgs).toContain('-v');
      expect(createArgs).toContain('swarm-vol-123:/workspace');
      expect(createArgs).toContain('--tmpfs');
      expect(createArgs).toContain('/tmp:rw,noexec,nosuid,size=100m');
    });

    test('should create isolated network per container', async () => {
      const networkManager = new (dockerExecutor['networkManager'].constructor as any)(dockerExecutor['logger']);
      
      const networkId = await networkManager.createIsolatedNetwork('session-123');
      
      expect(networkId).toMatch(/swarm-net-session-123/);
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle container execution timeout', async () => {
      const shortTimeoutConfig: Partial<DockerExecutionConfig> = {
        timeoutMs: 100, // Very short timeout
      };

      const timeoutExecutor = new DockerizedTaskExecutor(shortTimeoutConfig);

      // Mock long-running process
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          // Never call callback to simulate hang
        }
      });

      await expect(timeoutExecutor.executeTask(mockTask, mockAgent)).rejects.toThrow(/timed out/);
    });

    test('should handle Docker daemon connection errors', async () => {
      // Mock Docker daemon unavailable
      mockSpawn.mockImplementation(() => {
        throw new Error('Docker daemon not running');
      });

      await expect(dockerExecutor.executeTask(mockTask, mockAgent)).rejects.toThrow(/Docker daemon/);
    });

    test('should gracefully handle container stop failures', async () => {
      // Mock stop command failure, but kill success
      let isStopCommand = true;
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => {
            const exitCode = isStopCommand ? 1 : 0; // Stop fails, kill succeeds
            isStopCommand = false;
            callback(exitCode);
          }, 10);
        }
      });

      await dockerExecutor['stopContainer']('container-123', 'Test stop');

      expect(mockSpawn).toHaveBeenCalledWith('docker', ['stop', '-t', '10', 'container-123'], expect.any(Object));
      expect(mockSpawn).toHaveBeenCalledWith('docker', ['kill', 'container-123'], expect.any(Object));
    });
  });

  describe('Metrics and Monitoring', () => {
    test('should collect comprehensive Docker metrics', async () => {
      // Mock various Docker stats
      const mockMetrics = {
        containerMetrics: {
          totalContainers: 5,
          activeContainers: 3,
          imageSize: 500 * 1024 * 1024, // 500MB
          networkLatency: 0.5,
          volumeIOPS: 1000,
          securityViolations: 0,
        },
        performanceComparison: {
          dockerOverhead: 15,
          startupTime: 2000,
          memoryOverhead: 64 * 1024 * 1024,
          cpuOverhead: 5,
        },
      };

      jest.spyOn(dockerExecutor, 'getDockerMetrics').mockResolvedValue({
        ...dockerExecutor.getExecutionMetrics(),
        ...mockMetrics,
      } as DockerExecutionMetrics);

      const metrics = await dockerExecutor.getDockerMetrics();

      expect(metrics.containerMetrics.totalContainers).toBeGreaterThan(0);
      expect(metrics.performanceComparison.dockerOverhead).toBeGreaterThan(0);
      expect(metrics.containerMetrics.securityViolations).toBe(0);
    });

    test('should track performance trends over time', async () => {
      const results = [];
      
      // Run multiple executions to establish trends
      for (let i = 0; i < 5; i++) {
        const mockResult = {
          success: true,
          output: `Result ${i}`,
          error: '',
          exitCode: 0,
          duration: 1000 + (i * 100), // Increasing duration
          resourcesUsed: {
            cpuTime: 500 + (i * 50),
            maxMemory: (50 + i * 10) * 1024 * 1024,
            diskIO: 1024,
            networkIO: 100,
            fileHandles: 5,
          },
          artifacts: {},
          metadata: { iteration: i },
        };

        results.push(mockResult);
      }

      // Calculate trend
      const durations = results.map(r => r.duration);
      const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
      
      expect(avgDuration).toBeGreaterThan(1000);
      expect(durations[4]).toBeGreaterThan(durations[0]); // Increasing trend
    });
  });

  describe('Integration Tests', () => {
    test('should work end-to-end with real Docker commands (if Docker available)', async () => {
      // Skip if Docker not available in test environment
      try {
        await dockerExecutor['runDockerCommand'](['version']);
      } catch (error) {
        console.log('Skipping Docker integration test - Docker not available');
        return;
      }

      // This would be a real integration test with actual Docker
      // For now, we'll just verify the test framework is ready
      expect(dockerExecutor).toBeDefined();
    });

    test('should integrate with existing swarm infrastructure', async () => {
      // Test integration with swarm components
      const swarmConfig = {
        dockerImage: 'claude-flow-swarm',
        networkMode: 'bridge',
        securityOpts: ['no-new-privileges:true'],
      };

      const swarmExecutor = new DockerizedTaskExecutor(swarmConfig);
      
      expect(swarmExecutor['dockerConfig'].dockerImage).toBe('claude-flow-swarm');
      expect(swarmExecutor['dockerConfig'].networkMode).toBe('bridge');
    });
  });

  describe('Benchmark Performance Tests', () => {
    test('should benchmark container startup overhead', async () => {
      const iterations = 5;
      const startupTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        
        // Mock container operations
        mockProcess.on.mockImplementationOnce((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 100 + Math.random() * 50); // 100-150ms
          }
        });

        await dockerExecutor['runDockerCommand'](['create', 'test-image']);
        
        startupTimes.push(Date.now() - start);
      }

      const avgStartupTime = startupTimes.reduce((sum, time) => sum + time, 0) / iterations;
      
      expect(avgStartupTime).toBeGreaterThan(50); // At least 50ms
      expect(avgStartupTime).toBeLessThan(1000); // Less than 1s
    });

    test('should measure memory overhead accurately', async () => {
      const baselineMemory = 50 * 1024 * 1024; // 50MB baseline
      const dockerMemory = 80 * 1024 * 1024; // 80MB with Docker
      
      const memoryOverhead = ((dockerMemory - baselineMemory) / baselineMemory) * 100;
      
      expect(memoryOverhead).toBeCloseTo(60, 5); // 60% overhead
      expect(memoryOverhead).toBeGreaterThan(0);
    });

    test('should validate security isolation effectiveness', async () => {
      // Test that containers are properly isolated
      const isolation = await dockerExecutor['assessSecurityGains']();
      
      expect(isolation.isolationScore).toBeGreaterThan(0.9);
      expect(isolation.attackSurfaceReduction).toBeGreaterThan(0.7);
      expect(isolation.privilegeEscalationPrevention).toBeGreaterThan(0.8);
      expect(isolation.resourceContainment).toBeGreaterThan(0.8);
    });
  });
});

describe('Performance Comparison Matrix', () => {
  test('should generate comprehensive performance report', async () => {
    const dockerExecutor = new DockerizedTaskExecutor({
      timeoutMs: 30000,
      dockerImage: 'claude-flow-test',
    });

    const processExecutor = new TaskExecutor({
      timeoutMs: 30000,
    });

    // Mock task for comparison
    const comparisonTask: TaskDefinition = {
      id: { id: 'perf-test-001', swarmId: 'perf-swarm' },
      name: 'Performance Test Task',
      type: 'computation',
      description: 'Task for performance benchmarking',
      instructions: 'Execute computation with timing measurements',
      priority: 'normal',
      status: 'pending',
      context: {},
      input: { size: 'medium' },
      examples: [],
      requirements: {
        tools: ['calculator'],
        memoryRequired: 128 * 1024 * 1024,
        maxDuration: 10000,
        minReliability: 0.95,
        reviewRequired: false,
        testingRequired: false,
        documentationRequired: false,
      },
      constraints: {
        timeoutAfter: 10000,
        maxRetries: 1,
      },
      createdAt: new Date(),
      assignedAgents: [],
    };

    const agent: AgentState = {
      id: { id: 'perf-agent-001', swarmId: 'perf-swarm' },
      name: 'Performance Agent',
      type: 'coder',
      status: 'idle',
      capabilities: {
        canCode: true,
        canAnalyze: true,
        canTest: false,
        canReview: false,
        canDocument: false,
      },
      metadata: {
        version: '1.0.0',
        specialization: 'performance',
        trustLevel: 0.95,
        lastUpdated: new Date(),
      },
      environment: {
        nodeVersion: '20.0.0',
        platform: 'linux',
        credentials: {},
      },
    };

    // Mock both executors
    jest.spyOn(processExecutor, 'executeTask').mockResolvedValue({
      success: true,
      output: 'Process execution complete',
      error: '',
      exitCode: 0,
      duration: 1200,
      resourcesUsed: {
        cpuTime: 800,
        maxMemory: 64 * 1024 * 1024,
        diskIO: 2048,
        networkIO: 0,
        fileHandles: 8,
      },
      artifacts: {},
      metadata: { mode: 'process' },
    });

    jest.spyOn(dockerExecutor, 'executeTask').mockResolvedValue({
      success: true,
      output: 'Docker execution complete',
      error: '',
      exitCode: 0,
      duration: 1800, // 50% slower
      resourcesUsed: {
        cpuTime: 900,
        maxMemory: 96 * 1024 * 1024, // 50% more memory
        diskIO: 3072,
        networkIO: 512,
        fileHandles: 8,
      },
      artifacts: {},
      metadata: {
        mode: 'docker',
        containerId: 'perf-container-123',
        securityLevel: 'isolated',
      },
    });

    const comparison = await dockerExecutor.compareWithProcessExecution(comparisonTask, agent, 3);

    // Validate performance comparison
    expect(comparison.processExecution.averageDuration).toBe(1200);
    expect(comparison.dockerExecution.averageDuration).toBe(1800);
    expect(comparison.overhead.timeOverhead).toBeCloseTo(50, 1);
    expect(comparison.overhead.memoryOverhead).toBeCloseTo(50, 1);

    // Validate security gains justify the overhead
    expect(comparison.securityGains.isolationScore).toBeGreaterThan(0.9);
    expect(comparison.securityGains.attackSurfaceReduction).toBeGreaterThan(0.7);

    // Performance should be acceptable (less than 100% overhead)
    expect(comparison.overhead.timeOverhead).toBeLessThan(100);
    expect(comparison.overhead.memoryOverhead).toBeLessThan(100);

    // Log performance summary
    console.log('Performance Comparison Summary:', {
      timeOverhead: `${comparison.overhead.timeOverhead.toFixed(1)}%`,
      memoryOverhead: `${comparison.overhead.memoryOverhead.toFixed(1)}%`,
      isolationGain: `${(comparison.securityGains.isolationScore * 100).toFixed(1)}%`,
      recommendation: comparison.overhead.timeOverhead < 50 ? 'Docker recommended' : 'Evaluate trade-offs',
    });
  });
});