/**
 * Memory Usage Monitoring and Leak Detection System
 * Advanced memory profiling, leak detection, and optimization recommendations
 */

import { EventEmitter } from 'events';
import * as v8 from 'v8';
import * as process from 'process';
import { performance } from 'perf_hooks';
import {
  MemoryMetrics,
  MemoryLeakIndicator,
  MemoryProfileOptions,
  ProfilingSession,
  ProfilingResults,
  PerformanceAlert,
  PerformanceConfig
} from '../types.js';

export interface MemorySnapshot {
  id: string;
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
  heapStatistics: v8.HeapStatistics;
  heapCodeStatistics?: v8.HeapCodeStatistics;
  heapSpaceStatistics: v8.HeapSpaceStatistics[];
  gcStatistics?: GCStatistics;
}

export interface GCStatistics {
  totalGCTime: number;
  totalGCCount: number;
  scavengeCount: number;
  markSweepCount: number;
  incrementalMarkingCount: number;
  averageGCTime: number;
  lastGCType: string;
  lastGCDuration: number;
}

export interface MemoryTrend {
  metric: keyof MemoryMetrics;
  direction: 'increasing' | 'decreasing' | 'stable';
  rate: number; // bytes per second
  confidence: number; // 0-1
  duration: number; // milliseconds
  samples: number;
}

export interface MemoryLeakReport {
  id: string;
  timestamp: number;
  leaks: DetectedLeak[];
  trends: MemoryTrend[];
  recommendations: MemoryRecommendation[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
}

export interface DetectedLeak {
  type: 'heap_growth' | 'external_growth' | 'handle_leak' | 'listener_leak' | 'timer_leak';
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  description: string;
  affectedArea: string;
  evidence: LeakEvidence;
  recommendation: string;
  estimatedImpact: number; // bytes
}

export interface LeakEvidence {
  growthRate: number;
  duration: number;
  samples: MemorySnapshot[];
  correlations: string[];
  patterns: string[];
}

export interface MemoryRecommendation {
  type: 'immediate' | 'optimization' | 'monitoring' | 'configuration';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  implementation: string[];
  expectedBenefit: string;
}

export interface MemoryThresholds {
  heapGrowthRate: number; // bytes per second
  externalGrowthRate: number;
  rssGrowthRate: number;
  gcFrequency: number; // GCs per minute
  gcDuration: number; // milliseconds
  heapFragmentation: number; // percentage
}

export class MemoryLeakDetector extends EventEmitter {
  private snapshots: MemorySnapshot[] = [];
  private monitoringInterval: NodeJS.Timeout | null = null;
  private profiling: boolean = false;
  private currentSession: ProfilingSession | null = null;
  private gcObserver: any = null;
  private thresholds: MemoryThresholds;
  private config: PerformanceConfig;

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
        memoryUsage: 500 * 1024 * 1024,
        cpuUsage: 80,
        responseTime: 5000,
        bundleSize: 10 * 1024 * 1024,
        regressionPercent: 10
      },
      alerts: {
        enabled: true,
        channels: [],
        debounceMs: 30000,
        aggregationWindow: 300000
      },
      monitoring: {
        interval: 5000,
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

    this.thresholds = {
      heapGrowthRate: 1024 * 1024, // 1MB/s
      externalGrowthRate: 512 * 1024, // 512KB/s
      rssGrowthRate: 2 * 1024 * 1024, // 2MB/s
      gcFrequency: 10, // 10 GCs per minute
      gcDuration: 100, // 100ms
      heapFragmentation: 20 // 20%
    };

    this.setupGCObserver();
  }

  /**
   * Start continuous memory monitoring
   */
  startMonitoring(intervalMs: number = 5000): void {
    if (this.monitoringInterval) {
      this.stopMonitoring();
    }

    this.monitoringInterval = setInterval(async () => {
      try {
        const snapshot = await this.takeSnapshot();
        this.snapshots.push(snapshot);
        
        // Keep only recent snapshots
        if (this.snapshots.length > 1000) {
          this.snapshots = this.snapshots.slice(-500);
        }

        // Analyze for leaks periodically
        if (this.snapshots.length % 20 === 0) { // Every 20 snapshots
          await this.detectLeaks();
        }

        this.emit('memorySnapshot', snapshot);
      } catch (error) {
        this.emit('monitoringError', { error: error instanceof Error ? error.message : String(error) });
      }
    }, intervalMs);

    this.emit('monitoringStarted', { interval: intervalMs });
  }

  /**
   * Stop memory monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      this.emit('monitoringStopped');
    }
  }

  /**
   * Take a memory snapshot
   */
  async takeSnapshot(): Promise<MemorySnapshot> {
    const memUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();
    const heapSpaceStats = v8.getHeapSpaceStatistics();

    let heapCodeStats: v8.HeapCodeStatistics | undefined;
    try {
      heapCodeStats = v8.getHeapCodeStatistics();
    } catch (error) {
      // Not available in all Node.js versions
    }

    const snapshot: MemorySnapshot = {
      id: `snapshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      arrayBuffers: memUsage.arrayBuffers,
      heapStatistics: heapStats,
      heapCodeStatistics: heapCodeStats,
      heapSpaceStatistics: heapSpaceStats,
      gcStatistics: this.getGCStatistics()
    };

    return snapshot;
  }

  /**
   * Detect memory leaks from collected snapshots
   */
  async detectLeaks(): Promise<MemoryLeakReport> {
    if (this.snapshots.length < 10) {
      throw new Error('Insufficient snapshots for leak detection');
    }

    const leaks: DetectedLeak[] = [];
    const trends = this.analyzeTrends();
    
    // Detect heap growth leaks
    const heapLeaks = await this.detectHeapGrowthLeaks();
    leaks.push(...heapLeaks);

    // Detect external memory leaks
    const externalLeaks = await this.detectExternalMemoryLeaks();
    leaks.push(...externalLeaks);

    // Detect event listener leaks
    const listenerLeaks = await this.detectEventListenerLeaks();
    leaks.push(...listenerLeaks);

    // Detect timer leaks
    const timerLeaks = await this.detectTimerLeaks();
    leaks.push(...timerLeaks);

    const severity = this.calculateOverallSeverity(leaks);
    const recommendations = this.generateRecommendations(leaks, trends);
    const summary = this.generateSummary(leaks, trends);

    const report: MemoryLeakReport = {
      id: `leak-report-${Date.now()}`,
      timestamp: Date.now(),
      leaks,
      trends,
      recommendations,
      severity,
      summary
    };

    this.emit('leaksDetected', { report, leakCount: leaks.length });
    return report;
  }

  /**
   * Start detailed memory profiling
   */
  async startProfiling(options: MemoryProfileOptions = {}): Promise<string> {
    if (this.profiling) {
      throw new Error('Memory profiling is already active');
    }

    const sessionId = `memory-profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.currentSession = {
      id: sessionId,
      startTime: Date.now(),
      type: 'memory',
      status: 'active',
      options
    };

    this.profiling = true;
    
    // Configure profiling options
    const duration = options.duration || 60000; // 1 minute default
    const interval = options.interval || 1000; // 1 second default

    // Start intensive snapshot collection
    const profilingInterval = setInterval(async () => {
      if (!this.profiling) {
        clearInterval(profilingInterval);
        return;
      }

      const snapshot = await this.takeSnapshot();
      this.snapshots.push(snapshot);
      
      // Generate heap snapshot if requested
      if (options.heapSnapshot && this.snapshots.length % 10 === 0) {
        try {
          const heapSnapshot = v8.writeHeapSnapshot();
          this.emit('heapSnapshotGenerated', { sessionId, path: heapSnapshot });
        } catch (error) {
          console.warn('Failed to generate heap snapshot:', error);
        }
      }
    }, interval);

    // Stop profiling after duration
    setTimeout(() => {
      clearInterval(profilingInterval);
      this.stopProfiling(sessionId);
    }, duration);

    this.emit('profilingStarted', { sessionId, options });
    return sessionId;
  }

  /**
   * Stop memory profiling
   */
  async stopProfiling(sessionId: string): Promise<ProfilingResults | null> {
    if (!this.currentSession || this.currentSession.id !== sessionId) {
      return null;
    }

    this.profiling = false;
    this.currentSession.endTime = Date.now();
    this.currentSession.status = 'completed';

    const duration = this.currentSession.endTime - this.currentSession.startTime;
    
    // Analyze profiling results
    const profilingSnapshots = this.snapshots.filter(s => 
      s.timestamp >= this.currentSession.startTime && 
      s.timestamp <= this.currentSession.endTime!
    );

    const results: ProfilingResults = {
      sessionId,
      duration,
      samplingRate: (this.currentSession.options as MemoryProfileOptions).interval || 1000,
      totalSamples: profilingSnapshots.length,
      hotspots: [], // Would be populated from heap analysis
      summary: {
        totalTime: duration,
        idleTime: 0,
        gcTime: this.calculateTotalGCTime(profilingSnapshots),
        compilationTime: 0,
        topFunctions: [],
        memoryPeaks: profilingSnapshots.map(s => s.heapUsed),
        recommendations: await this.generateProfilingRecommendations(profilingSnapshots)
      }
    };

    this.currentSession.results = results;
    this.emit('profilingStopped', { sessionId, duration, results });
    
    return results;
  }

  /**
   * Analyze memory trends
   */
  analyzeTrends(windowSize: number = 50): MemoryTrend[] {
    if (this.snapshots.length < windowSize) {
      return [];
    }

    const trends: MemoryTrend[] = [];
    const recentSnapshots = this.snapshots.slice(-windowSize);
    
    // Analyze heap used trend
    const heapTrend = this.calculateTrend('heapUsed', recentSnapshots);
    if (heapTrend) trends.push(heapTrend);

    // Analyze external memory trend
    const externalTrend = this.calculateTrend('external', recentSnapshots);
    if (externalTrend) trends.push(externalTrend);

    // Analyze RSS trend
    const rssTrend = this.calculateTrend('rss', recentSnapshots);
    if (rssTrend) trends.push(rssTrend);

    return trends;
  }

  /**
   * Generate alerts for memory issues
   */
  generateAlerts(report: MemoryLeakReport): PerformanceAlert[] {
    const alerts: PerformanceAlert[] = [];
    const timestamp = Date.now();

    // Critical leak alert
    const criticalLeaks = report.leaks.filter(l => l.severity === 'critical');
    if (criticalLeaks.length > 0) {
      alerts.push({
        id: `critical-memory-leak-${timestamp}`,
        timestamp,
        type: 'anomaly',
        severity: 'critical',
        title: 'Critical Memory Leak Detected',
        description: `${criticalLeaks.length} critical memory leaks detected`,
        metrics: {} as any,
        issue: {
          type: 'memory_leak',
          severity: 'critical',
          message: 'Critical memory leaks detected',
          metric: 'memoryUsage',
          current: 0,
          impact: 'critical'
        },
        environment: {} as any
      });
    }

    // High memory usage alert
    const latestSnapshot = this.snapshots[this.snapshots.length - 1];
    if (latestSnapshot && latestSnapshot.heapUsed > this.config.thresholds.memoryUsage) {
      alerts.push({
        id: `high-memory-usage-${timestamp}`,
        timestamp,
        type: 'threshold',
        severity: 'warning',
        title: 'High Memory Usage',
        description: `Memory usage ${this.formatBytes(latestSnapshot.heapUsed)} exceeds threshold`,
        metrics: {} as any,
        issue: {
          type: 'resource_exhaustion',
          severity: 'warning',
          message: 'High memory usage detected',
          metric: 'memoryUsage.heapUsed',
          current: latestSnapshot.heapUsed,
          threshold: this.config.thresholds.memoryUsage,
          impact: 'medium'
        },
        environment: {} as any
      });
    }

    return alerts;
  }

  private setupGCObserver(): void {
    try {
      // Setup GC performance observer if available
      if (typeof performance.getEntriesByType === 'function') {
        // Monitor GC entries
        setInterval(() => {
          const gcEntries = performance.getEntriesByType('gc');
          if (gcEntries.length > 0) {
            this.emit('gcActivity', { entries: gcEntries });
          }
        }, 1000);
      }
    } catch (error) {
      // GC observer not available
    }
  }

  private getGCStatistics(): GCStatistics | undefined {
    try {
      // This would be implemented using performance hooks
      // Simplified for this example
      return {
        totalGCTime: 0,
        totalGCCount: 0,
        scavengeCount: 0,
        markSweepCount: 0,
        incrementalMarkingCount: 0,
        averageGCTime: 0,
        lastGCType: 'unknown',
        lastGCDuration: 0
      };
    } catch (error) {
      return undefined;
    }
  }

  private async detectHeapGrowthLeaks(): Promise<DetectedLeak[]> {
    const leaks: DetectedLeak[] = [];
    
    if (this.snapshots.length < 20) return leaks;

    const recentSnapshots = this.snapshots.slice(-20);
    const heapGrowthRate = this.calculateGrowthRate(recentSnapshots, 'heapUsed');

    if (heapGrowthRate > this.thresholds.heapGrowthRate) {
      const confidence = Math.min(1, heapGrowthRate / (this.thresholds.heapGrowthRate * 2));
      const severity = this.classifyLeakSeverity(heapGrowthRate, this.thresholds.heapGrowthRate);

      leaks.push({
        type: 'heap_growth',
        severity,
        confidence,
        description: `Heap memory growing at ${this.formatBytes(heapGrowthRate)}/second`,
        affectedArea: 'Heap Memory',
        evidence: {
          growthRate: heapGrowthRate,
          duration: recentSnapshots[recentSnapshots.length - 1].timestamp - recentSnapshots[0].timestamp,
          samples: recentSnapshots,
          correlations: [],
          patterns: ['continuous_growth']
        },
        recommendation: 'Review recent code changes for object retention issues',
        estimatedImpact: heapGrowthRate * 60 // Impact per minute
      });
    }

    return leaks;
  }

  private async detectExternalMemoryLeaks(): Promise<DetectedLeak[]> {
    const leaks: DetectedLeak[] = [];
    
    if (this.snapshots.length < 20) return leaks;

    const recentSnapshots = this.snapshots.slice(-20);
    const externalGrowthRate = this.calculateGrowthRate(recentSnapshots, 'external');

    if (externalGrowthRate > this.thresholds.externalGrowthRate) {
      const confidence = Math.min(1, externalGrowthRate / (this.thresholds.externalGrowthRate * 2));
      const severity = this.classifyLeakSeverity(externalGrowthRate, this.thresholds.externalGrowthRate);

      leaks.push({
        type: 'external_growth',
        severity,
        confidence,
        description: `External memory growing at ${this.formatBytes(externalGrowthRate)}/second`,
        affectedArea: 'External Memory',
        evidence: {
          growthRate: externalGrowthRate,
          duration: recentSnapshots[recentSnapshots.length - 1].timestamp - recentSnapshots[0].timestamp,
          samples: recentSnapshots,
          correlations: ['native_modules', 'buffers'],
          patterns: ['external_growth']
        },
        recommendation: 'Check for native module memory leaks or unreleased buffers',
        estimatedImpact: externalGrowthRate * 60
      });
    }

    return leaks;
  }

  private async detectEventListenerLeaks(): Promise<DetectedLeak[]> {
    const leaks: DetectedLeak[] = [];
    
    try {
      // Get process listener counts
      const listenerCounts = process.listenerCount ? {
        exit: process.listenerCount('exit'),
        uncaughtException: process.listenerCount('uncaughtException'),
        unhandledRejection: process.listenerCount('unhandledRejection')
      } : {};

      // Check for excessive listeners
      Object.entries(listenerCounts).forEach(([event, count]) => {
        if (count > 10) { // Threshold for excessive listeners
          leaks.push({
            type: 'listener_leak',
            severity: count > 50 ? 'high' : 'medium',
            confidence: 0.8,
            description: `Excessive ${event} listeners: ${count}`,
            affectedArea: 'Event Listeners',
            evidence: {
              growthRate: 0,
              duration: 0,
              samples: [],
              correlations: [event],
              patterns: ['listener_accumulation']
            },
            recommendation: `Review ${event} event listener management`,
            estimatedImpact: count * 1024 // Rough estimate
          });
        }
      });
    } catch (error) {
      // Listener count not available
    }

    return leaks;
  }

  private async detectTimerLeaks(): Promise<DetectedLeak[]> {
    const leaks: DetectedLeak[] = [];
    
    try {
      // This would require native timer tracking
      // Simplified implementation
      const activeHandles = (process as any)._getActiveHandles ? (process as any)._getActiveHandles().length : 0;
      const activeRequests = (process as any)._getActiveRequests ? (process as any)._getActiveRequests().length : 0;

      if (activeHandles > 100) {
        leaks.push({
          type: 'handle_leak',
          severity: activeHandles > 500 ? 'high' : 'medium',
          confidence: 0.7,
          description: `High number of active handles: ${activeHandles}`,
          affectedArea: 'Timers/Handles',
          evidence: {
            growthRate: 0,
            duration: 0,
            samples: [],
            correlations: ['timers', 'intervals', 'sockets'],
            patterns: ['handle_accumulation']
          },
          recommendation: 'Review timer and handle cleanup in your application',
          estimatedImpact: activeHandles * 512
        });
      }
    } catch (error) {
      // Handle/request tracking not available
    }

    return leaks;
  }

  private calculateGrowthRate(snapshots: MemorySnapshot[], metric: keyof MemorySnapshot): number {
    if (snapshots.length < 2) return 0;

    const values = snapshots.map(s => s[metric] as number);
    const times = snapshots.map(s => s.timestamp);
    
    // Simple linear regression to calculate growth rate
    const n = values.length;
    const sumX = times.reduce((sum, t) => sum + t, 0);
    const sumY = values.reduce((sum, v) => sum + v, 0);
    const sumXY = times.reduce((sum, t, i) => sum + t * values[i], 0);
    const sumXX = times.reduce((sum, t) => sum + t * t, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    
    // Convert from bytes per millisecond to bytes per second
    return slope * 1000;
  }

  private calculateTrend(metric: keyof MemorySnapshot, snapshots: MemorySnapshot[]): MemoryTrend | null {
    if (snapshots.length < 5) return null;

    const values = snapshots.map(s => s[metric] as number);
    const growthRate = this.calculateGrowthRate(snapshots, metric);
    
    let direction: MemoryTrend['direction'] = 'stable';
    if (Math.abs(growthRate) > 1024) { // 1KB/s threshold
      direction = growthRate > 0 ? 'increasing' : 'decreasing';
    }

    const confidence = Math.min(1, Math.abs(growthRate) / 10240); // Confidence based on growth rate
    const duration = snapshots[snapshots.length - 1].timestamp - snapshots[0].timestamp;

    return {
      metric: metric as keyof MemoryMetrics,
      direction,
      rate: growthRate,
      confidence,
      duration,
      samples: snapshots.length
    } as MemoryTrend;
  }

  private classifyLeakSeverity(growthRate: number, threshold: number): DetectedLeak['severity'] {
    const ratio = growthRate / threshold;
    if (ratio > 5) return 'critical';
    if (ratio > 3) return 'high';
    if (ratio > 1.5) return 'medium';
    return 'low';
  }

  private calculateOverallSeverity(leaks: DetectedLeak[]): MemoryLeakReport['severity'] {
    if (leaks.some(l => l.severity === 'critical')) return 'critical';
    if (leaks.some(l => l.severity === 'high')) return 'high';
    if (leaks.some(l => l.severity === 'medium')) return 'medium';
    return 'low';
  }

  private generateRecommendations(leaks: DetectedLeak[], trends: MemoryTrend[]): MemoryRecommendation[] {
    const recommendations: MemoryRecommendation[] = [];

    // Immediate actions for critical leaks
    const criticalLeaks = leaks.filter(l => l.severity === 'critical');
    if (criticalLeaks.length > 0) {
      recommendations.push({
        type: 'immediate',
        priority: 'critical',
        title: 'Address Critical Memory Leaks',
        description: 'Critical memory leaks detected that require immediate attention',
        implementation: [
          'Stop the application if memory usage continues to grow',
          'Identify and fix the root cause of memory leaks',
          'Implement memory monitoring in production'
        ],
        expectedBenefit: 'Prevent application crashes and system instability'
      });
    }

    // Heap growth recommendations
    const heapLeaks = leaks.filter(l => l.type === 'heap_growth');
    if (heapLeaks.length > 0) {
      recommendations.push({
        type: 'optimization',
        priority: 'high',
        title: 'Optimize Heap Memory Usage',
        description: 'Heap memory is growing continuously',
        implementation: [
          'Review object lifecycle management',
          'Implement proper cleanup in event handlers',
          'Use WeakMap/WeakSet for temporary object references',
          'Profile heap allocations to identify hotspots'
        ],
        expectedBenefit: 'Reduce memory usage and improve application stability'
      });
    }

    // Event listener recommendations
    const listenerLeaks = leaks.filter(l => l.type === 'listener_leak');
    if (listenerLeaks.length > 0) {
      recommendations.push({
        type: 'optimization',
        priority: 'medium',
        title: 'Fix Event Listener Leaks',
        description: 'Excessive event listeners detected',
        implementation: [
          'Remove event listeners when no longer needed',
          'Use AbortController for automatic cleanup',
          'Implement listener registry for better management'
        ],
        expectedBenefit: 'Prevent memory leaks and improve performance'
      });
    }

    // General monitoring recommendation
    recommendations.push({
      type: 'monitoring',
      priority: 'medium',
      title: 'Implement Continuous Memory Monitoring',
      description: 'Establish ongoing memory monitoring and alerting',
      implementation: [
        'Set up automated memory monitoring',
        'Configure memory usage alerts',
        'Regular memory profiling in development',
        'Monitor memory trends in production'
      ],
      expectedBenefit: 'Early detection of memory issues and better observability'
    });

    return recommendations;
  }

  private generateSummary(leaks: DetectedLeak[], trends: MemoryTrend[]): string {
    if (leaks.length === 0) {
      return 'No memory leaks detected. Memory usage appears stable.';
    }

    const criticalCount = leaks.filter(l => l.severity === 'critical').length;
    const highCount = leaks.filter(l => l.severity === 'high').length;
    const totalLeaks = leaks.length;

    if (criticalCount > 0) {
      return `${criticalCount} critical memory leak(s) detected among ${totalLeaks} total issues. Immediate action required.`;
    } else if (highCount > 0) {
      return `${highCount} high-severity memory leak(s) detected among ${totalLeaks} total issues. Investigation recommended.`;
    } else {
      return `${totalLeaks} minor memory issue(s) detected. Monitoring and optimization recommended.`;
    }
  }

  private calculateTotalGCTime(snapshots: MemorySnapshot[]): number {
    const gcStats = snapshots
      .map(s => s.gcStatistics?.totalGCTime || 0)
      .filter(time => time > 0);
    
    if (gcStats.length === 0) return 0;
    return gcStats[gcStats.length - 1] - gcStats[0];
  }

  private async generateProfilingRecommendations(snapshots: MemorySnapshot[]): Promise<string[]> {
    const recommendations: string[] = [];

    if (snapshots.length === 0) return recommendations;

    // Analyze memory patterns
    const avgHeapUsed = snapshots.reduce((sum, s) => sum + s.heapUsed, 0) / snapshots.length;
    const maxHeapUsed = Math.max(...snapshots.map(s => s.heapUsed));
    const heapGrowth = snapshots[snapshots.length - 1].heapUsed - snapshots[0].heapUsed;

    if (heapGrowth > avgHeapUsed * 0.1) {
      recommendations.push('Heap memory increased significantly during profiling - investigate object retention');
    }

    if (maxHeapUsed > avgHeapUsed * 1.5) {
      recommendations.push('Memory usage spikes detected - consider implementing memory pooling');
    }

    // Analyze GC patterns
    const gcTimes = snapshots
      .map(s => s.gcStatistics?.totalGCTime || 0)
      .filter(time => time > 0);

    if (gcTimes.length > 1) {
      const totalGCTime = gcTimes[gcTimes.length - 1] - gcTimes[0];
      const profilingDuration = snapshots[snapshots.length - 1].timestamp - snapshots[0].timestamp;
      const gcPercentage = (totalGCTime / profilingDuration) * 100;

      if (gcPercentage > 10) {
        recommendations.push(`High GC overhead (${gcPercentage.toFixed(1)}%) - optimize memory allocation patterns`);
      }
    }

    return recommendations;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}