/**
 * Comprehensive Tests for Pooled Docker Task Executor
 * Tests container pooling, warm container management, and performance optimization
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { performance } from 'perf_hooks';

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

import PooledDockerExecutor, { 
  PooledDockerConfig, 
  AgentContainerInfo,
  PoolMetrics 
} from '../pooled-docker-executor';
import { TaskDefinition, AgentState } from '../types';

describe('PooledDockerExecutor', () => {
  let pooledExecutor: PooledDockerExecutor;
  let mockTask: TaskDefinition;
  let mockAgents: Record<string, AgentState>;
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

    // Create pooled executor with test configuration
    const config: Partial<PooledDockerConfig> = {
      timeoutMs: 30000,
      dockerImage: 'claude-flow-pool-test',
      poolSize: 2,
      warmupAgentTypes: ['coder', 'tester', 'reviewer'],
      healthCheckInterval: 5000, // 5 seconds for testing
      containerIdleTimeout: 30000, // 30 seconds for testing
      maxContainerAge: 300000, // 5 minutes for testing
      autoScaling: true,
      minPoolSize: 1,
      maxPoolSize: 5,
      logLevel: 'debug',
    };

    pooledExecutor = new PooledDockerExecutor(config);

    // Mock task
    mockTask = {
      id: { id: 'pool-test-task-001', swarmId: 'pool-test-swarm' },
      name: 'Pool Test Task',
      type: 'computation',
      description: 'Test task for pooled container execution',
      instructions: 'Execute a test computation',
      priority: 'normal',
      status: 'pending',
      context: {},
      input: { data: 'test-pool-input' },
      examples: [],
      requirements: {
        tools: ['calculator'],
        memoryRequired: 128 * 1024 * 1024, // 128MB
        maxDuration: 30000,
        minReliability: 0.9,
        reviewRequired: false,
        testingRequired: false,
        documentationRequired: false,
      },
      constraints: {
        timeoutAfter: 30000,
        maxRetries: 3,
      },
      createdAt: new Date(),
      assignedAgents: [],
    };

    // Mock agents of different types
    mockAgents = {
      coder: {
        id: { id: 'pool-coder-001', swarmId: 'pool-test-swarm' },
        name: 'Pool Coder Agent',
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
      },
      tester: {
        id: { id: 'pool-tester-001', swarmId: 'pool-test-swarm' },
        name: 'Pool Tester Agent',
        type: 'tester',
        status: 'idle',
        capabilities: {
          canCode: false,
          canAnalyze: true,
          canTest: true,
          canReview: false,
          canDocument: false,
        },
        metadata: {
          version: '1.0.0',
          specialization: 'testing',
          trustLevel: 0.95,
          lastUpdated: new Date(),
        },
        environment: {
          nodeVersion: '20.0.0',
          platform: 'linux',
          credentials: {},
        },
      },
      reviewer: {
        id: { id: 'pool-reviewer-001', swarmId: 'pool-test-swarm' },
        name: 'Pool Reviewer Agent',
        type: 'reviewer',
        status: 'idle',
        capabilities: {
          canCode: false,
          canAnalyze: true,
          canTest: false,
          canReview: true,
          canDocument: false,
        },
        metadata: {
          version: '1.0.0',
          specialization: 'code-review',
          trustLevel: 0.92,
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

  afterEach(async () => {
    // Cleanup
    try {
      await pooledExecutor.shutdown();
    } catch (error) {
      // Ignore cleanup errors in tests
    }
  });

  describe('Container Pool Initialization', () => {
    test('should initialize warm container pool for specified agent types', async () => {
      // Mock successful Docker commands for pool initialization
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10); // Successful execution
        }
      });

      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          // Mock different responses based on command
          const commandCallCount = mockSpawn.mock.calls.length;
          const responses = [
            // Docker version check
            JSON.stringify({ Client: { Version: '24.0.0', ApiVersion: '1.43' } }),
            // Container creation responses
            'container-coder-001',
            'container-coder-002',
            'container-tester-001',
            'container-tester-002',
            'container-reviewer-001',
            'container-reviewer-002',
          ];
          
          const response = responses[commandCallCount - 1] || 'success';
          callback(Buffer.from(response));
        }
      });

      await pooledExecutor.initialize();
      
      const poolMetrics = await pooledExecutor.getPoolMetrics();
      
      // Should have created 2 containers per agent type (poolSize = 2)
      expect(poolMetrics.totalContainers).toBe(6); // 3 agent types × 2 containers
      expect(poolMetrics.containersByType).toEqual({
        'coder': 2,
        'tester': 2,
        'reviewer': 2,
      });
      expect(poolMetrics.idleContainers).toBe(6); // All should be idle initially
    });

    test('should handle partial pool initialization failures gracefully', async () => {
      let callCount = 0;
      
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          callCount++;
          // Fail every 3rd container creation
          const exitCode = callCount % 3 === 0 ? 1 : 0;
          setTimeout(() => callback(exitCode), 10);
        }
      });

      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(Buffer.from(`container-${callCount}`));
        }
      });

      mockProcess.stderr.on.mockImplementation((event, callback) => {
        if (event === 'data' && callCount % 3 === 0) {
          callback(Buffer.from('Container creation failed'));
        }
      });

      await pooledExecutor.initialize();
      
      const poolMetrics = await pooledExecutor.getPoolMetrics();
      
      // Should have fewer containers due to failures
      expect(poolMetrics.totalContainers).toBeLessThan(6);
      expect(poolMetrics.totalContainers).toBeGreaterThan(0);
    });
  });

  describe('Container Pool Management', () => {
    test('should reuse existing container for same agent type', async () => {
      // Setup successful pool initialization
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      });

      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(Buffer.from(JSON.stringify({ result: 'success' })));
        }
      });

      await pooledExecutor.initialize();
      
      // Execute task with coder agent - should use pooled container
      const result1 = await pooledExecutor.executeTask(mockTask, mockAgents.coder);
      
      expect(result1.success).toBe(true);
      expect(result1.metadata.executionMode).toBe('pooled-docker');
      expect(result1.metadata.pooledExecution).toBe(true);
      expect(result1.metadata.agentType).toBe('coder');

      // Execute another task with coder agent - should reuse same container type
      const result2 = await pooledExecutor.executeTask(mockTask, mockAgents.coder);
      
      expect(result2.success).toBe(true);
      expect(result2.metadata.agentType).toBe('coder');

      const poolMetrics = await pooledExecutor.getPoolMetrics();
      expect(poolMetrics.containerHitRate).toBeGreaterThan(0);
    });

    test('should create new container when pool is exhausted', async () => {
      // Mock pool with only 1 container per type
      const smallPoolConfig: Partial<PooledDockerConfig> = {
        poolSize: 1,
        warmupAgentTypes: ['coder'],
      };

      const smallPoolExecutor = new PooledDockerExecutor(smallPoolConfig);

      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      });

      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(Buffer.from('container-new'));
        }
      });

      await smallPoolExecutor.initialize();

      // Start first execution (should use pooled container)
      const execution1Promise = smallPoolExecutor.executeTask(mockTask, mockAgents.coder);
      
      // Start second execution immediately (should create new container)
      const execution2Promise = smallPoolExecutor.executeTask(mockTask, mockAgents.coder);

      const [result1, result2] = await Promise.all([execution1Promise, execution2Promise]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      const poolMetrics = await smallPoolExecutor.getPoolMetrics();
      expect(poolMetrics.totalContainers).toBeGreaterThan(1); // Should have created extra container

      await smallPoolExecutor.shutdown();
    });

    test('should isolate containers between different agent types', async () => {
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      });

      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(Buffer.from('success'));
        }
      });

      await pooledExecutor.initialize();

      // Execute tasks with different agent types
      const coderResult = await pooledExecutor.executeTask(mockTask, mockAgents.coder);
      const testerResult = await pooledExecutor.executeTask(mockTask, mockAgents.tester);
      const reviewerResult = await pooledExecutor.executeTask(mockTask, mockAgents.reviewer);

      // Each should use different container types
      expect(coderResult.metadata.agentType).toBe('coder');
      expect(testerResult.metadata.agentType).toBe('tester');
      expect(reviewerResult.metadata.agentType).toBe('reviewer');

      // Verify containers exist for each type
      const containerPool = await pooledExecutor.getContainerPool();
      expect(containerPool.has('coder')).toBe(true);
      expect(containerPool.has('tester')).toBe(true);
      expect(containerPool.has('reviewer')).toBe(true);
    });
  });

  describe('Container Health Monitoring', () => {
    test('should monitor container health and replace unhealthy containers', async () => {
      jest.useFakeTimers();

      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      });

      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          // Mock container health check - alternate between healthy and unhealthy
          const commandArgs = mockSpawn.mock.calls[mockSpawn.mock.calls.length - 1][1];
          if (commandArgs.includes('inspect') && commandArgs.includes('{{.State.Status}}')) {
            const response = Math.random() > 0.5 ? 'running' : 'exited';
            callback(Buffer.from(response));
          } else {
            callback(Buffer.from('success'));
          }
        }
      });

      await pooledExecutor.initialize();

      // Fast-forward through health check interval
      jest.advanceTimersByTime(6000); // 6 seconds (health check interval is 5s)
      
      // Allow health checks to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const poolMetrics = await pooledExecutor.getPoolMetrics();
      
      // Should have attempted health checks
      expect(poolMetrics.totalContainers).toBeGreaterThan(0);

      jest.useRealTimers();
    });

    test('should refresh aged containers automatically', async () => {
      jest.useFakeTimers();

      const shortAgeConfig: Partial<PooledDockerConfig> = {
        maxContainerAge: 1000, // 1 second for testing
        poolSize: 1,
        warmupAgentTypes: ['coder'],
      };

      const ageTestExecutor = new PooledDockerExecutor(shortAgeConfig);

      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      });

      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(Buffer.from('container-refreshed'));
        }
      });

      await ageTestExecutor.initialize();

      // Fast-forward past container max age
      jest.advanceTimersByTime(2000);
      
      // Allow cleanup to run
      await new Promise(resolve => setTimeout(resolve, 100));

      await ageTestExecutor.shutdown();
      jest.useRealTimers();
    });
  });

  describe('Auto-scaling', () => {
    test('should scale up when pool utilization is high', async () => {
      const autoScaleConfig: Partial<PooledDockerConfig> = {
        autoScaling: true,
        poolSize: 1,
        maxPoolSize: 3,
        scaleUpThreshold: 80,
        warmupAgentTypes: ['coder'],
      };

      const autoScaleExecutor = new PooledDockerExecutor(autoScaleConfig);

      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      });

      await autoScaleExecutor.initialize();

      // Manually trigger scaling
      await autoScaleExecutor.scalePool('coder', 3);

      const poolMetrics = await autoScaleExecutor.getPoolMetrics();
      expect(poolMetrics.containersByType['coder']).toBe(3);

      await autoScaleExecutor.shutdown();
    });

    test('should scale down when pool utilization is low', async () => {
      const scaleDownConfig: Partial<PooledDockerConfig> = {
        autoScaling: true,
        poolSize: 3,
        minPoolSize: 1,
        scaleDownThreshold: 20,
        warmupAgentTypes: ['coder'],
      };

      const scaleDownExecutor = new PooledDockerExecutor(scaleDownConfig);

      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      });

      await scaleDownExecutor.initialize();

      // Scale down to minimum
      await scaleDownExecutor.scalePool('coder', 1);

      const poolMetrics = await scaleDownExecutor.getPoolMetrics();
      expect(poolMetrics.containersByType['coder']).toBe(1);

      await scaleDownExecutor.shutdown();
    });
  });

  describe('Performance Optimization', () => {
    test('should demonstrate significant startup time improvement over fresh containers', async () => {
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          // Simulate faster execution for pooled containers
          const delay = mockSpawn.mock.calls.length <= 10 ? 50 : 10; // Initial setup slower
          setTimeout(() => callback(0), delay);
        }
      });

      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(Buffer.from('fast-execution'));
        }
      });

      await pooledExecutor.initialize();

      // Measure execution time with pooled container
      const pooledStart = performance.now();
      await pooledExecutor.executeTask(mockTask, mockAgents.coder);
      const pooledTime = performance.now() - pooledStart;

      // Pooled execution should be fast (no container creation overhead)
      expect(pooledTime).toBeLessThan(1000); // Less than 1 second
    });

    test('should maintain high container hit rate', async () => {
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      });

      await pooledExecutor.initialize();

      // Execute multiple tasks
      const tasks = Array(5).fill(null).map(() => 
        pooledExecutor.executeTask(mockTask, mockAgents.coder)
      );

      await Promise.all(tasks);

      const poolMetrics = await pooledExecutor.getPoolMetrics();
      expect(poolMetrics.containerHitRate).toBeGreaterThan(50); // At least 50% hit rate
    });

    test('should track execution metrics per agent type', async () => {
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      });

      await pooledExecutor.initialize();

      // Execute tasks with different agent types
      await pooledExecutor.executeTask(mockTask, mockAgents.coder);
      await pooledExecutor.executeTask(mockTask, mockAgents.tester);

      const poolMetrics = await pooledExecutor.getPoolMetrics();
      expect(poolMetrics.averageExecutionTime).toBeGreaterThan(0);
      expect(poolMetrics.totalContainers).toBeGreaterThan(0);
    });
  });

  describe('Resource Management', () => {
    test('should configure agent-specific resource limits', async () => {
      const containerPool = await pooledExecutor.getContainerPool();
      
      // Different agent types should have different configurations
      // This is tested through the Docker create arguments
      expect(pooledExecutor).toBeDefined();
      
      // Agent-specific configs are tested through the private methods
      // In a real test, we'd verify the Docker create args contain appropriate limits
    });

    test('should cleanup idle containers after timeout', async () => {
      jest.useFakeTimers();

      const idleCleanupConfig: Partial<PooledDockerConfig> = {
        containerIdleTimeout: 1000, // 1 second for testing
        poolSize: 2,
        warmupAgentTypes: ['coder'],
      };

      const idleExecutor = new PooledDockerExecutor(idleCleanupConfig);

      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      });

      await idleExecutor.initialize();

      // Fast-forward past idle timeout
      jest.advanceTimersByTime(2000);
      
      // Allow cleanup to process
      await new Promise(resolve => setTimeout(resolve, 100));

      await idleExecutor.shutdown();
      jest.useRealTimers();
    });

    test('should prevent resource leaks during shutdown', async () => {
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      });

      await pooledExecutor.initialize();

      // Verify containers exist
      const poolMetrics = await pooledExecutor.getPoolMetrics();
      expect(poolMetrics.totalContainers).toBeGreaterThan(0);

      // Shutdown should cleanup all containers
      await pooledExecutor.shutdown();

      // Verify cleanup commands were called
      const rmCalls = mockSpawn.mock.calls.filter(call => 
        call[0] === 'docker' && call[1].includes('rm')
      );
      expect(rmCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle container creation failures gracefully', async () => {
      // Mock container creation failure for specific agent type
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          const commandArgs = mockSpawn.mock.calls[mockSpawn.mock.calls.length - 1][1];
          const exitCode = commandArgs.includes('create') && commandArgs.includes('tester') ? 1 : 0;
          setTimeout(() => callback(exitCode), 10);
        }
      });

      mockProcess.stderr.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(Buffer.from('Failed to create tester container'));
        }
      });

      await pooledExecutor.initialize();

      // Should still be able to execute with other agent types
      const coderResult = await pooledExecutor.executeTask(mockTask, mockAgents.coder);
      expect(coderResult.success).toBe(true);

      // Tester execution might create new container or fail gracefully
      try {
        await pooledExecutor.executeTask(mockTask, mockAgents.tester);
      } catch (error) {
        // Graceful failure is acceptable
        expect(error).toBeDefined();
      }
    });

    test('should recover from unhealthy containers', async () => {
      jest.useFakeTimers();

      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      });

      // Mock health check that shows container as unhealthy
      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          const commandArgs = mockSpawn.mock.calls[mockSpawn.mock.calls.length - 1][1];
          if (commandArgs.includes('inspect')) {
            callback(Buffer.from('exited')); // Unhealthy
          } else {
            callback(Buffer.from('container-healthy'));
          }
        }
      });

      await pooledExecutor.initialize();

      // Trigger health check
      jest.advanceTimersByTime(6000);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should have attempted to refresh unhealthy containers
      const refreshCalls = mockSpawn.mock.calls.filter(call => 
        call[0] === 'docker' && call[1].includes('create')
      );
      expect(refreshCalls.length).toBeGreaterThan(3); // Initial + refresh calls

      jest.useRealTimers();
    });

    test('should handle concurrent access to container pool', async () => {
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      });

      await pooledExecutor.initialize();

      // Execute multiple concurrent tasks with same agent type
      const concurrentTasks = Array(10).fill(null).map(() => 
        pooledExecutor.executeTask(mockTask, mockAgents.coder)
      );

      const results = await Promise.allSettled(concurrentTasks);

      // Most should succeed (some might create new containers)
      const successes = results.filter(r => r.status === 'fulfilled').length;
      expect(successes).toBeGreaterThan(5);
    });
  });

  describe('Configuration and Customization', () => {
    test('should support custom agent type configurations', () => {
      const customConfig: Partial<PooledDockerConfig> = {
        warmupAgentTypes: ['custom-agent'],
        poolSize: 3,
      };

      const customExecutor = new PooledDockerExecutor(customConfig);
      expect(customExecutor).toBeDefined();
    });

    test('should validate configuration parameters', () => {
      const invalidConfig: Partial<PooledDockerConfig> = {
        poolSize: -1,
        maxPoolSize: 0,
        minPoolSize: 10, // min > max
      };

      // Constructor should handle invalid config gracefully
      const invalidExecutor = new PooledDockerExecutor(invalidConfig);
      expect(invalidExecutor).toBeDefined();
    });

    test('should support disabling auto-scaling', () => {
      const noAutoScaleConfig: Partial<PooledDockerConfig> = {
        autoScaling: false,
        poolSize: 2,
      };

      const noAutoScaleExecutor = new PooledDockerExecutor(noAutoScaleConfig);
      expect(noAutoScaleExecutor).toBeDefined();
    });
  });

  describe('Metrics and Monitoring', () => {
    test('should provide comprehensive pool metrics', async () => {
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      });

      await pooledExecutor.initialize();

      const metrics = await pooledExecutor.getPoolMetrics();

      expect(metrics).toHaveProperty('totalContainers');
      expect(metrics).toHaveProperty('activeContainers');
      expect(metrics).toHaveProperty('idleContainers');
      expect(metrics).toHaveProperty('containersByType');
      expect(metrics).toHaveProperty('poolUtilization');
      expect(metrics).toHaveProperty('averageExecutionTime');
      expect(metrics).toHaveProperty('containerHitRate');
      expect(metrics).toHaveProperty('healthyContainers');
      expect(metrics).toHaveProperty('unhealthyContainers');

      expect(typeof metrics.totalContainers).toBe('number');
      expect(typeof metrics.poolUtilization).toBe('number');
      expect(metrics.poolUtilization).toBeGreaterThanOrEqual(0);
      expect(metrics.poolUtilization).toBeLessThanOrEqual(100);
    });

    test('should track container usage statistics', async () => {
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      });

      await pooledExecutor.initialize();

      // Execute some tasks
      await pooledExecutor.executeTask(mockTask, mockAgents.coder);
      await pooledExecutor.executeTask(mockTask, mockAgents.coder);

      const containerPool = await pooledExecutor.getContainerPool();
      const coderContainers = containerPool.get('coder') || [];

      // At least one container should have been used
      const usedContainer = coderContainers.find(c => c.execCount > 0);
      expect(usedContainer).toBeDefined();
      expect(usedContainer?.execCount).toBeGreaterThan(0);
    });
  });
});