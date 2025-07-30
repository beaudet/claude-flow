/**
 * Automated Alert System with Configurable Thresholds
 * Comprehensive alerting system for performance monitoring and notifications
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  PerformanceAlert,
  AlertChannel,
  AlertAction,
  PerformanceConfig,
  PerformanceMetrics,
  PerformanceBa seline,
  PerformanceIssue
} from '../types.js';

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  conditions: AlertCondition[];
  actions: AlertActionConfig[];
  severity: 'info' | 'warning' | 'error' | 'critical';
  cooldownMs: number;
  escalationRules?: EscalationRule[];
}

export interface AlertCondition {
  metric: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne' | 'change_percent' | 'trend';
  value: number;
  duration?: number; // How long condition must be true
  aggregation?: 'avg' | 'max' | 'min' | 'sum' | 'count';
  windowMs?: number; // Time window for aggregation
}

export interface AlertActionConfig {
  type: 'email' | 'slack' | 'webhook' | 'file' | 'console' | 'exec';
  config: Record<string, any>;
  enabled: boolean;
  condition?: 'always' | 'first_time' | 'escalation' | 'resolved';
}

export interface EscalationRule {
  afterMinutes: number;
  severity: 'warning' | 'error' | 'critical';
  actions: AlertActionConfig[];
}

export interface AlertHistory {
  alertId: string;
  ruleId: string;
  timestamp: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  status: 'active' | 'resolved' | 'acknowledged' | 'suppressed';
  metrics: PerformanceMetrics;
  message: string;
  actions: AlertActionResult[];
  acknowledged?: {
    timestamp: number;
    user: string;
    note?: string;
  };
  resolved?: {
    timestamp: number;
    auto: boolean;
    reason?: string;
  };
}

export interface AlertActionResult {
  type: string;
  timestamp: number;
  success: boolean;
  error?: string;
  details?: Record<string, any>;
}

export interface AlertSummary {
  totalAlerts: number;
  activeAlerts: number;
  criticalAlerts: number;
  errorAlerts: number;
  warningAlerts: number;
  infoAlerts: number;
  averageResolutionTime: number;
  topAlertSources: string[];
}

export class AlertSystem extends EventEmitter {
  private rules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, AlertHistory> = new Map();
  private alertHistory: AlertHistory[] = [];
  private metricBuffer: Map<string, { timestamp: number; value: number }[]> = new Map();
  private lastAlertTime: Map<string, number> = new Map();
  private config: PerformanceConfig;
  private channels: Map<string, AlertChannel> = new Map();

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

    this.setupDefaultRules();
    this.setupChannels();
    this.startBackgroundTasks();
  }

  /**
   * Register an alert rule
   */
  registerRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
    this.emit('ruleRegistered', { ruleId: rule.id, name: rule.name });
  }

  /**
   * Unregister an alert rule
   */
  unregisterRule(ruleId: string): boolean {
    const removed = this.rules.delete(ruleId);
    if (removed) {
      this.emit('ruleUnregistered', { ruleId });
    }
    return removed;
  }

  /**
   * Register an alert channel
   */
  registerChannel(channel: AlertChannel): void {
    this.channels.set(channel.type, channel);
    this.emit('channelRegistered', { type: channel.type });
  }

  /**
   * Process performance metrics and check for alerts
   */
  async processMetrics(metrics: PerformanceMetrics, baseline?: PerformanceBaseline): Promise<PerformanceAlert[]> {
    if (!this.config.alerts.enabled) {
      return [];
    }

    const alerts: PerformanceAlert[] = [];
    
    // Store metrics in buffer for trend analysis
    this.storeMetrics(metrics);

    // Check each rule
    for (const [ruleId, rule] of this.rules) {
      if (!rule.enabled) continue;

      try {
        const ruleAlerts = await this.evaluateRule(rule, metrics, baseline);
        alerts.push(...ruleAlerts);
      } catch (error) {
        console.error(`Error evaluating rule ${ruleId}:`, error);
      }
    }

    // Process generated alerts
    for (const alert of alerts) {
      await this.processAlert(alert);
    }

    return alerts;
  }

  /**
   * Acknowledge an active alert
   */
  async acknowledgeAlert(alertId: string, user: string, note?: string): Promise<boolean> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.status = 'acknowledged';
    alert.acknowledged = {
      timestamp: Date.now(),
      user,
      note
    };

    this.emit('alertAcknowledged', { alertId, user, note });
    return true;
  }

  /**
   * Resolve an active alert
   */
  async resolveAlert(alertId: string, reason?: string): Promise<boolean> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.status = 'resolved';
    alert.resolved = {
      timestamp: Date.now(),
      auto: false,
      reason
    };

    this.activeAlerts.delete(alertId);
    this.emit('alertResolved', { alertId, reason });
    return true;
  }

  /**
   * Get alert summary
   */
  getAlertSummary(): AlertSummary {
    const activeAlerts = Array.from(this.activeAlerts.values());
    const allAlerts = [...this.alertHistory, ...activeAlerts];

    const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical').length;
    const errorAlerts = activeAlerts.filter(a => a.severity === 'error').length;
    const warningAlerts = activeAlerts.filter(a => a.severity === 'warning').length;
    const infoAlerts = activeAlerts.filter(a => a.severity === 'info').length;

    // Calculate average resolution time
    const resolvedAlerts = this.alertHistory.filter(a => a.resolved);
    const avgResolutionTime = resolvedAlerts.length > 0
      ? resolvedAlerts.reduce((sum, a) => sum + (a.resolved!.timestamp - a.timestamp), 0) / resolvedAlerts.length
      : 0;

    // Find top alert sources
    const ruleCount = new Map<string, number>();
    allAlerts.forEach(a => {
      const count = ruleCount.get(a.ruleId) || 0;
      ruleCount.set(a.ruleId, count + 1);
    });

    const topAlertSources = Array.from(ruleCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([ruleId, count]) => {
        const rule = this.rules.get(ruleId);
        return rule ? `${rule.name} (${count})` : `${ruleId} (${count})`;
      });

    return {
      totalAlerts: allAlerts.length,
      activeAlerts: activeAlerts.length,
      criticalAlerts,
      errorAlerts,
      warningAlerts,
      infoAlerts,
      averageResolutionTime,
      topAlertSources
    };
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): AlertHistory[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit?: number): AlertHistory[] {
    const history = [...this.alertHistory];
    return limit ? history.slice(-limit) : history;
  }

  /**
   * Test an alert rule
   */
  async testRule(ruleId: string, testMetrics: PerformanceMetrics): Promise<PerformanceAlert[]> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    return await this.evaluateRule(rule, testMetrics);
  }

  private setupDefaultRules(): void {
    // High memory usage rule
    this.registerRule({
      id: 'high-memory-usage',
      name: 'High Memory Usage',
      description: 'Alert when memory usage exceeds threshold',
      enabled: true,
      conditions: [{
        metric: 'memoryUsage.heapUsed',
        operator: 'gt',
        value: this.config.thresholds.memoryUsage,
        duration: 30000 // 30 seconds
      }],
      actions: [{
        type: 'console',
        config: {},
        enabled: true,
        condition: 'always'
      }],
      severity: 'warning',
      cooldownMs: 300000 // 5 minutes
    });

    // High CPU usage rule
    this.registerRule({
      id: 'high-cpu-usage',
      name: 'High CPU Usage',
      description: 'Alert when CPU usage exceeds threshold',
      enabled: true,
      conditions: [{
        metric: 'cpuUsage.utilizationPercent',
        operator: 'gt',
        value: this.config.thresholds.cpuUsage,
        duration: 60000 // 1 minute
      }],
      actions: [{
        type: 'console',
        config: {},
        enabled: true,
        condition: 'always'
      }],
      severity: 'warning',
      cooldownMs: 600000 // 10 minutes
    });

    // Performance regression rule
    this.registerRule({
      id: 'performance-regression',
      name: 'Performance Regression',
      description: 'Alert when performance degrades significantly',
      enabled: true,
      conditions: [{
        metric: 'duration',
        operator: 'change_percent',
        value: this.config.thresholds.regressionPercent,
        duration: 120000 // 2 minutes
      }],
      actions: [{
        type: 'console',
        config: {},
        enabled: true,
        condition: 'always'
      }],
      severity: 'error',
      cooldownMs: 300000 // 5 minutes
    });

    // Memory leak rule
    this.registerRule({
      id: 'memory-leak',
      name: 'Memory Leak Detection',
      description: 'Alert when memory shows continuous growth pattern',
      enabled: true,
      conditions: [{
        metric: 'memoryUsage.heapUsed',
        operator: 'trend',
        value: 1024 * 1024, // 1MB/minute growth
        duration: 600000, // 10 minutes
        windowMs: 300000 // 5 minute window
      }],
      actions: [{
        type: 'console',
        config: {},
        enabled: true,
        condition: 'always'
      }],
      severity: 'critical',
      cooldownMs: 1800000 // 30 minutes
    });
  }

  private setupChannels(): void {
    // Console channel
    this.registerChannel({
      type: 'console',
      config: {},
      enabled: true
    });

    // File channel
    this.registerChannel({
      type: 'file',
      config: {
        path: path.join(process.cwd(), 'logs', 'alerts.log')
      },
      enabled: true
    });

    // Setup channels from config
    this.config.alerts.channels.forEach(channel => {
      this.registerChannel(channel);
    });
  }

  private startBackgroundTasks(): void {
    // Clean up old metric data
    setInterval(() => {
      this.cleanupOldMetrics();
    }, 300000); // 5 minutes

    // Check for escalations
    setInterval(() => {
      this.checkEscalations();
    }, 60000); // 1 minute

    // Auto-resolve stale alerts
    setInterval(() => {
      this.autoResolveStaleAlerts();
    }, 300000); // 5 minutes
  }

  private storeMetrics(metrics: PerformanceMetrics): void {
    const metricKeys = [
      'memoryUsage.heapUsed',
      'memoryUsage.rss',
      'cpuUsage.utilizationPercent',
      'duration'
    ];

    metricKeys.forEach(key => {
      const value = this.getNestedValue(metrics, key);
      if (typeof value === 'number') {
        const buffer = this.metricBuffer.get(key) || [];
        buffer.push({ timestamp: metrics.timestamp, value });
        
        // Keep only recent data (last hour)
        const cutoff = Date.now() - 3600000;
        const filtered = buffer.filter(item => item.timestamp > cutoff);
        this.metricBuffer.set(key, filtered);
      }
    });
  }

  private async evaluateRule(
    rule: AlertRule,
    metrics: PerformanceMetrics,
    baseline?: PerformanceBaseline
  ): Promise<PerformanceAlert[]> {
    const alerts: PerformanceAlert[] = [];

    // Check cooldown
    const lastAlert = this.lastAlertTime.get(rule.id);
    if (lastAlert && Date.now() - lastAlert < rule.cooldownMs) {
      return alerts;
    }

    // Evaluate all conditions
    const conditionResults = await Promise.all(
      rule.conditions.map(condition => this.evaluateCondition(condition, metrics, baseline))
    );

    // Check if all conditions are met
    const allConditionsMet = conditionResults.every(result => result);

    if (allConditionsMet) {
      const alert = await this.createAlert(rule, metrics, baseline);
      alerts.push(alert);
      this.lastAlertTime.set(rule.id, Date.now());
    }

    return alerts;
  }

  private async evaluateCondition(
    condition: AlertCondition,
    metrics: PerformanceMetrics,
    baseline?: PerformanceBaseline
  ): Promise<boolean> {
    const currentValue = this.getNestedValue(metrics, condition.metric);
    if (typeof currentValue !== 'number') {
      return false;
    }

    switch (condition.operator) {
      case 'gt':
        return currentValue > condition.value;
      case 'gte':
        return currentValue >= condition.value;
      case 'lt':
        return currentValue < condition.value;
      case 'lte':
        return currentValue <= condition.value;
      case 'eq':
        return Math.abs(currentValue - condition.value) < 0.001;
      case 'ne':
        return Math.abs(currentValue - condition.value) >= 0.001;
      case 'change_percent':
        return baseline ? this.evaluateChangePercent(currentValue, baseline, condition) : false;
      case 'trend':
        return this.evaluateTrend(condition.metric, condition.value, condition.windowMs || 300000);
      default:
        return false;
    }
  }

  private evaluateChangePercent(
    currentValue: number,
    baseline: PerformanceBaseline,
    condition: AlertCondition
  ): boolean {
    const baselineValue = this.getNestedValue(baseline.metrics, condition.metric);
    if (typeof baselineValue !== 'number') {
      return false;
    }

    const changePercent = Math.abs((currentValue - baselineValue) / baselineValue) * 100;
    return changePercent > condition.value;
  }

  private evaluateTrend(metric: string, threshold: number, windowMs: number): boolean {
    const buffer = this.metricBuffer.get(metric);
    if (!buffer || buffer.length < 10) {
      return false;
    }

    const cutoff = Date.now() - windowMs;
    const recentData = buffer.filter(item => item.timestamp > cutoff);
    
    if (recentData.length < 5) {
      return false;
    }

    // Simple linear trend calculation
    const n = recentData.length;
    const sumX = recentData.reduce((sum, item) => sum + item.timestamp, 0);
    const sumY = recentData.reduce((sum, item) => sum + item.value, 0);
    const sumXY = recentData.reduce((sum, item) => sum + item.timestamp * item.value, 0);
    const sumXX = recentData.reduce((sum, item) => sum + item.timestamp * item.timestamp, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    
    // Convert slope to bytes per minute
    const trendRate = slope * 60000;
    
    return Math.abs(trendRate) > threshold;
  }

  private async createAlert(
    rule: AlertRule,
    metrics: PerformanceMetrics,
    baseline?: PerformanceBaseline
  ): Promise<PerformanceAlert> {
    const alertId = `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const issue: PerformanceIssue = {
      type: this.getIssueType(rule.id),
      severity: rule.severity,
      message: rule.description,
      metric: rule.conditions[0]?.metric || 'unknown',
      current: this.getNestedValue(metrics, rule.conditions[0]?.metric || '') as number || 0,
      baseline: baseline ? this.getNestedValue(baseline.metrics, rule.conditions[0]?.metric || '') as number : undefined,
      impact: this.classifyImpact(rule.severity)
    };

    return {
      id: alertId,
      timestamp: Date.now(),
      type: 'threshold',
      severity: rule.severity,
      title: rule.name,
      description: rule.description,
      metrics,
      baseline: baseline?.metrics,
      issue,
      environment: {} as any, // Would be populated with environment info
      actions: rule.actions.map(action => ({
        type: action.type as any,
        description: `Execute ${action.type} action`,
        automated: true
      }))
    };
  }

  private async processAlert(alert: PerformanceAlert): Promise<void> {
    // Store alert
    const alertHistory: AlertHistory = {
      alertId: alert.id,
      ruleId: this.findRuleIdForAlert(alert),
      timestamp: alert.timestamp,
      severity: alert.severity,
      status: 'active',
      metrics: alert.metrics,
      message: alert.description,
      actions: []
    };

    this.activeAlerts.set(alert.id, alertHistory);

    // Execute actions
    const rule = this.rules.get(alertHistory.ruleId);
    if (rule) {
      for (const actionConfig of rule.actions) {
        if (actionConfig.enabled) {
          const actionResult = await this.executeAction(actionConfig, alert);
          alertHistory.actions.push(actionResult);
        }
      }
    }

    this.emit('alertTriggered', { alert, history: alertHistory });
  }

  private async executeAction(actionConfig: AlertActionConfig, alert: PerformanceAlert): Promise<AlertActionResult> {
    const startTime = Date.now();
    
    try {
      const channel = this.channels.get(actionConfig.type);
      if (!channel || !channel.enabled) {
        throw new Error(`Channel ${actionConfig.type} not available or disabled`);
      }

      await this.sendAlert(actionConfig.type, alert, { ...channel.config, ...actionConfig.config });

      return {
        type: actionConfig.type,
        timestamp: startTime,
        success: true,
        details: { channelConfig: channel.config }
      };

    } catch (error) {
      return {
        type: actionConfig.type,
        timestamp: startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async sendAlert(type: string, alert: PerformanceAlert, config: Record<string, any>): Promise<void> {
    switch (type) {
      case 'console':
        console.log(`🚨 ALERT [${alert.severity.toUpperCase()}]: ${alert.title}`);
        console.log(`   ${alert.description}`);
        console.log(`   Time: ${new Date(alert.timestamp).toISOString()}`);
        break;

      case 'file':
        const logEntry = {
          timestamp: new Date(alert.timestamp).toISOString(),
          severity: alert.severity,
          title: alert.title,
          description: alert.description,
          metrics: alert.metrics
        };
        
        try {
          await fs.mkdir(path.dirname(config.path), { recursive: true });
          await fs.appendFile(config.path, JSON.stringify(logEntry) + '\n');
        } catch (error) {
          console.error('Failed to write alert to file:', error);
        }
        break;

      case 'webhook':
        if (config.url) {
          const response = await fetch(config.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(config.headers || {})
            },
            body: JSON.stringify({
              alert,
              timestamp: new Date().toISOString()
            })
          });
          
          if (!response.ok) {
            throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
          }
        }
        break;

      case 'slack':
        if (config.webhookUrl) {
          const color = {
            info: '#36a64f',
            warning: '#ff9900',
            error: '#ff0000',
            critical: '#990000'
          }[alert.severity] || '#999999';

          const slackMessage = {
            attachments: [{
              color,
              title: alert.title,
              text: alert.description,
              fields: [
                {
                  title: 'Severity',
                  value: alert.severity.toUpperCase(),
                  short: true
                },
                {
                  title: 'Time',
                  value: new Date(alert.timestamp).toISOString(),
                  short: true
                }
              ]
            }]
          };

          const response = await fetch(config.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(slackMessage)
          });

          if (!response.ok) {
            throw new Error(`Slack webhook failed: ${response.status}`);
          }
        }
        break;

      case 'email':
        // Email implementation would go here
        console.log(`Email alert would be sent: ${alert.title}`);
        break;

      case 'exec':
        if (config.command) {
          const env = {
            ...process.env,
            ALERT_ID: alert.id,
            ALERT_SEVERITY: alert.severity,
            ALERT_TITLE: alert.title,
            ALERT_DESCRIPTION: alert.description
          };
          
          execSync(config.command, { env });
        }
        break;

      default:
        throw new Error(`Unknown alert channel type: ${type}`);
    }
  }

  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - 3600000; // 1 hour
    
    for (const [key, buffer] of this.metricBuffer) {
      const filtered = buffer.filter(item => item.timestamp > cutoff);
      this.metricBuffer.set(key, filtered);
    }

    // Clean up old alert history
    const historyCutoff = Date.now() - (this.config.alerts.aggregationWindow * 10);
    this.alertHistory = this.alertHistory.filter(alert => alert.timestamp > historyCutoff);
  }

  private checkEscalations(): void {
    const now = Date.now();
    
    for (const [alertId, alert] of this.activeAlerts) {
      const rule = this.rules.get(alert.ruleId);
      if (!rule || !rule.escalationRules) continue;

      const alertAge = now - alert.timestamp;
      
      for (const escalation of rule.escalationRules) {
        const escalationTime = escalation.afterMinutes * 60000;
        
        if (alertAge >= escalationTime && alert.severity !== escalation.severity) {
          // Escalate alert
          alert.severity = escalation.severity;
          
          // Execute escalation actions
          escalation.actions.forEach(async (actionConfig) => {
            if (actionConfig.enabled) {
              const fakeAlert: PerformanceAlert = {
                id: alertId,
                timestamp: now,
                type: 'threshold',
                severity: escalation.severity,
                title: `ESCALATED: ${rule.name}`,
                description: `Alert escalated after ${escalation.afterMinutes} minutes`,
                metrics: alert.metrics,
                issue: {
                  type: 'regression',
                  severity: escalation.severity,
                  message: 'Alert escalated',
                  metric: 'escalation',
                  current: escalationTime,
                  impact: 'high'
                },
                environment: {} as any
              };

              const actionResult = await this.executeAction(actionConfig, fakeAlert);
              alert.actions.push(actionResult);
            }
          });

          this.emit('alertEscalated', { alertId, severity: escalation.severity });
          break; // Only escalate once per check
        }
      }
    }
  }

  private autoResolveStaleAlerts(): void {
    const staleThreshold = 3600000; // 1 hour
    const now = Date.now();
    
    for (const [alertId, alert] of this.activeAlerts) {
      if (now - alert.timestamp > staleThreshold && alert.status === 'active') {
        alert.status = 'resolved';
        alert.resolved = {
          timestamp: now,
          auto: true,
          reason: 'Auto-resolved due to age'
        };

        this.activeAlerts.delete(alertId);
        this.alertHistory.push(alert);
        
        this.emit('alertAutoResolved', { alertId, reason: 'stale' });
      }
    }
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private getIssueType(ruleId: string): PerformanceIssue['type'] {
    const typeMap: Record<string, PerformanceIssue['type']> = {
      'high-memory-usage': 'resource_exhaustion',
      'high-cpu-usage': 'resource_exhaustion',
      'performance-regression': 'regression',
      'memory-leak': 'memory_leak'
    };
    
    return typeMap[ruleId] || 'slow_operation';
  }

  private classifyImpact(severity: string): PerformanceIssue['impact'] {
    const impactMap: Record<string, PerformanceIssue['impact']> = {
      'info': 'low',
      'warning': 'medium',
      'error': 'high',
      'critical': 'critical'
    };
    
    return impactMap[severity] || 'medium';
  }

  private findRuleIdForAlert(alert: PerformanceAlert): string {
    // This would normally track which rule generated which alert
    // For now, try to infer from the alert title
    for (const [ruleId, rule] of this.rules) {
      if (rule.name === alert.title) {
        return ruleId;
      }
    }
    return 'unknown-rule';
  }
}