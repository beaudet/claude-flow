/**
 * Anthropic (Claude) Provider Implementation
 * Extends the existing Claude client with unified provider interface
 */

import { BaseProvider } from './base-provider.js';
import { ClaudeAPIClient, ClaudeModel as AnthropicModel } from '../api/claude-client.js';
import {
  LLMProvider,
  LLMModel,
  LLMRequest,
  LLMResponse,
  LLMStreamEvent,
  ModelInfo,
  ProviderCapabilities,
  HealthCheckResult,
  LLMProviderError,
  MaxProQuotaInfo,
  MaxProOptimization,
} from './types.js';

export class AnthropicProvider extends BaseProvider {
  readonly name: LLMProvider = 'anthropic';
  private maxProQuota: MaxProQuotaInfo | null = null;
  readonly capabilities: ProviderCapabilities = {
    supportedModels: [
      // Claude 4 models (Latest)
      'claude-opus-4-20250514',
      'claude-sonnet-4-20250514',
      // Claude 3 models (Legacy)
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
      'claude-2.1',
      'claude-2.0',
      'claude-instant-1.2',
    ],
    maxContextLength: {
      // Claude 4 models - Enhanced context
      'claude-opus-4-20250514': 200000,
      'claude-sonnet-4-20250514': 200000,
      // Claude 3 models
      'claude-3-opus-20240229': 200000,
      'claude-3-sonnet-20240229': 200000,
      'claude-3-haiku-20240307': 200000,
      'claude-2.1': 200000,
      'claude-2.0': 100000,
      'claude-instant-1.2': 100000,
    } as Record<LLMModel, number>,
    maxOutputTokens: {
      // Claude 4 models - Enhanced 8K output
      'claude-opus-4-20250514': 8192,
      'claude-sonnet-4-20250514': 8192,
      // Claude 3 models
      'claude-3-opus-20240229': 4096,
      'claude-3-sonnet-20240229': 4096,
      'claude-3-haiku-20240307': 4096,
      'claude-2.1': 4096,
      'claude-2.0': 4096,
      'claude-instant-1.2': 4096,
    } as Record<LLMModel, number>,
    supportsStreaming: true,
    supportsFunctionCalling: false, // Claude doesn't have native function calling yet
    supportsSystemMessages: true,
    supportsVision: true, // Claude 3+ models support vision
    supportsAudio: false,
    supportsTools: true, // Claude 4 enhanced tool support
    supportsHybridReasoning: true, // Claude 4 hybrid reasoning
    supportsExtendedThinking: true, // Claude 4 extended thinking
    supportsEnhancedTools: true, // Claude 4 enhanced tool capabilities
    supportsFineTuning: false,
    supportsEmbeddings: false,
    supportsLogprobs: false,
    supportsBatching: false,
    pricing: {
      // Claude 4 models - Current pricing (Max Pro plan compatible)
      'claude-opus-4-20250514': {
        promptCostPer1k: 0.015,
        completionCostPer1k: 0.075,
        currency: 'USD',
      },
      'claude-sonnet-4-20250514': {
        promptCostPer1k: 0.003,
        completionCostPer1k: 0.015,
        currency: 'USD',
      },
      // Claude 3 models (Legacy pricing)
      'claude-3-opus-20240229': {
        promptCostPer1k: 0.015,
        completionCostPer1k: 0.075,
        currency: 'USD',
      },
      'claude-3-sonnet-20240229': {
        promptCostPer1k: 0.003,
        completionCostPer1k: 0.015,
        currency: 'USD',
      },
      'claude-3-haiku-20240307': {
        promptCostPer1k: 0.00025,
        completionCostPer1k: 0.00125,
        currency: 'USD',
      },
      'claude-2.1': {
        promptCostPer1k: 0.008,
        completionCostPer1k: 0.024,
        currency: 'USD',
      },
      'claude-2.0': {
        promptCostPer1k: 0.008,
        completionCostPer1k: 0.024,
        currency: 'USD',
      },
      'claude-instant-1.2': {
        promptCostPer1k: 0.0008,
        completionCostPer1k: 0.0024,
        currency: 'USD',
      },
    },
  };

  private claudeClient!: ClaudeAPIClient;

  protected async doInitialize(): Promise<void> {
    // Create Claude client with our config
    this.claudeClient = new ClaudeAPIClient(
      this.logger,
      { get: () => this.config } as any, // Mock config manager
      {
        apiKey: this.config.apiKey!,
        model: this.mapToAnthropicModel(this.config.model),
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
        topP: this.config.topP,
        topK: this.config.topK,
        timeout: this.config.timeout,
        retryAttempts: this.config.retryAttempts,
        retryDelay: this.config.retryDelay,
      }
    );
  }

  protected async doComplete(request: LLMRequest): Promise<LLMResponse> {
    // Convert request to Claude format
    const claudeMessages = request.messages.map((msg) => ({
      role: msg.role === 'system' ? 'user' : msg.role as 'user' | 'assistant',
      content: msg.role === 'system' ? `System: ${msg.content}` : msg.content,
    }));

    // Extract system message if present
    const systemMessage = request.messages.find((m) => m.role === 'system');
    
    // Call Claude API
    const response = await this.claudeClient.sendMessage(claudeMessages, {
      model: request.model ? this.mapToAnthropicModel(request.model) : undefined,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      systemPrompt: systemMessage?.content,
      stream: false,
    }) as any; // ClaudeResponse type

    // Calculate cost
    const pricing = this.capabilities.pricing![response.model];
    const promptCost = (response.usage.input_tokens / 1000) * pricing.promptCostPer1k;
    const completionCost = (response.usage.output_tokens / 1000) * pricing.completionCostPer1k;

    // Convert to unified response format
    return {
      id: response.id,
      model: this.mapFromAnthropicModel(response.model),
      provider: 'anthropic',
      content: response.content[0].text,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      cost: {
        promptCost,
        completionCost,
        totalCost: promptCost + completionCost,
        currency: 'USD',
      },
      finishReason: response.stop_reason === 'end_turn' ? 'stop' : 'length',
    };
  }

  protected async *doStreamComplete(request: LLMRequest): AsyncIterable<LLMStreamEvent> {
    // Convert request to Claude format
    const claudeMessages = request.messages.map((msg) => ({
      role: msg.role === 'system' ? 'user' : msg.role as 'user' | 'assistant',
      content: msg.role === 'system' ? `System: ${msg.content}` : msg.content,
    }));

    const systemMessage = request.messages.find((m) => m.role === 'system');
    
    // Get stream from Claude API
    const stream = await this.claudeClient.sendMessage(claudeMessages, {
      model: request.model ? this.mapToAnthropicModel(request.model) : undefined,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      systemPrompt: systemMessage?.content,
      stream: true,
    }) as AsyncIterable<any>; // ClaudeStreamEvent type

    let accumulatedContent = '';
    let totalTokens = 0;

    // Process stream events
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        accumulatedContent += event.delta.text;
        yield {
          type: 'content',
          delta: {
            content: event.delta.text,
          },
        };
      } else if (event.type === 'message_delta' && event.usage) {
        totalTokens = event.usage.output_tokens;
      } else if (event.type === 'message_stop') {
        // Calculate final cost
        const model = request.model || this.config.model;
        const pricing = this.capabilities.pricing![model];
        
        // Estimate prompt tokens (rough approximation)
        const promptTokens = this.estimateTokens(JSON.stringify(request.messages));
        const completionTokens = totalTokens;
        
        const promptCost = (promptTokens / 1000) * pricing.promptCostPer1k;
        const completionCost = (completionTokens / 1000) * pricing.completionCostPer1k;

        yield {
          type: 'done',
          usage: {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          },
          cost: {
            promptCost,
            completionCost,
            totalCost: promptCost + completionCost,
            currency: 'USD',
          },
        };
      }
    }
  }

  override async listModels(): Promise<LLMModel[]> {
    return this.capabilities.supportedModels;
  }

  async getModelInfo(model: LLMModel): Promise<ModelInfo> {
    const anthropicModel = this.mapToAnthropicModel(model);
    const info = this.claudeClient.getModelInfo(anthropicModel);
    
    // Enhanced features for Claude 4 models
    const isClaudeV4 = model.includes('claude-opus-4') || model.includes('claude-sonnet-4');
    const isClaudeV3Plus = model.startsWith('claude-3') || isClaudeV4;
    
    const supportedFeatures = [
      'chat',
      'completion',
      ...(isClaudeV3Plus ? ['vision'] : []),
      ...(isClaudeV4 ? ['hybrid-reasoning', 'extended-thinking', 'enhanced-tools'] : []),
    ];
    
    return {
      model,
      name: info.name,
      description: info.description,
      contextLength: info.contextWindow,
      maxOutputTokens: this.capabilities.maxOutputTokens[model] || (isClaudeV4 ? 8192 : 4096),
      supportedFeatures,
      pricing: this.capabilities.pricing![model],
    };
  }

  protected async doHealthCheck(): Promise<HealthCheckResult> {
    try {
      // Use a minimal request to check API availability
      await this.claudeClient.complete('Hi', {
        maxTokens: 1,
      });
      
      return {
        healthy: true,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Map unified model to Anthropic model
   */
  private mapToAnthropicModel(model: LLMModel): AnthropicModel {
    // Direct mapping since we use the same model names
    return model as AnthropicModel;
  }

  /**
   * Map Anthropic model to unified model
   */
  private mapFromAnthropicModel(model: AnthropicModel): LLMModel {
    return model as LLMModel;
  }

  /**
   * Max Pro plan quota management
   */
  setMaxProQuota(quota: MaxProQuotaInfo): void {
    this.maxProQuota = quota;
  }

  getMaxProQuota(): MaxProQuotaInfo | null {
    return this.maxProQuota;
  }

  /**
   * Intelligent model selection for Max Pro plan optimization
   */
  async selectOptimalModel(request: LLMRequest): Promise<MaxProOptimization> {
    if (!this.maxProQuota) {
      // Fallback to Claude 4 Sonnet if no quota info
      return {
        recommendedModel: 'claude-sonnet-4-20250514',
        reasoning: 'No Max Pro quota info available, defaulting to Claude 4 Sonnet',
        quotaImpact: {
          opusRemaining: 0,
          sonnetRemaining: 0,
          nextResetIn: 0,
        },
        fallbackOptions: ['claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
      };
    }

    const now = new Date();
    const timeToReset = this.maxProQuota.quotaReset.getTime() - now.getTime();
    const opusRemaining = this.maxProQuota.opusQuotaLimit - this.maxProQuota.opusQuotaUsed;
    const sonnetRemaining = this.maxProQuota.sonnetQuotaLimit - this.maxProQuota.sonnetQuotaUsed;

    // Strategic task classification for optimal model selection
    const taskComplexity = this.classifyTaskComplexity(request);
    const isStrategicTask = this.isStrategicTask(request);

    let recommendedModel: LLMModel;
    let reasoning: string;

    if (isStrategicTask && opusRemaining > 0 && taskComplexity === 'high') {
      // Use Opus for strategic high-complexity tasks
      recommendedModel = 'claude-opus-4-20250514';
      reasoning = 'Strategic high-complexity task detected, using Opus for optimal results';
    } else if (sonnetRemaining > 0) {
      // Use Sonnet for most tasks (80% allocation)
      recommendedModel = 'claude-sonnet-4-20250514';
      reasoning = 'Using Sonnet for balanced performance and quota efficiency';
    } else if (opusRemaining > 0) {
      // Use remaining Opus quota if Sonnet exhausted
      recommendedModel = 'claude-opus-4-20250514';
      reasoning = 'Sonnet quota exhausted, using remaining Opus quota';
    } else {
      // Fallback to Claude 3 models
      recommendedModel = 'claude-3-sonnet-20240229';
      reasoning = 'Max Pro quota exhausted, falling back to Claude 3 Sonnet';
    }

    return {
      recommendedModel,
      reasoning,
      quotaImpact: {
        opusRemaining,
        sonnetRemaining,
        nextResetIn: timeToReset,
      },
      fallbackOptions: [
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
        // Local model fallback would be handled by provider manager
      ],
    };
  }

  /**
   * Classify task complexity based on request characteristics
   */
  private classifyTaskComplexity(request: LLMRequest): 'low' | 'medium' | 'high' {
    const messageContent = request.messages.map(m => m.content).join(' ');
    const hasComplexKeywords = /analyze|research|strategic|architecture|design|complex|comprehensive|detailed/.test(messageContent.toLowerCase());
    const hasTools = request.functions && request.functions.length > 0;
    const isLongContext = messageContent.length > 2000;

    if (hasComplexKeywords && (hasTools || isLongContext)) {
      return 'high';
    } else if (hasComplexKeywords || hasTools || isLongContext) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Determine if task is strategic (worth using Opus quota)
   */
  private isStrategicTask(request: LLMRequest): boolean {
    const messageContent = request.messages.map(m => m.content).join(' ').toLowerCase();
    const strategicKeywords = [
      'strategic', 'critical', 'important', 'complex analysis', 
      'architecture', 'system design', 'comprehensive research',
      'business decision', 'optimize', 'performance critical'
    ];
    
    return strategicKeywords.some(keyword => messageContent.includes(keyword));
  }

  /**
   * Update quota usage after request
   */
  updateQuotaUsage(model: LLMModel): void {
    if (!this.maxProQuota) return;

    if (model === 'claude-opus-4-20250514') {
      this.maxProQuota.opusQuotaUsed += 1;
    } else if (model === 'claude-sonnet-4-20250514') {
      this.maxProQuota.sonnetQuotaUsed += 1;
    }

    // Check if quota reset is needed
    const now = new Date();
    if (now > this.maxProQuota.quotaReset) {
      this.resetQuotaCycle();
    }
  }

  /**
   * Reset quota cycle (called every 5 hours)
   */
  private resetQuotaCycle(): void {
    if (!this.maxProQuota) return;

    const now = new Date();
    this.maxProQuota.opusQuotaUsed = 0;
    this.maxProQuota.sonnetQuotaUsed = 0;
    this.maxProQuota.currentCycleStart = now;
    this.maxProQuota.quotaReset = new Date(now.getTime() + 5 * 60 * 60 * 1000); // 5 hours
  }

  override destroy(): void {
    super.destroy();
    this.claudeClient?.destroy();
  }
}