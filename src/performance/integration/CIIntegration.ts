/**
 * CI/CD Integration for Performance Monitoring
 * Integration with existing CI/CD pipeline and security systems
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import { PerformanceBenchmarker } from '../core/PerformanceBenchmarker.js';
import { RegressionTestFramework } from '../regression/RegressionTestFramework.js';
import { BundleAnalyzer } from '../bundle/BundleAnalyzer.js';
import { AlertSystem } from '../alerts/AlertSystem.js';
import {
  PerformanceConfig,
  PerformanceGate,
  TestResult,
  RegressionTestResult,
  BundleAnalysisResult,
  PerformanceAlert,
  EnvironmentInfo
} from '../types.js';

export interface CIConfig {
  enabled: boolean;
  provider: 'github' | 'gitlab' | 'jenkins' | 'azure' | 'custom';
  apiToken?: string;
  apiUrl?: string;
  reportFormats: ('json' | 'junit' | 'html' | 'markdown')[];
  artifactStorage: {
    enabled: boolean;
    path: string;
    retention: number; // days
  };
  notifications: {
    slack?: {
      webhook: string;
      channel: string;
    };
    teams?: {
      webhook: string;
    };
    email?: {
      recipients: string[];
      smtp: {
        host: string;
        port: number;
        secure: boolean;
        auth: {
          user: string;
          pass: string;
        };
      };
    };
  };
  gates: PerformanceGate[];
  security: {
    enableScan: boolean;
    allowedDomains: string[];
    maxExecutionTime: number;
    memoryLimit: number;
  };
}

export interface CIBuildContext {
  buildId: string;
  commitSha: string;
  branch: string;
  pullRequest?: {
    number: number;
    title: string;
    author: string;
    baseBranch: string;
  };
  environment: 'development' | 'staging' | 'production' | 'test';
  triggeredBy: string;
  buildUrl?: string;
  artifacts: CIArtifact[];
}

export interface CIArtifact {
  name: string;
  path: string;
  type: 'report' | 'data' | 'log' | 'image';
  size: number;
  checksum: string;
}

export interface CIPipelineResult {
  buildId: string;
  status: 'success' | 'failure' | 'warning' | 'cancelled';
  timestamp: number;
  duration: number;
  context: CIBuildContext;
  performanceResults: {
    benchmarks: TestResult[];
    regressions: RegressionTestResult[];
    bundleAnalysis: BundleAnalysisResult[];
    alerts: PerformanceAlert[];
  };
  gates: {
    passed: number;
    failed: number;
    results: any[];
  };
  artifacts: CIArtifact[];
  recommendations: string[];
  summary: string;
}

export class CIIntegration extends EventEmitter {
  private benchmarker: PerformanceBenchmarker;
  private regressionFramework: RegressionTestFramework;
  private bundleAnalyzer: BundleAnalyzer;
  private alertSystem: AlertSystem;
  private config: CIConfig;
  private performanceConfig: PerformanceConfig;

  constructor(
    config: Partial<CIConfig> = {},
    performanceConfig: Partial<PerformanceConfig> = {}
  ) {
    super();

    this.config = {
      enabled: true,
      provider: 'github',
      reportFormats: ['json', 'html', 'junit'],
      artifactStorage: {
        enabled: true,
        path: './performance-artifacts',
        retention: 30
      },
      notifications: {},
      gates: [],
      security: {
        enableScan: true,
        allowedDomains: ['github.com', 'gitlab.com'],
        maxExecutionTime: 1800000, // 30 minutes
        memoryLimit: 2 * 1024 * 1024 * 1024, // 2GB
      },
      ...config
    };

    this.performanceConfig = {
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
      ...performanceConfig
    };

    this.benchmarker = new PerformanceBenchmarker(this.performanceConfig);
    this.regressionFramework = new RegressionTestFramework(this.performanceConfig);
    this.bundleAnalyzer = new BundleAnalyzer({}, this.performanceConfig);
    this.alertSystem = new AlertSystem(this.performanceConfig);

    this.setupDefaultGates();
  }

  /**
   * Execute performance testing in CI pipeline
   */
  async executePipeline(buildContext: CIBuildContext): Promise<CIPipelineResult> {
    if (!this.config.enabled) {
      throw new Error('CI integration is disabled');
    }

    this.emit('pipelineStarted', { buildId: buildContext.buildId });
    const startTime = Date.now();

    try {
      // Security checks
      await this.performSecurityChecks(buildContext);

      // Setup environment
      await this.setupTestEnvironment(buildContext);

      // Execute performance tests
      const performanceResults = await this.executePerformanceTests(buildContext);

      // Evaluate gates
      const gateResults = await this.evaluateGates(performanceResults, buildContext);

      // Generate artifacts
      const artifacts = await this.generateArtifacts(performanceResults, buildContext);

      // Determine overall status
      const status = this.determineStatus(gateResults, performanceResults);

      // Generate summary and recommendations
      const { summary, recommendations } = this.generateSummaryAndRecommendations(
        performanceResults, gateResults, buildContext
      );

      const result: CIPipelineResult = {
        buildId: buildContext.buildId,
        status,
        timestamp: startTime,
        duration: Date.now() - startTime,
        context: buildContext,
        performanceResults,
        gates: gateResults,
        artifacts,
        recommendations,
        summary
      };

      // Send notifications
      await this.sendNotifications(result);

      // Store artifacts
      if (this.config.artifactStorage.enabled) {
        await this.storeArtifacts(result);
      }

      this.emit('pipelineCompleted', {
        buildId: buildContext.buildId,
        status,
        duration: result.duration
      });

      return result;

    } catch (error) {
      const result: CIPipelineResult = {
        buildId: buildContext.buildId,
        status: 'failure',
        timestamp: startTime,
        duration: Date.now() - startTime,
        context: buildContext,
        performanceResults: {
          benchmarks: [],
          regressions: [],
          bundleAnalysis: [],
          alerts: []
        },
        gates: { passed: 0, failed: 0, results: [] },
        artifacts: [],
        recommendations: ['Fix pipeline execution error'],
        summary: `Pipeline failed: ${error instanceof Error ? error.message : String(error)}`
      };

      this.emit('pipelineError', {
        buildId: buildContext.buildId,
        error: error instanceof Error ? error.message : String(error)
      });

      // Still send notifications for failures
      await this.sendNotifications(result);

      throw error;
    }
  }

  /**
   * Create build context from CI environment
   */
  async createBuildContext(): Promise<CIBuildContext> {
    const env = process.env;
    const context: CIBuildContext = {
      buildId: this.generateBuildId(),
      commitSha: env.GITHUB_SHA || env.CI_COMMIT_SHA || 'unknown',
      branch: env.GITHUB_REF_NAME || env.CI_COMMIT_REF_NAME || 'main',
      environment: (env.NODE_ENV as any) || 'development',
      triggeredBy: env.GITHUB_ACTOR || env.CI_COMMIT_AUTHOR || 'system',
      artifacts: []
    };

    // GitHub-specific context
    if (env.GITHUB_EVENT_NAME === 'pull_request') {
      context.pullRequest = {
        number: parseInt(env.GITHUB_PR_NUMBER || '0'),
        title: env.GITHUB_PR_TITLE || '',
        author: env.GITHUB_ACTOR || '',
        baseBranch: env.GITHUB_BASE_REF || 'main'
      };
    }

    // Build URL
    if (env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID) {
      context.buildUrl = `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
    }

    return context;
  }

  /**
   * Update pull request with performance results
   */
  async updatePullRequest(result: CIPipelineResult): Promise<void> {
    if (!result.context.pullRequest || this.config.provider !== 'github') {
      return;
    }

    try {
      const comment = this.generatePRComment(result);
      
      if (this.config.apiToken) {
        await this.postGitHubComment(
          result.context.pullRequest.number,
          comment
        );
      }

      this.emit('pullRequestUpdated', {
        buildId: result.buildId,
        prNumber: result.context.pullRequest.number
      });

    } catch (error) {
      console.error('Failed to update pull request:', error);
    }
  }

  /**
   * Create performance baseline from current build
   */
  async createBaseline(
    buildContext: CIBuildContext,
    name?: string
  ): Promise<void> {
    const baselineName = name || `${buildContext.branch}-${buildContext.commitSha.slice(0, 8)}`;
    
    try {
      await this.regressionFramework.createBaseline(
        baselineName,
        buildContext.commitSha,
        undefined,
        [buildContext.branch, buildContext.environment]
      );

      this.emit('baselineCreated', {
        buildId: buildContext.buildId,
        baselineName,
        commitSha: buildContext.commitSha
      });

    } catch (error) {
      console.error('Failed to create baseline:', error);
    }
  }

  private async performSecurityChecks(buildContext: CIBuildContext): Promise<void> {
    if (!this.config.security.enableScan) {
      return;
    }

    // Validate build context
    if (buildContext.triggeredBy && buildContext.triggeredBy.includes('@')) {
      const domain = buildContext.triggeredBy.split('@')[1];
      if (!this.config.security.allowedDomains.includes(domain)) {
        throw new Error(`Unauthorized domain: ${domain}`);
      }
    }

    // Check for suspicious patterns in branch names
    const suspiciousPatterns = [/\$\{/, /`/, /eval\(/, /exec\(/];
    if (suspiciousPatterns.some(pattern => pattern.test(buildContext.branch))) {
      throw new Error('Suspicious patterns detected in branch name');
    }

    // Validate commit SHA format
    if (!/^[a-f0-9]{40}$/i.test(buildContext.commitSha)) {
      console.warn('Invalid commit SHA format, performance tests may be unreliable');
    }
  }

  private async setupTestEnvironment(buildContext: CIBuildContext): Promise<void> {
    // Set environment variables
    process.env.CI_BUILD_ID = buildContext.buildId;
    process.env.CI_COMMIT_SHA = buildContext.commitSha;
    process.env.CI_BRANCH = buildContext.branch;
    process.env.CI_ENVIRONMENT = buildContext.environment;

    // Set memory limits
    if (this.config.security.memoryLimit) {
      process.env.NODE_OPTIONS = `--max-old-space-size=${Math.floor(this.config.security.memoryLimit / 1024 / 1024)}`;
    }

    // Create artifact directory
    if (this.config.artifactStorage.enabled) {
      await fs.mkdir(this.config.artifactStorage.path, { recursive: true });
    }

    this.emit('environmentSetup', { buildId: buildContext.buildId });
  }

  private async executePerformanceTests(buildContext: CIBuildContext): Promise<CIPipelineResult['performanceResults']> {
    const results: CIPipelineResult['performanceResults'] = {
      benchmarks: [],
      regressions: [],
      bundleAnalysis: [],
      alerts: []
    };

    // Execute benchmarks
    try {
      const benchmarkResults = await this.benchmarker.runAllTests();
      results.benchmarks = benchmarkResults;
    } catch (error) {
      console.error('Benchmark execution failed:', error);
    }

    // Execute regression tests
    try {
      const regressionResults = await this.regressionFramework.runAllTestSuites();
      results.regressions = Array.from(regressionResults.values());
    } catch (error) {
      console.error('Regression tests failed:', error);
    }

    // Execute bundle analysis
    try {
      const bundleResult = await this.bundleAnalyzer.analyzeBundles();
      results.bundleAnalysis = [bundleResult];
    } catch (error) {
      console.error('Bundle analysis failed:', error);
    }

    // Collect alerts
    results.alerts = this.alertSystem.getActiveAlerts().map(alert => ({
      id: alert.alertId,
      timestamp: alert.timestamp,
      type: 'threshold' as const,
      severity: alert.severity,
      title: alert.message,
      description: alert.message,
      metrics: alert.metrics,
      issue: {
        type: 'slow_operation' as const,
        severity: alert.severity,
        message: alert.message,
        metric: 'unknown',
        current: 0,
        impact: 'medium' as const
      },
      environment: {} as EnvironmentInfo
    }));

    return results;
  }

  private async evaluateGates(
    performanceResults: CIPipelineResult['performanceResults'],
    buildContext: CIBuildContext
  ): Promise<CIPipelineResult['gates']> {
    let passed = 0;
    let failed = 0;
    const results: any[] = [];

    for (const gate of this.config.gates) {
      if (!gate.enabled) continue;

      try {
        const gateResult = await this.evaluateGate(gate, performanceResults);
        results.push(gateResult);
        
        if (gateResult.passed) {
          passed++;
        } else {
          failed++;
          
          if (gate.blocking) {
            throw new Error(`Blocking performance gate failed: ${gate.name}`);
          }
        }
      } catch (error) {
        failed++;
        results.push({
          gate: gate.name,
          passed: false,
          error: error instanceof Error ? error.message : String(error),
          blocking: gate.blocking
        });
        
        if (gate.blocking) {
          throw error;
        }
      }
    }

    return {
      passed,
      failed,
      results
    };
  }

  private async evaluateGate(
    gate: PerformanceGate,
    performanceResults: CIPipelineResult['performanceResults']
  ): Promise<any> {
    const gateResult = {
      gate: gate.name,
      passed: true,
      conditions: [] as any[],
      blocking: gate.blocking
    };

    for (const condition of gate.conditions) {
      const conditionResult = await this.evaluateGateCondition(condition, performanceResults);
      gateResult.conditions.push(conditionResult);
      
      if (!conditionResult.passed) {
        gateResult.passed = false;
      }
    }

    return gateResult;
  }

  private async evaluateGateCondition(condition: any, performanceResults: CIPipelineResult['performanceResults']): Promise<any> {
    // Extract metric value based on condition
    let actualValue = 0;
    
    // Example condition evaluation
    switch (condition.metric) {
      case 'bundleSize':
        actualValue = performanceResults.bundleAnalysis[0]?.totalSize || 0;
        break;
      case 'memoryUsage':
        actualValue = performanceResults.benchmarks.reduce((max, result) => 
          Math.max(max, result.metrics.memoryUsage?.heapUsed || 0), 0
        );
        break;
      case 'regressionCount':
        actualValue = performanceResults.regressions.reduce((sum, result) => 
          sum + result.regressions.length, 0
        );
        break;
      default:
        actualValue = 0;
    }

    // Evaluate condition
    let passed = false;
    switch (condition.operator) {
      case 'lt':
        passed = actualValue < condition.value;
        break;
      case 'le':
        passed = actualValue <= condition.value;
        break;
      case 'gt':
        passed = actualValue > condition.value;
        break;
      case 'ge':
        passed = actualValue >= condition.value;
        break;
      case 'eq':
        passed = actualValue === condition.value;
        break;
      case 'ne':
        passed = actualValue !== condition.value;
        break;
    }

    return {
      condition: condition.metric,
      passed,
      actualValue,
      expectedValue: condition.value,
      operator: condition.operator
    };
  }

  private async generateArtifacts(
    performanceResults: CIPipelineResult['performanceResults'],
    buildContext: CIBuildContext
  ): Promise<CIArtifact[]> {
    const artifacts: CIArtifact[] = [];

    if (!this.config.artifactStorage.enabled) {
      return artifacts;
    }

    const artifactDir = this.config.artifactStorage.path;

    // Generate reports in requested formats
    for (const format of this.config.reportFormats) {
      try {
        const reportPath = path.join(artifactDir, `performance-report.${format}`);
        const content = await this.generateReport(performanceResults, buildContext, format);
        
        await fs.writeFile(reportPath, content);
        
        const stats = await fs.stat(reportPath);
        const checksum = await this.calculateChecksum(reportPath);
        
        artifacts.push({
          name: `performance-report.${format}`,
          path: reportPath,
          type: 'report',
          size: stats.size,
          checksum
        });
      } catch (error) {
        console.error(`Failed to generate ${format} report:`, error);
      }
    }

    // Save raw data
    try {
      const dataPath = path.join(artifactDir, 'performance-data.json');
      await fs.writeFile(dataPath, JSON.stringify(performanceResults, null, 2));
      
      const stats = await fs.stat(dataPath);
      const checksum = await this.calculateChecksum(dataPath);
      
      artifacts.push({
        name: 'performance-data.json',
        path: dataPath,
        type: 'data',
        size: stats.size,
        checksum
      });
    } catch (error) {
      console.error('Failed to save performance data:', error);
    }

    return artifacts;
  }

  private async generateReport(
    performanceResults: CIPipelineResult['performanceResults'],
    buildContext: CIBuildContext,
    format: string
  ): Promise<string> {
    switch (format) {
      case 'json':
        return JSON.stringify({
          buildContext,
          performanceResults,
          timestamp: Date.now()
        }, null, 2);

      case 'html':
        return this.generateHTMLReport(performanceResults, buildContext);

      case 'junit':
        return this.generateJUnitReport(performanceResults, buildContext);

      case 'markdown':
        return this.generateMarkdownReport(performanceResults, buildContext);

      default:
        throw new Error(`Unsupported report format: ${format}`);
    }
  }

  private generateHTMLReport(
    performanceResults: CIPipelineResult['performanceResults'],
    buildContext: CIBuildContext
  ): string {
    const totalTests = performanceResults.benchmarks.length + 
                      performanceResults.regressions.reduce((sum, r) => sum + r.testResults.length, 0);
    const failedTests = performanceResults.benchmarks.filter(r => r.status === 'failed').length +
                       performanceResults.regressions.reduce((sum, r) => 
                         sum + r.testResults.filter(t => t.status === 'failed').length, 0
                       );

    return `
<!DOCTYPE html>
<html>
<head>
    <title>Performance Test Report - Build ${buildContext.buildId}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
        .metric { background: white; border: 1px solid #dee2e6; padding: 15px; border-radius: 5px; text-align: center; }
        .metric h3 { margin: 0 0 10px 0; color: #495057; }
        .metric .value { font-size: 24px; font-weight: bold; }
        .passed { color: #28a745; }
        .failed { color: #dc3545; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #dee2e6; padding: 12px; text-align: left; }
        th { background-color: #f8f9fa; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Performance Test Report</h1>
        <p><strong>Build ID:</strong> ${buildContext.buildId}</p>
        <p><strong>Commit:</strong> ${buildContext.commitSha}</p>
        <p><strong>Branch:</strong> ${buildContext.branch}</p>
        <p><strong>Environment:</strong> ${buildContext.environment}</p>
        <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
    </div>

    <div class="summary">
        <div class="metric">
            <h3>Total Tests</h3>
            <div class="value">${totalTests}</div>
        </div>
        <div class="metric">
            <h3>Passed</h3>
            <div class="value passed">${totalTests - failedTests}</div>
        </div>
        <div class="metric">
            <h3>Failed</h3>
            <div class="value failed">${failedTests}</div>
        </div>
        <div class="metric">
            <h3>Bundle Size</h3>
            <div class="value">${this.formatBytes(performanceResults.bundleAnalysis[0]?.totalSize || 0)}</div>
        </div>
    </div>

    <h2>Benchmark Results</h2>
    <table>
        <tr><th>Test</th><th>Status</th><th>Duration (ms)</th><th>Memory (MB)</th></tr>
        ${performanceResults.benchmarks.map(result => `
        <tr>
            <td>${result.test.name}</td>
            <td class="${result.status}">${result.status.toUpperCase()}</td>
            <td>${result.duration.toFixed(2)}</td>
            <td>${((result.metrics.memoryUsage?.heapUsed || 0) / 1024 / 1024).toFixed(2)}</td>
        </tr>
        `).join('')}
    </table>

    ${performanceResults.bundleAnalysis.length > 0 ? `
    <h2>Bundle Analysis</h2>
    <table>
        <tr><th>Metric</th><th>Value</th></tr>
        <tr><td>Total Size</td><td>${this.formatBytes(performanceResults.bundleAnalysis[0].totalSize)}</td></tr>
        <tr><td>Gzipped Size</td><td>${this.formatBytes(performanceResults.bundleAnalysis[0].gzippedSize)}</td></tr>
        <tr><td>Modules</td><td>${performanceResults.bundleAnalysis[0].metrics?.modules?.length || 0}</td></tr>
        <tr><td>Dependencies</td><td>${performanceResults.bundleAnalysis[0].metrics?.dependencies?.length || 0}</td></tr>
    </table>
    ` : ''}
</body>
</html>
    `;
  }

  private generateJUnitReport(
    performanceResults: CIPipelineResult['performanceResults'],
    buildContext: CIBuildContext
  ): string {
    const totalTests = performanceResults.benchmarks.length;
    const failedTests = performanceResults.benchmarks.filter(r => r.status === 'failed').length;
    const totalTime = performanceResults.benchmarks.reduce((sum, r) => sum + r.duration, 0) / 1000;

    const testCases = performanceResults.benchmarks.map(result => {
      const time = (result.duration / 1000).toFixed(3);
      const failure = result.status === 'failed' ? 
        `<failure message="${result.error || 'Test failed'}">${result.error || 'Test failed'}</failure>` : '';
      
      return `
    <testcase name="${result.test.name}" classname="PerformanceTests" time="${time}">
      ${failure}
    </testcase>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="PerformanceTests" tests="${totalTests}" failures="${failedTests}" time="${totalTime.toFixed(3)}">
  ${testCases}
</testsuite>`;
  }

  private generateMarkdownReport(
    performanceResults: CIPipelineResult['performanceResults'],
    buildContext: CIBuildContext
  ): string {
    const totalTests = performanceResults.benchmarks.length;
    const failedTests = performanceResults.benchmarks.filter(r => r.status === 'failed').length;

    return `
# Performance Test Report

**Build ID:** ${buildContext.buildId}  
**Commit:** ${buildContext.commitSha}  
**Branch:** ${buildContext.branch}  
**Environment:** ${buildContext.environment}  
**Generated:** ${new Date().toISOString()}

## Summary

- **Total Tests:** ${totalTests}
- **Passed:** ${totalTests - failedTests}
- **Failed:** ${failedTests}
- **Bundle Size:** ${this.formatBytes(performanceResults.bundleAnalysis[0]?.totalSize || 0)}

## Test Results

| Test | Status | Duration (ms) | Memory (MB) |
|------|--------|---------------|-------------|
${performanceResults.benchmarks.map(result => 
  `| ${result.test.name} | ${result.status.toUpperCase()} | ${result.duration.toFixed(2)} | ${((result.metrics.memoryUsage?.heapUsed || 0) / 1024 / 1024).toFixed(2)} |`
).join('\n')}

${performanceResults.bundleAnalysis.length > 0 ? `
## Bundle Analysis

- **Total Size:** ${this.formatBytes(performanceResults.bundleAnalysis[0].totalSize)}
- **Gzipped Size:** ${this.formatBytes(performanceResults.bundleAnalysis[0].gzippedSize)}
- **Modules:** ${performanceResults.bundleAnalysis[0].metrics?.modules?.length || 0}
- **Dependencies:** ${performanceResults.bundleAnalysis[0].metrics?.dependencies?.length || 0}
` : ''}
    `;
  }

  private determineStatus(
    gateResults: CIPipelineResult['gates'],
    performanceResults: CIPipelineResult['performanceResults']
  ): CIPipelineResult['status'] {
    if (gateResults.failed > 0) {
      return 'failure';
    }

    const hasFailures = performanceResults.benchmarks.some(r => r.status === 'failed') ||
                       performanceResults.regressions.some(r => 
                         r.testResults.some(t => t.status === 'failed')
                       );

    if (hasFailures) {
      return 'failure';
    }

    const hasWarnings = performanceResults.alerts.some(a => a.severity === 'warning') ||
                       performanceResults.regressions.some(r => r.regressions.length > 0);

    return hasWarnings ? 'warning' : 'success';
  }

  private generateSummaryAndRecommendations(
    performanceResults: CIPipelineResult['performanceResults'],
    gateResults: CIPipelineResult['gates'],
    buildContext: CIBuildContext
  ): { summary: string; recommendations: string[] } {
    const recommendations: string[] = [];
    let summary = '';

    const totalTests = performanceResults.benchmarks.length;
    const failedTests = performanceResults.benchmarks.filter(r => r.status === 'failed').length;
    const passedTests = totalTests - failedTests;

    if (gateResults.failed > 0) {
      summary = `Performance gates failed (${gateResults.failed}/${gateResults.passed + gateResults.failed})`;
      recommendations.push('Review and fix failing performance gates before deployment');
    } else if (failedTests > 0) {
      summary = `${failedTests} performance tests failed out of ${totalTests}`;
      recommendations.push('Fix failing performance tests');
    } else {
      summary = `All ${totalTests} performance tests passed`;
    }

    // Bundle size recommendations
    const bundleAnalysis = performanceResults.bundleAnalysis[0];
    if (bundleAnalysis && bundleAnalysis.recommendations.length > 0) {
      recommendations.push(...bundleAnalysis.recommendations.map(r => r.title));
    }

    // Regression recommendations
    const totalRegressions = performanceResults.regressions.reduce((sum, r) => sum + r.regressions.length, 0);
    if (totalRegressions > 0) {
      recommendations.push(`Address ${totalRegressions} performance regressions`);
    }

    // Alert recommendations
    const criticalAlerts = performanceResults.alerts.filter(a => a.severity === 'critical').length;
    if (criticalAlerts > 0) {
      recommendations.push(`Resolve ${criticalAlerts} critical performance alerts`);
    }

    return { summary, recommendations };
  }

  private async sendNotifications(result: CIPipelineResult): Promise<void> {
    // Slack notification
    if (this.config.notifications.slack) {
      try {
        await this.sendSlackNotification(result);
      } catch (error) {
        console.error('Failed to send Slack notification:', error);
      }
    }

    // Teams notification
    if (this.config.notifications.teams) {
      try {
        await this.sendTeamsNotification(result);
      } catch (error) {
        console.error('Failed to send Teams notification:', error);
      }
    }

    // Email notification
    if (this.config.notifications.email) {
      try {
        await this.sendEmailNotification(result);
      } catch (error) {
        console.error('Failed to send email notification:', error);
      }
    }
  }

  private async sendSlackNotification(result: CIPipelineResult): Promise<void> {
    if (!this.config.notifications.slack) return;

    const color = {
      success: '#36a64f',
      warning: '#ff9900',
      failure: '#ff0000',
      cancelled: '#999999'
    }[result.status];

    const message = {
      channel: this.config.notifications.slack.channel,
      attachments: [{
        color,
        title: `Performance Test Results - ${result.status.toUpperCase()}`,
        text: result.summary,
        fields: [
          {
            title: 'Build ID',
            value: result.buildId,
            short: true
          },
          {
            title: 'Branch',
            value: result.context.branch,
            short: true
          },
          {
            title: 'Duration',
            value: `${(result.duration / 1000).toFixed(1)}s`,
            short: true
          },
          {
            title: 'Gates',
            value: `${result.gates.passed}/${result.gates.passed + result.gates.failed}`,
            short: true
          }
        ],
        actions: result.context.buildUrl ? [{
          type: 'button',
          text: 'View Build',
          url: result.context.buildUrl
        }] : undefined
      }]
    };

    const response = await fetch(this.config.notifications.slack.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      throw new Error(`Slack notification failed: ${response.status}`);
    }
  }

  private async sendTeamsNotification(result: CIPipelineResult): Promise<void> {
    // Teams notification implementation would go here
    console.log('Teams notification would be sent:', result.summary);
  }

  private async sendEmailNotification(result: CIPipelineResult): Promise<void> {
    // Email notification implementation would go here
    console.log('Email notification would be sent:', result.summary);
  }

  private generatePRComment(result: CIPipelineResult): string {
    const statusEmoji = {
      success: '✅',
      warning: '⚠️',
      failure: '❌',
      cancelled: '⏹️'
    }[result.status];

    const totalTests = result.performanceResults.benchmarks.length;
    const failedTests = result.performanceResults.benchmarks.filter(r => r.status === 'failed').length;

    return `
## ${statusEmoji} Performance Test Results

**Status:** ${result.status.toUpperCase()}  
**Duration:** ${(result.duration / 1000).toFixed(1)}s

### Summary
- **Tests:** ${totalTests - failedTests}/${totalTests} passed
- **Gates:** ${result.gates.passed}/${result.gates.passed + result.gates.failed} passed
- **Regressions:** ${result.performanceResults.regressions.reduce((sum, r) => sum + r.regressions.length, 0)}
- **Bundle Size:** ${this.formatBytes(result.performanceResults.bundleAnalysis[0]?.totalSize || 0)}

${result.recommendations.length > 0 ? `
### Recommendations
${result.recommendations.map(rec => `- ${rec}`).join('\n')}
` : ''}

${result.context.buildUrl ? `
[View full report](${result.context.buildUrl})
` : ''}
    `;
  }

  private async postGitHubComment(prNumber: number, comment: string): Promise<void> {
    if (!this.config.apiToken || !process.env.GITHUB_REPOSITORY) {
      return;
    }

    const response = await fetch(
      `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/issues/${prNumber}/comments`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${this.config.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ body: comment })
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }
  }

  private async storeArtifacts(result: CIPipelineResult): Promise<void> {
    // Implement artifact storage logic (could be S3, Azure Blob, etc.)
    console.log(`Storing ${result.artifacts.length} artifacts for build ${result.buildId}`);

    // Clean up old artifacts
    await this.cleanupOldArtifacts();
  }

  private async cleanupOldArtifacts(): Promise<void> {
    const cutoff = Date.now() - (this.config.artifactStorage.retention * 24 * 60 * 60 * 1000);
    
    try {
      const items = await fs.readdir(this.config.artifactStorage.path);
      
      for (const item of items) {
        const itemPath = path.join(this.config.artifactStorage.path, item);
        const stats = await fs.stat(itemPath);
        
        if (stats.mtime.getTime() < cutoff) {
          await fs.rm(itemPath, { recursive: true, force: true });
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old artifacts:', error);
    }
  }

  private setupDefaultGates(): void {
    const defaultGates: PerformanceGate[] = [
      {
        name: 'Bundle Size Gate',
        enabled: true,
        blocking: true,
        conditions: [{
          metric: 'bundleSize',
          operator: 'lt',
          value: this.performanceConfig.thresholds.bundleSize
        }],
        timeout: 300000 // 5 minutes
      },
      {
        name: 'Memory Usage Gate',
        enabled: true,
        blocking: false,
        conditions: [{
          metric: 'memoryUsage',
          operator: 'lt',
          value: this.performanceConfig.thresholds.memoryUsage
        }],
        timeout: 300000
      },
      {
        name: 'Regression Gate',
        enabled: true,
        blocking: false,
        conditions: [{
          metric: 'regressionCount',
          operator: 'eq',
          value: 0
        }],
        timeout: 300000
      }
    ];

    this.config.gates.push(...defaultGates);
  }

  private generateBuildId(): string {
    return `build-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    const { createHash } = await import('crypto');
    const content = await fs.readFile(filePath);
    return createHash('sha256').update(content).digest('hex');
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}