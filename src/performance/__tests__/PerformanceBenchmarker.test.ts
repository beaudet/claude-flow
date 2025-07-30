/**
 * Comprehensive tests for Performance Benchmarker
 * Tests core performance monitoring functionality
 */

import { jest } from '@jest/globals';
import { PerformanceBenchmarker } from '../core/PerformanceBenchmarker.js';
import { 
  BenchmarkConfig, 
  BenchmarkResult, 
  SystemMetrics, 
  PerformanceTest 
} from '../types.js';

// Mock external dependencies
jest.mock('../../monitoring/real-time-monitor.js');
jest.mock('os');
jest.mock('process');

describe('PerformanceBenchmarker', () => {
  let benchmarker: PerformanceBenchmarker;
  let mockConfig: BenchmarkConfig;

  beforeEach(() => {
    mockConfig = {
      name: 'test-benchmark',
      iterations: 10,
      warmupIterations: 3,
      timeout: 30000,
      memoryLimit: 500 * 1024 * 1024, // 500MB
      cpuLimit: 80, // 80%
      thresholds: {
        maxExecutionTime: 1000,
        maxMemoryUsage: 100 * 1024 * 1024,
        maxCpuUsage: 70,
        regressionThreshold: 10
      },
      environment: 'test'
    };

    benchmarker = new PerformanceBenchmarker(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Benchmark Execution', () => {
    test('should run basic performance benchmark', async () => {
      const testFunction = jest.fn().mockResolvedValue('test result');
      
      const result = await benchmarker.runBenchmark('test-benchmark', testFunction);

      expect(result).toBeDefined();
      expect(result.name).toBe('test-benchmark');
      expect(result.iterations).toBe(mockConfig.iterations);
      expect(result.totalTime).toBeGreaterThan(0);
      expect(result.averageTime).toBeGreaterThan(0);
      expect(result.minTime).toBeGreaterThan(0);
      expect(result.maxTime).toBeGreaterThan(0);
      expect(result.success).toBe(true);
      expect(testFunction).toHaveBeenCalledTimes(mockConfig.iterations! + mockConfig.warmupIterations!);
    });

    test('should handle benchmark failures gracefully', async () => {
      const testFunction = jest.fn().mockRejectedValue(new Error('Test error'));
      
      const result = await benchmarker.runBenchmark('failing-benchmark', testFunction);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Test error');
      expect(result.averageTime).toBe(0);
    });

    test('should respect timeout configuration', async () => {
      const slowFunction = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 2000))
      );

      const shortTimeoutConfig = { ...mockConfig, timeout: 100 };
      const shortTimeoutBenchmarker = new PerformanceBenchmarker(shortTimeoutConfig);

      const result = await shortTimeoutBenchmarker.runBenchmark('timeout-test', slowFunction);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    test('should collect system metrics during benchmark', async () => {
      const testFunction = jest.fn().mockResolvedValue('result');
      
      const result = await benchmarker.runBenchmark('metrics-test', testFunction);

      expect(result.systemMetrics).toBeDefined();
      expect(result.systemMetrics.cpuUsage).toBeDefined();
      expect(result.systemMetrics.memoryUsage).toBeDefined();
      expect(result.systemMetrics.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Memory Monitoring', () => {
    test('should track memory usage during benchmark', async () => {
      const memoryIntensiveFunction = jest.fn().mockImplementation(() => {
        // Simulate memory allocation
        const largeArray = new Array(100000).fill('test');
        return Promise.resolve(largeArray.length);
      });

      const result = await benchmarker.runBenchmark('memory-test', memoryIntensiveFunction);

      expect(result.memoryStats).toBeDefined();
      expect(result.memoryStats.peakUsage).toBeGreaterThan(0);
      expect(result.memoryStats.averageUsage).toBeGreaterThan(0);
      expect(result.memoryStats.gcCount).toBeDefined();
    });

    test('should detect memory limit violations', async () => {
      const lowMemoryConfig = { ...mockConfig, memoryLimit: 1024 }; // 1KB limit
      const lowMemoryBenchmarker = new PerformanceBenchmarker(lowMemoryConfig);
      
      const memoryHogFunction = jest.fn().mockImplementation(() => {
        const largeBuffer = Buffer.alloc(2048); // 2KB allocation
        return Promise.resolve(largeBuffer.length);
      });

      const result = await lowMemoryBenchmarker.runBenchmark('memory-limit-test', memoryHogFunction);

      expect(result.success).toBe(false);
      expect(result.error).toContain('memory limit');
    });
  });

  describe('CPU Monitoring', () => {
    test('should track CPU usage during benchmark', async () => {
      const cpuIntensiveFunction = jest.fn().mockImplementation(() => {
        // Simulate CPU-intensive work
        let sum = 0;
        for (let i = 0; i < 100000; i++) {
          sum += Math.random();
        }
        return Promise.resolve(sum);
      });

      const result = await benchmarker.runBenchmark('cpu-test', cpuIntensiveFunction);

      expect(result.systemMetrics.cpuUsage).toBeDefined();
      expect(typeof result.systemMetrics.cpuUsage).toBe('number');
      expect(result.systemMetrics.cpuUsage).toBeGreaterThanOrEqual(0);
      expect(result.systemMetrics.cpuUsage).toBeLessThanOrEqual(100);
    });
  });

  describe('Regression Detection', () => {
    test('should detect performance regressions', async () => {
      const testFunction = jest.fn().mockResolvedValue('result');
      
      // Create baseline result
      const baselineResult: BenchmarkResult = {
        name: 'regression-test',
        timestamp: new Date(),
        iterations: 10,
        totalTime: 1000,
        averageTime: 100,
        minTime: 90,
        maxTime: 110,
        standardDeviation: 5,
        throughput: 10,
        success: true,
        systemMetrics: {
          cpuUsage: 50,
          memoryUsage: 1024 * 1024,
          timestamp: new Date()
        },
        memoryStats: {
          peakUsage: 1024 * 1024,
          averageUsage: 512 * 1024,
          gcCount: 2
        }
      };

      // Current result is slower (regression)
      const currentResult = await benchmarker.runBenchmark('regression-test', testFunction);
      
      // Mock the current result to be slower
      currentResult.averageTime = 150; // 50% slower than baseline
      
      const hasRegression = benchmarker.detectRegression(baselineResult, currentResult);
      
      expect(hasRegression).toBe(true);
    });

    test('should not flag minor performance variations as regressions', async () => {
      const testFunction = jest.fn().mockResolvedValue('result');
      
      const baselineResult: BenchmarkResult = {
        name: 'stable-test',
        timestamp: new Date(),
        iterations: 10,
        totalTime: 1000,
        averageTime: 100,
        minTime: 95,
        maxTime: 105,
        standardDeviation: 3,
        throughput: 10,
        success: true,
        systemMetrics: {
          cpuUsage: 50,
          memoryUsage: 1024 * 1024,
          timestamp: new Date()
        },
        memoryStats: {
          peakUsage: 1024 * 1024,
          averageUsage: 512 * 1024,
          gcCount: 2
        }
      };

      const currentResult = await benchmarker.runBenchmark('stable-test', testFunction);
      currentResult.averageTime = 105; // Only 5% slower (within threshold)
      
      const hasRegression = benchmarker.detectRegression(baselineResult, currentResult);
      
      expect(hasRegression).toBe(false);
    });
  });

  describe('Batch Testing', () => {
    test('should run multiple benchmarks in batch', async () => {
      const tests: PerformanceTest[] = [
        {
          name: 'test-1',
          fn: jest.fn().mockResolvedValue('result-1'),
          config: { iterations: 5 }
        },
        {
          name: 'test-2',
          fn: jest.fn().mockResolvedValue('result-2'),
          config: { iterations: 3 }
        }
      ];

      const results = await benchmarker.runBatchTests(tests);

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('test-1');
      expect(results[1].name).toBe('test-2');
      expect(results[0].iterations).toBe(5);
      expect(results[1].iterations).toBe(3);
    });

    test('should continue batch testing even if individual tests fail', async () => {
      const tests: PerformanceTest[] = [
        {
          name: 'passing-test',
          fn: jest.fn().mockResolvedValue('success'),
          config: { iterations: 3 }
        },
        {
          name: 'failing-test',
          fn: jest.fn().mockRejectedValue(new Error('Test failure')),
          config: { iterations: 3 }
        },
        {
          name: 'another-passing-test',
          fn: jest.fn().mockResolvedValue('success'),
          config: { iterations: 3 }
        }
      ];

      const results = await benchmarker.runBatchTests(tests);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });
  });

  describe('Statistical Analysis', () => {
    test('should calculate statistical metrics correctly', async () => {
      const testFunction = jest.fn().mockImplementation(() => {
        // Return varying execution times
        const delay = Math.random() * 100 + 50; // 50-150ms
        return new Promise(resolve => setTimeout(() => resolve('result'), delay));
      });

      const result = await benchmarker.runBenchmark('stats-test', testFunction);

      expect(result.standardDeviation).toBeGreaterThan(0);
      expect(result.minTime).toBeLessThanOrEqual(result.averageTime);
      expect(result.maxTime).toBeGreaterThanOrEqual(result.averageTime);
      expect(result.throughput).toBeGreaterThan(0);
    });

    test('should handle consistent performance correctly', async () => {
      const consistentFunction = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('result'), 100))
      );

      const result = await benchmarker.runBenchmark('consistent-test', consistentFunction);

      expect(result.standardDeviation).toBeLessThan(10); // Should be low for consistent timing
      expect(Math.abs(result.minTime - result.maxTime)).toBeLessThan(50); // Small range
    });
  });

  describe('Configuration Validation', () => {
    test('should validate benchmark configuration', () => {
      const invalidConfig = {
        ...mockConfig,
        iterations: -1, // Invalid
        timeout: 0 // Invalid
      };

      expect(() => new PerformanceBenchmarker(invalidConfig)).toThrow();
    });

    test('should use default values for missing configuration', () => {
      const minimalConfig: Partial<BenchmarkConfig> = {
        name: 'minimal-test'
      };

      const benchmarkerWithDefaults = new PerformanceBenchmarker(minimalConfig as BenchmarkConfig);
      
      expect(benchmarkerWithDefaults).toBeDefined();
      // Should use reasonable defaults
    });
  });

  describe('Cleanup and Resource Management', () => {
    test('should clean up resources after benchmark completion', async () => {
      const resourceCleanupSpy = jest.spyOn(benchmarker as any, 'cleanup');
      const testFunction = jest.fn().mockResolvedValue('result');

      await benchmarker.runBenchmark('cleanup-test', testFunction);

      expect(resourceCleanupSpy).toHaveBeenCalled();
    });

    test('should clean up resources even after benchmark failure', async () => {
      const resourceCleanupSpy = jest.spyOn(benchmarker as any, 'cleanup');
      const failingFunction = jest.fn().mockRejectedValue(new Error('Test error'));

      await benchmarker.runBenchmark('cleanup-fail-test', failingFunction);

      expect(resourceCleanupSpy).toHaveBeenCalled();
    });
  });
});