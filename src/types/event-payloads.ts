/**
 * Event Payload Type Definitions
 * Proper interfaces for event system to prevent runtime errors
 */

// Resource Management Events
export interface ResourceUsageUpdatePayload {
  resourceId: string;
  usage: number;
  metadata?: Record<string, any>;
}

// Agent Events  
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

// Task Events
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

// System Events
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

// Performance Events
export interface PerformanceMetricPayload {
  name: string;
  value: number;
  timestamp?: number;
}

// Logger Events
export interface LogSideEffectPayload {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
}