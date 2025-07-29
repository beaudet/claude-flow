/**
 * JSON-based persistence layer for Claude-Flow
 */
export interface PersistedAgent {
    id: string;
    type: string;
    name: string;
    status: string;
    capabilities: string[];
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
    dependencies: string[];
    metadata: Record<string, unknown>;
    assignedAgent?: string;
    progress: number;
    error?: string;
    createdAt: number;
    completedAt?: number;
}
export declare class JsonPersistenceManager {
    private dataPath;
    private data;
    constructor(dataDir?: string);
    initialize(): Promise<void>;
    private save;
    saveAgent(agent: PersistedAgent): Promise<void>;
    getAgent(id: string): Promise<PersistedAgent | null>;
    getActiveAgents(): Promise<PersistedAgent[]>;
    getAllAgents(): Promise<PersistedAgent[]>;
    updateAgentStatus(id: string, status: string): Promise<void>;
    saveTask(task: PersistedTask): Promise<void>;
    getTask(id: string): Promise<PersistedTask | null>;
    getActiveTasks(): Promise<PersistedTask[]>;
    getAllTasks(): Promise<PersistedTask[]>;
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
//# sourceMappingURL=json-persistence.d.ts.map