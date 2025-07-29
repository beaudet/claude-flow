/**
 * Claude API client for Claude-Flow
 * Provides direct integration with Claude's API including temperature and model selection
 */
import { EventEmitter } from 'events';
import { ILogger } from '../core/logger.js';
import { ConfigManager } from '../config/config-manager.js';
import { HealthCheckResult } from './claude-api-errors.js';
export interface ClaudeAPIConfig {
    apiKey: string;
    apiUrl?: string;
    model?: ClaudeModel;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    systemPrompt?: string;
    timeout?: number;
    retryAttempts?: number;
    retryDelay?: number;
    enableHealthCheck?: boolean;
    healthCheckInterval?: number;
    circuitBreakerThreshold?: number;
    circuitBreakerTimeout?: number;
    circuitBreakerResetTimeout?: number;
    retryJitter?: boolean;
}
export type ClaudeModel = 'claude-3-opus-20240229' | 'claude-3-sonnet-20240229' | 'claude-3-haiku-20240307' | 'claude-2.1' | 'claude-2.0' | 'claude-instant-1.2';
export interface ClaudeMessage {
    role: 'user' | 'assistant';
    content: string;
}
export interface ClaudeRequest {
    model: ClaudeModel;
    messages: ClaudeMessage[];
    system?: string;
    max_tokens: number;
    temperature?: number;
    top_p?: number;
    top_k?: number;
    metadata?: {
        user_id?: string;
    };
    stop_sequences?: string[];
    stream?: boolean;
}
export interface ClaudeResponse {
    id: string;
    type: 'message';
    role: 'assistant';
    content: Array<{
        type: 'text';
        text: string;
    }>;
    model: ClaudeModel;
    stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence';
    stop_sequence?: string;
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
}
export interface ClaudeStreamEvent {
    type: 'message_start' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_delta' | 'message_stop' | 'ping' | 'error';
    message?: Partial<ClaudeResponse>;
    index?: number;
    delta?: {
        type?: 'text_delta';
        text?: string;
        stop_reason?: string;
        stop_sequence?: string;
    };
    content_block?: {
        type: 'text';
        text: string;
    };
    usage?: {
        output_tokens: number;
    };
    error?: {
        type: string;
        message: string;
    };
}
export declare class ClaudeAPIClient extends EventEmitter {
    private config;
    private logger;
    private configManager;
    private defaultModel;
    private defaultTemperature;
    private defaultMaxTokens;
    private circuitBreaker;
    private lastHealthCheck?;
    private healthCheckTimer?;
    constructor(logger: ILogger, configManager: ConfigManager, config?: Partial<ClaudeAPIConfig>);
    /**
     * Load configuration from various sources
     */
    private loadConfiguration;
    /**
     * Validate configuration settings
     */
    private validateConfiguration;
    /**
     * Update configuration dynamically
     */
    updateConfig(updates: Partial<ClaudeAPIConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): ClaudeAPIConfig;
    /**
     * Send a message to Claude API
     */
    sendMessage(messages: ClaudeMessage[], options?: {
        model?: ClaudeModel;
        temperature?: number;
        maxTokens?: number;
        systemPrompt?: string;
        stream?: boolean;
    }): Promise<ClaudeResponse | AsyncIterable<ClaudeStreamEvent>>;
    /**
     * Send a non-streaming request
     */
    private sendRequest;
    /**
     * Send a streaming request
     */
    private streamRequest;
    /**
     * Helper method for simple completions
     */
    complete(prompt: string, options?: {
        model?: ClaudeModel;
        temperature?: number;
        maxTokens?: number;
        systemPrompt?: string;
    }): Promise<string>;
    /**
     * Helper method for streaming completions
     */
    streamComplete(prompt: string, options?: {
        model?: ClaudeModel;
        temperature?: number;
        maxTokens?: number;
        systemPrompt?: string;
    }): AsyncIterable<string>;
    /**
     * Get available models
     */
    getAvailableModels(): ClaudeModel[];
    /**
     * Get model information
     */
    getModelInfo(model: ClaudeModel): {
        name: string;
        contextWindow: number;
        description: string;
    };
    /**
     * Delay helper for retries
     */
    private delay;
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
     * Clean up resources
     */
    destroy(): void;
}
//# sourceMappingURL=claude-client.d.ts.map