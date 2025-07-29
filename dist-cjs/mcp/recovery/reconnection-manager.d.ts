/**
 * Reconnection Manager for MCP
 * Handles automatic reconnection with exponential backoff
 */
import { EventEmitter } from 'node:events';
import type { ILogger } from '../../core/logger.js';
import type { MCPClient } from '../client.js';
export interface ReconnectionConfig {
    maxRetries: number;
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
    jitterFactor: number;
    resetAfterSuccess: boolean;
}
export interface ReconnectionState {
    attempts: number;
    nextDelay: number;
    isReconnecting: boolean;
    lastAttempt?: Date;
    lastError?: Error;
}
export declare class ReconnectionManager extends EventEmitter {
    private client;
    private logger;
    private state;
    private reconnectTimer?;
    private reconnectPromise?;
    private readonly defaultConfig;
    constructor(client: MCPClient, logger: ILogger, config?: Partial<ReconnectionConfig>);
    private config;
    /**
     * Attempt to reconnect
     */
    attemptReconnection(): Promise<boolean>;
    /**
     * Start automatic reconnection
     */
    startAutoReconnect(): void;
    /**
     * Stop reconnection attempts
     */
    stopReconnection(): void;
    /**
     * Reset reconnection state
     */
    reset(): void;
    /**
     * Get current reconnection state
     */
    getState(): ReconnectionState;
    /**
     * Calculate next retry delay
     */
    getNextDelay(): number;
    private performReconnection;
    private scheduleReconnect;
    private calculateNextDelay;
    private addJitter;
    /**
     * Force immediate reconnection attempt
     */
    forceReconnect(): Promise<boolean>;
    /**
     * Get estimated time until next reconnection attempt
     */
    getTimeUntilNextAttempt(): number | null;
}
//# sourceMappingURL=reconnection-manager.d.ts.map