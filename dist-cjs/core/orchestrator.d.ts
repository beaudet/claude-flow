/**
 * Main orchestrator for Claude-Flow
 */
import { Config, AgentProfile, AgentSession, Task, HealthStatus, OrchestratorMetrics } from '../utils/types.js';
import { IEventBus } from './event-bus.js';
import type { ILogger } from './logger.js';
import type { ITerminalManager } from '../terminal/manager.js';
import type { IMemoryManager } from '../memory/manager.js';
import type { ICoordinationManager } from '../coordination/manager.js';
import type { IMCPServer } from '../mcp/server.js';
import { ClaudeAPIClient } from '../api/claude-client.js';
export interface ISessionManager {
    createSession(profile: AgentProfile): Promise<AgentSession>;
    getSession(sessionId: string): AgentSession | undefined;
    getActiveSessions(): AgentSession[];
    terminateSession(sessionId: string): Promise<void>;
    terminateAllSessions(): Promise<void>;
    persistSessions(): Promise<void>;
    restoreSessions(): Promise<void>;
    removeSession(sessionId: string): void;
}
export interface IOrchestrator {
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    spawnAgent(profile: AgentProfile): Promise<string>;
    terminateAgent(agentId: string): Promise<void>;
    assignTask(task: Task): Promise<void>;
    getHealthStatus(): Promise<HealthStatus>;
    getMetrics(): Promise<OrchestratorMetrics>;
    performMaintenance(): Promise<void>;
}
export interface SessionPersistence {
    sessions: Array<AgentSession & {
        profile: AgentProfile;
    }>;
    taskQueue: Task[];
    metrics: {
        completedTasks: number;
        failedTasks: number;
        totalTaskDuration: number;
    };
    savedAt: Date;
}
/**
 * Main orchestrator implementation with enhanced features
 */
export declare class Orchestrator implements IOrchestrator {
    private config;
    private terminalManager;
    private memoryManager;
    private coordinationManager;
    private mcpServer;
    private eventBus;
    private logger;
    private initialized;
    private shutdownInProgress;
    private sessionManager;
    private healthCheckInterval?;
    private maintenanceInterval?;
    private metricsInterval?;
    private agents;
    private taskQueue;
    private taskHistory;
    private startTime;
    private claudeClient?;
    private configManager;
    private metrics;
    private healthCheckCircuitBreaker;
    private taskAssignmentCircuitBreaker;
    constructor(config: Config, terminalManager: ITerminalManager, memoryManager: IMemoryManager, coordinationManager: ICoordinationManager, mcpServer: IMCPServer, eventBus: IEventBus, logger: ILogger);
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    spawnAgent(profile: AgentProfile): Promise<string>;
    terminateAgent(agentId: string): Promise<void>;
    assignTask(task: Task): Promise<void>;
    getHealthStatus(): Promise<HealthStatus>;
    getMetrics(): Promise<OrchestratorMetrics>;
    performMaintenance(): Promise<void>;
    private setupEventHandlers;
    private startHealthChecks;
    private startMaintenanceTasks;
    private startMetricsCollection;
    private stopBackgroundTasks;
    private shutdownComponents;
    private emergencyShutdown;
    private processTaskQueue;
    private getAvailableAgents;
    private selectAgentForTask;
    private getComponentHealth;
    private processHealthResult;
    private initializeComponent;
    private shutdownComponent;
    private validateAgentProfile;
    private validateTask;
    private handleAgentError;
    private handleTaskFailure;
    private handleSystemError;
    private resolveDeadlock;
    private cancelAgentTasks;
    private startAgentHealthMonitoring;
    private recoverUnhealthyComponents;
    private cleanupTerminatedSessions;
    private cleanupTaskHistory;
    private processShutdownTasks;
    /**
     * Get Claude API client instance
     */
    getClaudeClient(): ClaudeAPIClient | undefined;
    /**
     * Update Claude API configuration dynamically
     */
    updateClaudeConfig(config: any): void;
    /**
     * Execute a Claude API request
     */
    executeClaudeRequest(prompt: string, options?: {
        model?: string;
        temperature?: number;
        maxTokens?: number;
        systemPrompt?: string;
    }): Promise<string | null>;
}
//# sourceMappingURL=orchestrator.d.ts.map