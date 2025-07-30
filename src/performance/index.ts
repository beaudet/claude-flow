/**
 * Performance Regression Testing and Bundle Size Monitoring System
 * Main entry point for the comprehensive performance monitoring system
 */

// Core components
export { PerformanceBenchmarker } from './core/PerformanceBenchmarker.js';

// Bundle analysis
export { BundleAnalyzer } from './bundle/BundleAnalyzer.js';

// Regression testing
export { RegressionTestFramework } from './regression/RegressionTestFramework.js';

// Memory monitoring
export { MemoryLeakDetector } from './memory/MemoryLeakDetector.js';

// Alerting system
export { AlertSystem } from './alerts/AlertSystem.js';

// Dashboard
export { PerformanceDashboard } from './dashboard/PerformanceDashboard.js';

// CI/CD integration
export { CIIntegration } from './integration/CIIntegration.js';

// Enterprise features
export { MultiEnvironmentMonitor } from './enterprise/MultiEnvironmentMonitor.js';

// Types
export * from './types.js';

/**
 * Main Performance Monitoring System
 * Orchestrates all performance monitoring components
 */
import { EventEmitter } from 'events';
import { PerformanceBenchmarker } from './core/PerformanceBenchmarker.js';
import { BundleAnalyzer } from './bundle/BundleAnalyzer.js';
import { RegressionTestFramework } from './regression/RegressionTestFramework.js';
import { MemoryLeakDetector } from './memory/MemoryLeakDetector.js';
import { AlertSystem } from './alerts/AlertSystem.js';
import { PerformanceDashboard } from './dashboard/PerformanceDashboard.js';
import { CIIntegration } from './integration/CIIntegration.js';
import { MultiEnvironmentMonitor } from './enterprise/MultiEnvironmentMonitor.js';
import {
  PerformanceConfig,
  PerformanceTest,
  PerformanceMetrics,
  BundleAnalysisResult,
  MemoryLeakReport,
  RegressionTestResult,
  PerformanceAlert
} from './types.js';

export interface PerformanceSystemConfig extends PerformanceConfig {
  dashboard: {
    enabled: boolean;
    port: number;
    host: string;
    enableAuth: boolean;
    authToken?: string;
  };
  ci: {
    enabled: boolean;
    provider: 'github' | 'gitlab' | 'jenkins' | 'azure' | 'custom';
    apiToken?: string;
  };
  enterprise: {
    enabled: boolean;
    multiEnvironment: boolean;
    slaMonitoring: boolean;
  };
}

export interface PerformanceSystemStatus {
  status: 'healthy' | 'degraded' | 'critical';
  components: {
    benchmarker: 'active' | 'inactive' | 'error';
    bundleAnalyzer: 'active' | 'inactive' | 'error';
    regressionFramework: 'active' | 'inactive' | 'error';
    memoryDetector: 'active' | 'inactive' | 'error';
    alertSystem: 'active' | 'inactive' | 'error';
    dashboard: 'active' | 'inactive' | 'error';
  };
  metrics: PerformanceMetrics;
  activeAlerts: number;
  lastUpdate: number;
}

export class PerformanceMonitoringSystem extends EventEmitter {
  private benchmarker: PerformanceBenchmarker;
  private bundleAnalyzer: BundleAnalyzer;
  private regressionFramework: RegressionTestFramework;
  private memoryDetector: MemoryLeakDetector;
  private alertSystem: AlertSystem;
  private dashboard: PerformanceDashboard | null = null;
  private ciIntegration: CIIntegration | null = null;
  private multiEnvMonitor: MultiEnvironmentMonitor | null = null;
  private config: PerformanceSystemConfig;
  private isRunning: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<PerformanceSystemConfig> = {}) {
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
      dashboard: {
        enabled: true,
        port: 3001,
        host: 'localhost',
        enableAuth: false
      },
      ci: {
        enabled: false,
        provider: 'github'
      },
      enterprise: {
        enabled: false,
        multiEnvironment: false,
        slaMonitoring: false
      },
      ...config
    };

    this.initializeComponents();
  }

  /**
   * Initialize all performance monitoring components
   */
  private initializeComponents(): void {
    // Core components
    this.benchmarker = new PerformanceBenchmarker(this.config);
    this.bundleAnalyzer = new BundleAnalyzer({}, this.config);
    this.regressionFramework = new RegressionTestFramework(this.config);
    this.memoryDetector = new MemoryLeakDetector(this.config);
    this.alertSystem = new AlertSystem(this.config);

    // Optional components
    if (this.config.dashboard.enabled) {
      this.dashboard = new PerformanceDashboard(
        {
          port: this.config.dashboard.port,
          host: this.config.dashboard.host,
          enableAuth: this.config.dashboard.enableAuth,
          authToken: this.config.dashboard.authToken,
          enableRealtime: true
        },
        this.config
      );
    }

    if (this.config.ci.enabled) {
      this.ciIntegration = new CIIntegration(
        {
          enabled: true,
          provider: this.config.ci.provider,
          apiToken: this.config.ci.apiToken
        },
        this.config
      );
    }

    if (this.config.enterprise.enabled) {
      this.multiEnvMonitor = new MultiEnvironmentMonitor(this.config);
    }

    this.setupEventHandlers();
  }

  /**
   * Start the performance monitoring system
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Performance monitoring system is already running');
    }

    try {
      this.emit('starting');

      // Start dashboard
      if (this.dashboard) {
        await this.dashboard.start();
        this.emit('dashboardStarted', { 
          port: this.config.dashboard.port, 
          host: this.config.dashboard.host 
        });
      }

      // Start memory monitoring
      this.memoryDetector.startMonitoring(this.config.monitoring.interval);

      // Start enterprise features
      if (this.multiEnvMonitor && this.config.enterprise.multiEnvironment) {
        await this.multiEnvMonitor.startMonitoring();
        this.emit('multiEnvMonitoringStarted');
      }

      // Start periodic monitoring
      this.startPeriodicMonitoring();

      this.isRunning = true;
      this.emit('started');

      console.log('Performance monitoring system started successfully');

    } catch (error) {
      this.emit('error', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Stop the performance monitoring system
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      this.emit('stopping');

      // Stop periodic monitoring
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = null;
      }

      // Stop memory monitoring
      this.memoryDetector.stopMonitoring();

      // Stop dashboard
      if (this.dashboard) {
        await this.dashboard.stop();
        this.emit('dashboardStopped');
      }

      // Stop enterprise features
      if (this.multiEnvMonitor) {
        await this.multiEnvMonitor.stopMonitoring();
        this.emit('multiEnvMonitoringStopped');
      }

      this.isRunning = false;
      this.emit('stopped');

      console.log('Performance monitoring system stopped successfully');

    } catch (error) {
      this.emit('error', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Register a performance test
   */
  registerTest(test: PerformanceTest): void {
    this.benchmarker.registerTest(test);
    this.emit('testRegistered', { testId: test.id, name: test.name });
  }

  /**
   * Run all performance tests
   */
  async runTests(): Promise<{
    benchmarks: any[];
    bundleAnalysis: BundleAnalysisResult[];
    memoryReport: MemoryLeakReport;
    regressions: RegressionTestResult[];
  }> {
    this.emit('testsStarted');

    try {
      // Run benchmarks
      const benchmarks = await this.benchmarker.runAllTests();

      // Run bundle analysis
      const bundleAnalysis = [await this.bundleAnalyzer.analyzeBundles()];

      // Detect memory leaks
      const memoryReport = await this.memoryDetector.detectLeaks();

      // Run regression tests
      const regressionResults = await this.regressionFramework.runAllTestSuites();
      const regressions = Array.from(regressionResults.values());

      const results = {
        benchmarks,
        bundleAnalysis,
        memoryReport,
        regressions
      };

      this.emit('testsCompleted', { 
        totalTests: benchmarks.length,
        bundleIssues: bundleAnalysis[0]?.alerts?.length || 0,
        memoryLeaks: memoryReport.leaks.length,
        regressions: regressions.reduce((sum, r) => sum + r.regressions.length, 0)
      });

      return results;

    } catch (error) {
      this.emit('testsError', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get system status
   */
  async getStatus(): Promise<PerformanceSystemStatus> {
    const metrics = await this.benchmarker.collectSystemMetrics();
    const activeAlerts = this.alertSystem.getActiveAlerts();

    const status: PerformanceSystemStatus = {
      status: this.determineOverallStatus(activeAlerts),
      components: {
        benchmarker: this.isRunning ? 'active' : 'inactive',
        bundleAnalyzer: this.config.bundleAnalysis.enabled ? 'active' : 'inactive',
        regressionFramework: this.isRunning ? 'active' : 'inactive',
        memoryDetector: this.isRunning ? 'active' : 'inactive',
        alertSystem: this.config.alerts.enabled ? 'active' : 'inactive',
        dashboard: this.dashboard ? 'active' : 'inactive'
      },
      metrics,
      activeAlerts: activeAlerts.length,
      lastUpdate: Date.now()
    };

    return status;
  }

  /**
   * Execute CI/CD pipeline performance testing
   */
  async executeCIPipeline(): Promise<any> {
    if (!this.ciIntegration) {
      throw new Error('CI integration is not enabled');
    }

    const buildContext = await this.ciIntegration.createBuildContext();
    return await this.ciIntegration.executePipeline(buildContext);
  }

  /**
   * Create performance baseline
   */
  async createBaseline(name: string, version: string, tags: string[] = []): Promise<void> {
    const metrics = await this.benchmarker.collectSystemMetrics();
    const environment = await this.getEnvironmentInfo();

    await this.benchmarker.setBaseline({
      id: `baseline-${Date.now()}`,
      name,
      version,
      timestamp: Date.now(),
      metrics,
      environment,
      tags
    });

    this.emit('baselineCreated', { name, version, tags });
  }

  /**
   * Get performance trends
   */
  async getTrends(timeRange: number = 3600000): Promise<any> {
    if (this.dashboard) {
      return this.dashboard.getTrends(timeRange);
    }
    return [];
  }

  /**
   * Generate comprehensive performance report
   */
  async generateReport(format: 'json' | 'html' | 'markdown' = 'json'): Promise<string> {
    const status = await this.getStatus();
    const trends = await this.getTrends();
    const activeAlerts = this.alertSystem.getActiveAlerts();

    const report = {
      timestamp: Date.now(),
      system: status,
      trends,
      alerts: activeAlerts,
      summary: this.generateReportSummary(status, activeAlerts)
    };

    switch (format) {
      case 'html':
        return this.generateHTMLReport(report);
      case 'markdown':
        return this.generateMarkdownReport(report);
      default:
        return JSON.stringify(report, null, 2);
    }
  }

  private setupEventHandlers(): void {
    // Benchmarker events
    this.benchmarker.on('testCompleted', (event) => {
      this.emit('benchmarkCompleted', event);
    });

    // Bundle analyzer events
    this.bundleAnalyzer.on('analysisCompleted', (event) => {
      this.emit('bundleAnalysisCompleted', event);
    });

    // Memory detector events
    this.memoryDetector.on('leaksDetected', (event) => {
      this.emit('memoryLeaksDetected', event);
    });

    // Alert system events
    this.alertSystem.on('alertTriggered', (event) => {
      this.emit('alertTriggered', event);
      
      // Update dashboard if available
      if (this.dashboard) {
        this.dashboard.updateData({
          alerts: [event.history]
        });
      }
    });

    // CI integration events
    if (this.ciIntegration) {
      this.ciIntegration.on('pipelineCompleted', (event) => {
        this.emit('ciPipelineCompleted', event);
      });
    }

    // Multi-environment monitor events
    if (this.multiEnvMonitor) {
      this.multiEnvMonitor.on('environmentError', (event) => {
        this.emit('environmentError', event);
      });

      this.multiEnvMonitor.on('crossEnvironmentAnomalies', (event) => {
        this.emit('crossEnvironmentAnomalies', event);
      });
    }
  }

  private startPeriodicMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      try {
        // Collect system metrics
        const metrics = await this.benchmarker.collectSystemMetrics();

        // Process alerts
        const alerts = await this.alertSystem.processMetrics(metrics);

        // Update dashboard
        if (this.dashboard) {
          this.dashboard.updateData({
            metrics,
            alerts: alerts.map(alert => ({
              alertId: alert.id,
              ruleId: 'system',
              timestamp: alert.timestamp,
              severity: alert.severity,
              status: 'active' as const,
              metrics,
              message: alert.description,
              actions: []
            }))
          });
        }

        this.emit('metricsCollected', { metrics, alertCount: alerts.length });

      } catch (error) {
        this.emit('monitoringError', { 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }, this.config.monitoring.interval);
  }

  private determineOverallStatus(alerts: any[]): PerformanceSystemStatus['status'] {
    const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
    const warningAlerts = alerts.filter(a => a.severity === 'warning').length;

    if (criticalAlerts > 0) {
      return 'critical';
    } else if (warningAlerts > 0) {
      return 'degraded';
    } else {
      return 'healthy';
    }
  }

  private generateReportSummary(status: PerformanceSystemStatus, alerts: any[]): string {
    const memoryUsage = (status.metrics.memoryUsage?.heapUsed || 0) / 1024 / 1024;
    const cpuUsage = status.metrics.cpuUsage?.utilizationPercent || 0;

    let summary = `System Status: ${status.status.toUpperCase()}\n`;
    summary += `Memory Usage: ${memoryUsage.toFixed(1)} MB\n`;
    summary += `CPU Usage: ${cpuUsage.toFixed(1)}%\n`;
    summary += `Active Alerts: ${alerts.length}\n`;

    if (alerts.length > 0) {
      const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
      if (criticalAlerts > 0) {
        summary += `Critical Alerts: ${criticalAlerts}\n`;
      }
    }

    return summary;
  }

  private generateHTMLReport(report: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Performance System Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .status { padding: 10px; border-radius: 5px; margin-bottom: 20px; }
        .healthy { background: #d4edda; border: 1px solid #c3e6cb; }
        .degraded { background: #fff3cd; border: 1px solid #ffeaa7; }
        .critical { background: #f8d7da; border: 1px solid #f5c6cb; }
        .metric { margin: 10px 0; }
        .alert { background: #f8f9fa; border-left: 4px solid #dc3545; padding: 10px; margin: 5px 0; }
    </style>
</head>
<body>
    <h1>Performance System Report</h1>
    <p>Generated: ${new Date(report.timestamp).toISOString()}</p>
    
    <div class="status ${report.system.status}">
        <h2>System Status: ${report.system.status.toUpperCase()}</h2>
        <div class="metric">Memory: ${((report.system.metrics.memoryUsage?.heapUsed || 0) / 1024 / 1024).toFixed(1)} MB</div>
        <div class="metric">CPU: ${(report.system.metrics.cpuUsage?.utilizationPercent || 0).toFixed(1)}%</div>
        <div class="metric">Active Alerts: ${report.system.activeAlerts}</div>
    </div>
    
    ${report.alerts.length > 0 ? `
    <h2>Active Alerts</h2>
    ${report.alerts.map((alert: any) => `
    <div class="alert">
        <strong>${alert.severity.toUpperCase()}:</strong> ${alert.message}
        <br><small>${new Date(alert.timestamp).toLocaleString()}</small>
    </div>
    `).join('')}
    ` : '<p>No active alerts</p>'}
</body>
</html>
    `;
  }

  private generateMarkdownReport(report: any): string {
    return `
# Performance System Report

**Generated:** ${new Date(report.timestamp).toISOString()}

## System Status: ${report.system.status.toUpperCase()}

- **Memory Usage:** ${((report.system.metrics.memoryUsage?.heapUsed || 0) / 1024 / 1024).toFixed(1)} MB
- **CPU Usage:** ${(report.system.metrics.cpuUsage?.utilizationPercent || 0).toFixed(1)}%
- **Active Alerts:** ${report.system.activeAlerts}

${report.alerts.length > 0 ? `
## Active Alerts

${report.alerts.map((alert: any) => `
### ${alert.severity.toUpperCase()}: ${alert.message}
*${new Date(alert.timestamp).toLocaleString()}*
`).join('')}
` : '## No Active Alerts'}

## Component Status

${Object.entries(report.system.components).map(([component, status]) => 
  `- **${component}:** ${status}`
).join('\n')}
    `;
  }

  private async getEnvironmentInfo(): Promise<any> {
    const os = await import('os');
    return {
      nodeVersion: process.version,
      platform: os.platform(),
      arch: os.arch(),
      cpuModel: os.cpus()[0]?.model || 'Unknown',
      totalMemory: os.totalmem(),
      availableMemory: os.freemem(),
      osVersion: os.release(),
      ci: Boolean(process.env.CI),
      environment: process.env.NODE_ENV || 'development'
    };
  }
}