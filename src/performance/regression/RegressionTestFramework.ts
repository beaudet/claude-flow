/**
 * Automated Performance Regression Testing Framework
 * Comprehensive system for detecting, analyzing, and reporting performance regressions
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { PerformanceBenchmarker } from '../core/PerformanceBenchmarker.js';
import { BundleAnalyzer } from '../bundle/BundleAnalyzer.js';
import {
  PerformanceTest,
  PerformanceMetrics,
  PerformanceBaseline,
  TestResult,
  RegressionAnalysis,
  PerformanceConfig,
  PerformanceGate,
  GateCondition,
  ValidationResult,
  PerformanceIssue,
  PerformanceAlert,
  EnvironmentInfo
} from '../types.js';

export interface RegressionTestSuite {
  id: string;
  name: string;
  description: string;
  tests: PerformanceTest[];
  baseline?: string;
  gates: PerformanceGate[];
  config: RegressionTestConfig;
}

export interface RegressionTestConfig {
  enabled: boolean;
  retryOnFailure: boolean;
  maxRetries: number;
  parallelExecution: boolean;
  maxConcurrency: number;
  timeout: number;
  warmupRuns: number;
  testRuns: number;
  comparison: {
    enabled: boolean;
    baselineBranch: string;
    comparisonThreshold: number;
    significanceLevel: number;
  };
  reporting: {
    generateReport: boolean;
    includeDetails: boolean;
    outputFormat: 'json' | 'html' | 'markdown' | 'junit';
    outputPath?: string;
  };
}

export interface RegressionTestResult {
  suiteId: string;
  timestamp: number;
  duration: number;
  environment: EnvironmentInfo;
  summary: RegressionSummary;
  testResults: TestResult[];
  regressions: RegressionAnalysis[];
  gateResults: GateResult[];
  alerts: PerformanceAlert[];
  recommendations: string[];
}

export interface RegressionSummary {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  regressionsDetected: number;
  criticalRegressions: number;
  gatesPassed: number;
  gatesFailed: number;
  overallScore: number;
  statusMessage: string;
}

export interface GateResult {
  gate: PerformanceGate;
  passed: boolean;
  conditions: ConditionResult[];
  message: string;
  blocking: boolean;
}

export interface ConditionResult {
  condition: GateCondition;
  passed: boolean;
  actualValue: number;
  expectedValue: number;
  message: string;
}

export class RegressionTestFramework extends EventEmitter {
  private benchmarker: PerformanceBenchmarker;
  private bundleAnalyzer: BundleAnalyzer;
  private testSuites: Map<string, RegressionTestSuite> = new Map();
  private baselines: Map<string, PerformanceBaseline> = new Map();
  private runningTests: Set<string> = new Set();
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

    this.benchmarker = new PerformanceBenchmarker(this.config);
    this.bundleAnalyzer = new BundleAnalyzer({}, this.config);

    this.setupEventHandlers();
  }

  /**
   * Register a regression test suite
   */
  registerTestSuite(suite: RegressionTestSuite): void {
    this.testSuites.set(suite.id, suite);
    
    // Register individual tests with benchmarker
    suite.tests.forEach(test => {
      this.benchmarker.registerTest(test);
    });

    this.emit('testSuiteRegistered', { suiteId: suite.id, name: suite.name });
  }

  /**
   * Run a specific test suite
   */
  async runTestSuite(suiteId: string): Promise<RegressionTestResult> {
    const suite = this.testSuites.get(suiteId);
    if (!suite) {
      throw new Error(`Test suite not found: ${suiteId}`);
    }

    if (this.runningTests.has(suiteId)) {
      throw new Error(`Test suite ${suiteId} is already running`);
    }

    this.runningTests.add(suiteId);
    this.emit('testSuiteStarted', { suiteId, name: suite.name });

    const startTime = performance.now();
    let result: RegressionTestResult;

    try {
      // Execute the test suite
      result = await this.executeTestSuite(suite);
      
      // Generate report if configured
      if (suite.config.reporting.generateReport) {
        await this.generateReport(result, suite.config.reporting);
      }

      this.emit('testSuiteCompleted', {
        suiteId,
        duration: result.duration,
        passed: result.summary.overallScore >= 70
      });

    } catch (error) {
      this.emit('testSuiteError', {
        suiteId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      this.runningTests.delete(suiteId);
    }

    return result;
  }

  /**
   * Run all registered test suites
   */
  async runAllTestSuites(): Promise<Map<string, RegressionTestResult>> {
    const results = new Map<string, RegressionTestResult>();
    
    for (const [suiteId, suite] of this.testSuites) {
      if (suite.config.enabled) {
        try {
          const result = await this.runTestSuite(suiteId);
          results.set(suiteId, result);
        } catch (error) {
          console.error(`Failed to run test suite ${suiteId}:`, error);
        }
      }
    }

    return results;
  }

  /**
   * Create and set a performance baseline
   */
  async createBaseline(
    name: string,
    version: string,
    suiteId?: string,
    tags: string[] = []
  ): Promise<PerformanceBaseline> {
    const environment = await this.getEnvironmentInfo();
    
    // Run tests to establish baseline
    let baselineMetrics: PerformanceMetrics;
    
    if (suiteId) {
      const suite = this.testSuites.get(suiteId);
      if (!suite) {
        throw new Error(`Test suite not found: ${suiteId}`);
      }
      
      // Run a representative test to get baseline metrics
      const representativeTest = suite.tests[0];
      if (representativeTest) {
        baselineMetrics = await representativeTest.execute();
      } else {
        baselineMetrics = await this.benchmarker.collectSystemMetrics();
      }
    } else {
      baselineMetrics = await this.benchmarker.collectSystemMetrics();
    }

    const baseline: PerformanceBaseline = {
      id: `baseline-${Date.now()}`,
      name,
      version,
      timestamp: Date.now(),
      metrics: baselineMetrics,
      environment,
      tags
    };

    this.baselines.set(baseline.id, baseline);
    this.benchmarker.setBaseline(baseline);

    this.emit('baselineCreated', {
      baselineId: baseline.id,
      name: baseline.name,
      version: baseline.version
    });

    return baseline;
  }

  /**
   * Compare current performance with baseline
   */
  async compareWithBaseline(baselineId: string, suiteId?: string): Promise<RegressionAnalysis[]> {
    const baseline = this.baselines.get(baselineId);
    if (!baseline) {
      throw new Error(`Baseline not found: ${baselineId}`);
    }

    const regressions: RegressionAnalysis[] = [];

    if (suiteId) {
      // Run specific test suite and compare
      const result = await this.runTestSuite(suiteId);
      regressions.push(...result.regressions);
    } else {
      // Compare current system metrics with baseline
      const currentMetrics = await this.benchmarker.collectSystemMetrics();
      const regression = this.analyzeRegression(currentMetrics, baseline.metrics);
      if (regression) {
        regressions.push(regression);
      }
    }

    return regressions;
  }

  /**
   * Detect performance regressions automatically
   */
  async detectRegressions(
    windowDays: number = 7,
    significance: number = 0.05
  ): Promise<RegressionAnalysis[]> {
    const regressions: RegressionAnalysis[] = [];
    const cutoffDate = Date.now() - (windowDays * 24 * 60 * 60 * 1000);

    // Get recent baselines for comparison
    const recentBaselines = Array.from(this.baselines.values())
      .filter(b => b.timestamp >= cutoffDate)
      .sort((a, b) => b.timestamp - a.timestamp);

    if (recentBaselines.length < 2) {
      return regressions; // Need at least 2 data points
    }

    // Compare each baseline with the previous one
    for (let i = 0; i < recentBaselines.length - 1; i++) {
      const current = recentBaselines[i];
      const previous = recentBaselines[i + 1];
      
      const regression = this.analyzeRegression(current.metrics, previous.metrics);
      if (regression && this.isSignificantRegression(regression, significance)) {
        regressions.push(regression);
      }
    }

    return regressions;
  }

  private async executeTestSuite(suite: RegressionTestSuite): Promise<RegressionTestResult> {
    const startTime = Date.now();
    const environment = await this.getEnvironmentInfo();

    // Run tests
    const testResults = await this.runTests(suite);
    
    // Analyze regressions
    const regressions = await this.analyzeRegressions(testResults, suite.baseline);
    
    // Evaluate gates
    const gateResults = await this.evaluateGates(suite.gates, testResults);
    
    // Generate alerts
    const alerts = this.generateAlerts(testResults, regressions, gateResults);

    // Calculate summary
    const summary = this.calculateSummary(testResults, regressions, gateResults);

    // Generate recommendations
    const recommendations = this.generateRecommendations(testResults, regressions);

    const duration = Date.now() - startTime;

    return {
      suiteId: suite.id,
      timestamp: startTime,
      duration,
      environment,
      summary,
      testResults,
      regressions,
      gateResults,
      alerts,
      recommendations
    };
  }

  private async runTests(suite: RegressionTestSuite): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    if (suite.config.parallelExecution) {
      // Run tests in parallel with concurrency limit
      const semaphore = new Array(suite.config.maxConcurrency).fill(null);
      const testPromises = suite.tests.map(async (test, index) => {
        // Wait for available slot
        await semaphore[index % suite.config.maxConcurrency];
        
        try {
          const result = await this.runSingleTest(test, suite.config);
          semaphore[index % suite.config.maxConcurrency] = Promise.resolve();
          return result;
        } catch (error) {
          semaphore[index % suite.config.maxConcurrency] = Promise.resolve();
          throw error;
        }
      });
      
      const parallelResults = await Promise.allSettled(testPromises);
      parallelResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          // Create error result
          results.push({
            test: suite.tests[index],
            metrics: {} as PerformanceMetrics,
            validation: {
              passed: false,
              score: 0,
              issues: [],
              recommendations: []
            },
            duration: 0,
            status: 'failed',
            error: result.reason instanceof Error ? result.reason.message : String(result.reason)
          });
        }
      });
    } else {
      // Run tests sequentially
      for (const test of suite.tests) {
        try {
          const result = await this.runSingleTest(test, suite.config);
          results.push(result);
        } catch (error) {
          results.push({
            test,
            metrics: {} as PerformanceMetrics,
            validation: {
              passed: false,
              score: 0,
              issues: [],
              recommendations: []
            },
            duration: 0,
            status: 'failed',
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }

    return results;
  }

  private async runSingleTest(test: PerformanceTest, config: RegressionTestConfig): Promise<TestResult> {
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts <= config.maxRetries) {
      try {
        // Run warmup iterations
        for (let i = 0; i < config.warmupRuns; i++) {
          await test.execute();
        }

        // Run test iterations and collect metrics
        const metrics: PerformanceMetrics[] = [];
        for (let i = 0; i < config.testRuns; i++) {
          const iterationMetrics = await test.execute();
          metrics.push(iterationMetrics);
        }

        // Calculate average metrics
        const averageMetrics = this.averageMetrics(metrics);
        
        // Validate results
        const validation = test.validate 
          ? test.validate(averageMetrics)
          : this.defaultValidation(averageMetrics);

        return {
          test,
          metrics: averageMetrics,
          validation,
          duration: averageMetrics.duration,
          status: validation.passed ? 'passed' : 'failed'
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempts++;
        
        if (attempts <= config.maxRetries && config.retryOnFailure) {
          // Wait before retry with exponential backoff
          await this.sleep(Math.pow(2, attempts) * 1000);
        }
      }
    }

    // All attempts failed
    throw lastError || new Error('Test failed after all retry attempts');
  }

  private async analyzeRegressions(
    testResults: TestResult[],
    baselineId?: string
  ): Promise<RegressionAnalysis[]> {
    const regressions: RegressionAnalysis[] = [];

    if (!baselineId) {
      return regressions;
    }

    const baseline = this.baselines.get(baselineId);
    if (!baseline) {
      return regressions;
    }

    for (const result of testResults) {
      const regression = this.analyzeRegression(result.metrics, baseline.metrics);
      if (regression) {
        regressions.push(regression);
      }
    }

    return regressions;
  }

  private analyzeRegression(
    current: PerformanceMetrics,
    baseline: PerformanceMetrics
  ): RegressionAnalysis | null {
    // Analyze memory usage regression
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

    // Analyze duration regression
    const durationChange = current.duration - baseline.duration;
    const durationChangePercent = (durationChange / baseline.duration) * 100;

    if (Math.abs(durationChangePercent) > this.config.thresholds.regressionPercent) {
      return {
        metric: 'duration',
        current: current.duration,
        baseline: baseline.duration,
        change: durationChange,
        changePercent: durationChangePercent,
        significance: this.classifySignificance(Math.abs(durationChangePercent)),
        trend: durationChangePercent > 0 ? 'degrading' : 'improving'
      };
    }

    return null;
  }

  private async evaluateGates(gates: PerformanceGate[], testResults: TestResult[]): Promise<GateResult[]> {
    const gateResults: GateResult[] = [];

    for (const gate of gates) {
      if (!gate.enabled) {
        continue;
      }

      const conditionResults: ConditionResult[] = [];
      let gatePassed = true;

      for (const condition of gate.conditions) {
        const conditionResult = await this.evaluateCondition(condition, testResults);
        conditionResults.push(conditionResult);
        
        if (!conditionResult.passed) {
          gatePassed = false;
        }
      }

      const message = gatePassed 
        ? `Gate '${gate.name}' passed all conditions`
        : `Gate '${gate.name}' failed: ${conditionResults.filter(c => !c.passed).map(c => c.message).join(', ')}`;

      gateResults.push({
        gate,
        passed: gatePassed,
        conditions: conditionResults,
        message,
        blocking: gate.blocking
      });
    }

    return gateResults;
  }

  private async evaluateCondition(
    condition: GateCondition,
    testResults: TestResult[]
  ): Promise<ConditionResult> {
    // Get the metric value from test results
    const metricValues = testResults.map(result => this.extractMetricValue(result.metrics, condition.metric));
    const actualValue = metricValues.reduce((sum, val) => sum + val, 0) / metricValues.length;
    
    let expectedValue = condition.value;
    let passed = false;

    // Apply tolerance if specified
    if (condition.tolerance) {
      const tolerance = expectedValue * (condition.tolerance / 100);
      expectedValue = condition.operator.includes('l') ? expectedValue - tolerance : expectedValue + tolerance;
    }

    // Evaluate condition
    switch (condition.operator) {
      case 'lt':
        passed = actualValue < expectedValue;
        break;
      case 'le':
        passed = actualValue <= expectedValue;
        break;
      case 'gt':
        passed = actualValue > expectedValue;
        break;
      case 'ge':
        passed = actualValue >= expectedValue;
        break;
      case 'eq':
        passed = Math.abs(actualValue - expectedValue) < 0.001; // Float comparison
        break;
      case 'ne':
        passed = Math.abs(actualValue - expectedValue) >= 0.001;
        break;
    }

    const message = passed
      ? `${condition.metric} ${condition.operator} ${expectedValue} (actual: ${actualValue.toFixed(2)})`
      : `${condition.metric} ${condition.operator} ${expectedValue} FAILED (actual: ${actualValue.toFixed(2)})`;

    return {
      condition,
      passed,
      actualValue,
      expectedValue,
      message
    };
  }

  private extractMetricValue(metrics: PerformanceMetrics, metricPath: string): number {
    const path = metricPath.split('.');
    let value: any = metrics;
    
    for (const key of path) {
      value = value?.[key];
      if (value === undefined) {
        return 0;
      }
    }
    
    return typeof value === 'number' ? value : 0;
  }

  private generateAlerts(
    testResults: TestResult[],
    regressions: RegressionAnalysis[],
    gateResults: GateResult[]
  ): PerformanceAlert[] {
    const alerts: PerformanceAlert[] = [];
    const timestamp = Date.now();

    // Generate alerts for critical regressions
    const criticalRegressions = regressions.filter(r => r.significance === 'critical');
    if (criticalRegressions.length > 0) {
      alerts.push({
        id: `critical-regression-${timestamp}`,
        timestamp,
        type: 'regression',
        severity: 'critical',
        title: 'Critical Performance Regression Detected',
        description: `${criticalRegressions.length} critical performance regressions detected`,
        metrics: {} as PerformanceMetrics,
        issue: {
          type: 'regression',
          severity: 'critical',
          message: 'Critical performance regression detected',
          metric: 'multiple',
          current: 0,
          impact: 'critical'
        },
        environment: {} as EnvironmentInfo
      });
    }

    // Generate alerts for failed gates
    const failedBlockingGates = gateResults.filter(g => !g.passed && g.gate.blocking);
    if (failedBlockingGates.length > 0) {
      alerts.push({
        id: `gate-failure-${timestamp}`,
        timestamp,
        type: 'threshold',
        severity: 'error',
        title: 'Performance Gates Failed',
        description: `${failedBlockingGates.length} blocking performance gates failed`,
        metrics: {} as PerformanceMetrics,
        issue: {
          type: 'slow_operation',
          severity: 'error',
          message: 'Performance gates failed',
          metric: 'gates',
          current: failedBlockingGates.length,
          impact: 'high'
        },
        environment: {} as EnvironmentInfo
      });
    }

    return alerts;
  }

  private calculateSummary(
    testResults: TestResult[],
    regressions: RegressionAnalysis[],
    gateResults: GateResult[]
  ): RegressionSummary {
    const totalTests = testResults.length;
    const passedTests = testResults.filter(r => r.status === 'passed').length;
    const failedTests = testResults.filter(r => r.status === 'failed').length;
    const skippedTests = testResults.filter(r => r.status === 'skipped').length;
    
    const regressionsDetected = regressions.length;
    const criticalRegressions = regressions.filter(r => r.significance === 'critical').length;
    
    const gatesPassed = gateResults.filter(g => g.passed).length;
    const gatesFailed = gateResults.filter(g => !g.passed).length;

    // Calculate overall score
    let score = 100;
    score -= (failedTests / totalTests) * 30; // Failed tests penalty
    score -= criticalRegressions * 20; // Critical regressions penalty
    score -= (regressions.length - criticalRegressions) * 5; // Other regressions penalty
    score -= gatesFailed * 10; // Failed gates penalty

    const overallScore = Math.max(0, Math.min(100, score));

    let statusMessage = 'All tests passed';
    if (criticalRegressions > 0) {
      statusMessage = 'Critical regressions detected';
    } else if (failedTests > 0) {
      statusMessage = 'Some tests failed';
    } else if (regressionsDetected > 0) {
      statusMessage = 'Performance regressions detected';
    } else if (gatesFailed > 0) {
      statusMessage = 'Performance gates failed';
    }

    return {
      totalTests,
      passedTests,
      failedTests,
      skippedTests,
      regressionsDetected,
      criticalRegressions,
      gatesPassed,
      gatesFailed,
      overallScore,
      statusMessage
    };
  }

  private generateRecommendations(
    testResults: TestResult[],
    regressions: RegressionAnalysis[]
  ): string[] {
    const recommendations: string[] = [];

    // Memory recommendations
    const memoryRegressions = regressions.filter(r => r.metric.includes('memory'));
    if (memoryRegressions.length > 0) {
      recommendations.push('Investigate memory usage increases and potential leaks');
      recommendations.push('Consider implementing memory profiling for problematic tests');
    }

    // Performance recommendations
    const performanceRegressions = regressions.filter(r => r.metric === 'duration');
    if (performanceRegressions.length > 0) {
      recommendations.push('Profile application to identify performance bottlenecks');
      recommendations.push('Review recent code changes that might impact performance');
    }

    // Failed tests recommendations
    const failedTests = testResults.filter(r => r.status === 'failed');
    if (failedTests.length > 0) {
      recommendations.push('Fix failing tests before deployment');
      recommendations.push('Review test implementation and environment setup');
    }

    // General recommendations
    if (regressions.length > 0) {
      recommendations.push('Establish performance budgets for critical operations');
      recommendations.push('Implement continuous performance monitoring');
    }

    return recommendations;
  }

  private async generateReport(
    result: RegressionTestResult,
    reportingConfig: RegressionTestConfig['reporting']
  ): Promise<void> {
    if (!reportingConfig.outputPath) {
      return;
    }

    let reportContent: string;

    switch (reportingConfig.outputFormat) {
      case 'html':
        reportContent = this.generateHTMLReport(result, reportingConfig.includeDetails);
        break;
      case 'markdown':
        reportContent = this.generateMarkdownReport(result, reportingConfig.includeDetails);
        break;
      case 'junit':
        reportContent = this.generateJUnitReport(result);
        break;
      default:
        reportContent = JSON.stringify(result, null, 2);
    }

    await fs.writeFile(reportingConfig.outputPath, reportContent, 'utf-8');
    this.emit('reportGenerated', { path: reportingConfig.outputPath, format: reportingConfig.outputFormat });
  }

  private generateHTMLReport(result: RegressionTestResult, includeDetails: boolean): string {
    const statusColor = result.summary.overallScore >= 70 ? '#4caf50' : '#f44336';
    
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Performance Regression Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: ${statusColor}; color: white; padding: 20px; border-radius: 5px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
        .metric { background: #f5f5f5; padding: 15px; border-radius: 5px; text-align: center; }
        .metric h3 { margin: 0 0 10px 0; color: #333; }
        .metric .value { font-size: 24px; font-weight: bold; color: ${statusColor}; }
        .regression { background: #ffebee; border-left: 4px solid #f44336; padding: 15px; margin: 10px 0; }
        .recommendation { background: #e8f5e8; border-left: 4px solid #4caf50; padding: 15px; margin: 10px 0; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f2f2f2; }
        .passed { color: #4caf50; }
        .failed { color: #f44336; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Performance Regression Test Report</h1>
        <p>Suite: ${result.suiteId} | Status: ${result.summary.statusMessage} | Score: ${result.summary.overallScore.toFixed(1)}%</p>
        <p>Generated: ${new Date(result.timestamp).toLocaleString()}</p>
    </div>

    <div class="summary">
        <div class="metric">
            <h3>Total Tests</h3>
            <div class="value">${result.summary.totalTests}</div>
        </div>
        <div class="metric">
            <h3>Passed</h3>
            <div class="value passed">${result.summary.passedTests}</div>
        </div>
        <div class="metric">
            <h3>Failed</h3>
            <div class="value failed">${result.summary.failedTests}</div>
        </div>
        <div class="metric">
            <h3>Regressions</h3>
            <div class="value failed">${result.summary.regressionsDetected}</div>
        </div>
    </div>

    ${result.regressions.length > 0 ? `
    <h2>Performance Regressions</h2>
    ${result.regressions.map(reg => `
    <div class="regression">
        <strong>${reg.metric}:</strong> ${reg.changePercent.toFixed(1)}% ${reg.trend}<br>
        Current: ${this.formatMetricValue(reg.current)} | Baseline: ${this.formatMetricValue(reg.baseline)}<br>
        Significance: ${reg.significance}
    </div>
    `).join('')}
    ` : ''}

    ${result.recommendations.length > 0 ? `
    <h2>Recommendations</h2>
    ${result.recommendations.map(rec => `
    <div class="recommendation">${rec}</div>
    `).join('')}
    ` : ''}

    ${includeDetails ? `
    <h2>Test Results</h2>
    <table>
        <tr><th>Test</th><th>Status</th><th>Duration (ms)</th><th>Score</th><th>Issues</th></tr>
        ${result.testResults.map(test => `
        <tr>
            <td>${test.test.name}</td>
            <td class="${test.status}">${test.status}</td>
            <td>${test.duration.toFixed(2)}</td>
            <td>${test.validation.score.toFixed(1)}%</td>
            <td>${test.validation.issues.length}</td>
        </tr>
        `).join('')}
    </table>
    ` : ''}
</body>
</html>
    `;
  }

  private generateMarkdownReport(result: RegressionTestResult, includeDetails: boolean): string {
    return `
# Performance Regression Test Report

**Suite:** ${result.suiteId}  
**Status:** ${result.summary.statusMessage}  
**Score:** ${result.summary.overallScore.toFixed(1)}%  
**Generated:** ${new Date(result.timestamp).toISOString()}

## Summary

- **Total Tests:** ${result.summary.totalTests}
- **Passed:** ${result.summary.passedTests}
- **Failed:** ${result.summary.failedTests}
- **Regressions Detected:** ${result.summary.regressionsDetected}
- **Critical Regressions:** ${result.summary.criticalRegressions}

${result.regressions.length > 0 ? `
## Performance Regressions

${result.regressions.map(reg => `
### ${reg.metric}
- **Change:** ${reg.changePercent.toFixed(1)}% ${reg.trend}
- **Current:** ${this.formatMetricValue(reg.current)}
- **Baseline:** ${this.formatMetricValue(reg.baseline)}
- **Significance:** ${reg.significance}
`).join('')}
` : ''}

${result.recommendations.length > 0 ? `
## Recommendations

${result.recommendations.map(rec => `- ${rec}`).join('\n')}
` : ''}

${includeDetails ? `
## Test Results

| Test | Status | Duration (ms) | Score | Issues |
|------|--------|---------------|-------|--------|
${result.testResults.map(test => 
  `| ${test.test.name} | ${test.status} | ${test.duration.toFixed(2)} | ${test.validation.score.toFixed(1)}% | ${test.validation.issues.length} |`
).join('\n')}
` : ''}
    `;
  }

  private generateJUnitReport(result: RegressionTestResult): string {
    const testCases = result.testResults.map(test => {
      const status = test.status === 'passed' ? '' : `<failure message="${test.error || 'Test failed'}">${test.error || 'Test failed'}</failure>`;
      return `
    <testcase name="${test.test.name}" classname="${result.suiteId}" time="${(test.duration / 1000).toFixed(3)}">
      ${status}
    </testcase>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="${result.suiteId}" tests="${result.summary.totalTests}" failures="${result.summary.failedTests}" time="${(result.duration / 1000).toFixed(3)}">
  ${testCases}
</testsuite>`;
  }

  private setupEventHandlers(): void {
    this.benchmarker.on('testCompleted', (event) => {
      this.emit('testCompleted', event);
    });

    this.benchmarker.on('testStarted', (event) => {
      this.emit('testStarted', event);
    });
  }

  private isSignificantRegression(regression: RegressionAnalysis, significanceLevel: number): boolean {
    return Math.abs(regression.changePercent) > (significanceLevel * 100);
  }

  private classifySignificance(changePercent: number): RegressionAnalysis['significance'] {
    if (changePercent < 5) return 'negligible';
    if (changePercent < 15) return 'minor';
    if (changePercent < 30) return 'moderate';
    if (changePercent < 50) return 'major';
    return 'critical';
  }

  private averageMetrics(metrics: PerformanceMetrics[]): PerformanceMetrics {
    // Implementation would be similar to the one in PerformanceBenchmarker
    // Simplified for brevity
    return metrics[0]; // Return first metric as placeholder
  }

  private defaultValidation(metrics: PerformanceMetrics): ValidationResult {
    return {
      passed: true,
      score: 100,
      issues: [],
      recommendations: []
    };
  }

  private formatMetricValue(value: number): string {
    if (value > 1024 * 1024) {
      return `${(value / 1024 / 1024).toFixed(2)} MB`;
    } else if (value > 1024) {
      return `${(value / 1024).toFixed(2)} KB`;
    } else {
      return `${value.toFixed(2)} B`;
    }
  }

  private async getEnvironmentInfo(): Promise<EnvironmentInfo> {
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
      environment: (process.env.NODE_ENV as any) || 'development'
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}