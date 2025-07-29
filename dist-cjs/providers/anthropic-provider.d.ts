/**
 * Anthropic (Claude) Provider Implementation
 * Extends the existing Claude client with unified provider interface
 */
import { BaseProvider } from './base-provider.js';
import { LLMProvider, LLMModel, LLMRequest, LLMResponse, LLMStreamEvent, ModelInfo, ProviderCapabilities, HealthCheckResult, MaxProQuotaInfo, MaxProOptimization } from './types.js';
export declare class AnthropicProvider extends BaseProvider {
    readonly name: LLMProvider;
    private maxProQuota;
    readonly capabilities: ProviderCapabilities;
    private claudeClient;
    protected doInitialize(): Promise<void>;
    protected doComplete(request: LLMRequest): Promise<LLMResponse>;
    protected doStreamComplete(request: LLMRequest): AsyncIterable<LLMStreamEvent>;
    listModels(): Promise<LLMModel[]>;
    getModelInfo(model: LLMModel): Promise<ModelInfo>;
    protected doHealthCheck(): Promise<HealthCheckResult>;
    /**
     * Map unified model to Anthropic model
     */
    private mapToAnthropicModel;
    /**
     * Map Anthropic model to unified model
     */
    private mapFromAnthropicModel;
    /**
     * Max Pro plan quota management
     */
    setMaxProQuota(quota: MaxProQuotaInfo): void;
    getMaxProQuota(): MaxProQuotaInfo | null;
    /**
     * Intelligent model selection for Max Pro plan optimization
     */
    selectOptimalModel(request: LLMRequest): Promise<MaxProOptimization>;
    /**
     * Classify task complexity based on request characteristics
     */
    private classifyTaskComplexity;
    /**
     * Determine if task is strategic (worth using Opus quota)
     */
    private isStrategicTask;
    /**
     * Update quota usage after request
     */
    updateQuotaUsage(model: LLMModel): void;
    /**
     * Reset quota cycle (called every 5 hours)
     */
    private resetQuotaCycle;
    destroy(): void;
}
//# sourceMappingURL=anthropic-provider.d.ts.map