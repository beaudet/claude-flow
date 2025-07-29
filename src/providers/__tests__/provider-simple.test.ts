/**
 * Simple Provider System Functional Tests
 * Tests basic provider functionality without complex integrations
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock the logger to avoid initialization issues
jest.mock('../../core/logger.js', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

import { AnthropicProvider } from '../anthropic-provider';
import { OpenAIProvider } from '../openai-provider';
import { GoogleProvider } from '../google-provider';
import { CohereProvider } from '../cohere-provider';
import { OllamaProvider } from '../ollama-provider';
import type { LLMProviderConfig } from '../types';

describe('Provider System Basic Tests', () => {
  describe('Provider Configuration and Initialization', () => {
    test('should create Anthropic provider with basic configuration', () => {
      const config: LLMProviderConfig = {
        apiKey: 'sk-ant-test-key',
        model: 'claude-3-sonnet-20240229',
        maxTokens: 2000,
        temperature: 0.7
      };

      expect(() => {
        const provider = new AnthropicProvider({
          logger: {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn()
          } as any,
          config
        });
        expect(provider.name).toBe('anthropic');
      }).not.toThrow();
    });

    test('should create OpenAI provider with basic configuration', () => {
      const config: LLMProviderConfig = {
        apiKey: 'sk-test-openai-key',
        model: 'gpt-4',
        maxTokens: 1500,
        temperature: 0.6
      };

      expect(() => {
        const provider = new OpenAIProvider({
          logger: {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn()
          } as any,
          config
        });
        expect(provider.name).toBe('openai');
      }).not.toThrow();
    });

    test('should create Google provider with basic configuration', () => {
      const config: LLMProviderConfig = {
        apiKey: 'google-api-key',
        model: 'gemini-pro',
        maxTokens: 1000
      };

      expect(() => {
        const provider = new GoogleProvider({
          logger: {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn()
          } as any,
          config
        });
        expect(provider.name).toBe('google');
      }).not.toThrow();
    });

    test('should create Cohere provider with basic configuration', () => {
      const config: LLMProviderConfig = {
        apiKey: 'cohere-api-key',
        model: 'command',
        maxTokens: 2000
      };

      expect(() => {
        const provider = new CohereProvider({
          logger: {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn()
          } as any,
          config
        });
        expect(provider.name).toBe('cohere');
      }).not.toThrow();
    });

    test('should create Ollama provider with basic configuration', () => {
      const config: LLMProviderConfig = {
        baseUrl: 'http://localhost:11434',
        model: 'llama-2-7b',
        maxTokens: 1000
      };

      expect(() => {
        const provider = new OllamaProvider({
          logger: {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn()
          } as any,
          config
        });
        expect(provider.name).toBe('ollama');
      }).not.toThrow();
    });
  });

  describe('Provider Capabilities', () => {
    test('should expose supported models for Anthropic provider', () => {
      const config: LLMProviderConfig = {
        apiKey: 'sk-ant-test',
        model: 'claude-3-sonnet-20240229'
      };

      const provider = new AnthropicProvider({
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn()
        } as any,
        config
      });

      expect(provider.capabilities).toBeDefined();
      expect(provider.capabilities.supportedModels).toBeDefined();
      expect(provider.capabilities.supportedModels.length).toBeGreaterThan(0);
      
      // Should include Claude 4 models
      expect(provider.capabilities.supportedModels).toContain('claude-sonnet-4-20250514');
      expect(provider.capabilities.supportedModels).toContain('claude-opus-4-20250514');
      
      // Should include Claude 3 models
      expect(provider.capabilities.supportedModels).toContain('claude-3-sonnet-20240229');
      expect(provider.capabilities.supportedModels).toContain('claude-3-haiku-20240307');
    });

    test('should expose context length limits for Anthropic models', () => {
      const config: LLMProviderConfig = {
        apiKey: 'sk-ant-test',
        model: 'claude-3-sonnet-20240229'
      };

      const provider = new AnthropicProvider({
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn()
        } as any,
        config
      });

      expect(provider.capabilities.maxContextLength).toBeDefined();
      
      // Claude 4 models should have enhanced context
      expect(provider.capabilities.maxContextLength['claude-sonnet-4-20250514']).toBe(200000);
      expect(provider.capabilities.maxContextLength['claude-opus-4-20250514']).toBe(200000);
      
      // Claude 3 models should have 200k context
      expect(provider.capabilities.maxContextLength['claude-3-sonnet-20240229']).toBe(200000);
      expect(provider.capabilities.maxContextLength['claude-3-haiku-20240307']).toBe(200000);
    });

    test('should expose supported models for OpenAI provider', () => {
      const config: LLMProviderConfig = {
        apiKey: 'sk-openai-test',
        model: 'gpt-4'
      };

      const provider = new OpenAIProvider({
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn()
        } as any,
        config
      });

      expect(provider.capabilities).toBeDefined();
      expect(provider.capabilities.supportedModels).toBeDefined();
      expect(provider.capabilities.supportedModels.length).toBeGreaterThan(0);
      
      // Should include GPT models
      expect(provider.capabilities.supportedModels).toContain('gpt-4');
      expect(provider.capabilities.supportedModels).toContain('gpt-3.5-turbo');
    });

    test('should expose supported models for Google provider', () => {
      const config: LLMProviderConfig = {
        apiKey: 'google-test',
        model: 'gemini-pro'
      };

      const provider = new GoogleProvider({
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn()
        } as any,
        config
      });

      expect(provider.capabilities).toBeDefined();
      expect(provider.capabilities.supportedModels).toBeDefined();
      expect(provider.capabilities.supportedModels.length).toBeGreaterThan(0);
      
      // Should include Gemini models
      expect(provider.capabilities.supportedModels).toContain('gemini-pro');
    });

    test('should expose supported models for Cohere provider', () => {
      const config: LLMProviderConfig = {
        apiKey: 'cohere-test',
        model: 'command-r-plus'
      };

      const provider = new CohereProvider({
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn()
        } as any,
        config
      });

      expect(provider.capabilities).toBeDefined();
      expect(provider.capabilities.supportedModels).toBeDefined();
      expect(provider.capabilities.supportedModels.length).toBeGreaterThan(0);
      
      // Should include Command models
      expect(provider.capabilities.supportedModels).toContain('command');
    });

    test('should expose supported models for Ollama provider', () => {
      const config: LLMProviderConfig = {
        baseUrl: 'http://localhost:11434',
        model: 'llama2'
      };

      const provider = new OllamaProvider({
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn()
        } as any,
        config
      });

      expect(provider.capabilities).toBeDefined();
      expect(provider.capabilities.supportedModels).toBeDefined();
      expect(provider.capabilities.supportedModels.length).toBeGreaterThan(0);
      
      // Should include Ollama models
      expect(provider.capabilities.supportedModels).toContain('llama-2-7b');
    });
  });

  describe('Provider Event System', () => {
    test('should inherit EventEmitter functionality', () => {
      const config: LLMProviderConfig = {
        apiKey: 'sk-ant-test',
        model: 'claude-3-sonnet-20240229'
      };

      const provider = new AnthropicProvider({
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn()
        } as any,
        config
      });

      // Should have EventEmitter methods
      expect(typeof provider.on).toBe('function');
      expect(typeof provider.emit).toBe('function');
      expect(typeof provider.removeListener).toBe('function');
    });

    test('should emit custom events', (done) => {
      const config: LLMProviderConfig = {
        apiKey: 'sk-ant-test',
        model: 'claude-3-sonnet-20240229'
      };

      const provider = new AnthropicProvider({
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn()
        } as any,
        config
      });

      provider.on('test-event', (data) => {
        expect(data.message).toBe('test message');
        done();
      });

      provider.emit('test-event', { message: 'test message' });
    });
  });

  describe('Provider Configuration Validation', () => {
    test('should handle different model configurations for Anthropic', () => {
      const models = [
        'claude-sonnet-4-20250514',
        'claude-opus-4-20250514', 
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
        'claude-3-opus-20240229'
      ];

      models.forEach(model => {
        const config: LLMProviderConfig = {
          apiKey: 'sk-ant-test',
          model: model as any,
          maxTokens: 1000
        };

        expect(() => {
          const provider = new AnthropicProvider({
            logger: {
              info: jest.fn(),
              error: jest.fn(),
              warn: jest.fn(),
              debug: jest.fn()
            } as any,
            config
          });
          expect(provider.name).toBe('anthropic');
        }).not.toThrow();
      });
    });

    test('should handle different temperature settings', () => {
      const temperatures = [0.0, 0.3, 0.7, 1.0];

      temperatures.forEach(temperature => {
        const config: LLMProviderConfig = {
          apiKey: 'sk-ant-test',
          model: 'claude-3-sonnet-20240229',
          temperature
        };

        expect(() => {
          const provider = new AnthropicProvider({
            logger: {
              info: jest.fn(),
              error: jest.fn(),
              warn: jest.fn(),
              debug: jest.fn()
            } as any,
            config
          });
          expect(provider.name).toBe('anthropic');
        }).not.toThrow();
      });
    });

    test('should handle different maxTokens settings', () => {
      const tokenLimits = [100, 1000, 4000, 8000];

      tokenLimits.forEach(maxTokens => {
        const config: LLMProviderConfig = {
          apiKey: 'sk-ant-test',
          model: 'claude-3-sonnet-20240229',
          maxTokens
        };

        expect(() => {
          const provider = new AnthropicProvider({
            logger: {
              info: jest.fn(),
              error: jest.fn(),
              warn: jest.fn(),
              debug: jest.fn()
            } as any,
            config
          });
          expect(provider.name).toBe('anthropic');
        }).not.toThrow();
      });
    });
  });

  describe('Provider Features and Compatibility', () => {
    test('should support streaming for capable providers', () => {
      const config: LLMProviderConfig = {
        apiKey: 'sk-ant-test',
        model: 'claude-3-sonnet-20240229'
      };

      const provider = new AnthropicProvider({
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn()
        } as any,
        config
      });

      expect(provider.capabilities.supportsStreaming).toBe(true);
    });

    test('should support function calling for capable providers', () => {
      const config: LLMProviderConfig = {
        apiKey: 'sk-openai-test',
        model: 'gpt-4'
      };

      const provider = new OpenAIProvider({
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn()
        } as any,
        config
      });

      expect(provider.capabilities.supportsFunctionCalling).toBe(true);
    });

    test('should support vision capabilities for applicable models', () => {
      const config: LLMProviderConfig = {
        apiKey: 'google-test',
        model: 'gemini-pro-vision'
      };

      const provider = new GoogleProvider({
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn()
        } as any,
        config
      });

      expect(provider.capabilities.supportsVision).toBe(true);
    });
  });

  describe('Error Handling and Robustness', () => {
    test('should handle missing API key gracefully', () => {
      const config: LLMProviderConfig = {
        model: 'claude-3-sonnet-20240229',
        maxTokens: 1000
        // apiKey intentionally missing
      };

      expect(() => {
        const provider = new AnthropicProvider({
          logger: {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn()
          } as any,
          config
        });
        expect(provider.name).toBe('anthropic');
      }).not.toThrow();
    });

    test('should handle invalid model names gracefully', () => {
      const config: LLMProviderConfig = {
        apiKey: 'sk-ant-test',
        model: 'invalid-model-name' as any,
        maxTokens: 1000
      };

      expect(() => {
        const provider = new AnthropicProvider({
          logger: {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn()
          } as any,
          config
        });
        expect(provider.name).toBe('anthropic');
      }).not.toThrow();
    });

    test('should handle edge case configuration values', () => {
      const config: LLMProviderConfig = {
        apiKey: 'sk-ant-test',
        model: 'claude-3-sonnet-20240229',
        maxTokens: 0,
        temperature: -1
      };

      expect(() => {
        const provider = new AnthropicProvider({
          logger: {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn()
          } as any,
          config
        });
        expect(provider.name).toBe('anthropic');
      }).not.toThrow();
    });
  });

  describe('Provider Type Consistency', () => {
    test('should maintain consistent provider names', () => {
      const providers = [
        { 
          provider: AnthropicProvider,
          expectedName: 'anthropic',
          config: { apiKey: 'test', model: 'claude-3-sonnet-20240229' }
        },
        { 
          provider: OpenAIProvider,
          expectedName: 'openai',
          config: { apiKey: 'test', model: 'gpt-4' }
        },
        { 
          provider: GoogleProvider,
          expectedName: 'google',
          config: { apiKey: 'test', model: 'gemini-pro' }
        },
        { 
          provider: CohereProvider,
          expectedName: 'cohere',
          config: { apiKey: 'test', model: 'command' }
        },
        { 
          provider: OllamaProvider,
          expectedName: 'ollama',
          config: { baseUrl: 'http://localhost:11434', model: 'llama-2-7b' }
        }
      ];

      providers.forEach(({ provider: ProviderClass, expectedName, config }) => {
        const provider = new ProviderClass({
          logger: {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn()
          } as any,
          config: config as LLMProviderConfig
        });

        expect(provider.name).toBe(expectedName);
      });
    });

    test('should have consistent capabilities structure', () => {
      const providers = [
        new AnthropicProvider({
          logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() } as any,
          config: { apiKey: 'test', model: 'claude-3-sonnet-20240229' }
        }),
        new OpenAIProvider({
          logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() } as any,
          config: { apiKey: 'test', model: 'gpt-4' }
        }),
        new GoogleProvider({
          logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() } as any,
          config: { apiKey: 'test', model: 'gemini-pro' }
        })
      ];

      providers.forEach(provider => {
        expect(provider.capabilities).toBeDefined();
        expect(provider.capabilities.supportedModels).toBeDefined();
        expect(Array.isArray(provider.capabilities.supportedModels)).toBe(true);
        expect(provider.capabilities.maxContextLength).toBeDefined();
        expect(typeof provider.capabilities.supportsStreaming).toBe('boolean');
        expect(typeof provider.capabilities.supportsFunctionCalling).toBe('boolean');
      });
    });
  });
});