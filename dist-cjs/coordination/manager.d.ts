/**
 * Coordination manager for task scheduling and resource management
 */
import { Task, CoordinationConfig } from '../utils/types.js';
import type { IEventBus } from '../core/event-bus.js';
import type { ILogger } from '../core/logger.js';
export interface ICoordinationManager {
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    assignTask(task: Task, agentId: string): Promise<void>;
    getAgentTaskCount(agentId: string): Promise<number>;
    getAgentTasks(agentId: string): Promise<Task[]>;
    cancelTask(taskId: string, reason?: string): Promise<void>;
    acquireResource(resourceId: string, agentId: string): Promise<void>;
    releaseResource(resourceId: string, agentId: string): Promise<void>;
    sendMessage(from: string, to: string, message: unknown): Promise<void>;
    getHealthStatus(): Promise<{
        healthy: boolean;
        error?: string;
        metrics?: Record<string, number>;
    }>;
    performMaintenance(): Promise<void>;
    getCoordinationMetrics(): Promise<Record<string, unknown>>;
    enableAdvancedScheduling(): void;
    reportConflict(type: 'resource' | 'task', id: string, agents: string[]): Promise<void>;
}
/**
 * Coordination manager implementation
 */
export declare class CoordinationManager implements ICoordinationManager {
    private config;
    private eventBus;
    private logger;
    private scheduler;
    private resourceManager;
    private messageRouter;
    private conflictResolver;
    private metricsCollector;
    private initialized;
    private deadlockCheckInterval?;
    private advancedSchedulingEnabled;
    constructor(config: CoordinationConfig, eventBus: IEventBus, logger: ILogger);
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    assignTask(task: Task, agentId: string): Promise<void>;
    getAgentTaskCount(agentId: string): Promise<number>;
    acquireResource(resourceId: string, agentId: string): Promise<void>;
    releaseResource(resourceId: string, agentId: string): Promise<void>;
    sendMessage(from: string, to: string, message: unknown): Promise<void>;
    getHealthStatus(): Promise<{
        healthy: boolean;
        error?: string;
        metrics?: Record<string, number>;
    }>;
    private setupEventHandlers;
    private startDeadlockDetection;
    private detectDeadlock;
    private resolveDeadlock;
    getAgentTasks(agentId: string): Promise<Task[]>;
    cancelTask(taskId: string, reason?: string): Promise<void>;
    performMaintenance(): Promise<void>;
    getCoordinationMetrics(): Promise<Record<string, unknown>>;
    enableAdvancedScheduling(): void;
    reportConflict(type: 'resource' | 'task', id: string, agents: string[]): Promise<void>;
}
//# sourceMappingURL=manager.d.ts.map