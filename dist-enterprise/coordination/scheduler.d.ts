/**
 * Task scheduler implementation
 */
import { Task, CoordinationConfig } from '../utils/types.js';
import type { IEventBus } from '../core/event-bus.js';
import type { ILogger } from '../core/logger.js';
interface ScheduledTask {
    task: Task;
    agentId: string;
    attempts: number;
    lastAttempt?: Date;
    timeout?: number;
}
/**
 * Task scheduler for managing task assignment and execution
 */
export declare class TaskScheduler {
    protected config: CoordinationConfig;
    protected eventBus: IEventBus;
    protected logger: ILogger;
    protected tasks: Map<string, ScheduledTask>;
    protected agentTasks: Map<string, Set<string>>;
    protected taskDependencies: Map<string, Set<string>>;
    protected completedTasks: Set<string>;
    constructor(config: CoordinationConfig, eventBus: IEventBus, logger: ILogger);
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    assignTask(task: Task, agentId: string): Promise<void>;
    completeTask(taskId: string, result: unknown): Promise<void>;
    failTask(taskId: string, error: Error): Promise<void>;
    cancelTask(taskId: string, reason: string): Promise<void>;
    cancelAgentTasks(agentId: string): Promise<void>;
    rescheduleAgentTasks(agentId: string): Promise<void>;
    getAgentTaskCount(agentId: string): number;
    getHealthStatus(): Promise<{
        healthy: boolean;
        error?: string;
        metrics?: Record<string, number>;
    }>;
    getAgentTasks(agentId: string): Promise<Task[]>;
    performMaintenance(): Promise<void>;
    private startTask;
    private canStartTask;
    private cancelDependentTasks;
    private cleanup;
}
export {};
//# sourceMappingURL=scheduler.d.ts.map