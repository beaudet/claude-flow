/**
 * Advanced task scheduler with intelligent agent selection and priority handling
 */
import { Task, CoordinationConfig, AgentProfile } from '../utils/types.js';
import type { IEventBus } from '../core/event-bus.js';
import type { ILogger } from '../core/logger.js';
import { TaskScheduler } from './scheduler.js';
export interface SchedulingStrategy {
    name: string;
    selectAgent(task: Task, agents: AgentProfile[], context: SchedulingContext): string | null;
}
export interface SchedulingContext {
    taskLoads: Map<string, number>;
    agentCapabilities: Map<string, string[]>;
    agentPriorities: Map<string, number>;
    taskHistory: Map<string, TaskStats>;
    currentTime: Date;
}
export interface TaskStats {
    totalExecutions: number;
    avgDuration: number;
    successRate: number;
    lastAgent?: string;
}
/**
 * Capability-based scheduling strategy
 */
export declare class CapabilitySchedulingStrategy implements SchedulingStrategy {
    name: string;
    selectAgent(task: Task, agents: AgentProfile[], context: SchedulingContext): string | null;
}
/**
 * Round-robin scheduling strategy
 */
export declare class RoundRobinSchedulingStrategy implements SchedulingStrategy {
    name: string;
    private lastIndex;
    selectAgent(task: Task, agents: AgentProfile[], context: SchedulingContext): string | null;
}
/**
 * Least-loaded scheduling strategy
 */
export declare class LeastLoadedSchedulingStrategy implements SchedulingStrategy {
    name: string;
    selectAgent(task: Task, agents: AgentProfile[], context: SchedulingContext): string | null;
}
/**
 * Affinity-based scheduling strategy (prefers agents that previously executed similar tasks)
 */
export declare class AffinitySchedulingStrategy implements SchedulingStrategy {
    name: string;
    selectAgent(task: Task, agents: AgentProfile[], context: SchedulingContext): string | null;
}
/**
 * Advanced task scheduler with multiple strategies
 */
export declare class AdvancedTaskScheduler extends TaskScheduler {
    private strategies;
    private activeAgents;
    private taskStats;
    private workStealing;
    private dependencyGraph;
    private circuitBreakers;
    private defaultStrategy;
    constructor(config: CoordinationConfig, eventBus: IEventBus, logger: ILogger);
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    /**
     * Register a scheduling strategy
     */
    registerStrategy(strategy: SchedulingStrategy): void;
    /**
     * Set the default scheduling strategy
     */
    setDefaultStrategy(name: string): void;
    /**
     * Register an agent
     */
    registerAgent(profile: AgentProfile): void;
    /**
     * Unregister an agent
     */
    unregisterAgent(agentId: string): void;
    /**
     * Override assignTask to use advanced scheduling
     */
    assignTask(task: Task, agentId?: string): Promise<void>;
    /**
     * Select the best agent for a task
     */
    private selectAgentForTask;
    /**
     * Override completeTask to update stats and dependency graph
     */
    completeTask(taskId: string, result: unknown): Promise<void>;
    /**
     * Override failTask to update stats and dependency graph
     */
    failTask(taskId: string, error: Error): Promise<void>;
    /**
     * Get a task by ID (helper method)
     */
    private getTask;
    /**
     * Update task statistics
     */
    private updateTaskStats;
    /**
     * Set up advanced event handlers
     */
    private setupAdvancedEventHandlers;
    /**
     * Reassign a task to a different agent
     */
    private reassignTask;
    /**
     * Get advanced scheduling metrics
     */
    getSchedulingMetrics(): Promise<Record<string, unknown>>;
}
//# sourceMappingURL=advanced-scheduler.d.ts.map