/**
 * Metrics and monitoring for coordination performance
 */
import type { ILogger } from '../core/logger.js';
import type { IEventBus } from '../core/event-bus.js';
export interface CoordinationMetrics {
    timestamp: Date;
    taskMetrics: {
        totalTasks: number;
        activeTasks: number;
        completedTasks: number;
        failedTasks: number;
        cancelledTasks: number;
        avgTaskDuration: number;
        taskThroughput: number;
        tasksByPriority: Record<string, number>;
        tasksByType: Record<string, number>;
    };
    agentMetrics: {
        totalAgents: number;
        activeAgents: number;
        idleAgents: number;
        busyAgents: number;
        agentUtilization: number;
        avgTasksPerAgent: number;
        agentsByType: Record<string, number>;
    };
    resourceMetrics: {
        totalResources: number;
        lockedResources: number;
        freeResources: number;
        resourceUtilization: number;
        avgLockDuration: number;
        lockContention: number;
        deadlockCount: number;
    };
    coordinationMetrics: {
        messagesSent: number;
        messagesReceived: number;
        messageLatency: number;
        conflictsDetected: number;
        conflictsResolved: number;
        workStealingEvents: number;
        circuitBreakerTrips: number;
    };
    performanceMetrics: {
        coordinationLatency: number;
        schedulingLatency: number;
        memoryUsage: number;
        cpuUsage: number;
        errorRate: number;
    };
}
export interface MetricsSample {
    timestamp: Date;
    metric: string;
    value: number;
    tags?: Record<string, string>;
}
/**
 * Metrics collector for coordination system
 */
export declare class CoordinationMetricsCollector {
    private logger;
    private eventBus;
    private collectionIntervalMs;
    private samples;
    private taskStartTimes;
    private messageStartTimes;
    private lockStartTimes;
    private collectionInterval?;
    private counters;
    private gauges;
    private histograms;
    constructor(logger: ILogger, eventBus: IEventBus, collectionIntervalMs?: number);
    /**
     * Start metrics collection
     */
    start(): void;
    /**
     * Stop metrics collection
     */
    stop(): void;
    /**
     * Record a metric sample
     */
    recordMetric(metric: string, value: number, tags?: Record<string, string>): void;
    /**
     * Get current metrics snapshot
     */
    getCurrentMetrics(): CoordinationMetrics;
    /**
     * Get metric history for a specific metric
     */
    getMetricHistory(metric: string, since?: Date): MetricsSample[];
    /**
     * Get top metrics by value
     */
    getTopMetrics(limit?: number): Array<{
        metric: string;
        value: number;
        timestamp: Date;
    }>;
    /**
     * Set up event handlers to collect metrics
     */
    private setupEventHandlers;
    /**
     * Collect comprehensive metrics
     */
    private collectMetrics;
    /**
     * Calculate average from array of numbers
     */
    private average;
    /**
     * Get tasks grouped by priority
     */
    private getTasksByPriority;
    /**
     * Get tasks grouped by type
     */
    private getTasksByType;
    /**
     * Get agents grouped by type
     */
    private getAgentsByType;
    /**
     * Calculate agent utilization percentage
     */
    private calculateAgentUtilization;
    /**
     * Calculate average tasks per agent
     */
    private calculateAvgTasksPerAgent;
    /**
     * Calculate resource utilization percentage
     */
    private calculateResourceUtilization;
    /**
     * Get current memory usage in MB
     */
    private getMemoryUsage;
    /**
     * Get current CPU usage percentage
     */
    private getCpuUsage;
    /**
     * Clear all metrics data
     */
    clearMetrics(): void;
}
//# sourceMappingURL=metrics.d.ts.map