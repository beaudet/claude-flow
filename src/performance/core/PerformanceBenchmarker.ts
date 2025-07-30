/**
 * Core Performance Benchmarker
 * Implements comprehensive performance benchmarking and optimization analysis
 */

import { EventEmitter } from 'events';
import * as os from 'os';
import * as v8 from 'v8';
import * as process from 'process';
import { performance } from 'perf_hooks';
import {
  PerformanceMetrics,
  PerformanceTest,
  PerformanceBaseline,
  PerformanceConfig,
  PerformanceReport,
  TestResult,
  ValidationResult,
  PerformanceIssue,
  MemoryMetrics,
  CPUMetrics,
  NetworkMetrics,
  DiskMetrics,
  EnvironmentInfo,
  MemoryLeakIndicator,
  ProfilingSession,
  ProfilingResults
} from '../types.js';

export class PerformanceBenchmarker extends EventEmitter {
  private tests: Map<string, PerformanceTest> = new Map();
  private baselines: Map<string, PerformanceBaseline> = new Map();
  private sessions: Map<string, ProfilingSession> = new Map();
  private config: PerformanceConfig;
  private isRunning: boolean = false;
  private startTime: number = 0;
  private memoryHistory: MemoryMetrics[] = [];
  private cpuHistory: CPUMetrics[] = [];

  constructor(config: Partial<PerformanceConfig> = {}) {
    super();
    
    this.config = {
      enabled: true,
      baseline: {
        autoUpdate: false,
        retentionDays: 30,
        comparisonWindow: 7
      },
      thresholds: {
        memoryUsage: 500 * 1024 * 1024, // 500MB
        cpuUsage: 80, // 80%
        responseTime: 5000, // 5s
        bundleSize: 10 * 1024 * 1024, // 10MB
        regressionPercent: 10 // 10%
      },
      alerts: {
        enabled: true,
        channels: [],
        debounceMs: 30000, // 30s
        aggregationWindow: 300000 // 5m
      },
      monitoring: {
        interval: 5000, // 5s
        retentionDays: 7,
        batchSize: 100,
        enableProfiling: false
      },
      bundleAnalysis: {
        enabled: true,
        trackDependencies: true,
        analyzeTreeshaking: true,
        findDuplicates: true,
        detectUnusedCode: true
      },
      ...config
    };
  }

  /**
   * Register a performance test
   */
  registerTest(test: PerformanceTest): void {
    this.tests.set(test.id, test);
    this.emit('testRegistered', { testId: test.id, name: test.name });
  }

  /**
   * Unregister a performance test
   */
  unregisterTest(testId: string): boolean {
    const removed = this.tests.delete(testId);
    if (removed) {
      this.emit('testUnregistered', { testId });
    }
    return removed;
  }

  /**
   * Set or update performance baseline
   */
  setBaseline(baseline: PerformanceBaseline): void {
    this.baselines.set(baseline.id, baseline);
    this.emit('baselineUpdated', { baselineId: baseline.id, name: baseline.name });
  }

  /**
   * Get current system metrics
   */
  async collectSystemMetrics(): Promise<PerformanceMetrics> {
    const timestamp = Date.now();
    const startMark = performance.now();

    // Memory metrics
    const memUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();
    const memoryMetrics: MemoryMetrics = {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      arrayBuffers: memUsage.arrayBuffers,
      peak: heapStats.peak_malloced_memory,
      growthRate: this.calculateMemoryGrowthRate(),
      leakIndicators: this.detectMemoryLeaks()
    };

    // CPU metrics
    const cpuUsage = process.cpuUsage();
    const loadAvg = os.loadavg();
    const cpuMetrics: CPUMetrics = {
      user: cpuUsage.user,
      system: cpuUsage.system,
      total: cpuUsage.user + cpuUsage.system,
      cores: os.cpus().map(() => 0), // Would need platform-specific implementation
      loadAverage: loadAvg,
      utilizationPercent: this.calculateCPUUtilization()
    };

    // Network metrics (simplified - would need platform-specific implementation)
    const networkMetrics: NetworkMetrics = {
      bytesIn: 0,
      bytesOut: 0,
      packetsIn: 0,
      packetsOut: 0,
      connectionsActive: 0
    };

    // Disk metrics (simplified - would need platform-specific implementation)
    const diskMetrics: DiskMetrics = {
      bytesRead: 0,
      bytesWritten: 0,
      operationsRead: 0,
      operationsWrite: 0,
      queueLength: 0
    };

    const endMark = performance.now();
    const duration = endMark - startMark;

    // Store metrics for trend analysis
    this.memoryHistory.push(memoryMetrics);
    this.cpuHistory.push(cpuMetrics);
    
    // Keep only recent history
    if (this.memoryHistory.length > 1000) {
      this.memoryHistory = this.memoryHistory.slice(-500);
    }
    if (this.cpuHistory.length > 1000) {
      this.cpuHistory = this.cpuHistory.slice(-500);
    }

    return {
      timestamp,
      duration,
      memoryUsage: memoryMetrics,
      cpuUsage: cpuMetrics,
      networkIO: networkMetrics,
      diskIO: diskMetrics
    };
  }

  /**
   * Run a specific performance test
   */
  async runTest(testId: string, baseline?: string): Promise<TestResult> {
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error(`Test not found: ${testId}`);
    }

    this.emit('testStarted', { testId, name: test.name });
    const startTime = performance.now();
    let result: TestResult;

    try {
      // Setup phase
      if (test.setup) {
        await test.setup();
      }

      // Warmup iterations
      if (test.warmupIterations && test.warmupIterations > 0) {
        for (let i = 0; i < test.warmupIterations; i++) {
          await test.execute();
        }
      }

      // Execute test iterations
      const iterations = test.testIterations || 1;
      const metrics: PerformanceMetrics[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const iterationMetrics = await test.execute();
        metrics.push(iterationMetrics);
      }

      // Calculate average metrics
      const averageMetrics = this.averageMetrics(metrics);
      
      // Get baseline for comparison
      const baselineMetrics = baseline ? this.baselines.get(baseline)?.metrics : undefined;
      
      // Validate results
      const validation = test.validate 
        ? test.validate(averageMetrics, baselineMetrics)
        : this.defaultValidation(averageMetrics, baselineMetrics);

      const duration = performance.now() - startTime;

      result = {
        test,
        metrics: averageMetrics,
        baseline: baselineMetrics,
        validation,
        duration,
        status: validation.passed ? 'passed' : 'failed'
      };

      // Teardown phase
      if (test.teardown) {
        await test.teardown();
      }

    } catch (error) {
      const duration = performance.now() - startTime;
      result = {
        test,
        metrics: await this.collectSystemMetrics(), // Best effort metrics
        validation: {
          passed: false,
          score: 0,
          issues: [{
            type: 'slow_operation',
            severity: 'error',
            message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
            metric: 'execution',
            current: duration,
            impact: 'critical'
          }],
          recommendations: ['Fix test execution error', 'Check test implementation']
        },
        duration,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      };
    }

    this.emit('testCompleted', { testId, result });
    return result;
  }

  /**
   * Run all registered tests
   */
  async runAllTests(baseline?: string): Promise<TestResult[]> {
    if (this.isRunning) {
      throw new Error('Benchmark suite is already running');
    }

    this.isRunning = true;
    this.startTime = Date.now();
    this.emit('suiteStarted', { totalTests: this.tests.size });

    const results: TestResult[] = [];

    try {
      for (const [testId] of this.tests) {
        try {
          const result = await this.runTest(testId, baseline);
          results.push(result);
        } catch (error) {
          console.error(`Failed to run test ${testId}:`, error);
          // Continue with other tests
        }
      }
    } finally {
      this.isRunning = false;
      this.emit('suiteCompleted', { 
        duration: Date.now() - this.startTime,
        results: results.length 
      });
    }

    return results;
  }

  /**
   * Generate performance report
   */
  async generateReport(
    results: TestResult[],
    period: { start: number; end: number }
  ): Promise<PerformanceReport> {
    const timestamp = Date.now();
    const environment = await this.getEnvironmentInfo();

    // Calculate summary
    const totalTests = results.length;
    const passedTests = results.filter(r => r.status === 'passed').length;
    const failedTests = results.filter(r => r.status === 'failed').length;
    
    const performanceScores = results
      .filter(r => r.validation.passed)
      .map(r => r.validation.score);
    const averagePerformance = performanceScores.length > 0
      ? performanceScores.reduce((a, b) => a + b, 0) / performanceScores.length
      : 0;

    // Analyze regressions
    const regressions = results
      .filter(r => r.baseline)
      .map(r => this.analyzeRegression(r))
      .filter(r => r !== null) as any[];

    // Generate recommendations
    const recommendations = this.generateRecommendations(results, regressions);

    return {
      id: `report-${timestamp}`,
      timestamp,
      period,
      summary: {
        totalTests,
        passedTests,
        failedTests,
        averagePerformance,
        performanceChange: this.calculatePerformanceChange(results),
        criticalIssues: this.countCriticalIssues(results),
        bundleSizeChange: 0, // Would be calculated if bundle analysis enabled
        memoryLeaks: this.countMemoryLeaks(results)
      },
      tests: results,
      regressions,
      trends: [], // Would be calculated from historical data
      recommendations,
      environment
    };
  }

  /**
   * Start profiling session
   */
  startProfiling(
    type: 'cpu' | 'memory' | 'bundle' | 'network',
    options: Record<string, any> = {}
  ): string {
    const sessionId = `profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const session: ProfilingSession = {
      id: sessionId,
      startTime: Date.now(),
      type,
      status: 'active',
      options
    };

    this.sessions.set(sessionId, session);
    this.emit('profilingStarted', { sessionId, type });

    return sessionId;
  }

  /**
   * Stop profiling session
   */
  async stopProfiling(sessionId: string): Promise<ProfilingResults | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') {
      return null;
    }

    session.endTime = Date.now();
    session.status = 'completed';

    // Generate profiling results based on type
    const results = await this.generateProfilingResults(session);
    session.results = results;

    this.emit('profilingStopped', { sessionId, duration: session.endTime - session.startTime });
    return results;
  }

  private calculateMemoryGrowthRate(): number {
    if (this.memoryHistory.length < 2) return 0;
    
    const recent = this.memoryHistory.slice(-10);
    if (recent.length < 2) return 0;
    
    const oldest = recent[0];
    const newest = recent[recent.length - 1];
    const timeDiff = newest.heapUsed - oldest.heapUsed;
    
    return timeDiff / recent.length; // Approximate growth per measurement
  }

  private detectMemoryLeaks(): MemoryLeakIndicator[] {
    const indicators: MemoryLeakIndicator[] = [];
    
    if (this.memoryHistory.length < 10) return indicators;
    
    const recent = this.memoryHistory.slice(-10);
    const growthRate = this.calculateMemoryGrowthRate();
    
    // Detect heap growth
    if (growthRate > 1024 * 1024) { // 1MB growth per measurement
      indicators.push({
        type: 'heap_growth',
        severity: growthRate > 10 * 1024 * 1024 ? 'critical' : 'high',
        description: `Heap growing at ${(growthRate / 1024 / 1024).toFixed(2)} MB per measurement`,
        value: growthRate,
        threshold: 1024 * 1024,
        trend: 'increasing'
      });
    }
    
    return indicators;
  }

  private calculateCPUUtilization(): number {
    if (this.cpuHistory.length < 2) return 0;
    
    const recent = this.cpuHistory.slice(-5);
    const totalUsage = recent.reduce((sum, cpu) => sum + cpu.total, 0);
    return (totalUsage / recent.length / 1000000) * 100; // Convert to percentage
  }

  private averageMetrics(metrics: PerformanceMetrics[]): PerformanceMetrics {
    if (metrics.length === 0) {
      throw new Error('Cannot average empty metrics array');
    }
    
    const sum = metrics.reduce((acc, m) => ({
      timestamp: Math.max(acc.timestamp, m.timestamp),
      duration: acc.duration + m.duration,
      memoryUsage: {
        heapUsed: acc.memoryUsage.heapUsed + m.memoryUsage.heapUsed,
        heapTotal: acc.memoryUsage.heapTotal + m.memoryUsage.heapTotal,
        external: acc.memoryUsage.external + m.memoryUsage.external,
        rss: acc.memoryUsage.rss + m.memoryUsage.rss,
        arrayBuffers: acc.memoryUsage.arrayBuffers + m.memoryUsage.arrayBuffers,
        peak: Math.max(acc.memoryUsage.peak || 0, m.memoryUsage.peak || 0),
        growthRate: (acc.memoryUsage.growthRate || 0) + (m.memoryUsage.growthRate || 0),
        leakIndicators: [...(acc.memoryUsage.leakIndicators || []), ...(m.memoryUsage.leakIndicators || [])]
      },
      cpuUsage: {
        user: acc.cpuUsage.user + m.cpuUsage.user,
        system: acc.cpuUsage.system + m.cpuUsage.system,
        total: acc.cpuUsage.total + m.cpuUsage.total,
        cores: acc.cpuUsage.cores.map((core, i) => core + (m.cpuUsage.cores[i] || 0)),
        loadAverage: acc.cpuUsage.loadAverage.map((load, i) => load + (m.cpuUsage.loadAverage[i] || 0)),
        utilizationPercent: acc.cpuUsage.utilizationPercent + m.cpuUsage.utilizationPercent
      },
      networkIO: {
        bytesIn: acc.networkIO.bytesIn + m.networkIO.bytesIn,
        bytesOut: acc.networkIO.bytesOut + m.networkIO.bytesOut,
        packetsIn: acc.networkIO.packetsIn + m.networkIO.packetsIn,
        packetsOut: acc.networkIO.packetsOut + m.networkIO.packetsOut,
        connectionsActive: Math.max(acc.networkIO.connectionsActive, m.networkIO.connectionsActive)
      },
      diskIO: {
        bytesRead: acc.diskIO.bytesRead + m.diskIO.bytesRead,
        bytesWritten: acc.diskIO.bytesWritten + m.diskIO.bytesWritten,
        operationsRead: acc.diskIO.operationsRead + m.diskIO.operationsRead,
        operationsWrite: acc.diskIO.operationsWrite + m.diskIO.operationsWrite,
        queueLength: Math.max(acc.diskIO.queueLength, m.diskIO.queueLength)
      }
    }), metrics[0]);
    
    const count = metrics.length;
    return {
      timestamp: sum.timestamp,
      duration: sum.duration / count,
      memoryUsage: {
        heapUsed: sum.memoryUsage.heapUsed / count,
        heapTotal: sum.memoryUsage.heapTotal / count,
        external: sum.memoryUsage.external / count,
        rss: sum.memoryUsage.rss / count,
        arrayBuffers: sum.memoryUsage.arrayBuffers / count,
        peak: sum.memoryUsage.peak,
        growthRate: (sum.memoryUsage.growthRate || 0) / count,
        leakIndicators: sum.memoryUsage.leakIndicators
      },
      cpuUsage: {
        user: sum.cpuUsage.user / count,
        system: sum.cpuUsage.system / count,
        total: sum.cpuUsage.total / count,
        cores: sum.cpuUsage.cores.map(core => core / count),
        loadAverage: sum.cpuUsage.loadAverage.map(load => load / count),
        utilizationPercent: sum.cpuUsage.utilizationPercent / count
      },
      networkIO: {
        bytesIn: sum.networkIO.bytesIn / count,
        bytesOut: sum.networkIO.bytesOut / count,
        packetsIn: sum.networkIO.packetsIn / count,
        packetsOut: sum.networkIO.packetsOut / count,
        connectionsActive: sum.networkIO.connectionsActive
      },
      diskIO: {
        bytesRead: sum.diskIO.bytesRead / count,
        bytesWritten: sum.diskIO.bytesWritten / count,
        operationsRead: sum.diskIO.operationsRead / count,
        operationsWrite: sum.diskIO.operationsWrite / count,
        queueLength: sum.diskIO.queueLength
      }
    };
  }

  private defaultValidation(
    metrics: PerformanceMetrics,
    baseline?: PerformanceMetrics
  ): ValidationResult {
    const issues: PerformanceIssue[] = [];
    let score = 100;

    // Check against thresholds
    if (metrics.memoryUsage.heapUsed > this.config.thresholds.memoryUsage) {
      issues.push({
        type: 'resource_exhaustion',
        severity: 'warning',
        message: 'High memory usage detected',
        metric: 'memoryUsage.heapUsed',
        current: metrics.memoryUsage.heapUsed,
        threshold: this.config.thresholds.memoryUsage,
        impact: 'medium',
        suggestion: 'Consider optimizing memory usage or increasing memory limits'
      });
      score -= 20;
    }

    if (metrics.cpuUsage.utilizationPercent > this.config.thresholds.cpuUsage) {
      issues.push({
        type: 'resource_exhaustion',
        severity: 'warning',
        message: 'High CPU usage detected',
        metric: 'cpuUsage.utilizationPercent',
        current: metrics.cpuUsage.utilizationPercent,
        threshold: this.config.thresholds.cpuUsage,
        impact: 'medium',
        suggestion: 'Consider optimizing CPU-intensive operations'
      });
      score -= 15;
    }

    // Check for regressions against baseline
    if (baseline) {
      const memoryIncrease = (metrics.memoryUsage.heapUsed - baseline.memoryUsage.heapUsed) / baseline.memoryUsage.heapUsed * 100;
      if (memoryIncrease > this.config.thresholds.regressionPercent) {
        issues.push({
          type: 'regression',
          severity: 'error',
          message: `Memory usage increased by ${memoryIncrease.toFixed(1)}%`,
          metric: 'memoryUsage.heapUsed',
          current: metrics.memoryUsage.heapUsed,
          baseline: baseline.memoryUsage.heapUsed,
          impact: 'high',
          suggestion: 'Investigate recent changes that might cause memory increases'
        });
        score -= Math.min(30, memoryIncrease);
      }

      const durationIncrease = (metrics.duration - baseline.duration) / baseline.duration * 100;
      if (durationIncrease > this.config.thresholds.regressionPercent) {
        issues.push({
          type: 'regression',
          severity: 'error',
          message: `Performance degraded by ${durationIncrease.toFixed(1)}%`,
          metric: 'duration',
          current: metrics.duration,
          baseline: baseline.duration,
          impact: 'high',
          suggestion: 'Profile the application to identify performance bottlenecks'
        });
        score -= Math.min(40, durationIncrease);
      }
    }

    // Check for memory leaks
    if (metrics.memoryUsage.leakIndicators && metrics.memoryUsage.leakIndicators.length > 0) {
      const criticalLeaks = metrics.memoryUsage.leakIndicators.filter(l => l.severity === 'critical');
      if (criticalLeaks.length > 0) {
        issues.push({
          type: 'memory_leak',
          severity: 'critical',
          message: `${criticalLeaks.length} critical memory leak(s) detected`,
          metric: 'memoryUsage.leakIndicators',
          current: criticalLeaks.length,
          impact: 'critical',
          suggestion: 'Fix memory leaks immediately to prevent application instability'
        });
        score -= 50;
      }
    }

    return {
      passed: score >= 70, // Pass threshold of 70%
      score: Math.max(0, score),
      issues,
      recommendations: issues.map(issue => issue.suggestion).filter(Boolean) as string[]
    };
  }

  private analyzeRegression(result: TestResult): any {
    if (!result.baseline) return null;

    const current = result.metrics;
    const baseline = result.baseline;
    
    // Analyze key metrics for regression
    const memoryChange = current.memoryUsage.heapUsed - baseline.memoryUsage.heapUsed;
    const memoryChangePercent = (memoryChange / baseline.memoryUsage.heapUsed) * 100;
    
    if (Math.abs(memoryChangePercent) > this.config.thresholds.regressionPercent) {
      return {
        metric: 'memoryUsage.heapUsed',
        current: current.memoryUsage.heapUsed,
        baseline: baseline.memoryUsage.heapUsed,
        change: memoryChange,
        changePercent: memoryChangePercent,
        significance: this.classifySignificance(Math.abs(memoryChangePercent)),
        trend: memoryChangePercent > 0 ? 'degrading' : 'improving'
      };
    }

    return null;
  }

  private classifySignificance(changePercent: number): string {
    if (changePercent < 5) return 'negligible';
    if (changePercent < 15) return 'minor';
    if (changePercent < 30) return 'moderate';
    if (changePercent < 50) return 'major';
    return 'critical';
  }

  private generateRecommendations(results: TestResult[], regressions: any[]): string[] {
    const recommendations: string[] = [];
    
    // Memory recommendations
    const memoryIssues = results.filter(r => 
      r.validation.issues.some(i => i.type === 'memory_leak' || i.metric.includes('memory'))
    );
    if (memoryIssues.length > 0) {
      recommendations.push('Consider implementing memory monitoring and leak detection');
      recommendations.push('Review memory allocation patterns in critical paths');
    }

    // Performance recommendations
    const performanceIssues = results.filter(r => 
      r.validation.issues.some(i => i.type === 'regression' || i.type === 'slow_operation')
    );
    if (performanceIssues.length > 0) {
      recommendations.push('Profile application to identify performance bottlenecks');
      recommendations.push('Consider implementing performance budgets for critical operations');
    }

    // General recommendations
    if (regressions.length > 0) {
      recommendations.push('Establish performance baselines for all critical operations');
      recommendations.push('Implement automated performance regression testing in CI/CD');
    }

    return recommendations;
  }

  private calculatePerformanceChange(results: TestResult[]): number {
    const resultsWithBaseline = results.filter(r => r.baseline);
    if (resultsWithBaseline.length === 0) return 0;

    const changes = resultsWithBaseline.map(r => {
      const currentScore = r.validation.score;
      const baselineScore = 100; // Assume baseline was 100% when it was set
      return ((currentScore - baselineScore) / baselineScore) * 100;
    });

    return changes.reduce((sum, change) => sum + change, 0) / changes.length;
  }

  private countCriticalIssues(results: TestResult[]): number {
    return results.reduce((count, r) => 
      count + r.validation.issues.filter(i => i.severity === 'critical').length, 0
    );
  }

  private countMemoryLeaks(results: TestResult[]): number {
    return results.reduce((count, r) => 
      count + r.validation.issues.filter(i => i.type === 'memory_leak').length, 0
    );
  }

  private async getEnvironmentInfo(): Promise<EnvironmentInfo> {
    return {
      nodeVersion: process.version,
      platform: os.platform(),
      arch: os.arch(),
      cpuModel: os.cpus()[0]?.model || 'Unknown',
      totalMemory: os.totalmem(),
      availableMemory: os.freemem(),
      osVersion: os.release(),
      ci: Boolean(process.env.CI),
      environment: (process.env.NODE_ENV as any) || 'development'
    };
  }

  private async generateProfilingResults(session: ProfilingSession): Promise<ProfilingResults> {
    const duration = (session.endTime || Date.now()) - session.startTime;
    
    // This would be implemented based on the profiling type
    // For now, return a basic structure
    return {
      sessionId: session.id,
      duration,
      samplingRate: 1000, // 1ms
      totalSamples: Math.floor(duration / 1000),
      hotspots: [],
      summary: {
        totalTime: duration,
        idleTime: 0,
        gcTime: 0,
        compilationTime: 0,
        topFunctions: [],
        memoryPeaks: [],
        recommendations: []
      }
    };
  }
}