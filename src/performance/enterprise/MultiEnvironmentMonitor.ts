/**
 * Multi-Environment Performance Monitoring System
 * Enterprise-grade monitoring across development, staging, and production environments
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PerformanceBenchmarker } from '../core/PerformanceBenchmarker.js';
import { AlertSystem } from '../alerts/AlertSystem.js';
import { PerformanceDashboard } from '../dashboard/PerformanceDashboard.js';
import {
  PerformanceMetrics,
  PerformanceConfig,
  PerformanceAlert,
  AlertChannel,
  EnvironmentInfo,
  PerformanceBaseline,
  TrendAnalysis
} from '../types.js';

export interface EnvironmentConfig {
  name: string;
  type: 'development' | 'staging' | 'production' | 'test' | 'preview';
  endpoint?: string;
  credentials?: {
    apiKey?: string;
    token?: string;
    username?: string;
    password?: string;
  };
  monitoring: {
    enabled: boolean;
    interval: number;
    retentionDays: number;
    metrics: string[];
  };
  alerts: {
    enabled: boolean;
    channels: AlertChannel[];
    escalation: EscalationConfig[];
  };
  sla: SLAConfig;
  deployment: {
    branch: string;
    autoBaseline: boolean;
    requiresApproval: boolean;
  };
}

export interface EscalationConfig {
  level: number;
  afterMinutes: number;
  severity: 'warning' | 'error' | 'critical';
  channels: AlertChannel[];
  oncall?: {
    team: string;
    schedule: string;
  };
}

export interface SLAConfig {
  availability: {
    target: number; // percentage
    measurement: 'uptime' | 'success_rate';
  };
  performance: {
    responseTime: {
      p50: number;
      p95: number;
      p99: number;
    };
    throughput: {
      min: number; // requests per second
    };
    errorRate: {
      max: number; // percentage
    };
  };
  resources: {
    memory: {
      max: number; // bytes
      sustained: number; // bytes
    };
    cpu: {
      max: number; // percentage
      sustained: number; // percentage
    };
  };
}

export interface EnvironmentStatus {
  name: string;
  type: string;
  status: 'healthy' | 'degraded' | 'critical' | 'offline';
  lastUpdate: number;
  uptime: number;
  metrics: PerformanceMetrics;
  alerts: PerformanceAlert[];
  slaCompliance: SLACompliance;
  deployment: {
    version: string;
    commit: string;
    deployedAt: number;
    deployedBy: string;
  };
}

export interface SLACompliance {
  overall: {
    score: number; // 0-100
    status: 'meeting' | 'at_risk' | 'breached';
  };
  availability: {
    current: number;
    target: number;
    status: 'meeting' | 'breached';
  };
  performance: {
    responseTime: {
      p50: { current: number; target: number; status: 'meeting' | 'breached' };
      p95: { current: number; target: number; status: 'meeting' | 'breached' };
      p99: { current: number; target: number; status: 'meeting' | 'breached' };
    };
    throughput: {
      current: number;
      target: number;
      status: 'meeting' | 'breached';
    };
    errorRate: {
      current: number;
      target: number;
      status: 'meeting' | 'breached';
    };
  };
  resources: {
    memory: {
      current: number;
      target: number;
      status: 'meeting' | 'breached';
    };
    cpu: {
      current: number;
      target: number;
      status: 'meeting' | 'breached';
    };
  };
}

export interface CrossEnvironmentComparison {
  timestamp: number;
  environments: string[];
  metrics: {
    [metric: string]: {
      [environment: string]: number;
    };
  };
  anomalies: EnvironmentAnomaly[];
  recommendations: string[];
}

export interface EnvironmentAnomaly {
  environment: string;
  metric: string;
  type: 'spike' | 'drop' | 'trend' | 'outlier';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
  recommendation: string;
}

export interface DeploymentImpactAnalysis {
  deployment: {
    environment: string;
    version: string;
    commit: string;
    timestamp: number;
  };
  preDeployment: PerformanceMetrics;
  postDeployment: PerformanceMetrics;
  impact: {
    responseTime: { change: number; changePercent: number };
    throughput: { change: number; changePercent: number };
    errorRate: { change: number; changePercent: number };
    memoryUsage: { change: number; changePercent: number };
    cpuUsage: { change: number; changePercent: number };
  };
  regressions: string[];
  improvements: string[];
  recommendation: 'proceed' | 'rollback' | 'investigate';
}

export class MultiEnvironmentMonitor extends EventEmitter {
  private environments: Map<string, EnvironmentConfig> = new Map();
  private benchmarkers: Map<string, PerformanceBenchmarker> = new Map();
  private alertSystems: Map<string, AlertSystem> = new Map();
  private dashboards: Map<string, PerformanceDashboard> = new Map();
  private environmentStatus: Map<string, EnvironmentStatus> = new Map();
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
  private config: PerformanceConfig;
  private dataRetention: number = 30; // days

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
  }

  /**
   * Register an environment for monitoring
   */
  async registerEnvironment(environmentConfig: EnvironmentConfig): Promise<void> {
    this.environments.set(environmentConfig.name, environmentConfig);

    // Create dedicated performance monitoring components for this environment
    const benchmarker = new PerformanceBenchmarker(this.config);
    const alertSystem = new AlertSystem({
      ...this.config,
      alerts: {
        ...this.config.alerts,
        channels: environmentConfig.alerts.channels
      }
    });

    this.benchmarkers.set(environmentConfig.name, benchmarker);
    this.alertSystems.set(environmentConfig.name, alertSystem);

    // Initialize environment status
    this.environmentStatus.set(environmentConfig.name, {
      name: environmentConfig.name,
      type: environmentConfig.type,
      status: 'offline',
      lastUpdate: Date.now(),
      uptime: 0,
      metrics: await benchmarker.collectSystemMetrics(),
      alerts: [],
      slaCompliance: this.calculateInitialSLACompliance(environmentConfig.sla),
      deployment: {
        version: 'unknown',
        commit: 'unknown',
        deployedAt: Date.now(),
        deployedBy: 'system'
      }
    });

    this.emit('environmentRegistered', {
      environment: environmentConfig.name,
      type: environmentConfig.type
    });
  }

  /**
   * Start monitoring all registered environments
   */
  async startMonitoring(): Promise<void> {
    for (const [envName, envConfig] of this.environments) {
      if (envConfig.monitoring.enabled) {
        await this.startEnvironmentMonitoring(envName);
      }
    }

    // Start cross-environment analysis
    this.startCrossEnvironmentAnalysis();

    this.emit('monitoringStarted', {
      environments: Array.from(this.environments.keys())
    });
  }

  /**
   * Stop monitoring all environments
   */
  async stopMonitoring(): Promise<void> {
    for (const [envName, interval] of this.monitoringIntervals) {
      clearInterval(interval);
    }
    this.monitoringIntervals.clear();

    // Stop dashboards
    for (const [envName, dashboard] of this.dashboards) {
      await dashboard.stop();
    }

    this.emit('monitoringStopped');
  }

  /**
   * Get status of all environments
   */
  getAllEnvironmentStatus(): EnvironmentStatus[] {
    return Array.from(this.environmentStatus.values());
  }

  /**
   * Get status of a specific environment
   */
  getEnvironmentStatus(environmentName: string): EnvironmentStatus | null {
    return this.environmentStatus.get(environmentName) || null;
  }

  /**
   * Compare performance across environments
   */
  async compareEnvironments(
    environments: string[],
    timeRange: number = 3600000 // 1 hour
  ): Promise<CrossEnvironmentComparison> {
    const comparison: CrossEnvironmentComparison = {
      timestamp: Date.now(),
      environments,
      metrics: {},
      anomalies: [],
      recommendations: []
    };

    // Collect metrics from each environment
    const metricsToCompare = [
      'memoryUsage.heapUsed',
      'cpuUsage.utilizationPercent',
      'duration',
      'networkIO.bytesOut'
    ];

    for (const metric of metricsToCompare) {
      comparison.metrics[metric] = {};
      
      for (const envName of environments) {
        const status = this.environmentStatus.get(envName);
        if (status) {
          const value = this.extractMetricValue(status.metrics, metric);
          comparison.metrics[metric][envName] = value;
        }
      }
    }

    // Detect anomalies
    comparison.anomalies = this.detectCrossEnvironmentAnomalies(comparison.metrics, environments);

    // Generate recommendations
    comparison.recommendations = this.generateCrossEnvironmentRecommendations(
      comparison.metrics,
      comparison.anomalies
    );

    return comparison;
  }

  /**
   * Analyze deployment impact
   */
  async analyzeDeploymentImpact(
    environmentName: string,
    deploymentInfo: {
      version: string;
      commit: string;
      timestamp: number;
    }
  ): Promise<DeploymentImpactAnalysis> {
    const envStatus = this.environmentStatus.get(environmentName);
    if (!envStatus) {
      throw new Error(`Environment not found: ${environmentName}`);
    }

    // Get pre-deployment metrics (assume 30 minutes before deployment)
    const preDeploymentTime = deploymentInfo.timestamp - 1800000;
    const preDeploymentMetrics = await this.getHistoricalMetrics(
      environmentName,
      preDeploymentTime,
      deploymentInfo.timestamp
    );

    // Get post-deployment metrics (30 minutes after deployment)
    const postDeploymentMetrics = await this.getHistoricalMetrics(
      environmentName,
      deploymentInfo.timestamp,
      deploymentInfo.timestamp + 1800000
    );

    // Calculate impact
    const impact = this.calculateDeploymentImpact(preDeploymentMetrics, postDeploymentMetrics);

    const analysis: DeploymentImpactAnalysis = {
      deployment: {
        environment: environmentName,
        ...deploymentInfo
      },
      preDeployment: preDeploymentMetrics,
      postDeployment: postDeploymentMetrics,
      impact,
      regressions: this.identifyDeploymentRegressions(impact),
      improvements: this.identifyDeploymentImprovements(impact),
      recommendation: this.generateDeploymentRecommendation(impact)
    };

    this.emit('deploymentAnalyzed', {
      environment: environmentName,
      analysis
    });

    return analysis;
  }

  /**
   * Create environment-specific baseline
   */
  async createEnvironmentBaseline(
    environmentName: string,
    name: string,
    version: string
  ): Promise<void> {
    const benchmarker = this.benchmarkers.get(environmentName);
    if (!benchmarker) {
      throw new Error(`Environment not found: ${environmentName}`);
    }

    const envConfig = this.environments.get(environmentName);
    if (!envConfig) {
      throw new Error(`Environment config not found: ${environmentName}`);
    }

    await benchmarker.setBaseline({
      id: `${environmentName}-${name}-${Date.now()}`,
      name: `${environmentName}-${name}`,
      version,
      timestamp: Date.now(),
      metrics: await benchmarker.collectSystemMetrics(),
      environment: await this.getEnvironmentInfo(environmentName),
      tags: [environmentName, envConfig.type, version]
    });

    this.emit('baselineCreated', {
      environment: environmentName,
      name,
      version
    });
  }

  /**
   * Get SLA compliance report
   */
  async getSLAComplianceReport(
    environmentName: string,
    timeRange: number = 86400000 // 24 hours
  ): Promise<SLACompliance> {
    const envConfig = this.environments.get(environmentName);
    const envStatus = this.environmentStatus.get(environmentName);
    
    if (!envConfig || !envStatus) {
      throw new Error(`Environment not found: ${environmentName}`);
    }

    return this.calculateSLACompliance(envConfig.sla, envStatus.metrics, timeRange);
  }

  /**
   * Generate environment health report
   */
  async generateHealthReport(timeRange: number = 86400000): Promise<any> {
    const environments = Array.from(this.environments.keys());
    const report = {
      timestamp: Date.now(),
      timeRange,
      environments: {} as any,
      summary: {
        total: environments.length,
        healthy: 0,
        degraded: 0,
        critical: 0,
        offline: 0
      },
      alerts: {
        total: 0,
        critical: 0,
        warning: 0
      },
      sla: {
        overall: 0,
        meeting: 0,
        atRisk: 0,
        breached: 0
      }
    };

    for (const envName of environments) {
      const status = this.environmentStatus.get(envName);
      if (!status) continue;

      report.environments[envName] = {
        status: status.status,
        uptime: status.uptime,
        alerts: status.alerts.length,
        slaScore: status.slaCompliance.overall.score,
        lastUpdate: status.lastUpdate
      };

      // Update summary
      report.summary[status.status]++;
      report.alerts.total += status.alerts.length;
      report.alerts.critical += status.alerts.filter(a => a.severity === 'critical').length;
      report.alerts.warning += status.alerts.filter(a => a.severity === 'warning').length;

      // Update SLA summary
      report.sla.overall += status.slaCompliance.overall.score;
      switch (status.slaCompliance.overall.status) {
        case 'meeting':
          report.sla.meeting++;
          break;
        case 'at_risk':
          report.sla.atRisk++;
          break;
        case 'breached':
          report.sla.breached++;
          break;
      }
    }

    report.sla.overall = report.sla.overall / environments.length;

    return report;
  }

  private async startEnvironmentMonitoring(environmentName: string): Promise<void> {
    const envConfig = this.environments.get(environmentName);
    if (!envConfig) return;

    const interval = setInterval(async () => {
      try {
        await this.updateEnvironmentMetrics(environmentName);
      } catch (error) {
        console.error(`Failed to update metrics for ${environmentName}:`, error);
      }
    }, envConfig.monitoring.interval);

    this.monitoringIntervals.set(environmentName, interval);

    // Start dashboard if needed
    if (envConfig.type === 'production') {
      const dashboard = new PerformanceDashboard(
        {
          port: 3001 + Array.from(this.environments.keys()).indexOf(environmentName),
          host: 'localhost',
          enableRealtime: true
        },
        this.config
      );

      await dashboard.start();
      this.dashboards.set(environmentName, dashboard);
    }

    this.emit('environmentMonitoringStarted', { environment: environmentName });
  }

  private async updateEnvironmentMetrics(environmentName: string): Promise<void> {
    const benchmarker = this.benchmarkers.get(environmentName);
    const alertSystem = this.alertSystems.get(environmentName);
    const envStatus = this.environmentStatus.get(environmentName);
    
    if (!benchmarker || !alertSystem || !envStatus) return;

    try {
      // Collect current metrics
      const metrics = await benchmarker.collectSystemMetrics();
      
      // Process alerts
      const alerts = await alertSystem.processMetrics(metrics);
      
      // Update environment status
      envStatus.metrics = metrics;
      envStatus.alerts = alerts;
      envStatus.lastUpdate = Date.now();
      envStatus.status = this.determineEnvironmentHealth(envStatus);
      
      // Calculate SLA compliance
      const envConfig = this.environments.get(environmentName);
      if (envConfig) {
        envStatus.slaCompliance = this.calculateSLACompliance(envConfig.sla, metrics);
      }

      // Update dashboard
      const dashboard = this.dashboards.get(environmentName);
      if (dashboard) {
        dashboard.updateData({
          metrics,
          alerts: alerts.map(a => ({
            alertId: a.id,
            ruleId: 'unknown',
            timestamp: a.timestamp,
            severity: a.severity,
            status: 'active' as const,
            metrics,
            message: a.description,
            actions: []
          })),
          trends: []
        });
      }

      this.emit('metricsUpdated', {
        environment: environmentName,
        metrics,
        alerts: alerts.length
      });

    } catch (error) {
      envStatus.status = 'offline';
      this.emit('environmentError', {
        environment: environmentName,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private startCrossEnvironmentAnalysis(): void {
    // Run cross-environment analysis every 5 minutes
    setInterval(async () => {
      try {
        const environments = Array.from(this.environments.keys());
        if (environments.length > 1) {
          const comparison = await this.compareEnvironments(environments);
          
          if (comparison.anomalies.length > 0) {
            this.emit('crossEnvironmentAnomalies', {
              anomalies: comparison.anomalies,
              recommendations: comparison.recommendations
            });
          }
        }
      } catch (error) {
        console.error('Cross-environment analysis failed:', error);
      }
    }, 300000); // 5 minutes
  }

  private determineEnvironmentHealth(status: EnvironmentStatus): EnvironmentStatus['status'] {
    const criticalAlerts = status.alerts.filter(a => a.severity === 'critical').length;
    const warningAlerts = status.alerts.filter(a => a.severity === 'warning').length;
    
    // Check if environment is responsive
    const lastUpdateAge = Date.now() - status.lastUpdate;
    if (lastUpdateAge > 300000) { // 5 minutes
      return 'offline';
    }

    // Check SLA compliance
    if (status.slaCompliance.overall.status === 'breached') {
      return 'critical';
    }

    // Check alerts
    if (criticalAlerts > 0) {
      return 'critical';
    } else if (warningAlerts > 0 || status.slaCompliance.overall.status === 'at_risk') {
      return 'degraded';
    }

    return 'healthy';
  }

  private calculateSLACompliance(sla: SLAConfig, metrics: PerformanceMetrics, timeRange?: number): SLACompliance {
    // This is a simplified implementation
    // In production, you'd calculate based on historical data
    
    const responseTimeP50 = metrics.duration || 0;
    const responseTimeP95 = metrics.duration * 1.5 || 0; // Approximation
    const responseTimeP99 = metrics.duration * 2 || 0; // Approximation
    
    const memoryUsage = metrics.memoryUsage?.heapUsed || 0;
    const cpuUsage = metrics.cpuUsage?.utilizationPercent || 0;
    
    const compliance: SLACompliance = {
      overall: {
        score: 100,
        status: 'meeting'
      },
      availability: {
        current: 99.9, // Would be calculated from uptime data
        target: sla.availability.target,
        status: 99.9 >= sla.availability.target ? 'meeting' : 'breached'
      },
      performance: {
        responseTime: {
          p50: {
            current: responseTimeP50,
            target: sla.performance.responseTime.p50,
            status: responseTimeP50 <= sla.performance.responseTime.p50 ? 'meeting' : 'breached'
          },
          p95: {
            current: responseTimeP95,
            target: sla.performance.responseTime.p95,
            status: responseTimeP95 <= sla.performance.responseTime.p95 ? 'meeting' : 'breached'
          },
          p99: {
            current: responseTimeP99,
            target: sla.performance.responseTime.p99,
            status: responseTimeP99 <= sla.performance.responseTime.p99 ? 'meeting' : 'breached'
          }
        },
        throughput: {
          current: 100, // Would be calculated from actual throughput
          target: sla.performance.throughput.min,
          status: 100 >= sla.performance.throughput.min ? 'meeting' : 'breached'
        },
        errorRate: {
          current: 0.1, // Would be calculated from error rate
          target: sla.performance.errorRate.max,
          status: 0.1 <= sla.performance.errorRate.max ? 'meeting' : 'breached'
        }
      },
      resources: {
        memory: {
          current: memoryUsage,
          target: sla.resources.memory.max,
          status: memoryUsage <= sla.resources.memory.max ? 'meeting' : 'breached'
        },
        cpu: {
          current: cpuUsage,
          target: sla.resources.cpu.max,
          status: cpuUsage <= sla.resources.cpu.max ? 'meeting' : 'breached'
        }
      }
    };

    // Calculate overall score and status
    let violations = 0;
    if (compliance.availability.status === 'breached') violations++;
    if (compliance.performance.responseTime.p95.status === 'breached') violations++;
    if (compliance.performance.responseTime.p99.status === 'breached') violations++;
    if (compliance.performance.throughput.status === 'breached') violations++;
    if (compliance.performance.errorRate.status === 'breached') violations++;
    if (compliance.resources.memory.status === 'breached') violations++;
    if (compliance.resources.cpu.status === 'breached') violations++;

    const totalChecks = 7;
    compliance.overall.score = Math.max(0, 100 - (violations / totalChecks) * 100);
    
    if (violations === 0) {
      compliance.overall.status = 'meeting';
    } else if (violations <= 2) {
      compliance.overall.status = 'at_risk';
    } else {
      compliance.overall.status = 'breached';
    }

    return compliance;
  }

  private calculateInitialSLACompliance(sla: SLAConfig): SLACompliance {
    return {
      overall: { score: 100, status: 'meeting' },
      availability: { current: 100, target: sla.availability.target, status: 'meeting' },
      performance: {
        responseTime: {
          p50: { current: 0, target: sla.performance.responseTime.p50, status: 'meeting' },
          p95: { current: 0, target: sla.performance.responseTime.p95, status: 'meeting' },
          p99: { current: 0, target: sla.performance.responseTime.p99, status: 'meeting' }
        },
        throughput: { current: 0, target: sla.performance.throughput.min, status: 'meeting' },
        errorRate: { current: 0, target: sla.performance.errorRate.max, status: 'meeting' }
      },
      resources: {
        memory: { current: 0, target: sla.resources.memory.max, status: 'meeting' },
        cpu: { current: 0, target: sla.resources.cpu.max, status: 'meeting' }
      }
    };
  }

  private detectCrossEnvironmentAnomalies(
    metrics: CrossEnvironmentComparison['metrics'],
    environments: string[]
  ): EnvironmentAnomaly[] {
    const anomalies: EnvironmentAnomaly[] = [];

    for (const [metric, envValues] of Object.entries(metrics)) {
      const values = Object.values(envValues);
      const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
      const stdDev = Math.sqrt(values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length);

      for (const [env, value] of Object.entries(envValues)) {
        const zScore = Math.abs((value - mean) / stdDev);
        
        if (zScore > 2) { // More than 2 standard deviations
          anomalies.push({
            environment: env,
            metric,
            type: 'outlier',
            severity: zScore > 3 ? 'critical' : zScore > 2.5 ? 'high' : 'medium',
            description: `${metric} in ${env} is significantly different from other environments`,
            impact: `Performance deviation detected in ${env}`,
            recommendation: `Investigate ${metric} in ${env} environment`
          });
        }
      }
    }

    return anomalies;
  }

  private generateCrossEnvironmentRecommendations(
    metrics: CrossEnvironmentComparison['metrics'],
    anomalies: EnvironmentAnomaly[]
  ): string[] {
    const recommendations: string[] = [];

    if (anomalies.length > 0) {
      recommendations.push('Review environments with performance anomalies');
    }

    const criticalAnomalies = anomalies.filter(a => a.severity === 'critical');
    if (criticalAnomalies.length > 0) {
      recommendations.push(`Immediate attention required for ${criticalAnomalies.length} critical anomalies`);
    }

    // Add environment-specific recommendations
    const environmentsWithIssues = [...new Set(anomalies.map(a => a.environment))];
    if (environmentsWithIssues.length > 0) {
      recommendations.push(`Focus on environments: ${environmentsWithIssues.join(', ')}`);
    }

    return recommendations;
  }

  private async getHistoricalMetrics(
    environmentName: string,
    startTime: number,
    endTime: number
  ): Promise<PerformanceMetrics> {
    // This would typically query a time-series database
    // For now, return current metrics as approximation
    const benchmarker = this.benchmarkers.get(environmentName);
    return benchmarker ? await benchmarker.collectSystemMetrics() : {} as PerformanceMetrics;
  }

  private calculateDeploymentImpact(
    preMetrics: PerformanceMetrics,
    postMetrics: PerformanceMetrics
  ): DeploymentImpactAnalysis['impact'] {
    return {
      responseTime: {
        change: (postMetrics.duration || 0) - (preMetrics.duration || 0),
        changePercent: preMetrics.duration ? 
          ((postMetrics.duration || 0) - (preMetrics.duration || 0)) / (preMetrics.duration || 1) * 100 : 0
      },
      throughput: {
        change: 0, // Would calculate from actual throughput metrics
        changePercent: 0
      },
      errorRate: {
        change: 0, // Would calculate from actual error rate metrics
        changePercent: 0
      },
      memoryUsage: {
        change: (postMetrics.memoryUsage?.heapUsed || 0) - (preMetrics.memoryUsage?.heapUsed || 0),
        changePercent: preMetrics.memoryUsage?.heapUsed ? 
          ((postMetrics.memoryUsage?.heapUsed || 0) - (preMetrics.memoryUsage?.heapUsed || 0)) / 
          (preMetrics.memoryUsage?.heapUsed || 1) * 100 : 0
      },
      cpuUsage: {
        change: (postMetrics.cpuUsage?.utilizationPercent || 0) - (preMetrics.cpuUsage?.utilizationPercent || 0),
        changePercent: preMetrics.cpuUsage?.utilizationPercent ? 
          ((postMetrics.cpuUsage?.utilizationPercent || 0) - (preMetrics.cpuUsage?.utilizationPercent || 0)) / 
          (preMetrics.cpuUsage?.utilizationPercent || 1) * 100 : 0
      }
    };
  }

  private identifyDeploymentRegressions(impact: DeploymentImpactAnalysis['impact']): string[] {
    const regressions: string[] = [];
    const threshold = 10; // 10% threshold

    if (impact.responseTime.changePercent > threshold) {
      regressions.push(`Response time increased by ${impact.responseTime.changePercent.toFixed(1)}%`);
    }
    if (impact.memoryUsage.changePercent > threshold) {
      regressions.push(`Memory usage increased by ${impact.memoryUsage.changePercent.toFixed(1)}%`);
    }
    if (impact.cpuUsage.changePercent > threshold) {
      regressions.push(`CPU usage increased by ${impact.cpuUsage.changePercent.toFixed(1)}%`);
    }

    return regressions;
  }

  private identifyDeploymentImprovements(impact: DeploymentImpactAnalysis['impact']): string[] {
    const improvements: string[] = [];
    const threshold = 5; // 5% threshold

    if (impact.responseTime.changePercent < -threshold) {
      improvements.push(`Response time improved by ${Math.abs(impact.responseTime.changePercent).toFixed(1)}%`);
    }
    if (impact.memoryUsage.changePercent < -threshold) {
      improvements.push(`Memory usage reduced by ${Math.abs(impact.memoryUsage.changePercent).toFixed(1)}%`);
    }
    if (impact.cpuUsage.changePercent < -threshold) {
      improvements.push(`CPU usage reduced by ${Math.abs(impact.cpuUsage.changePercent).toFixed(1)}%`);
    }

    return improvements;
  }

  private generateDeploymentRecommendation(
    impact: DeploymentImpactAnalysis['impact']
  ): DeploymentImpactAnalysis['recommendation'] {
    const regressions = this.identifyDeploymentRegressions(impact);
    
    if (regressions.length > 2) {
      return 'rollback';
    } else if (regressions.length > 0) {
      return 'investigate';
    } else {
      return 'proceed';
    }
  }

  private extractMetricValue(metrics: PerformanceMetrics, path: string): number {
    const parts = path.split('.');
    let value: any = metrics;
    
    for (const part of parts) {
      value = value?.[part];
      if (value === undefined) return 0;
    }
    
    return typeof value === 'number' ? value : 0;
  }

  private async getEnvironmentInfo(environmentName: string): Promise<EnvironmentInfo> {
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
      environment: environmentName as any
    };
  }
}