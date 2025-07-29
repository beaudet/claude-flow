/**
 * Enhanced Claude API client with comprehensive error handling
 * Implements exponential backoff, health checks, and improved error messages
 */
import { EventEmitter } from 'events';
import { ILogger } from '../core/logger.js';
import { ConfigManager } from '../config/config-manager.js';
import { HealthCheckResult } from './claude-api-errors.js';
import { ClaudeAPIConfig, ClaudeModel, ClaudeMessage, ClaudeResponse, ClaudeStreamEvent } from './claude-client.js';
export interface EnhancedClaudeAPIConfig extends ClaudeAPIConfig {
    enableHealthCheck?: boolean;
    healthCheckInterval?: number;
    circuitBreakerThreshold?: number;
    circuitBreakerTimeout?: number;
    circuitBreakerResetTimeout?: number;
    maxRetries?: number;
    retryBaseDelay?: number;
    retryMaxDelay?: number;
    retryJitter?: boolean;
}
export declare class EnhancedClaudeAPIClient extends EventEmitter {
    private config;
    private logger;
    private configManager;
    private circuitBreaker;
    private lastHealthCheck?;
    private healthCheckTimer?;
    constructor(logger: ILogger, configManager: ConfigManager, config?: Partial<EnhancedClaudeAPIConfig>);
    /**
     * Load configuration with enhanced defaults
     */
    private loadConfiguration;
    /**
     * Validate configuration
     */
    private validateConfiguration;
    /**
     * Start periodic health checks
     */
    private startHealthCheck;
    /**
     * Perform a health check on the API
     */
    performHealthCheck(): Promise<HealthCheckResult>;
    /**
     * Get last health check result
     */
    getHealthStatus(): HealthCheckResult | undefined;
    /**
     * Send a message with enhanced error handling
     */
    sendMessage(messages: ClaudeMessage[], options?: {
        model?: ClaudeModel;
        temperature?: number;
        maxTokens?: number;
        systemPrompt?: string;
        stream?: boolean;
    }): Promise<ClaudeResponse | AsyncIterable<ClaudeStreamEvent>>;
    /**
     * Send request with retry logic and enhanced error handling
     */
    private sendRequestWithRetry;
    /**
     * Send a single request
     */
    private sendRequestOnce;
    /**
     * Stream request with retry logic
     */
    private streamRequestWithRetry;
    /**
     * Send a single streaming request
     */
    private streamRequestOnce;
    /**
     * Create appropriate error based on status code
     */
    private createAPIError;
    /**
     * Transform generic errors to Claude API errors
     */
    private transformError;
    /**
     * Calculate retry delay with exponential backoff and jitter
     */
    private calculateRetryDelay;
    /**
     * Handle errors with user-friendly messages and logging
     */
    private handleError;
    /**
     * Helper method for simple completions with error handling
     */
    complete(prompt: string, options?: {
        model?: ClaudeModel;
        temperature?: number;
        maxTokens?: number;
        systemPrompt?: string;
    }): Promise<string>;
    /**
     * Delay helper
     */
    private delay;
    /**
     * Clean up resources
     */
    destroy(): void;
}
//# sourceMappingURL=claude-client-enhanced.d.ts.map