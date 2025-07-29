/**
 * Multi-LLM Provider Types and Interfaces
 * Unified type system for all LLM providers
 */
import { EventEmitter } from 'events';
export type LLMProvider = 'openai' | 'anthropic' | 'google' | 'cohere' | 'ollama' | 'llama-cpp' | 'custom';
export type LLMModel = 'gpt-4-turbo-preview' | 'gpt-4' | 'gpt-4-32k' | 'gpt-3.5-turbo' | 'gpt-3.5-turbo-16k' | 'claude-opus-4-20250514' | 'claude-sonnet-4-20250514' | 'claude-3-opus-20240229' | 'claude-3-sonnet-20240229' | 'claude-3-haiku-20240307' | 'claude-2.1' | 'claude-2.0' | 'claude-instant-1.2' | 'gemini-pro' | 'gemini-pro-vision' | 'palm-2' | 'bison' | 'command' | 'command-light' | 'command-nightly' | 'generate-xlarge' | 'generate-medium' | 'llama-2-7b' | 'llama-2-13b' | 'llama-2-70b' | 'mistral-7b' | 'mixtral-8x7b' | 'custom-model';
export interface LLMProviderConfig {
    provider: LLMProvider;
    apiKey?: string;
    apiUrl?: string;
    model: LLMModel;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    stopSequences?: string[];
    providerOptions?: Record<string, any>;
    timeout?: number;
    retryAttempts?: number;
    retryDelay?: number;
    enableStreaming?: boolean;
    enableCaching?: boolean;
    cacheTimeout?: number;
    enableCostOptimization?: boolean;
    maxCostPerRequest?: number;
    fallbackModels?: LLMModel[];
}
export interface LLMMessage {
    role: 'system' | 'user' | 'assistant' | 'function';
    content: string;
    name?: string;
    functionCall?: {
        name: string;
        arguments: string;
    };
}
export interface LLMRequest {
    messages: LLMMessage[];
    model?: LLMModel;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    stopSequences?: string[];
    stream?: boolean;
    functions?: LLMFunction[];
    functionCall?: 'auto' | 'none' | {
        name: string;
    };
    providerOptions?: {
        preferredProvider?: LLMProvider;
        fallbackProviders?: LLMProvider[];
        useExtendedThinking?: boolean;
        useHybridReasoning?: boolean;
        [key: string]: any;
    };
    costConstraints?: {
        maxCost?: number;
        preferredModels?: LLMModel[];
    };
    quotaConstraints?: {
        maxProPlan?: MaxProQuotaInfo;
    };
}
export interface LLMFunction {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
    };
}
export interface LLMResponse {
    id: string;
    model: LLMModel;
    provider: LLMProvider;
    content: string;
    functionCall?: {
        name: string;
        arguments: string;
    };
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    cost?: {
        promptCost: number;
        completionCost: number;
        totalCost: number;
        currency: string;
    };
    latency?: number;
    finishReason?: 'stop' | 'length' | 'function_call' | 'content_filter';
    metadata?: Record<string, any>;
}
export interface LLMStreamEvent {
    type: 'content' | 'function_call' | 'error' | 'done';
    delta?: {
        content?: string;
        functionCall?: {
            name?: string;
            arguments?: string;
        };
    };
    error?: Error;
    usage?: LLMResponse['usage'];
    cost?: LLMResponse['cost'];
}
export interface ProviderCapabilities {
    supportedModels: LLMModel[];
    maxContextLength: Record<LLMModel, number>;
    maxOutputTokens: Record<LLMModel, number>;
    supportsStreaming: boolean;
    supportsFunctionCalling: boolean;
    supportsSystemMessages: boolean;
    supportsVision: boolean;
    supportsAudio: boolean;
    supportsTools: boolean;
    supportsFineTuning: boolean;
    supportsEmbeddings: boolean;
    supportsLogprobs: boolean;
    supportsBatching: boolean;
    supportsHybridReasoning?: boolean;
    supportsExtendedThinking?: boolean;
    supportsEnhancedTools?: boolean;
    rateLimit?: {
        requestsPerMinute: number;
        tokensPerMinute: number;
        concurrentRequests: number;
    };
    pricing?: {
        [model: string]: {
            promptCostPer1k: number;
            completionCostPer1k: number;
            currency: string;
        };
    };
}
export declare class LLMProviderError extends Error {
    code: string;
    provider: LLMProvider;
    statusCode?: number | undefined;
    retryable: boolean;
    details?: any | undefined;
    constructor(message: string, code: string, provider: LLMProvider, statusCode?: number | undefined, retryable?: boolean, details?: any | undefined);
}
export declare class RateLimitError extends LLMProviderError {
    retryAfter?: number | undefined;
    constructor(message: string, provider: LLMProvider, retryAfter?: number | undefined, details?: any);
}
export declare class AuthenticationError extends LLMProviderError {
    constructor(message: string, provider: LLMProvider, details?: any);
}
export declare class ModelNotFoundError extends LLMProviderError {
    constructor(model: string, provider: LLMProvider, details?: any);
}
export declare class ProviderUnavailableError extends LLMProviderError {
    constructor(provider: LLMProvider, details?: any);
}
export interface ILLMProvider extends EventEmitter {
    readonly name: LLMProvider;
    readonly capabilities: ProviderCapabilities;
    config: LLMProviderConfig;
    initialize(): Promise<void>;
    complete(request: LLMRequest): Promise<LLMResponse>;
    streamComplete(request: LLMRequest): AsyncIterable<LLMStreamEvent>;
    listModels(): Promise<LLMModel[]>;
    getModelInfo(model: LLMModel): Promise<ModelInfo>;
    validateModel(model: LLMModel): boolean;
    healthCheck(): Promise<HealthCheckResult>;
    getStatus(): ProviderStatus;
    estimateCost(request: LLMRequest): Promise<CostEstimate>;
    getUsage(period?: UsagePeriod): Promise<UsageStats>;
    destroy(): void;
}
export interface ModelInfo {
    model: LLMModel;
    name: string;
    description: string;
    contextLength: number;
    maxOutputTokens: number;
    supportedFeatures: string[];
    pricing?: {
        promptCostPer1k: number;
        completionCostPer1k: number;
        currency: string;
    };
    deprecated?: boolean;
    deprecationDate?: Date;
    recommendedReplacement?: LLMModel;
}
export interface HealthCheckResult {
    healthy: boolean;
    latency?: number;
    error?: string;
    timestamp: Date;
    details?: Record<string, any>;
}
export interface ProviderStatus {
    available: boolean;
    currentLoad: number;
    queueLength: number;
    activeRequests: number;
    rateLimitRemaining?: number;
    rateLimitReset?: Date;
}
export interface CostEstimate {
    estimatedPromptTokens: number;
    estimatedCompletionTokens: number;
    estimatedTotalTokens: number;
    estimatedCost: {
        prompt: number;
        completion: number;
        total: number;
        currency: string;
    };
    confidence: number;
}
export interface UsageStats {
    period: {
        start: Date;
        end: Date;
    };
    requests: number;
    tokens: {
        prompt: number;
        completion: number;
        total: number;
    };
    cost: {
        prompt: number;
        completion: number;
        total: number;
        currency: string;
    };
    errors: number;
    averageLatency: number;
    modelBreakdown: Record<LLMModel, {
        requests: number;
        tokens: number;
        cost: number;
    }>;
}
export type UsagePeriod = 'hour' | 'day' | 'week' | 'month' | 'all';
export interface MaxProQuotaInfo {
    quotaReset: Date;
    opusQuotaUsed: number;
    sonnetQuotaUsed: number;
    opusQuotaLimit: number;
    sonnetQuotaLimit: number;
    totalQuotaLimit: number;
    currentCycleStart: Date;
}
export interface MaxProOptimization {
    recommendedModel: LLMModel;
    reasoning: string;
    quotaImpact: {
        opusRemaining: number;
        sonnetRemaining: number;
        nextResetIn: number;
    };
    fallbackOptions: LLMModel[];
}
export interface FallbackStrategy {
    name: string;
    enabled: boolean;
    rules: FallbackRule[];
    maxAttempts: number;
}
export interface FallbackRule {
    condition: 'error' | 'rate_limit' | 'timeout' | 'cost' | 'unavailable';
    errorCodes?: string[];
    fallbackProviders: LLMProvider[];
    fallbackModels?: LLMModel[];
    retryOriginal: boolean;
    retryDelay?: number;
}
export interface RetryStrategy {
    maxAttempts: number;
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
    jitter: boolean;
    retryableErrors: string[];
}
export interface CacheConfig {
    enabled: boolean;
    ttl: number;
    maxSize: number;
    strategy: 'lru' | 'lfu' | 'ttl';
    keyGenerator?: (request: LLMRequest) => string;
}
export interface CacheEntry {
    key: string;
    request: LLMRequest;
    response: LLMResponse;
    timestamp: Date;
    hits: number;
    size: number;
}
export interface RateLimiter {
    checkLimit(provider: LLMProvider, model?: LLMModel): Promise<boolean>;
    consumeToken(provider: LLMProvider, tokens: number): Promise<void>;
    getRemainingTokens(provider: LLMProvider): Promise<number>;
    getResetTime(provider: LLMProvider): Promise<Date | null>;
    waitForCapacity(provider: LLMProvider, tokens: number): Promise<void>;
}
export interface LoadBalancer {
    selectProvider(request: LLMRequest, availableProviders: ILLMProvider[]): Promise<ILLMProvider>;
    updateProviderMetrics(provider: LLMProvider, metrics: ProviderMetrics): void;
    rebalance(): Promise<void>;
}
export interface ProviderMetrics {
    provider: LLMProvider;
    timestamp: Date;
    latency: number;
    errorRate: number;
    successRate: number;
    load: number;
    cost: number;
    availability: number;
}
export interface ProviderMonitor {
    trackRequest(provider: LLMProvider, request: LLMRequest, response: LLMResponse | Error): void;
    getMetrics(provider?: LLMProvider, period?: UsagePeriod): Promise<ProviderMetrics[]>;
    getAlerts(): Alert[];
    setAlertThreshold(metric: string, threshold: number): void;
}
export interface Alert {
    id: string;
    timestamp: Date;
    provider: LLMProvider;
    type: 'error_rate' | 'latency' | 'cost' | 'rate_limit' | 'availability';
    severity: 'info' | 'warning' | 'error' | 'critical';
    message: string;
    value: number;
    threshold: number;
}
export interface CostOptimizer {
    selectOptimalModel(request: LLMRequest, constraints: CostConstraints): Promise<OptimizationResult>;
    analyzeCostTrends(period: UsagePeriod): Promise<CostAnalysis>;
    suggestOptimizations(): Promise<OptimizationSuggestion[]>;
}
export interface CostConstraints {
    maxCostPerRequest?: number;
    maxCostPerToken?: number;
    preferredProviders?: LLMProvider[];
    requiredFeatures?: string[];
    minQuality?: number;
}
export interface OptimizationResult {
    provider: LLMProvider;
    model: LLMModel;
    estimatedCost: number;
    estimatedQuality: number;
    reasoning: string;
}
export interface CostAnalysis {
    period: UsagePeriod;
    totalCost: number;
    costByProvider: Record<LLMProvider, number>;
    costByModel: Record<LLMModel, number>;
    trends: {
        dailyAverage: number;
        weeklyGrowth: number;
        projection30Days: number;
    };
}
export interface OptimizationSuggestion {
    type: 'model_switch' | 'provider_switch' | 'parameter_tuning' | 'caching' | 'batching';
    description: string;
    estimatedSavings: number;
    implementation: string;
    impact: 'low' | 'medium' | 'high';
}
export declare function isLLMResponse(obj: any): obj is LLMResponse;
export declare function isLLMStreamEvent(obj: any): obj is LLMStreamEvent;
export declare function isLLMProviderError(error: any): error is LLMProviderError;
export declare function isRateLimitError(error: any): error is RateLimitError;
//# sourceMappingURL=types.d.ts.map