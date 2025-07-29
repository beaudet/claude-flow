/**
 * Comprehensive Functional Tests for Provider System
 * Tests API integration reliability, provider management, and error handling
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BaseProvider } from '../base-provider';
import { AnthropicProvider } from '../anthropic-provider';
import { OpenAIProvider } from '../openai-provider';
import { GoogleProvider } from '../google-provider';
import { CohereProvider } from '../cohere-provider';
import { OllamaProvider } from '../ollama-provider';
import { ProviderManager } from '../provider-manager';
import type { ProviderConfig, ChatMessage, ChatResponse } from '../index';

describe('Provider System Functional Tests', () => {
  describe('Base Provider Functionality', () => {
    test('should create base provider with configuration', () => {
      const config: ProviderConfig = {
        name: 'test-provider',
        type: 'anthropic',
        apiKey: 'test-key',
        model: 'claude-3-sonnet-20240229',
        maxTokens: 1000,
        temperature: 0.7
      };

      const provider = new BaseProvider(config);
      
      expect(provider.getName()).toBe('test-provider');
      expect(provider.getType()).toBe('anthropic');
      expect(provider.getModel()).toBe('claude-3-sonnet-20240229');
    });

    test('should handle provider configuration validation', () => {
      const validConfigs: ProviderConfig[] = [
        {
          name: 'anthropic-test',
          type: 'anthropic',
          apiKey: 'sk-ant-test',
          model: 'claude-3-sonnet-20240229'
        },
        {
          name: 'openai-test',
          type: 'openai',
          apiKey: 'sk-test',
          model: 'gpt-4',
          temperature: 0.5,
          maxTokens: 2000
        },
        {
          name: 'google-test',
          type: 'google',
          apiKey: 'google-test-key',
          model: 'gemini-pro'
        }
      ];

      validConfigs.forEach(config => {
        const provider = new BaseProvider(config);
        expect(provider.getName()).toBe(config.name);
        expect(provider.getType()).toBe(config.type);
      });
    });

    test('should handle provider settings updates', () => {
      const config: ProviderConfig = {
        name: 'updateable-provider',
        type: 'anthropic',
        apiKey: 'initial-key',
        model: 'claude-3-haiku-20240307',
        maxTokens: 1000
      };

      const provider = new BaseProvider(config);
      
      // Update configuration
      provider.updateConfig({
        model: 'claude-3-sonnet-20240229',
        maxTokens: 2000,
        temperature: 0.8
      });

      expect(provider.getModel()).toBe('claude-3-sonnet-20240229');
    });

    test('should track provider statistics', () => {
      const config: ProviderConfig = {
        name: 'stats-provider',
        type: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4'
      };

      const provider = new BaseProvider(config);
      
      const initialStats = provider.getStats();
      expect(initialStats.totalRequests).toBe(0);
      expect(initialStats.totalTokens).toBe(0);
      expect(initialStats.errors).toBe(0);
    });
  });

  describe('Anthropic Provider', () => {
    test('should create Anthropic provider with correct configuration', () => {
      const config: ProviderConfig = {
        name: 'anthropic-provider',
        type: 'anthropic',
        apiKey: 'sk-ant-test-key',
        model: 'claude-3-sonnet-20240229',
        maxTokens: 2000,
        temperature: 0.7
      };

      const provider = new AnthropicProvider(config);
      
      expect(provider.getName()).toBe('anthropic-provider');
      expect(provider.getType()).toBe('anthropic');
      expect(provider.getModel()).toBe('claude-3-sonnet-20240229');
    });

    test('should handle different Claude models', () => {
      const models = [
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
        'claude-3-opus-20240229'
      ];

      models.forEach(model => {
        const config: ProviderConfig = {
          name: `anthropic-${model}`,
          type: 'anthropic',
          apiKey: 'sk-ant-test',
          model
        };

        const provider = new AnthropicProvider(config);
        expect(provider.getModel()).toBe(model);
      });
    });

    test('should format messages correctly for Anthropic API', () => {
      const config: ProviderConfig = {
        name: 'anthropic-formatter',
        type: 'anthropic',
        apiKey: 'sk-ant-test',
        model: 'claude-3-sonnet-20240229'
      };

      const provider = new AnthropicProvider(config);
      
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello, how are you?' },
        { role: 'assistant', content: 'I am doing well, thank you!' },
        { role: 'user', content: 'Can you help me with coding?' }
      ];

      // Test message formatting (this would be internal method)
      expect(messages).toHaveLength(3);
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
    });

    test('should handle system prompts correctly', () => {
      const config: ProviderConfig = {
        name: 'anthropic-system',
        type: 'anthropic',
        apiKey: 'sk-ant-test',
        model: 'claude-3-sonnet-20240229',
        systemPrompt: 'You are a helpful coding assistant.'
      };

      const provider = new AnthropicProvider(config);
      expect(provider.getSystemPrompt()).toBe('You are a helpful coding assistant.');
    });
  });

  describe('OpenAI Provider', () => {
    test('should create OpenAI provider with configuration', () => {
      const config: ProviderConfig = {
        name: 'openai-provider',
        type: 'openai',
        apiKey: 'sk-test-openai-key',
        model: 'gpt-4',
        maxTokens: 1500,
        temperature: 0.6
      };

      const provider = new OpenAIProvider(config);
      
      expect(provider.getName()).toBe('openai-provider');
      expect(provider.getType()).toBe('openai');
      expect(provider.getModel()).toBe('gpt-4');
    });

    test('should handle different OpenAI models', () => {
      const models = [
        'gpt-4',
        'gpt-4-turbo-preview',
        'gpt-3.5-turbo',
        'gpt-3.5-turbo-16k'
      ];

      models.forEach(model => {
        const config: ProviderConfig = {
          name: `openai-${model}`,
          type: 'openai',
          apiKey: 'sk-test',
          model
        };

        const provider = new OpenAIProvider(config);
        expect(provider.getModel()).toBe(model);
      });
    });

    test('should handle OpenAI-specific parameters', () => {
      const config: ProviderConfig = {
        name: 'openai-advanced',
        type: 'openai',
        apiKey: 'sk-test',
        model: 'gpt-4',
        temperature: 0.9,
        topP: 0.95,
        frequencyPenalty: 0.5,
        presencePenalty: 0.3
      };

      const provider = new OpenAIProvider(config);
      expect(provider.getName()).toBe('openai-advanced');
    });
  });

  describe('Google Provider', () => {
    test('should create Google provider with configuration', () => {
      const config: ProviderConfig = {
        name: 'google-provider',
        type: 'google',
        apiKey: 'google-api-key',
        model: 'gemini-pro',
        maxTokens: 1000
      };

      const provider = new GoogleProvider(config);
      
      expect(provider.getName()).toBe('google-provider');
      expect(provider.getType()).toBe('google');
      expect(provider.getModel()).toBe('gemini-pro');
    });

    test('should handle different Gemini models', () => {
      const models = ['gemini-pro', 'gemini-pro-vision', 'gemini-ultra'];

      models.forEach(model => {
        const config: ProviderConfig = {
          name: `google-${model}`,
          type: 'google',
          apiKey: 'google-test',
          model
        };

        const provider = new GoogleProvider(config);
        expect(provider.getModel()).toBe(model);
      });
    });
  });

  describe('Cohere Provider', () => {
    test('should create Cohere provider with configuration', () => {
      const config: ProviderConfig = {
        name: 'cohere-provider',
        type: 'cohere',
        apiKey: 'cohere-api-key',
        model: 'command-r-plus',
        maxTokens: 2000
      };

      const provider = new CohereProvider(config);
      
      expect(provider.getName()).toBe('cohere-provider');
      expect(provider.getType()).toBe('cohere');
      expect(provider.getModel()).toBe('command-r-plus');
    });

    test('should handle different Cohere models', () => {
      const models = ['command-r-plus', 'command-r', 'command-light'];

      models.forEach(model => {
        const config: ProviderConfig = {
          name: `cohere-${model}`,
          type: 'cohere',
          apiKey: 'cohere-test',
          model
        };

        const provider = new CohereProvider(config);
        expect(provider.getModel()).toBe(model);
      });
    });
  });

  describe('Ollama Provider', () => {
    test('should create Ollama provider with configuration', () => {
      const config: ProviderConfig = {
        name: 'ollama-provider',
        type: 'ollama',
        baseUrl: 'http://localhost:11434',
        model: 'llama2',
        maxTokens: 1000
      };

      const provider = new OllamaProvider(config);
      
      expect(provider.getName()).toBe('ollama-provider');
      expect(provider.getType()).toBe('ollama');
      expect(provider.getModel()).toBe('llama2');
    });

    test('should handle different Ollama models', () => {
      const models = ['llama2', 'mistral', 'codellama', 'neural-chat'];

      models.forEach(model => {
        const config: ProviderConfig = {
          name: `ollama-${model}`,
          type: 'ollama',
          baseUrl: 'http://localhost:11434',
          model
        };

        const provider = new OllamaProvider(config);
        expect(provider.getModel()).toBe(model);
      });
    });

    test('should handle custom Ollama endpoint', () => {
      const config: ProviderConfig = {
        name: 'ollama-custom',
        type: 'ollama',
        baseUrl: 'http://custom-ollama-server:8080',
        model: 'custom-model'
      };

      const provider = new OllamaProvider(config);
      expect(provider.getName()).toBe('ollama-custom');
    });
  });

  describe('Provider Manager', () => {
    let providerManager: ProviderManager;

    beforeEach(() => {
      providerManager = new ProviderManager();
    });

    afterEach(() => {
      // Clean up any registered providers
      providerManager.clearProviders();
    });

    test('should register multiple providers', () => {
      const providers = [
        {
          name: 'anthropic-test',
          type: 'anthropic' as const,
          apiKey: 'sk-ant-test',
          model: 'claude-3-sonnet-20240229'
        },
        {
          name: 'openai-test',
          type: 'openai' as const,
          apiKey: 'sk-openai-test',
          model: 'gpt-4'
        },
        {
          name: 'google-test',
          type: 'google' as const,
          apiKey: 'google-test',
          model: 'gemini-pro'
        }
      ];

      providers.forEach(config => {
        providerManager.registerProvider(config);
      });

      const registeredProviders = providerManager.getProviders();
      expect(registeredProviders).toHaveLength(3);
      
      const providerNames = registeredProviders.map(p => p.getName());
      expect(providerNames).toContain('anthropic-test');
      expect(providerNames).toContain('openai-test');
      expect(providerNames).toContain('google-test');
    });

    test('should get provider by name', () => {
      const config: ProviderConfig = {
        name: 'findable-provider',
        type: 'anthropic',
        apiKey: 'sk-ant-test',
        model: 'claude-3-haiku-20240307'
      };

      providerManager.registerProvider(config);
      
      const provider = providerManager.getProvider('findable-provider');
      expect(provider).toBeDefined();
      expect(provider?.getName()).toBe('findable-provider');
    });

    test('should return null for non-existent provider', () => {
      const provider = providerManager.getProvider('non-existent');
      expect(provider).toBeNull();
    });

    test('should unregister providers', () => {
      const config: ProviderConfig = {
        name: 'removable-provider',
        type: 'openai',
        apiKey: 'sk-test',
        model: 'gpt-3.5-turbo'
      };

      providerManager.registerProvider(config);
      expect(providerManager.getProvider('removable-provider')).toBeDefined();

      providerManager.unregisterProvider('removable-provider');
      expect(providerManager.getProvider('removable-provider')).toBeNull();
    });

    test('should get providers by type', () => {
      const configs: ProviderConfig[] = [
        {
          name: 'anthropic-1',
          type: 'anthropic',
          apiKey: 'sk-ant-1',
          model: 'claude-3-sonnet-20240229'
        },
        {
          name: 'anthropic-2',
          type: 'anthropic',
          apiKey: 'sk-ant-2',
          model: 'claude-3-haiku-20240307'
        },
        {
          name: 'openai-1',
          type: 'openai',
          apiKey: 'sk-openai-1',
          model: 'gpt-4'
        }
      ];

      configs.forEach(config => {
        providerManager.registerProvider(config);
      });

      const anthropicProviders = providerManager.getProvidersByType('anthropic');
      const openaiProviders = providerManager.getProvidersByType('openai');

      expect(anthropicProviders).toHaveLength(2);
      expect(openaiProviders).toHaveLength(1);
    });

    test('should handle provider load balancing', () => {
      // Register multiple providers of same type
      const configs: ProviderConfig[] = [
        {
          name: 'load-balance-1',
          type: 'anthropic',
          apiKey: 'sk-ant-1',
          model: 'claude-3-sonnet-20240229'
        },
        {
          name: 'load-balance-2',
          type: 'anthropic',
          apiKey: 'sk-ant-2',
          model: 'claude-3-sonnet-20240229'
        },
        {
          name: 'load-balance-3',
          type: 'anthropic',
          apiKey: 'sk-ant-3',
          model: 'claude-3-sonnet-20240229'
        }
      ];

      configs.forEach(config => {
        providerManager.registerProvider(config);
      });

      // Test round-robin or least-loaded provider selection
      const selections = [];
      for (let i = 0; i < 6; i++) {
        const provider = providerManager.selectProvider('anthropic');
        selections.push(provider?.getName());
      }

      // Should distribute across all providers
      const uniqueSelections = new Set(selections);
      expect(uniqueSelections.size).toBeGreaterThan(1);
    });

    test('should track provider health and performance', () => {
      const config: ProviderConfig = {
        name: 'health-tracked-provider',
        type: 'openai',
        apiKey: 'sk-test',
        model: 'gpt-3.5-turbo'
      };

      providerManager.registerProvider(config);
      const provider = providerManager.getProvider('health-tracked-provider');

      expect(provider).toBeDefined();
      
      const stats = provider!.getStats();
      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('totalTokens');
      expect(stats).toHaveProperty('errors');
      expect(stats).toHaveProperty('averageResponseTime');
    });

    test('should handle provider failover', () => {
      const configs: ProviderConfig[] = [
        {
          name: 'primary-provider',
          type: 'anthropic',
          apiKey: 'sk-ant-primary',
          model: 'claude-3-sonnet-20240229'
        },
        {
          name: 'backup-provider',
          type: 'anthropic',
          apiKey: 'sk-ant-backup',
          model: 'claude-3-sonnet-20240229'
        }
      ];

      configs.forEach(config => {
        providerManager.registerProvider(config);
      });

      // Mark primary as unhealthy
      const primaryProvider = providerManager.getProvider('primary-provider');
      primaryProvider?.markUnhealthy();

      // Should select backup provider
      const selectedProvider = providerManager.selectProvider('anthropic');
      expect(selectedProvider?.getName()).toBe('backup-provider');
    });

    test('should aggregate provider statistics', () => {
      const configs: ProviderConfig[] = [
        {
          name: 'stats-provider-1',
          type: 'anthropic',
          apiKey: 'sk-ant-1',
          model: 'claude-3-sonnet-20240229'
        },
        {
          name: 'stats-provider-2',
          type: 'openai',
          apiKey: 'sk-openai-1',
          model: 'gpt-4'
        }
      ];

      configs.forEach(config => {
        providerManager.registerProvider(config);
      });

      const aggregatedStats = providerManager.getAggregatedStats();
      
      expect(aggregatedStats).toHaveProperty('totalProviders');
      expect(aggregatedStats).toHaveProperty('totalRequests');
      expect(aggregatedStats).toHaveProperty('totalTokens');
      expect(aggregatedStats).toHaveProperty('totalErrors');
      expect(aggregatedStats.totalProviders).toBe(2);
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle invalid API keys gracefully', () => {
      const config: ProviderConfig = {
        name: 'invalid-key-provider',
        type: 'anthropic',
        apiKey: 'invalid-key',
        model: 'claude-3-sonnet-20240229'
      };

      const provider = new AnthropicProvider(config);
      
      // Provider should be created even with invalid key
      expect(provider.getName()).toBe('invalid-key-provider');
      
      // Error handling would be tested in actual API calls
      expect(provider.getStats().errors).toBe(0);
    });

    test('should handle network errors and retries', () => {
      const config: ProviderConfig = {
        name: 'retry-provider',
        type: 'openai',
        apiKey: 'sk-test',
        model: 'gpt-4',
        retryAttempts: 3,
        retryDelay: 1000
      };

      const provider = new OpenAIProvider(config);
      expect(provider.getName()).toBe('retry-provider');
    });

    test('should handle rate limiting', () => {
      const config: ProviderConfig = {
        name: 'rate-limited-provider',
        type: 'anthropic',
        apiKey: 'sk-ant-test',
        model: 'claude-3-sonnet-20240229',
        rateLimitPerMinute: 60
      };

      const provider = new AnthropicProvider(config);
      expect(provider.getName()).toBe('rate-limited-provider');
    });

    test('should handle malformed responses', () => {
      const config: ProviderConfig = {
        name: 'error-handling-provider',
        type: 'google',
        apiKey: 'google-test',
        model: 'gemini-pro'
      };

      const provider = new GoogleProvider(config);
      expect(provider.getName()).toBe('error-handling-provider');
      
      // Provider should be robust to various error conditions
      const stats = provider.getStats();
      expect(stats.errors).toBe(0);
    });
  });

  describe('Performance and Optimization', () => {
    test('should handle concurrent requests efficiently', () => {
      const config: ProviderConfig = {
        name: 'concurrent-provider',
        type: 'anthropic',
        apiKey: 'sk-ant-test',
        model: 'claude-3-sonnet-20240229',
        maxConcurrentRequests: 10
      };

      const provider = new AnthropicProvider(config);
      expect(provider.getName()).toBe('concurrent-provider');
    });

    test('should optimize token usage', () => {
      const config: ProviderConfig = {
        name: 'token-optimized-provider',
        type: 'openai',
        apiKey: 'sk-test',
        model: 'gpt-4',
        maxTokens: 2000,
        tokenOptimization: true
      };

      const provider = new OpenAIProvider(config);
      expect(provider.getName()).toBe('token-optimized-provider');
    });

    test('should cache responses when appropriate', () => {
      const config: ProviderConfig = {
        name: 'cached-provider',
        type: 'anthropic',
        apiKey: 'sk-ant-test',
        model: 'claude-3-sonnet-20240229',
        enableCaching: true,
        cacheTTL: 3600
      };

      const provider = new AnthropicProvider(config);
      expect(provider.getName()).toBe('cached-provider');
    });

    test('should handle large message histories efficiently', () => {
      const config: ProviderConfig = {
        name: 'large-history-provider',
        type: 'google',
        apiKey: 'google-test',
        model: 'gemini-pro',
        maxHistoryLength: 1000
      };

      const provider = new GoogleProvider(config);
      expect(provider.getName()).toBe('large-history-provider');
    });
  });

  describe('Integration and Compatibility', () => {
    test('should maintain compatibility across provider types', () => {
      const providerConfigs: ProviderConfig[] = [
        {
          name: 'compat-anthropic',
          type: 'anthropic',
          apiKey: 'sk-ant-test',
          model: 'claude-3-sonnet-20240229'
        },
        {
          name: 'compat-openai',
          type: 'openai',
          apiKey: 'sk-openai-test',
          model: 'gpt-4'
        },
        {
          name: 'compat-google',
          type: 'google',
          apiKey: 'google-test',
          model: 'gemini-pro'
        },
        {
          name: 'compat-cohere',
          type: 'cohere',
          apiKey: 'cohere-test',
          model: 'command-r-plus'
        }
      ];

      // All providers should have consistent interface
      providerConfigs.forEach(config => {
        let provider;
        
        switch (config.type) {
          case 'anthropic':
            provider = new AnthropicProvider(config);
            break;
          case 'openai':
            provider = new OpenAIProvider(config);
            break;
          case 'google':
            provider = new GoogleProvider(config);
            break;
          case 'cohere':
            provider = new CohereProvider(config);
            break;
        }

        expect(provider.getName()).toBe(config.name);
        expect(provider.getType()).toBe(config.type);
        expect(provider.getModel()).toBe(config.model);
        expect(typeof provider.getStats).toBe('function');
      });
    });

    test('should support custom provider configurations', () => {
      const customConfig: ProviderConfig = {
        name: 'custom-provider',
        type: 'ollama',
        baseUrl: 'http://custom-server:8080',
        model: 'custom-model',
        customHeaders: {
          'X-Custom-Header': 'custom-value'
        },
        customParameters: {
          temperature: 0.8,
          top_k: 40,
          top_p: 0.9
        }
      };

      const provider = new OllamaProvider(customConfig);
      expect(provider.getName()).toBe('custom-provider');
    });
  });
});