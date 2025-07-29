/**
 * Conflict resolution mechanisms for multi-agent coordination
 */
import type { ILogger } from '../core/logger.js';
import type { IEventBus } from '../core/event-bus.js';
export interface ResourceConflict {
    id: string;
    resourceId: string;
    agents: string[];
    timestamp: Date;
    resolved: boolean;
    resolution?: ConflictResolution;
}
export interface TaskConflict {
    id: string;
    taskId: string;
    agents: string[];
    type: 'assignment' | 'dependency' | 'output';
    timestamp: Date;
    resolved: boolean;
    resolution?: ConflictResolution;
}
export interface ConflictResolution {
    type: 'priority' | 'timestamp' | 'vote' | 'manual' | 'retry';
    winner?: string;
    losers?: string[];
    reason: string;
    timestamp: Date;
}
export interface ConflictResolutionStrategy {
    name: string;
    resolve(conflict: ResourceConflict | TaskConflict, context: any): Promise<ConflictResolution>;
}
/**
 * Priority-based resolution strategy
 */
export declare class PriorityResolutionStrategy implements ConflictResolutionStrategy {
    name: string;
    resolve(conflict: ResourceConflict | TaskConflict, context: {
        agentPriorities: Map<string, number>;
    }): Promise<ConflictResolution>;
}
/**
 * First-come-first-served resolution strategy
 */
export declare class TimestampResolutionStrategy implements ConflictResolutionStrategy {
    name: string;
    resolve(conflict: ResourceConflict | TaskConflict, context: {
        requestTimestamps: Map<string, Date>;
    }): Promise<ConflictResolution>;
}
/**
 * Voting-based resolution strategy (for multi-agent consensus)
 */
export declare class VotingResolutionStrategy implements ConflictResolutionStrategy {
    name: string;
    resolve(conflict: ResourceConflict | TaskConflict, context: {
        votes: Map<string, string[]>;
    }): Promise<ConflictResolution>;
}
/**
 * Conflict resolution manager
 */
export declare class ConflictResolver {
    private logger;
    private eventBus;
    private strategies;
    private conflicts;
    private resolutionHistory;
    constructor(logger: ILogger, eventBus: IEventBus);
    /**
     * Register a conflict resolution strategy
     */
    registerStrategy(strategy: ConflictResolutionStrategy): void;
    /**
     * Report a resource conflict
     */
    reportResourceConflict(resourceId: string, agents: string[]): Promise<ResourceConflict>;
    /**
     * Report a task conflict
     */
    reportTaskConflict(taskId: string, agents: string[], type: TaskConflict['type']): Promise<TaskConflict>;
    /**
     * Resolve a conflict using a specific strategy
     */
    resolveConflict(conflictId: string, strategyName: string, context: any): Promise<ConflictResolution>;
    /**
     * Auto-resolve conflicts based on configuration
     */
    autoResolve(conflictId: string, preferredStrategy?: string): Promise<ConflictResolution>;
    /**
     * Get active conflicts
     */
    getActiveConflicts(): Array<ResourceConflict | TaskConflict>;
    /**
     * Get conflict history
     */
    getConflictHistory(limit?: number): ConflictResolution[];
    /**
     * Clear resolved conflicts older than a certain age
     */
    cleanupOldConflicts(maxAgeMs: number): number;
    /**
     * Get conflict statistics
     */
    getStats(): Record<string, unknown>;
}
/**
 * Optimistic concurrency control for resource updates
 */
export declare class OptimisticLockManager {
    private logger;
    private versions;
    private locks;
    constructor(logger: ILogger);
    /**
     * Acquire an optimistic lock
     */
    acquireLock(resourceId: string, agentId: string): number;
    /**
     * Validate and update with optimistic lock
     */
    validateAndUpdate(resourceId: string, agentId: string, expectedVersion: number): boolean;
    /**
     * Release a lock without updating
     */
    releaseLock(resourceId: string, agentId: string): void;
    /**
     * Clean up stale locks
     */
    cleanupStaleLocks(maxAgeMs: number): number;
}
//# sourceMappingURL=conflict-resolution.d.ts.map