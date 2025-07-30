/**
 * Comprehensive tests for Memory Leak Detector
 * Tests memory monitoring and leak detection functionality
 */

import { jest } from '@jest/globals';
import { MemoryLeakDetector } from '../memory/MemoryLeakDetector.js';
import { 
  MemoryMonitoringConfig, 
  MemoryProfile, 
  MemoryLeak,
  MemorySnapshot 
} from '../types.js';

// Mock Node.js memory-related APIs
const mockProcess = {
  memoryUsage: jest.fn(),
  cpuUsage: jest.fn()
};

// Mock v8 profiling APIs
const mockV8 = {
  writeHeapSnapshot: jest.fn(),
  getHeapSnapshot: jest.fn(),
  getHeapStatistics: jest.fn()
};

jest.mock('process', () => mockProcess);
jest.mock('v8', () => mockV8);
jest.mock('../../monitoring/real-time-monitor.js');

describe('MemoryLeakDetector', () => {
  let detector: MemoryLeakDetector;
  let mockConfig: MemoryMonitoringConfig;

  beforeEach(() => {
    mockConfig = {
      monitoringInterval: 1000,
      snapshotInterval: 5000,
      maxSnapshots: 10,
      leakThreshold: 50 * 1024 * 1024, // 50MB
      growthRateThreshold: 10, // 10% per minute
      retentionPeriod: 3600000, // 1 hour
      enableProfiling: true,
      enableGCMonitoring: true
    };

    detector = new MemoryLeakDetector(mockConfig);

    // Setup default mocks
    mockProcess.memoryUsage.mockReturnValue({
      rss: 100 * 1024 * 1024,     // 100MB
      heapTotal: 50 * 1024 * 1024, // 50MB
      heapUsed: 30 * 1024 * 1024,  // 30MB
      external: 5 * 1024 * 1024,   // 5MB
      arrayBuffers: 2 * 1024 * 1024 // 2MB
    });

    mockV8.getHeapStatistics.mockReturnValue({
      total_heap_size: 50 * 1024 * 1024,
      total_heap_size_executable: 5 * 1024 * 1024,
      total_physical_size: 45 * 1024 * 1024,
      total_available_size: 100 * 1024 * 1024,
      used_heap_size: 30 * 1024 * 1024,
      heap_size_limit: 1024 * 1024 * 1024,
      malloced_memory: 1024 * 1024,
      peak_malloced_memory: 2 * 1024 * 1024,
      does_zap_garbage: false,
      number_of_native_contexts: 1,
      number_of_detached_contexts: 0
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    detector.stop();
  });

  describe('Memory Monitoring', () => {
    test('should start memory monitoring', async () => {
      await detector.startMonitoring();

      expect(detector.isMonitoring()).toBe(true);
      
      // Wait for at least one monitoring cycle
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      expect(mockProcess.memoryUsage).toHaveBeenCalled();
    });

    test('should stop memory monitoring', async () => {
      await detector.startMonitoring();
      expect(detector.isMonitoring()).toBe(true);

      detector.stop();
      expect(detector.isMonitoring()).toBe(false);
    });

    test('should collect memory snapshots at specified intervals', async () => {
      const snapshotSpy = jest.spyOn(detector as any, 'takeSnapshot');
      
      await detector.startMonitoring();
      
      // Wait for snapshot interval
      await new Promise(resolve => setTimeout(resolve, 5100));
      
      expect(snapshotSpy).toHaveBeenCalled();
    });

    test('should limit number of stored snapshots', async () => {
      // Configure to keep only 3 snapshots
      const limitedConfig = { ...mockConfig, maxSnapshots: 3 };
      const limitedDetector = new MemoryLeakDetector(limitedConfig);

      await limitedDetector.startMonitoring();

      // Force multiple snapshots
      for (let i = 0; i < 5; i++) {
        await (limitedDetector as any).takeSnapshot();
      }

      const snapshots = (limitedDetector as any).snapshots;
      expect(snapshots.length).toBeLessThanOrEqual(3);

      limitedDetector.stop();
    });
  });

  describe('Memory Leak Detection', () => {
    test('should detect memory leaks based on consistent growth', async () => {
      let memoryUsage = 50 * 1024 * 1024; // Start at 50MB

      // Mock increasing memory usage
      mockProcess.memoryUsage.mockImplementation(() => {
        memoryUsage += 5 * 1024 * 1024; // Increase by 5MB each call
        return {
          rss: memoryUsage + 20 * 1024 * 1024,
          heapTotal: memoryUsage,
          heapUsed: memoryUsage * 0.8,
          external: 5 * 1024 * 1024,
          arrayBuffers: 2 * 1024 * 1024
        };
      });

      await detector.startMonitoring();

      // Wait for enough data points
      await new Promise(resolve => setTimeout(resolve, 6000));

      const leaks = detector.detectLeaks();
      
      expect(leaks.length).toBeGreaterThan(0);
      expect(leaks[0].severity).toBeDefined();
      expect(leaks[0].growthRate).toBeGreaterThan(0);
    });

    test('should not flag normal memory fluctuations as leaks', async () => {
      let callCount = 0;
      const baseMemory = 50 * 1024 * 1024;

      // Mock fluctuating but stable memory usage
      mockProcess.memoryUsage.mockImplementation(() => {
        callCount++;
        const variation = Math.sin(callCount * 0.1) * 5 * 1024 * 1024; // ±5MB variation
        const memoryUsage = baseMemory + variation;
        
        return {
          rss: memoryUsage + 20 * 1024 * 1024,
          heapTotal: memoryUsage,
          heapUsed: memoryUsage * 0.8,
          external: 5 * 1024 * 1024,
          arrayBuffers: 2 * 1024 * 1024
        };
      });

      await detector.startMonitoring();

      // Wait for data collection
      await new Promise(resolve => setTimeout(resolve, 3000));

      const leaks = detector.detectLeaks();
      
      expect(leaks.length).toBe(0);
    });

    test('should classify leak severity correctly', async () => {
      let memoryUsage = 50 * 1024 * 1024;

      // Mock severe memory leak (20MB per call)
      mockProcess.memoryUsage.mockImplementation(() => {
        memoryUsage += 20 * 1024 * 1024;
        return {
          rss: memoryUsage + 20 * 1024 * 1024,
          heapTotal: memoryUsage,
          heapUsed: memoryUsage * 0.9,
          external: 5 * 1024 * 1024,
          arrayBuffers: 2 * 1024 * 1024
        };
      });

      await detector.startMonitoring();
      await new Promise(resolve => setTimeout(resolve, 3000));

      const leaks = detector.detectLeaks();
      
      expect(leaks.length).toBeGreaterThan(0);
      expect(leaks[0].severity).toBe('critical'); // Should be critical due to high growth rate
    });
  });

  describe('Memory Profile Analysis', () => {
    test('should generate comprehensive memory profile', async () => {
      await detector.startMonitoring();
      await new Promise(resolve => setTimeout(resolve, 2000));

      const profile = detector.generateProfile();

      expect(profile).toBeDefined();
      expect(profile.timestamp).toBeInstanceOf(Date);
      expect(profile.currentUsage).toBeDefined();
      expect(profile.trend).toBeDefined();
      expect(profile.leaks).toBeDefined();
      expect(profile.recommendations).toBeDefined();
    });

    test('should track memory usage trends', async () => {
      let memoryUsage = 30 * 1024 * 1024;

      // Mock gradual memory increase
      mockProcess.memoryUsage.mockImplementation(() => {
        memoryUsage += 1024 * 1024; // 1MB increase per call
        return {
          rss: memoryUsage + 10 * 1024 * 1024,
          heapTotal: memoryUsage,
          heapUsed: memoryUsage * 0.8,
          external: 5 * 1024 * 1024,
          arrayBuffers: 2 * 1024 * 1024
        };
      });

      await detector.startMonitoring();
      await new Promise(resolve => setTimeout(resolve, 3000));

      const profile = detector.generateProfile();

      expect(profile.trend.direction).toBe('increasing');
      expect(profile.trend.rate).toBeGreaterThan(0);
    });

    test('should provide actionable recommendations', async () => {
      // Mock high memory usage scenario
      mockProcess.memoryUsage.mockReturnValue({
        rss: 500 * 1024 * 1024,     // 500MB RSS
        heapTotal: 400 * 1024 * 1024, // 400MB heap
        heapUsed: 350 * 1024 * 1024,  // 350MB used (87.5%)
        external: 50 * 1024 * 1024,   // 50MB external
        arrayBuffers: 20 * 1024 * 1024 // 20MB array buffers
      });

      await detector.startMonitoring();
      await new Promise(resolve => setTimeout(resolve, 1000));

      const profile = detector.generateProfile();

      expect(profile.recommendations.length).toBeGreaterThan(0);
      expect(profile.recommendations.some(r => 
        r.includes('heap usage') || r.includes('memory')
      )).toBe(true);
    });
  });

  describe('Garbage Collection Monitoring', () => {
    test('should monitor GC activity when enabled', async () => {
      const gcSpy = jest.spyOn(detector as any, 'trackGCActivity');
      
      await detector.startMonitoring();
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Simulate GC event
      process.emit('gc' as any, { type: 'major', duration: 15 });

      expect(gcSpy).toHaveBeenCalled();
    });

    test('should detect excessive GC pressure', async () => {
      await detector.startMonitoring();

      // Simulate frequent GC events
      for (let i = 0; i < 10; i++) {
        process.emit('gc' as any, { type: 'major', duration: 20 + i * 5 });
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      const profile = detector.generateProfile();
      
      expect(profile.gcStats).toBeDefined();
      expect(profile.gcStats.frequency).toBeGreaterThan(0);
      expect(profile.recommendations.some(r => 
        r.includes('garbage collection') || r.includes('GC')
      )).toBe(true);
    });
  });

  describe('Heap Snapshot Analysis', () => {
    test('should create heap snapshots when enabled', async () => {
      mockV8.writeHeapSnapshot.mockReturnValue('/tmp/heap-snapshot-123.heapsnapshot');

      await detector.startMonitoring();
      
      const snapshotPath = await (detector as any).createHeapSnapshot();
      
      expect(snapshotPath).toBeDefined();
      expect(mockV8.writeHeapSnapshot).toHaveBeenCalled();
    });

    test('should compare heap snapshots to identify growing objects', async () => {
      const snapshot1: MemorySnapshot = {
        timestamp: new Date(Date.now() - 60000),
        heapUsed: 30 * 1024 * 1024,
        heapTotal: 50 * 1024 * 1024,
        objects: [
          { type: 'String', count: 1000, size: 50000 },
          { type: 'Array', count: 500, size: 100000 }
        ]
      };

      const snapshot2: MemorySnapshot = {
        timestamp: new Date(),
        heapUsed: 40 * 1024 * 1024,
        heapTotal: 60 * 1024 * 1024,
        objects: [
          { type: 'String', count: 2000, size: 100000 }, // Doubled
          { type: 'Array', count: 500, size: 100000 }    // Same
        ]
      };

      const comparison = (detector as any).compareSnapshots(snapshot1, snapshot2);

      expect(comparison).toBeDefined();
      expect(comparison.growingObjects).toBeDefined();
      expect(comparison.growingObjects.some((obj: any) => obj.type === 'String')).toBe(true);
    });
  });

  describe('Performance Impact', () => {
    test('should have minimal performance impact during monitoring', async () => {
      const startTime = process.hrtime.bigint();
      
      await detector.startMonitoring();
      
      // Simulate some work
      for (let i = 0; i < 1000000; i++) {
        Math.random();
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
      
      // Monitoring should not add significant overhead
      expect(duration).toBeLessThan(3000); // Should complete within 3 seconds
    });

    test('should batch memory checks to reduce overhead', async () => {
      await detector.startMonitoring();
      
      const initialCallCount = mockProcess.memoryUsage.mock.calls.length;
      
      await new Promise(resolve => setTimeout(resolve, 2500)); // 2.5 seconds
      
      const finalCallCount = mockProcess.memoryUsage.mock.calls.length;
      const callsPerSecond = (finalCallCount - initialCallCount) / 2.5;
      
      // Should not exceed reasonable monitoring frequency
      expect(callsPerSecond).toBeLessThan(10); // Less than 10 calls per second
    });
  });

  describe('Error Handling', () => {
    test('should handle memory usage API failures gracefully', async () => {
      mockProcess.memoryUsage.mockImplementation(() => {
        throw new Error('Memory API unavailable');
      });

      await detector.startMonitoring();
      
      // Should not crash and should continue monitoring
      expect(detector.isMonitoring()).toBe(true);
      
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should still be running despite API errors
      expect(detector.isMonitoring()).toBe(true);
    });

    test('should handle heap snapshot failures gracefully', async () => {
      mockV8.writeHeapSnapshot.mockImplementation(() => {
        throw new Error('Heap snapshot failed');
      });

      await detector.startMonitoring();
      
      // Should not crash when snapshot fails
      const profile = detector.generateProfile();
      expect(profile).toBeDefined();
    });

    test('should cleanup resources on error', async () => {
      const cleanupSpy = jest.spyOn(detector as any, 'cleanup');
      
      // Force an error during monitoring
      mockProcess.memoryUsage.mockImplementation(() => {
        throw new Error('Critical memory error');
      });

      await detector.startMonitoring();
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      detector.stop();
      
      expect(cleanupSpy).toHaveBeenCalled();
    });
  });

  describe('Configuration Validation', () => {
    test('should validate monitoring configuration', () => {
      const invalidConfig = {
        ...mockConfig,
        monitoringInterval: -1, // Invalid
        leakThreshold: 0 // Invalid
      };

      expect(() => new MemoryLeakDetector(invalidConfig)).toThrow();
    });

    test('should use reasonable defaults for missing configuration', () => {
      const minimalConfig: Partial<MemoryMonitoringConfig> = {};

      const detectorWithDefaults = new MemoryLeakDetector(minimalConfig as MemoryMonitoringConfig);
      
      expect(detectorWithDefaults).toBeDefined();
    });
  });

  describe('Reporting', () => {
    test('should generate detailed leak report', async () => {
      // Setup leak scenario
      let memoryUsage = 50 * 1024 * 1024;
      mockProcess.memoryUsage.mockImplementation(() => {
        memoryUsage += 10 * 1024 * 1024;
        return {
          rss: memoryUsage + 20 * 1024 * 1024,
          heapTotal: memoryUsage,
          heapUsed: memoryUsage * 0.9,
          external: 5 * 1024 * 1024,
          arrayBuffers: 2 * 1024 * 1024
        };
      });

      await detector.startMonitoring();
      await new Promise(resolve => setTimeout(resolve, 3000));

      const report = detector.generateLeakReport();

      expect(report).toBeDefined();
      expect(report).toContain('Memory Leak Detection Report');
      expect(report).toContain('Detected Leaks');
      expect(report).toContain('MB'); // Should contain memory sizes
    });

    test('should export monitoring data for analysis', async () => {
      await detector.startMonitoring();
      await new Promise(resolve => setTimeout(resolve, 2000));

      const exportData = detector.exportData();

      expect(exportData).toBeDefined();
      expect(exportData.snapshots).toBeDefined();
      expect(exportData.leaks).toBeDefined();
      expect(exportData.config).toBeDefined();
      expect(exportData.metadata).toBeDefined();
    });
  });
});