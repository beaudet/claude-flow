/**
 * Work stealing algorithm for load balancing between agents
 */
import type { Task, AgentProfile } from '../utils/types.js';
import type { IEventBus } from '../core/event-bus.js';
import type { ILogger } from '../core/logger.js';
export interface WorkStealingConfig {
    enabled: boolean;
    stealThreshold: number;
    maxStealBatch: number;
    stealInterval: number;
}
export interface AgentWorkload {
    agentId: string;
    taskCount: number;
    avgTaskDuration: number;
    cpuUsage: number;
    memoryUsage: number;
    priority: number;
    capabilities: string[];
}
/**
 * Work stealing coordinator for load balancing
 */
export declare class WorkStealingCoordinator {
    private config;
    private eventBus;
    private logger;
    private workloads;
    private stealInterval?;
    private taskDurations;
    constructor(config: WorkStealingConfig, eventBus: IEventBus, logger: ILogger);
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    updateAgentWorkload(agentId: string, workload: Partial<AgentWorkload>): void;
    recordTaskDuration(agentId: string, duration: number): void;
    checkAndSteal(): Promise<void>;
    /**
     * Find the best agent for a task based on capabilities and load
     */
    findBestAgent(task: Task, agents: AgentProfile[]): string | null;
    getWorkloadStats(): Record<string, unknown>;
}
//# sourceMappingURL=work-stealing.d.ts.map