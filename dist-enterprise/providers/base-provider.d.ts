/**
 * Abstract Base Provider for LLM integrations
 * Provides common functionality for all LLM providers
 */
import { EventEmitter } from 'events';
import { ILogger } from '../core/logger.js';
import { CircuitBreaker } from '../utils/helpers.js';
import { ILLMProvider, LLMProvider, LLMProviderConfig, LLMRequest, LLMResponse, LLMStreamEvent, LLMModel, ModelInfo, ProviderCapabilities, HealthCheckResult, ProviderStatus, CostEstimate, UsageStats, UsagePeriod, LLMProviderError } from './types.js';
export interface BaseProviderOptions {
    logger: ILogger;
    config: LLMProviderConfig;
    cacheTTL?: number;
    circuitBreakerOptions?: {
        threshold?: number;
        timeout?: number;
        resetTimeout?: number;
    };
}
export declare abstract class BaseProvider extends EventEmitter implements ILLMProvider {
    abstract readonly name: LLMProvider;
    abstract readonly capabilities: ProviderCapabilities;
    protected logger: ILogger;
    protected circuitBreaker: CircuitBreaker;
    protected healthCheckInterval?: NodeJS.Timeout;
    protected lastHealthCheck?: HealthCheckResult;
    protected requestCount: number;
    protected errorCount: number;
    protected totalTokens: number;
    protected totalCost: number;
    protected requestMetrics: Map<string, any>;
    config: LLMProviderConfig;
    constructor(options: BaseProviderOptions);
    /**
     * Initialize the provider
     */
    initialize(): Promise<void>;
    /**
     * Provider-specific initialization
     */
    protected abstract doInitialize(): Promise<void>;
    /**
     * Validate provider configuration
     */
    protected validateConfig(): void;
    /**
     * Complete a request
     */
    complete(request: LLMRequest): Promise<LLMResponse>;
    /**
     * Provider-specific completion implementation
     */
    protected abstract doComplete(request: LLMRequest): Promise<LLMResponse>;
    /**
     * Stream complete a request
     */
    streamComplete(request: LLMRequest): AsyncIterable<LLMStreamEvent>;
    /**
     * Provider-specific stream completion implementation
     */
    protected abstract doStreamComplete(request: LLMRequest): AsyncIterable<LLMStreamEvent>;
    /**
     * List available models
     */
    abstract listModels(): Promise<LLMModel[]>;
    /**
     * Get model information
     */
    abstract getModelInfo(model: LLMModel): Promise<ModelInfo>;
    /**
     * Validate if a model is supported
     */
    validateModel(model: LLMModel): boolean;
    /**
     * Perform health check
     */
    healthCheck(): Promise<HealthCheckResult>;
    /**
     * Provider-specific health check implementation
     */
    protected abstract doHealthCheck(): Promise<HealthCheckResult>;
    /**
     * Get provider status
     */
    getStatus(): ProviderStatus;
    /**
     * Get remaining rate limit (override in provider)
     */
    protected getRateLimitRemaining(): number | undefined;
    /**
     * Get rate limit reset time (override in provider)
     */
    protected getRateLimitReset(): Date | undefined;
    /**
     * Estimate cost for a request
     */
    estimateCost(request: LLMRequest): Promise<CostEstimate>;
    /**
     * Simple token estimation (4 chars = 1 token approximation)
     */
    protected estimateTokens(text: string): number;
    /**
     * Get usage statistics
     */
    getUsageStats(): Record<LLMModel, {
        requests: number;
        tokens: number;
        cost: number;
    }>;
    getUsage(period?: UsagePeriod): Promise<UsageStats>;
    /**
     * Get start date for period
     */
    private getStartDate;
    /**
     * Calculate average latency
     */
    private calculateAverageLatency;
    /**
     * Track successful request
     */
    protected trackRequest(request: LLMRequest, response: LLMResponse, latency: number): void;
    /**
     * Track streaming request
     */
    protected trackStreamRequest(request: LLMRequest, totalTokens: number, totalCost: number, latency: number): void;
    /**
     * Transform errors to provider errors
     */
    protected transformError(error: unknown): LLMProviderError;
    /**
     * Start periodic health checks
     */
    protected startHealthChecks(): void;
    /**
     * Clean up resources
     */
    destroy(): void;
}
//# sourceMappingURL=base-provider.d.ts.map