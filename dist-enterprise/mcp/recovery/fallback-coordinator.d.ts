/**
 * Fallback Coordinator for MCP
 * Manages graceful degradation to CLI when MCP connection fails
 */
import { EventEmitter } from 'node:events';
import type { ILogger } from '../../core/logger.js';
export interface FallbackOperation {
    id: string;
    type: 'tool' | 'resource' | 'notification';
    method: string;
    params: unknown;
    timestamp: Date;
    priority: 'high' | 'medium' | 'low';
    retryable: boolean;
}
export interface FallbackConfig {
    enableFallback: boolean;
    maxQueueSize: number;
    queueTimeout: number;
    cliPath: string;
    fallbackNotificationInterval: number;
}
export interface FallbackState {
    isFallbackActive: boolean;
    queuedOperations: number;
    failedOperations: number;
    successfulOperations: number;
    lastFallbackActivation?: Date;
}
export declare class FallbackCoordinator extends EventEmitter {
    private logger;
    private operationQueue;
    private state;
    private notificationTimer?;
    private processingQueue;
    private readonly defaultConfig;
    constructor(logger: ILogger, config?: Partial<FallbackConfig>);
    private config;
    /**
     * Check if MCP is available
     */
    isMCPAvailable(): Promise<boolean>;
    /**
     * Enable CLI fallback mode
     */
    enableCLIFallback(): void;
    /**
     * Disable CLI fallback mode
     */
    disableCLIFallback(): void;
    /**
     * Queue an operation for later execution
     */
    queueOperation(operation: Omit<FallbackOperation, 'id' | 'timestamp'>): void;
    /**
     * Process all queued operations
     */
    processQueue(): Promise<void>;
    /**
     * Get current fallback state
     */
    getState(): FallbackState;
    /**
     * Get queued operations
     */
    getQueuedOperations(): FallbackOperation[];
    /**
     * Clear operation queue
     */
    clearQueue(): void;
    private executeViaCliFallback;
    private replayOperation;
    private mapOperationToCli;
    private isOperationExpired;
    private generateOperationId;
    private startNotificationTimer;
    private stopNotificationTimer;
}
//# sourceMappingURL=fallback-coordinator.d.ts.map