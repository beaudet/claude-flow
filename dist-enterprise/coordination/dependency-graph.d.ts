/**
 * Dependency graph management for task scheduling
 */
import type { Task } from '../utils/types.js';
import type { ILogger } from '../core/logger.js';
export interface DependencyNode {
    taskId: string;
    dependencies: Set<string>;
    dependents: Set<string>;
    status: 'pending' | 'ready' | 'running' | 'completed' | 'failed';
}
export interface DependencyPath {
    from: string;
    to: string;
    path: string[];
}
/**
 * Manages task dependencies and determines execution order
 */
export declare class DependencyGraph {
    private logger;
    private nodes;
    private completedTasks;
    constructor(logger: ILogger);
    /**
     * Add a task to the dependency graph
     */
    addTask(task: Task): void;
    /**
     * Remove a task from the dependency graph
     */
    removeTask(taskId: string): void;
    /**
     * Mark a task as completed
     */
    markCompleted(taskId: string): string[];
    /**
     * Mark a task as failed
     */
    markFailed(taskId: string): string[];
    /**
     * Check if a task is ready to run
     */
    isTaskReady(taskId: string): boolean;
    /**
     * Get all ready tasks
     */
    getReadyTasks(): string[];
    /**
     * Get all dependents of a task (recursive)
     */
    getAllDependents(taskId: string): string[];
    /**
     * Detect circular dependencies
     */
    detectCycles(): string[][];
    /**
     * Get topological sort of tasks
     */
    topologicalSort(): string[] | null;
    /**
     * Find critical path (longest path through the graph)
     */
    findCriticalPath(): DependencyPath | null;
    /**
     * Find path between two tasks
     */
    private findPath;
    /**
     * Get graph statistics
     */
    getStats(): Record<string, unknown>;
    /**
     * Export graph to DOT format for visualization
     */
    toDot(): string;
}
//# sourceMappingURL=dependency-graph.d.ts.map