/**
 * MCP Performance Monitoring and Optimization
 */
import { EventEmitter } from 'node:events';
import type { ILogger } from '../core/logger.js';
import type { MCPSession, MCPRequest, MCPResponse } from '../utils/types.js';
export interface PerformanceMetrics {
    requestCount: number;
    averageResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    p50ResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    errorRate: number;
    throughput: number;
    activeConnections: number;
    memoryUsage: {
        heapUsed: number;
        heapTotal: number;
        external: number;
        rss: number;
    };
    cpuUsage: {
        user: number;
        system: number;
    };
    timestamp: Date;
}
export interface RequestMetrics {
    id: string;
    method: string;
    sessionId: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    success?: boolean;
    error?: string;
    requestSize?: number;
    responseSize?: number;
}
export interface AlertRule {
    id: string;
    name: string;
    metric: string;
    operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
    threshold: number;
    duration: number;
    enabled: boolean;
    severity: 'low' | 'medium' | 'high' | 'critical';
    actions: string[];
}
export interface Alert {
    id: string;
    ruleId: string;
    ruleName: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    triggeredAt: Date;
    resolvedAt?: Date;
    currentValue: number;
    threshold: number;
    metadata?: Record<string, unknown>;
}
export interface OptimizationSuggestion {
    id: string;
    type: 'performance' | 'memory' | 'throughput' | 'latency';
    priority: 'low' | 'medium' | 'high';
    title: string;
    description: string;
    impact: string;
    implementation: string;
    estimatedImprovement: string;
    detectedAt: Date;
    metrics: Record<string, number>;
}
/**
 * MCP Performance Monitor
 * Provides comprehensive performance monitoring, alerting, and optimization suggestions
 */
export declare class MCPPerformanceMonitor extends EventEmitter {
    private logger;
    private requestMetrics;
    private historicalMetrics;
    private responseTimes;
    private alertRules;
    private activeAlerts;
    private optimizationSuggestions;
    private metricsTimer?;
    private alertCheckTimer?;
    private cleanupTimer?;
    private readonly config;
    constructor(logger: ILogger);
    /**
     * Record the start of a request
     */
    recordRequestStart(request: MCPRequest, session: MCPSession): string;
    /**
     * Record the completion of a request
     */
    recordRequestEnd(requestId: string, response?: MCPResponse, error?: Error): void;
    /**
     * Get current performance metrics
     */
    getCurrentMetrics(): PerformanceMetrics;
    /**
     * Get historical metrics
     */
    getHistoricalMetrics(limit?: number): PerformanceMetrics[];
    /**
     * Add custom alert rule
     */
    addAlertRule(rule: AlertRule): void;
    /**
     * Remove alert rule
     */
    removeAlertRule(ruleId: string): void;
    /**
     * Get active alerts
     */
    getActiveAlerts(): Alert[];
    /**
     * Get optimization suggestions
     */
    getOptimizationSuggestions(): OptimizationSuggestion[];
    /**
     * Get performance summary
     */
    getPerformanceSummary(): {
        current: PerformanceMetrics;
        trends: {
            responseTime: 'improving' | 'degrading' | 'stable';
            throughput: 'improving' | 'degrading' | 'stable';
            errorRate: 'improving' | 'degrading' | 'stable';
        };
        alerts: number;
        suggestions: number;
    };
    /**
     * Resolve an alert
     */
    resolveAlert(alertId: string): void;
    /**
     * Clear all optimization suggestions
     */
    clearOptimizationSuggestions(): void;
    /**
     * Stop monitoring
     */
    stop(): void;
    private startMonitoring;
    private setupDefaultAlertRules;
    private checkAlerts;
    private getMetricValue;
    private evaluateCondition;
    private getPercentile;
    private calculateTrends;
    private getTrend;
    private generateOptimizationSuggestions;
    private cleanup;
    private calculateRequestSize;
    private calculateResponseSize;
}
//# sourceMappingURL=performance-monitor.d.ts.map