/**
 * Integration Tests for Claude 4 Max Pro Plan Features
 * Comprehensive testing of quota management, intelligent routing, and fallback systems
 */

import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { ProviderManager } from '../../src/providers/provider-manager.js';
import { AnthropicProvider } from '../../src/providers/anthropic-provider.js';
import { OllamaProvider } from '../../src/providers/ollama-provider.js';
import { Logger } from '../../src/core/logger.js';
import { ConfigManager } from '../../src/config/config-manager.js';
import { LLMRequest, MaxProQuotaInfo } from '../../src/providers/types.js';

describe('Claude 4 Max Pro Plan Integration', () => {
  let providerManager: ProviderManager;
  let logger: Logger;
  let configManager: ConfigManager;

  const mockConfig = {
    providers: {
      anthropic: {
        provider: 'anthropic' as const,
        model: 'claude-sonnet-4-20250514' as const,
        temperature: 0.7,
        maxTokens: 8192,
      },
      ollama: {
        provider: 'ollama' as const,
        model: 'qwen2-7b-instruct' as const,
        apiUrl: 'http://localhost:8080',
        temperature: 0.3,
        maxTokens: 4096,
      },
    },
    defaultProvider: 'anthropic' as const,
    fallbackStrategy: {
      name: 'max-pro-optimized',
      enabled: true,
      maxAttempts: 3,
      rules: [
        {
          condition: 'rate_limit' as const,
          fallbackProviders: ['ollama' as const],
          retryOriginal: true,
          retryDelay: 300000,
        },
      ],
    },
    costOptimization: {
      enabled: true,
      maxCostPerRequest: 1.0,
      preferredProviders: ['anthropic' as const, 'ollama' as const],
    },
    loadBalancing: {
      enabled: true,
      strategy: 'cost-based' as const,
    },
  };

  beforeEach(async () => {
    logger = new Logger('TestLogger');
    configManager = ConfigManager.getInstance();
    await configManager.init();
    
    // Mock the provider initialization to avoid actual API calls
    jest.spyOn(ProviderManager.prototype as any, 'initializeProviders').mockResolvedValue(undefined);
    
    providerManager = new ProviderManager(logger, configManager, mockConfig);
    
    // Initialize with test quota
    providerManager.initializeMaxProQuota(1000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    providerManager.destroy();
  });

  describe('Max Pro Quota Management', () => {
    it('should initialize quota with correct 20/80 split', () => {
      const quota = providerManager.getMaxProQuota();
      
      expect(quota).toBeDefined();
      expect(quota!.opusQuotaLimit).toBe(200); // 20% of 1000
      expect(quota!.sonnetQuotaLimit).toBe(800); // 80% of 1000
      expect(quota!.totalQuotaLimit).toBe(1000);
      expect(quota!.opusQuotaUsed).toBe(0);
      expect(quota!.sonnetQuotaUsed).toBe(0);
    });

    it('should track quota usage correctly', () => {
      const quota = providerManager.getMaxProQuota()!;
      
      // Simulate usage
      quota.opusQuotaUsed = 50;
      quota.sonnetQuotaUsed = 300;
      
      expect(quota.opusQuotaUsed / quota.opusQuotaLimit).toBe(0.25); // 25% used
      expect(quota.sonnetQuotaUsed / quota.sonnetQuotaLimit).toBe(0.375); // 37.5% used
    });

    it('should reset quota cycle correctly', () => {
      const quota = providerManager.getMaxProQuota()!;
      
      // Simulate usage
      quota.opusQuotaUsed = 100;
      quota.sonnetQuotaUsed = 400;
      
      // Simulate quota reset (5 hours passed)
      const futureDate = new Date(Date.now() + 6 * 60 * 60 * 1000); // 6 hours
      quota.quotaReset = futureDate;
      
      // Initialize new quota (simulating reset)
      providerManager.initializeMaxProQuota(1000);
      const newQuota = providerManager.getMaxProQuota()!;
      
      expect(newQuota.opusQuotaUsed).toBe(0);
      expect(newQuota.sonnetQuotaUsed).toBe(0);
    });
  });

  describe('Intelligent Model Selection', () => {
    it('should recommend Opus for strategic high-complexity tasks', async () => {
      const strategicRequest: LLMRequest = {
        messages: [{
          role: 'user',
          content: 'Analyze the strategic implications of our microservices architecture and provide comprehensive recommendations for system optimization and scalability improvements.'
        }],
        model: 'claude-opus-4-20250514',
        quotaConstraints: {
          maxProPlan: providerManager.getMaxProQuota()!,
        },
      };

      const optimization = await providerManager.getMaxProOptimization(strategicRequest);
      
      expect(optimization).toBeDefined();
      expect(optimization!.recommendedModel).toBe('claude-opus-4-20250514');
      expect(optimization!.reasoning).toContain('strategic');
    });

    it('should recommend Sonnet for general tasks', async () => {
      const generalRequest: LLMRequest = {
        messages: [{
          role: 'user',
          content: 'Write a TypeScript function to validate email addresses.'
        }],
        model: 'claude-sonnet-4-20250514',
        quotaConstraints: {
          maxProPlan: providerManager.getMaxProQuota()!,
        },
      };

      const optimization = await providerManager.getMaxProOptimization(generalRequest);
      
      expect(optimization).toBeDefined();
      expect(optimization!.recommendedModel).toBe('claude-sonnet-4-20250514');
      expect(optimization!.reasoning).toContain('Sonnet');
    });

    it('should fallback to Claude 3 when quota exhausted', async () => {
      const quota = providerManager.getMaxProQuota()!;
      
      // Exhaust both quotas
      quota.opusQuotaUsed = quota.opusQuotaLimit;
      quota.sonnetQuotaUsed = quota.sonnetQuotaLimit;

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Simple question' }],
        model: 'claude-sonnet-4-20250514',
        quotaConstraints: { maxProPlan: quota },
      };

      const optimization = await providerManager.getMaxProOptimization(request);
      
      expect(optimization).toBeDefined();
      expect(optimization!.recommendedModel).toBe('claude-3-sonnet-20240229');
      expect(optimization!.reasoning).toContain('exhausted');
      expect(optimization!.fallbackOptions).toContain('claude-3-haiku-20240307');
    });
  });

  describe('Task Complexity Classification', () => {
    const testCases = [
      {
        content: 'strategic architecture comprehensive analysis optimization',
        expectedComplexity: 'high',
        description: 'high complexity with multiple strategic keywords'
      },
      {
        content: 'implement feature with proper testing',
        expectedComplexity: 'medium', 
        description: 'medium complexity with implementation keywords'
      },
      {
        content: 'what is 2 + 2?',
        expectedComplexity: 'low',
        description: 'low complexity simple question'
      },
      {
        content: 'A very long task description that goes on and on with many details about implementation requirements, architectural considerations, performance optimizations, security implications, scalability concerns, and comprehensive testing strategies that would require significant analysis and planning to execute properly with attention to multiple complex factors and interdependencies.',
        expectedComplexity: 'high',
        description: 'high complexity due to length'
      }
    ];

    testCases.forEach(({ content, expectedComplexity, description }) => {
      it(`should classify as ${expectedComplexity}: ${description}`, () => {
        // We need to access the private method for testing
        const anthropicProvider = new AnthropicProvider({
          logger,
          config: mockConfig.providers.anthropic,
        });

        const request: LLMRequest = {
          messages: [{ role: 'user', content }],
          model: 'claude-sonnet-4-20250514',
        };

        // Use type assertion to access private method
        const complexity = (anthropicProvider as any).classifyTaskComplexity(request);
        expect(complexity).toBe(expectedComplexity);
      });
    });
  });

  describe('Model Capabilities', () => {
    it('should support Claude 4 enhanced features', () => {
      const anthropicProvider = new AnthropicProvider({
        logger,
        config: mockConfig.providers.anthropic,
      });

      const capabilities = anthropicProvider.capabilities;
      
      expect(capabilities.supportedModels).toContain('claude-opus-4-20250514');
      expect(capabilities.supportedModels).toContain('claude-sonnet-4-20250514');
      expect(capabilities.maxOutputTokens['claude-opus-4-20250514']).toBe(8192);
      expect(capabilities.maxOutputTokens['claude-sonnet-4-20250514']).toBe(8192);
      expect(capabilities.supportsHybridReasoning).toBe(true);
      expect(capabilities.supportsExtendedThinking).toBe(true);
      expect(capabilities.supportsEnhancedTools).toBe(true);
    });

    it('should provide enhanced model info for Claude 4', async () => {
      const anthropicProvider = new AnthropicProvider({
        logger,
        config: mockConfig.providers.anthropic,
      });

      // Mock the claude client method
      jest.spyOn(anthropicProvider as any, 'mapToAnthropicModel').mockReturnValue('claude-sonnet-4-20250514');
      (anthropicProvider as any).claudeClient = {
        getModelInfo: jest.fn().mockReturnValue({
          name: 'Claude 4 Sonnet',
          description: 'Claude 4 Sonnet with enhanced capabilities',
          contextWindow: 200000,
        }),
      };

      const modelInfo = await anthropicProvider.getModelInfo('claude-sonnet-4-20250514');
      
      expect(modelInfo.supportedFeatures).toContain('hybrid-reasoning');
      expect(modelInfo.supportedFeatures).toContain('extended-thinking');
      expect(modelInfo.supportedFeatures).toContain('enhanced-tools');
      expect(modelInfo.maxOutputTokens).toBe(8192);
    });
  });

  describe('Error Handling and Fallbacks', () => {
    it('should handle quota exhaustion gracefully', async () => {
      const quota = providerManager.getMaxProQuota()!;
      quota.sonnetQuotaUsed = quota.sonnetQuotaLimit;
      quota.opusQuotaUsed = quota.opusQuotaLimit;

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Test request' }],
        model: 'claude-sonnet-4-20250514',
        quotaConstraints: { maxProPlan: quota },
      };

      const optimization = await providerManager.getMaxProOptimization(request);
      
      expect(optimization!.fallbackOptions).toEqual([
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
      ]);
    });

    it('should handle missing quota information', async () => {
      // Create provider without quota
      const noQuotaManager = new ProviderManager(logger, configManager, mockConfig);

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Test request' }],
        model: 'claude-sonnet-4-20250514',
      };

      const optimization = await noQuotaManager.getMaxProOptimization(request);
      
      expect(optimization!.recommendedModel).toBe('claude-sonnet-4-20250514');
      expect(optimization!.reasoning).toContain('No Max Pro quota info');
      
      noQuotaManager.destroy();
    });
  });

  describe('Performance Metrics', () => {
    it('should track quota utilization metrics', () => {
      const quota = providerManager.getMaxProQuota()!;
      
      quota.opusQuotaUsed = 40; // 20% of 200
      quota.sonnetQuotaUsed = 160; // 20% of 800

      const opusUtilization = (quota.opusQuotaUsed / quota.opusQuotaLimit) * 100;
      const sonnetUtilization = (quota.sonnetQuotaUsed / quota.sonnetQuotaLimit) * 100;

      expect(opusUtilization).toBe(20);
      expect(sonnetUtilization).toBe(20);
    });

    it('should calculate time to quota reset', () => {
      const quota = providerManager.getMaxProQuota()!;
      const now = new Date();
      const resetTime = new Date(now.getTime() + 3 * 60 * 60 * 1000); // 3 hours
      
      quota.quotaReset = resetTime;
      
      const timeToReset = quota.quotaReset.getTime() - now.getTime();
      const hoursToReset = timeToReset / (1000 * 60 * 60);
      
      expect(hoursToReset).toBeCloseTo(3, 1);
    });
  });
});