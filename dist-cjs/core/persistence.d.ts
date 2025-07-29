/**
 * Persistence layer for Claude-Flow using SQLite
 */
export interface PersistedAgent {
    id: string;
    type: string;
    name: string;
    status: string;
    capabilities: string;
    systemPrompt: string;
    maxConcurrentTasks: number;
    priority: number;
    createdAt: number;
}
export interface PersistedTask {
    id: string;
    type: string;
    description: string;
    status: string;
    priority: number;
    dependencies: string;
    metadata: string;
    assignedAgent?: string;
    progress: number;
    error?: string;
    createdAt: number;
    completedAt?: number;
}
export declare class PersistenceManager {
    private db;
    private dbPath;
    constructor(dataDir?: string);
    initialize(): Promise<void>;
    private createTables;
    saveAgent(agent: PersistedAgent): Promise<void>;
    getAgent(id: string): Promise<PersistedAgent | null>;
    getActiveAgents(): Promise<PersistedAgent[]>;
    updateAgentStatus(id: string, status: string): Promise<void>;
    saveTask(task: PersistedTask): Promise<void>;
    getTask(id: string): Promise<PersistedTask | null>;
    getActiveTasks(): Promise<PersistedTask[]>;
    updateTaskStatus(id: string, status: string, assignedAgent?: string): Promise<void>;
    updateTaskProgress(id: string, progress: number): Promise<void>;
    getStats(): Promise<{
        totalAgents: number;
        activeAgents: number;
        totalTasks: number;
        pendingTasks: number;
        completedTasks: number;
    }>;
    close(): void;
}
//# sourceMappingURL=persistence.d.ts.map