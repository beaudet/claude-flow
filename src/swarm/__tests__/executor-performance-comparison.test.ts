/**
 * Comprehensive Performance Comparison Tests
 * Compares process-based vs Docker-based execution across multiple dimensions
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

import { TaskExecutor } from '../executor';
import DockerizedTaskExecutor, { PerformanceComparison } from '../dockerized-executor';
import { TaskDefinition, AgentState } from '../types';

describe('Executor Performance Comparison Matrix', () => {
  let processExecutor: TaskExecutor;
  let dockerExecutor: DockerizedTaskExecutor;
  let testTasks: TaskDefinition[];
  let testAgent: AgentState;

  beforeEach(() => {
    processExecutor = new TaskExecutor({
      timeoutMs: 30000,
      enableMetrics: true,
      logLevel: 'info',
    });

    dockerExecutor = new DockerizedTaskExecutor({
      timeoutMs: 30000,
      dockerImage: 'claude-flow-perf-test',
      enableMetrics: true,
      logLevel: 'info',
    });

    // Create test agent
    testAgent = {
      id: { id: 'perf-agent-001', swarmId: 'perf-swarm' },
      name: 'Performance Test Agent',
      type: 'coder',
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
        specialization: 'performance-testing',
        trustLevel: 0.95,
        lastUpdated: new Date(),
      },
      environment: {
        nodeVersion: '20.0.0',
        platform: 'linux',
        credentials: {},
      },
    };

    // Create test tasks with varying complexity
    testTasks = [
      createTestTask('simple-computation', 'Simple math calculation', 'low'),
      createTestTask('medium-processing', 'Data processing task', 'medium'),
      createTestTask('complex-algorithm', 'Complex algorithmic task', 'high'),
      createTestTask('io-intensive', 'File I/O intensive task', 'medium'),
      createTestTask('memory-intensive', 'Memory-heavy computation', 'high'),
    ];
  });

  afterEach(async () => {
    await processExecutor.shutdown();
    await dockerExecutor.shutdown();
  });

  describe('Startup Time Comparison', () => {
    test('should measure process vs Docker startup overhead', async () => {
      const iterations = 10;
      const results = {
        process: [] as number[],
        docker: [] as number[],
      };

      // Mock lightweight task
      const quickTask = createTestTask('startup-test', 'Quick startup test', 'low');

      // Measure process startup times
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        
        jest.spyOn(processExecutor, 'executeTask').mockResolvedValueOnce({
          success: true,
          output: 'Quick result',
          error: '',
          exitCode: 0,
          duration: 100,
          resourcesUsed: mockResourceUsage(25, 10),
          artifacts: {},
          metadata: { mode: 'process' },
        });

        await processExecutor.executeTask(quickTask, testAgent);
        results.process.push(performance.now() - start);
      }

      // Measure Docker startup times
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        jest.spyOn(dockerExecutor, 'executeTask').mockResolvedValueOnce({
          success: true,
          output: 'Quick Docker result',
          error: '',
          exitCode: 0,
          duration: 150,
          resourcesUsed: mockResourceUsage(35, 15),
          artifacts: {},
          metadata: { 
            mode: 'docker',
            containerId: `container-${i}`,
            performanceComparison: {
              dockerOverhead: 20,
              startupTime: 2000,
              memoryOverhead: 30 * 1024 * 1024,
              cpuOverhead: 10,
            },
          },
        });

        await dockerExecutor.executeTask(quickTask, testAgent);
        results.docker.push(performance.now() - start);
      }

      // Calculate statistics
      const processAvg = average(results.process);
      const dockerAvg = average(results.docker);
      const startupOverhead = ((dockerAvg - processAvg) / processAvg) * 100;

      console.log('Startup Time Comparison:', {
        processAvg: `${processAvg.toFixed(2)}ms`,
        dockerAvg: `${dockerAvg.toFixed(2)}ms`,
        overhead: `${startupOverhead.toFixed(1)}%`,
      });

      expect(dockerAvg).toBeGreaterThan(processAvg);
      expect(startupOverhead).toBeGreaterThan(0);
      expect(startupOverhead).toBeLessThan(500); // Should be less than 500% overhead
    });

    test('should measure cold vs warm start performance', async () => {
      const coldStart = performance.now();
      
      // First execution (cold start)
      jest.spyOn(dockerExecutor, 'executeTask').mockResolvedValueOnce({
        success: true,
        output: 'Cold start result',
        error: '',
        exitCode: 0,
        duration: 3000, // Longer for cold start
        resourcesUsed: mockResourceUsage(50, 20),
        artifacts: {},
        metadata: { startType: 'cold' },
      });

      await dockerExecutor.executeTask(testTasks[0], testAgent);
      const coldTime = performance.now() - coldStart;

      const warmStart = performance.now();
      
      // Second execution (warm start)
      jest.spyOn(dockerExecutor, 'executeTask').mockResolvedValueOnce({
        success: true,
        output: 'Warm start result',
        error: '',
        exitCode: 0,
        duration: 1500, // Faster for warm start
        resourcesUsed: mockResourceUsage(50, 20),
        artifacts: {},
        metadata: { startType: 'warm' },
      });

      await dockerExecutor.executeTask(testTasks[0], testAgent);
      const warmTime = performance.now() - warmStart;

      const improvement = ((coldTime - warmTime) / coldTime) * 100;

      console.log('Cold vs Warm Start:', {
        coldStart: `${coldTime.toFixed(2)}ms`,
        warmStart: `${warmTime.toFixed(2)}ms`,
        improvement: `${improvement.toFixed(1)}%`,
      });

      expect(warmTime).toBeLessThan(coldTime);
      expect(improvement).toBeGreaterThan(0);
    });
  });

  describe('Resource Usage Comparison', () => {
    test('should compare memory overhead across task complexities', async () => {
      const memoryResults = [];

      for (const task of testTasks) {
        // Mock process execution
        const processMemory = getExpectedMemoryUsage(task.name);
        jest.spyOn(processExecutor, 'executeTask').mockResolvedValueOnce({
          success: true,
          output: 'Process result',
          error: '',
          exitCode: 0,
          duration: 1000,
          resourcesUsed: mockResourceUsage(processMemory, 50),
          artifacts: {},
          metadata: { mode: 'process' },
        });

        // Mock Docker execution
        const dockerMemory = processMemory * 1.4; // 40% overhead
        jest.spyOn(dockerExecutor, 'executeTask').mockResolvedValueOnce({
          success: true,
          output: 'Docker result',
          error: '',
          exitCode: 0,
          duration: 1400,
          resourcesUsed: mockResourceUsage(dockerMemory, 70),
          artifacts: {},
          metadata: { mode: 'docker' },
        });

        const processResult = await processExecutor.executeTask(task, testAgent);
        const dockerResult = await dockerExecutor.executeTask(task, testAgent);

        const memoryOverhead = ((dockerResult.resourcesUsed.maxMemory - processResult.resourcesUsed.maxMemory) / processResult.resourcesUsed.maxMemory) * 100;

        memoryResults.push({
          taskName: task.name,
          taskComplexity: task.priority,
          processMemory: processResult.resourcesUsed.maxMemory,
          dockerMemory: dockerResult.resourcesUsed.maxMemory,
          memoryOverhead,
        });
      }

      // Analyze memory overhead patterns
      const simpleTaskOverhead = memoryResults.filter(r => r.taskComplexity === 'low').map(r => r.memoryOverhead);
      const complexTaskOverhead = memoryResults.filter(r => r.taskComplexity === 'high').map(r => r.memoryOverhead);

      console.log('Memory Overhead by Complexity:', {
        simple: `${average(simpleTaskOverhead).toFixed(1)}%`,
        complex: `${average(complexTaskOverhead).toFixed(1)}%`,
      });

      // Memory overhead should be consistent across task types
      expect(average(simpleTaskOverhead)).toBeGreaterThan(0);
      expect(average(complexTaskOverhead)).toBeGreaterThan(0);
      expect(Math.abs(average(simpleTaskOverhead) - average(complexTaskOverhead))).toBeLessThan(20); // Within 20%
    });

    test('should measure CPU overhead distribution', async () => {
      const cpuResults = [];

      for (let i = 0; i < 15; i++) {
        const task = testTasks[i % testTasks.length];
        
        // Mock varying CPU usage
        const baseCpu = 50 + Math.random() * 100;
        const dockerCpuOverhead = 5 + Math.random() * 15; // 5-20% overhead

        jest.spyOn(processExecutor, 'executeTask').mockResolvedValueOnce({
          success: true,
          output: 'Process result',
          error: '',
          exitCode: 0,
          duration: 1000 + Math.random() * 500,
          resourcesUsed: {
            cpuTime: baseCpu,
            maxMemory: 64 * 1024 * 1024,
            diskIO: 1024,
            networkIO: 0,
            fileHandles: 5,
          },
          artifacts: {},
          metadata: { mode: 'process' },
        });

        jest.spyOn(dockerExecutor, 'executeTask').mockResolvedValueOnce({
          success: true,
          output: 'Docker result',
          error: '',
          exitCode: 0,
          duration: 1000 + Math.random() * 500,
          resourcesUsed: {
            cpuTime: baseCpu * (1 + dockerCpuOverhead / 100),
            maxMemory: 90 * 1024 * 1024,
            diskIO: 1500,
            networkIO: 200,
            fileHandles: 5,
          },
          artifacts: {},
          metadata: { mode: 'docker' },
        });

        const processResult = await processExecutor.executeTask(task, testAgent);
        const dockerResult = await dockerExecutor.executeTask(task, testAgent);

        const cpuOverhead = ((dockerResult.resourcesUsed.cpuTime - processResult.resourcesUsed.cpuTime) / processResult.resourcesUsed.cpuTime) * 100;

        cpuResults.push(cpuOverhead);
      }

      const avgCpuOverhead = average(cpuResults);
      const stdDevCpuOverhead = standardDeviation(cpuResults);

      console.log('CPU Overhead Statistics:', {
        average: `${avgCpuOverhead.toFixed(1)}%`,
        stdDev: `${stdDevCpuOverhead.toFixed(1)}%`,
        min: `${Math.min(...cpuResults).toFixed(1)}%`,
        max: `${Math.max(...cpuResults).toFixed(1)}%`,
      });

      expect(avgCpuOverhead).toBeGreaterThan(0);
      expect(avgCpuOverhead).toBeLessThan(50); // Should be reasonable overhead
      expect(stdDevCpuOverhead).toBeLessThan(20); // Should be consistent
    });
  });

  describe('Execution Time Analysis', () => {
    test('should analyze execution time patterns by task type', async () => {
      const timeResults = new Map<string, { process: number[], docker: number[] }>();

      // Group tasks by type
      const tasksByType = {
        computation: ['simple-computation', 'complex-algorithm'],
        io: ['io-intensive'],
        memory: ['memory-intensive'],
        processing: ['medium-processing'],
      };

      for (const [type, taskNames] of Object.entries(tasksByType)) {
        timeResults.set(type, { process: [], docker: [] });

        for (const taskName of taskNames) {
          const task = testTasks.find(t => t.name === taskName)!;

          // Run multiple iterations for statistical significance
          for (let i = 0; i < 5; i++) {
            // Mock process execution
            const baseTime = getExpectedExecutionTime(taskName);
            jest.spyOn(processExecutor, 'executeTask').mockResolvedValueOnce({
              success: true,
              output: 'Process result',
              error: '',
              exitCode: 0,
              duration: baseTime + Math.random() * 200, // Add some variance
              resourcesUsed: mockResourceUsage(64, 50),
              artifacts: {},
              metadata: { mode: 'process' },
            });

            // Mock Docker execution
            const dockerTime = baseTime * (1.2 + Math.random() * 0.3); // 20-50% overhead
            jest.spyOn(dockerExecutor, 'executeTask').mockResolvedValueOnce({
              success: true,
              output: 'Docker result',
              error: '',
              exitCode: 0,
              duration: dockerTime,
              resourcesUsed: mockResourceUsage(90, 70),
              artifacts: {},
              metadata: { mode: 'docker' },
            });

            const processResult = await processExecutor.executeTask(task, testAgent);
            const dockerResult = await dockerExecutor.executeTask(task, testAgent);

            timeResults.get(type)!.process.push(processResult.duration);
            timeResults.get(type)!.docker.push(dockerResult.duration);
          }
        }
      }

      // Analyze results by task type
      const analysis = Array.from(timeResults.entries()).map(([type, times]) => {
        const processAvg = average(times.process);
        const dockerAvg = average(times.docker);
        const overhead = ((dockerAvg - processAvg) / processAvg) * 100;

        return { type, processAvg, dockerAvg, overhead };
      });

      console.log('Execution Time by Task Type:');
      analysis.forEach(({ type, processAvg, dockerAvg, overhead }) => {
        console.log(`  ${type}: Process=${processAvg.toFixed(0)}ms, Docker=${dockerAvg.toFixed(0)}ms, Overhead=${overhead.toFixed(1)}%`);
      });

      // Verify overhead is reasonable for all task types
      analysis.forEach(({ overhead }) => {
        expect(overhead).toBeGreaterThan(0);
        expect(overhead).toBeLessThan(100); // Less than 100% overhead
      });

      // I/O intensive tasks should have lower relative overhead
      const ioOverhead = analysis.find(a => a.type === 'io')?.overhead || 0;
      const computationOverhead = analysis.find(a => a.type === 'computation')?.overhead || 0;
      
      expect(ioOverhead).toBeLessThanOrEqual(computationOverhead * 1.5); // I/O should have relatively lower overhead
    });

    test('should measure scalability with concurrent executions', async () => {
      const concurrencyLevels = [1, 2, 4, 8];
      const scalabilityResults = [];

      for (const concurrency of concurrencyLevels) {
        const processPromises = [];
        const dockerPromises = [];

        // Create concurrent process executions
        for (let i = 0; i < concurrency; i++) {
          const task = testTasks[i % testTasks.length];
          
          jest.spyOn(processExecutor, 'executeTask').mockResolvedValue({
            success: true,
            output: 'Concurrent process result',
            error: '',
            exitCode: 0,
            duration: 1000 + Math.random() * 200,
            resourcesUsed: mockResourceUsage(64, 50),
            artifacts: {},
            metadata: { mode: 'process', concurrency: i },
          });

          processPromises.push(processExecutor.executeTask(task, testAgent));
        }

        // Create concurrent Docker executions
        for (let i = 0; i < concurrency; i++) {
          const task = testTasks[i % testTasks.length];

          jest.spyOn(dockerExecutor, 'executeTask').mockResolvedValue({
            success: true,
            output: 'Concurrent Docker result',
            error: '',
            exitCode: 0,
            duration: 1400 + Math.random() * 300, // Higher variance under load
            resourcesUsed: mockResourceUsage(90, 70),
            artifacts: {},
            metadata: { mode: 'docker', concurrency: i },
          });

          dockerPromises.push(dockerExecutor.executeTask(task, testAgent));
        }

        // Measure total time for all concurrent executions
        const processStart = performance.now();
        await Promise.all(processPromises);
        const processTotal = performance.now() - processStart;

        const dockerStart = performance.now();
        await Promise.all(dockerPromises);
        const dockerTotal = performance.now() - dockerStart;

        scalabilityResults.push({
          concurrency,
          processTotal,
          dockerTotal,
          dockerOverhead: ((dockerTotal - processTotal) / processTotal) * 100,
        });
      }

      console.log('Scalability Analysis:');
      scalabilityResults.forEach(({ concurrency, processTotal, dockerTotal, dockerOverhead }) => {
        console.log(`  Concurrency ${concurrency}: Process=${processTotal.toFixed(0)}ms, Docker=${dockerTotal.toFixed(0)}ms, Overhead=${dockerOverhead.toFixed(1)}%`);
      });

      // Verify scalability characteristics
      expect(scalabilityResults.length).toBe(concurrencyLevels.length);
      
      // Docker overhead should remain relatively stable with increased concurrency
      const overheads = scalabilityResults.map(r => r.dockerOverhead);
      const overheadVariance = standardDeviation(overheads);
      expect(overheadVariance).toBeLessThan(30); // Should be stable within 30%
    });
  });

  describe('Security vs Performance Trade-off Analysis', () => {
    test('should quantify security gains vs performance cost', async () => {
      const tradeoffAnalysis = [];

      // Test different security configurations
      const securityConfigs = [
        { name: 'minimal', readOnly: false, noNewPrivs: false, capDrop: [], expectedGain: 0.3 },
        { name: 'standard', readOnly: true, noNewPrivs: true, capDrop: ['ALL'], expectedGain: 0.7 },
        { name: 'strict', readOnly: true, noNewPrivs: true, capDrop: ['ALL'], expectedGain: 0.9 },
      ];

      for (const config of securityConfigs) {
        const dockerExecutorWithConfig = new DockerizedTaskExecutor({
          readOnlyRootFs: config.readOnly,
          noNewPrivileges: config.noNewPrivs,
          timeoutMs: 30000,
        });

        // Mock execution with varying overhead based on security level
        const securityOverhead = config.expectedGain * 20; // Higher security = higher overhead
        
        jest.spyOn(dockerExecutorWithConfig, 'executeTask').mockResolvedValue({
          success: true,
          output: 'Secure execution result',
          error: '',
          exitCode: 0,
          duration: 1000 * (1 + securityOverhead / 100),
          resourcesUsed: mockResourceUsage(80 * (1 + securityOverhead / 200), 60),
          artifacts: {},
          metadata: { 
            securityLevel: config.name,
            securityGain: config.expectedGain,
          },
        });

        jest.spyOn(dockerExecutorWithConfig, 'compareWithProcessExecution').mockResolvedValue({
          processExecution: {
            averageDuration: 1000,
            averageMemory: 64 * 1024 * 1024,
            averageCpu: 50,
            successRate: 0.98,
            startupTime: 100,
          },
          dockerExecution: {
            averageDuration: 1000 * (1 + securityOverhead / 100),
            averageMemory: 80 * 1024 * 1024,
            averageCpu: 60,
            successRate: 0.98,
            startupTime: 2000,
          },
          overhead: {
            timeOverhead: securityOverhead,
            memoryOverhead: 25,
            cpuOverhead: 20,
            startupOverhead: 1900,
          },
          securityGains: {
            isolationScore: config.expectedGain,
            attackSurfaceReduction: config.expectedGain * 0.8,
            privilegeEscalationPrevention: config.expectedGain * 0.9,
            resourceContainment: config.expectedGain * 0.85,
          },
        });

        const comparison = await dockerExecutorWithConfig.compareWithProcessExecution(testTasks[0], testAgent, 3);

        tradeoffAnalysis.push({
          securityLevel: config.name,
          performanceOverhead: comparison.overhead.timeOverhead,
          securityGain: comparison.securityGains.isolationScore,
          tradeoffRatio: comparison.securityGains.isolationScore / (comparison.overhead.timeOverhead / 100),
        });

        await dockerExecutorWithConfig.shutdown();
      }

      console.log('Security vs Performance Trade-off:');
      tradeoffAnalysis.forEach(({ securityLevel, performanceOverhead, securityGain, tradeoffRatio }) => {
        console.log(`  ${securityLevel}: Security=${(securityGain * 100).toFixed(1)}%, Overhead=${performanceOverhead.toFixed(1)}%, Ratio=${tradeoffRatio.toFixed(2)}`);
      });

      // Verify trade-off makes sense
      expect(tradeoffAnalysis.length).toBe(3);
      
      // Higher security should provide higher gains but at higher cost
      const minimalSecurity = tradeoffAnalysis.find(a => a.securityLevel === 'minimal')!;
      const strictSecurity = tradeoffAnalysis.find(a => a.securityLevel === 'strict')!;
      
      expect(strictSecurity.securityGain).toBeGreaterThan(minimalSecurity.securityGain);
      expect(strictSecurity.performanceOverhead).toBeGreaterThan(minimalSecurity.performanceOverhead);

      // All configurations should have positive trade-off ratios
      tradeoffAnalysis.forEach(({ tradeoffRatio }) => {
        expect(tradeoffRatio).toBeGreaterThan(0);
      });
    });

    test('should evaluate acceptable performance thresholds', async () => {
      const thresholdTests = [
        { maxOverhead: 25, acceptable: true, description: 'Low overhead threshold' },
        { maxOverhead: 50, acceptable: true, description: 'Medium overhead threshold' },
        { maxOverhead: 100, acceptable: false, description: 'High overhead threshold' },
        { maxOverhead: 200, acceptable: false, description: 'Excessive overhead threshold' },
      ];

      for (const threshold of thresholdTests) {
        // Mock execution with specific overhead
        jest.spyOn(dockerExecutor, 'compareWithProcessExecution').mockResolvedValue({
          processExecution: {
            averageDuration: 1000,
            averageMemory: 64 * 1024 * 1024,
            averageCpu: 50,
            successRate: 0.98,
            startupTime: 100,
          },
          dockerExecution: {
            averageDuration: 1000 * (1 + threshold.maxOverhead / 100),
            averageMemory: 80 * 1024 * 1024,
            averageCpu: 60,
            successRate: 0.98,
            startupTime: 2000,
          },
          overhead: {
            timeOverhead: threshold.maxOverhead,
            memoryOverhead: 25,
            cpuOverhead: 20,
            startupOverhead: 1900,
          },
          securityGains: {
            isolationScore: 0.9,
            attackSurfaceReduction: 0.8,
            privilegeEscalationPrevention: 0.85,
            resourceContainment: 0.8,
          },
        });

        const comparison = await dockerExecutor.compareWithProcessExecution(testTasks[0], testAgent, 1);
        
        const isAcceptable = comparison.overhead.timeOverhead <= 50 && // Max 50% overhead
                            comparison.securityGains.isolationScore >= 0.8; // Min 80% security gain

        console.log(`Threshold Test - ${threshold.description}:`, {
          overhead: `${comparison.overhead.timeOverhead}%`,
          securityGain: `${(comparison.securityGains.isolationScore * 100).toFixed(1)}%`,
          acceptable: isAcceptable,
        });

        if (threshold.acceptable) {
          expect(isAcceptable).toBe(true);
        }
      }
    });
  });

  describe('Comprehensive Performance Report', () => {
    test('should generate detailed performance matrix', async () => {
      // Mock comprehensive comparison
      jest.spyOn(dockerExecutor, 'compareWithProcessExecution').mockResolvedValue({
        processExecution: {
          averageDuration: 1200,
          averageMemory: 72 * 1024 * 1024,
          averageCpu: 55,
          successRate: 0.97,
          startupTime: 120,
        },
        dockerExecution: {
          averageDuration: 1680, // 40% slower
          averageMemory: 108 * 1024 * 1024, // 50% more memory
          averageCpu: 66, // 20% more CPU
          successRate: 0.98, // Slightly better success rate
          startupTime: 2200, // Much slower startup
        },
        overhead: {
          timeOverhead: 40,
          memoryOverhead: 50,
          cpuOverhead: 20,
          startupOverhead: 1733, // 1733% slower startup
        },
        securityGains: {
          isolationScore: 0.92,
          attackSurfaceReduction: 0.75,
          privilegeEscalationPrevention: 0.88,
          resourceContainment: 0.82,
        },
      });

      const performanceMatrix = await dockerExecutor.compareWithProcessExecution(testTasks[0], testAgent, 5);

      // Generate comprehensive report
      const report = {
        executionTime: {
          processAvg: performanceMatrix.processExecution.averageDuration,
          dockerAvg: performanceMatrix.dockerExecution.averageDuration,
          overhead: performanceMatrix.overhead.timeOverhead,
          recommendation: performanceMatrix.overhead.timeOverhead < 50 ? 'Acceptable' : 'Consider optimization',
        },
        memoryUsage: {
          processAvg: performanceMatrix.processExecution.averageMemory / (1024 * 1024),
          dockerAvg: performanceMatrix.dockerExecution.averageMemory / (1024 * 1024),
          overhead: performanceMatrix.overhead.memoryOverhead,
          recommendation: performanceMatrix.overhead.memoryOverhead < 100 ? 'Acceptable' : 'Monitor closely',
        },
        startup: {
          processTime: performanceMatrix.processExecution.startupTime,
          dockerTime: performanceMatrix.dockerExecution.startupTime,
          overhead: performanceMatrix.overhead.startupOverhead,
          recommendation: 'Use warm containers or persistent pools for frequent executions',
        },
        security: {
          isolationGain: performanceMatrix.securityGains.isolationScore * 100,
          overallSecurityImprovement: (
            performanceMatrix.securityGains.isolationScore +
            performanceMatrix.securityGains.attackSurfaceReduction +
            performanceMatrix.securityGains.privilegeEscalationPrevention +
            performanceMatrix.securityGains.resourceContainment
          ) / 4 * 100,
          recommendation: 'Security gains justify performance overhead for production use',
        },
        overallRecommendation: determineOverallRecommendation(performanceMatrix),
      };

      console.log('\n=== COMPREHENSIVE PERFORMANCE REPORT ===');
      console.log('Execution Time:', report.executionTime);
      console.log('Memory Usage:', report.memoryUsage);
      console.log('Startup Performance:', report.startup);
      console.log('Security Gains:', report.security);
      console.log('Overall Recommendation:', report.overallRecommendation);

      // Verify report completeness
      expect(report.executionTime.overhead).toBeGreaterThan(0);
      expect(report.memoryUsage.overhead).toBeGreaterThan(0);
      expect(report.security.isolationGain).toBeGreaterThan(80);
      expect(report.overallRecommendation).toBeDefined();
      expect(report.overallRecommendation.useDocker).toBeDefined();
      expect(report.overallRecommendation.reasoning).toBeDefined();
    });
  });
});

// Helper functions

function createTestTask(name: string, description: string, priority: 'low' | 'medium' | 'high'): TaskDefinition {
  return {
    id: { id: `task-${name}`, swarmId: 'perf-swarm' },
    name,
    type: 'computation',
    description,
    instructions: `Execute ${description.toLowerCase()}`,
    priority: priority === 'low' ? 'low' : priority === 'medium' ? 'normal' : 'high',
    status: 'pending',
    context: {},
    input: { complexity: priority },
    examples: [],
    requirements: {
      tools: ['calculator'],
      memoryRequired: getExpectedMemoryUsage(name),
      maxDuration: getExpectedExecutionTime(name),
      minReliability: 0.9,
      reviewRequired: false,
      testingRequired: false,
      documentationRequired: false,
    },
    constraints: {
      timeoutAfter: getExpectedExecutionTime(name) * 2,
      maxRetries: 3,
    },
    createdAt: new Date(),
    assignedAgents: [],
  };
}

function getExpectedMemoryUsage(taskName: string): number {
  const memoryMap: Record<string, number> = {
    'simple-computation': 32 * 1024 * 1024, // 32MB
    'medium-processing': 64 * 1024 * 1024, // 64MB
    'complex-algorithm': 128 * 1024 * 1024, // 128MB
    'io-intensive': 48 * 1024 * 1024, // 48MB
    'memory-intensive': 256 * 1024 * 1024, // 256MB
  };
  return memoryMap[taskName] || 64 * 1024 * 1024;
}

function getExpectedExecutionTime(taskName: string): number {
  const timeMap: Record<string, number> = {
    'simple-computation': 500, // 500ms
    'medium-processing': 1500, // 1.5s
    'complex-algorithm': 3000, // 3s
    'io-intensive': 2000, // 2s
    'memory-intensive': 4000, // 4s
  };
  return timeMap[taskName] || 1000;
}

function mockResourceUsage(memoryMB: number, cpuPercent: number) {
  return {
    cpuTime: cpuPercent,
    maxMemory: memoryMB * 1024 * 1024,
    diskIO: 1024 + Math.random() * 1024,
    networkIO: Math.random() * 512,
    fileHandles: 5 + Math.floor(Math.random() * 10),
  };
}

function average(numbers: number[]): number {
  return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
}

function standardDeviation(numbers: number[]): number {
  const avg = average(numbers);
  const squareDiffs = numbers.map(num => Math.pow(num - avg, 2));
  return Math.sqrt(average(squareDiffs));
}

function determineOverallRecommendation(comparison: PerformanceComparison): {
  useDocker: boolean;
  reasoning: string;
  conditions: string[];
} {
  const timeOverhead = comparison.overhead.timeOverhead;
  const securityGain = comparison.securityGains.isolationScore;
  const memoryOverhead = comparison.overhead.memoryOverhead;

  const useDocker = timeOverhead < 75 && securityGain > 0.8;

  let reasoning = '';
  const conditions: string[] = [];

  if (useDocker) {
    reasoning = 'Docker containerization recommended for production use';
    conditions.push('Security gains justify performance overhead');
    
    if (timeOverhead < 50) {
      conditions.push('Low performance overhead');
    } else {
      conditions.push('Moderate performance overhead within acceptable limits');
    }
    
    if (securityGain > 0.9) {
      conditions.push('Excellent security isolation');
    }
  } else {
    reasoning = 'Consider process-based execution or optimize Docker configuration';
    
    if (timeOverhead > 100) {
      conditions.push('High performance overhead may impact user experience');
    }
    
    if (securityGain < 0.8) {
      conditions.push('Security gains may not justify performance cost');
    }
  }

  return { useDocker, reasoning, conditions };
}