/**
 * Fixed orchestrator implementation for Claude-Flow
 */
import type { EventBus } from './event-bus.js';
import type { Logger } from './logger.js';
import type { ConfigManager } from './config.js';
export interface AgentInfo {
    id: string;
    type: string;
    name: string;
    status: string;
    assignedTasks: string[];
    createdAt: number;
}
export interface TaskInfo {
    id: string;
    type: string;
    description: string;
    status: string;
    progress: number;
    assignedAgent?: string;
    error?: string;
}
export interface SessionInfo {
    id: string;
    type: string;
    agentId: string;
}
export interface WorkflowStatus {
    status: string;
    progress: number;
    error?: string;
}
export interface HealthCheckResult {
    healthy: boolean;
    memory: boolean;
    terminalPool: boolean;
    mcp: boolean;
}
export declare class Orchestrator {
    private config;
    private eventBus;
    private logger;
    private agents;
    private tasks;
    private sessions;
    private persistence;
    private workflows;
    private started;
    constructor(config: ConfigManager, eventBus: EventBus, logger: Logger);
    start(): Promise<void>;
    private loadFromPersistence;
    stop(): Promise<void>;
    spawnAgent(profile: {
        type: string;
        name: string;
        capabilities: string[];
        systemPrompt: string;
        maxConcurrentTasks: number;
        priority: number;
    }): Promise<string>;
    terminateAgent(agentId: string): Promise<void>;
    getActiveAgents(): AgentInfo[];
    getAgentInfo(agentId: string): AgentInfo | undefined;
    submitTask(task: {
        type: string;
        description: string;
        priority: number;
        dependencies: string[];
        metadata: Record<string, unknown>;
    }): Promise<string>;
    getTaskQueue(): TaskInfo[];
    getTaskStatus(taskId: string): TaskInfo | undefined;
    cancelTask(taskId: string): Promise<void>;
    getActiveSessions(): SessionInfo[];
    terminateSession(sessionId: string): Promise<void>;
    executeWorkflow(workflow: any): Promise<string>;
    getWorkflowStatus(workflowId: string): Promise<WorkflowStatus>;
    healthCheck(): Promise<HealthCheckResult>;
}
//# sourceMappingURL=orchestrator-fixed.d.ts.map