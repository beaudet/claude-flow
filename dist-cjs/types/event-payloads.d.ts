/**
 * Event Payload Type Definitions
 * Proper interfaces for event system to prevent runtime errors
 */
export interface ResourceUsageUpdatePayload {
    resourceId: string;
    usage: number;
    metadata?: Record<string, any>;
}
export interface AgentMetricsUpdatePayload {
    agentId: string;
    metrics: {
        activeAgents?: number;
        [key: string]: any;
    };
}
export interface AgentStatusChangedPayload {
    agentId: string;
    from: string;
    to: string;
}
export interface TaskStartedPayload {
    taskId: string;
    agentId: string;
}
export interface TaskCompletedPayload {
    taskId: string;
    duration: number;
}
export interface TaskFailedPayload {
    taskId: string;
    error: string;
}
export interface SystemResourceUpdatePayload {
    usage: number;
    metadata: Record<string, any>;
}
export interface SwarmMetricsUpdatePayload {
    metrics: {
        activeTasks?: number;
        queuedTasks?: number;
        [key: string]: any;
    };
}
export interface PerformanceMetricPayload {
    name: string;
    value: number;
    timestamp?: number;
}
export interface LogSideEffectPayload {
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    data?: any;
}
//# sourceMappingURL=event-payloads.d.ts.map