/**
 * MCP Server Lifecycle Manager
 * Handles server lifecycle operations including start, stop, restart, and health checks
 */
import { EventEmitter } from 'node:events';
import type { ILogger } from '../core/logger.js';
import type { MCPConfig, MCPSession, MCPMetrics } from '../utils/types.js';
import type { IMCPServer } from './server.js';
export declare enum LifecycleState {
    STOPPED = "stopped",
    STARTING = "starting",
    RUNNING = "running",
    STOPPING = "stopping",
    RESTARTING = "restarting",
    ERROR = "error"
}
export interface LifecycleEvent {
    timestamp: Date;
    state: LifecycleState;
    previousState?: LifecycleState;
    error?: Error;
    details?: Record<string, unknown>;
}
export interface HealthCheckResult {
    healthy: boolean;
    state: LifecycleState;
    uptime: number;
    lastRestart?: Date;
    error?: string;
    metrics?: Record<string, number>;
    components: {
        server: boolean;
        transport: boolean;
        sessions: boolean;
        tools: boolean;
        auth: boolean;
        loadBalancer: boolean;
    };
}
export interface LifecycleManagerConfig {
    healthCheckInterval: number;
    gracefulShutdownTimeout: number;
    maxRestartAttempts: number;
    restartDelay: number;
    enableAutoRestart: boolean;
    enableHealthChecks: boolean;
}
/**
 * MCP Server Lifecycle Manager
 * Manages the complete lifecycle of MCP servers with robust error handling
 */
export declare class MCPLifecycleManager extends EventEmitter {
    private mcpConfig;
    private logger;
    private serverFactory;
    private state;
    private server?;
    private healthCheckTimer?;
    private startTime?;
    private lastRestart?;
    private restartAttempts;
    private shutdownPromise?;
    private history;
    private readonly config;
    constructor(mcpConfig: MCPConfig, logger: ILogger, serverFactory: () => IMCPServer, config?: Partial<LifecycleManagerConfig>);
    /**
     * Start the MCP server
     */
    start(): Promise<void>;
    /**
     * Stop the MCP server gracefully
     */
    stop(): Promise<void>;
    /**
     * Restart the MCP server
     */
    restart(): Promise<void>;
    /**
     * Perform comprehensive health check
     */
    healthCheck(): Promise<HealthCheckResult>;
    /**
     * Get current server state
     */
    getState(): LifecycleState;
    /**
     * Get server metrics
     */
    getMetrics(): MCPMetrics | undefined;
    /**
     * Get active sessions
     */
    getSessions(): MCPSession[];
    /**
     * Get server uptime in milliseconds
     */
    getUptime(): number;
    /**
     * Get lifecycle event history
     */
    getHistory(): LifecycleEvent[];
    /**
     * Force terminate server (emergency stop)
     */
    forceStop(): Promise<void>;
    /**
     * Enable or disable auto-restart
     */
    setAutoRestart(enabled: boolean): void;
    /**
     * Enable or disable health checks
     */
    setHealthChecks(enabled: boolean): void;
    private setState;
    private setupEventHandlers;
    private handleServerError;
    private startHealthChecks;
    private stopHealthChecks;
    private performShutdown;
}
//# sourceMappingURL=lifecycle-manager.d.ts.map