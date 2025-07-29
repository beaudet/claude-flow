/**
 * Recovery Manager for MCP
 * Orchestrates all recovery components for comprehensive connection stability
 */
import { EventEmitter } from 'node:events';
import type { ILogger } from '../../core/logger.js';
import type { MCPClient } from '../client.js';
import { HealthStatus } from './connection-health-monitor.js';
import type { MCPConfig, MCPRequest } from '../../utils/types.js';
export interface RecoveryConfig {
    enableRecovery: boolean;
    healthMonitor?: {
        heartbeatInterval?: number;
        heartbeatTimeout?: number;
        maxMissedHeartbeats?: number;
    };
    reconnection?: {
        maxRetries?: number;
        initialDelay?: number;
        maxDelay?: number;
        backoffMultiplier?: number;
    };
    fallback?: {
        enableFallback?: boolean;
        maxQueueSize?: number;
        cliPath?: string;
    };
    state?: {
        enablePersistence?: boolean;
        stateDirectory?: string;
    };
}
export interface RecoveryStatus {
    isRecoveryActive: boolean;
    connectionHealth: HealthStatus;
    reconnectionState: {
        attempts: number;
        isReconnecting: boolean;
        nextDelay?: number;
    };
    fallbackState: {
        isFallbackActive: boolean;
        queuedOperations: number;
    };
    metrics: {
        totalRecoveries: number;
        successfulRecoveries: number;
        failedRecoveries: number;
        averageRecoveryTime: number;
    };
}
export declare class RecoveryManager extends EventEmitter {
    private client;
    private mcpConfig;
    private logger;
    private healthMonitor;
    private reconnectionManager;
    private fallbackCoordinator;
    private stateManager;
    private isRecoveryActive;
    private recoveryStartTime?;
    private metrics;
    constructor(client: MCPClient, mcpConfig: MCPConfig, logger: ILogger, config?: RecoveryConfig);
    /**
     * Start recovery management
     */
    start(): Promise<void>;
    /**
     * Stop recovery management
     */
    stop(): Promise<void>;
    /**
     * Get current recovery status
     */
    getStatus(): RecoveryStatus;
    /**
     * Force a recovery attempt
     */
    forceRecovery(): Promise<boolean>;
    /**
     * Handle a request that needs recovery consideration
     */
    handleRequest(request: MCPRequest): Promise<void>;
    private setupEventHandlers;
    private startRecovery;
    private completeRecovery;
    private generateSessionId;
    /**
     * Clean up resources
     */
    cleanup(): Promise<void>;
}
//# sourceMappingURL=recovery-manager.d.ts.map