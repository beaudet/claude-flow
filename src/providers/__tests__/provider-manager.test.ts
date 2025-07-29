/**
 * Comprehensive Functional Tests for Provider Manager
 * Tests the core LLM provider coordination and management
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ProviderManager } from '../provider-manager';
import { AnthropicProvider } from '../anthropic-provider';
import { OpenAIProvider } from '../openai-provider';
import type { ProviderConfig, ChatMessage, ChatResponse } from '../types';

// Mock the actual providers to avoid real API calls
jest.mock('../anthropic-provider');
jest.mock('../openai-provider');

describe('ProviderManager Functional Tests', () => {
  let providerManager: ProviderManager;
  let mockAnthropicProvider: jest.Mocked<AnthropicProvider>;
  let mockOpenAIProvider: jest.Mocked<OpenAIProvider>;

  const mockAnthropicConfig: ProviderConfig = {
    apiKey: 'test-anthropic-key',
    model: 'claude-3-sonnet-20240229',
    baseURL: 'https://api.anthropic.com',
    maxTokens: 4000,
    temperature: 0.7
  };

  const mockOpenAIConfig: ProviderConfig = {
    apiKey: 'test-openai-key',
    model: 'gpt-4',
    baseURL: 'https://api.openai.com/v1',
    maxTokens: 4000,
    temperature: 0.7
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mocked provider instances
    mockAnthropicProvider = {
      initialize: jest.fn().mockResolvedValue(undefined),
      chat: jest.fn(),
      streamChat: jest.fn(),
      validateConfig: jest.fn().mockReturnValue(true),
      getModel: jest.fn().mockReturnValue('claude-3-sonnet-20240229'),
      isInitialized: jest.fn().mockReturnValue(true),
      cleanup: jest.fn().mockResolvedValue(undefined)
    } as any;

    mockOpenAIProvider = {
      initialize: jest.fn().mockResolvedValue(undefined),
      chat: jest.fn(),
      streamChat: jest.fn(), 
      validateConfig: jest.fn().mockReturnValue(true),
      getModel: jest.fn().mockReturnValue('gpt-4'),
      isInitialized: jest.fn().mockReturnValue(true),
      cleanup: jest.fn().mockResolvedValue(undefined)
    } as any;

    // Mock provider constructors
    (AnthropicProvider as jest.MockedClass<typeof AnthropicProvider>).mockImplementation(() => mockAnthropicProvider);
    (OpenAIProvider as jest.MockedClass<typeof OpenAIProvider>).mockImplementation(() => mockOpenAIProvider);

    providerManager = new ProviderManager();
  });

  afterEach(async () => {
    await providerManager.cleanup();
  });

  describe('Provider Registration', () => {
    test('should register anthropic provider successfully', async () => {
      await providerManager.registerProvider('anthropic', mockAnthropicConfig);
      
      expect(AnthropicProvider).toHaveBeenCalledWith(mockAnthropicConfig);
      expect(mockAnthropicProvider.initialize).toHaveBeenCalled();
      
      const providers = providerManager.getAvailableProviders();
      expect(providers).toContain('anthropic');
    });

    test('should register openai provider successfully', async () => {
      await providerManager.registerProvider('openai', mockOpenAIConfig);
      
      expect(OpenAIProvider).toHaveBeenCalledWith(mockOpenAIConfig);
      expect(mockOpenAIProvider.initialize).toHaveBeenCalled();
      
      const providers = providerManager.getAvailableProviders();
      expect(providers).toContain('openai');
    });

    test('should register multiple providers', async () => {
      await providerManager.registerProvider('anthropic', mockAnthropicConfig);
      await providerManager.registerProvider('openai', mockOpenAIConfig);
      
      const providers = providerManager.getAvailableProviders();
      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');
      expect(providers).toHaveLength(2);
    });

    test('should handle provider registration failure', async () => {
      mockAnthropicProvider.initialize.mockRejectedValueOnce(new Error('API key invalid'));
      
      await expect(
        providerManager.registerProvider('anthropic', mockAnthropicConfig)
      ).rejects.toThrow('API key invalid');
    });

    test('should throw error for unsupported provider type', async () => {
      await expect(
        providerManager.registerProvider('unsupported' as any, {} as any)
      ).rejects.toThrow('Unsupported provider type: unsupported');
    });
  });

  describe('Provider Selection and Usage', () => {
    beforeEach(async () => {
      await providerManager.registerProvider('anthropic', mockAnthropicConfig);
      await providerManager.registerProvider('openai', mockOpenAIConfig);
    });

    test('should set and get default provider', () => {
      providerManager.setDefaultProvider('anthropic');
      expect(providerManager.getDefaultProvider()).toBe('anthropic');
    });

    test('should use default provider for chat', async () => {
      const mockResponse: ChatResponse = {
        content: 'Test response',
        role: 'assistant',
        metadata: {
          model: 'claude-3-sonnet-20240229',
          tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
        }
      };

      mockAnthropicProvider.chat.mockResolvedValueOnce(mockResponse);
      providerManager.setDefaultProvider('anthropic');

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' }
      ];

      const response = await providerManager.chat(messages);
      
      expect(mockAnthropicProvider.chat).toHaveBeenCalledWith(messages, undefined);
      expect(response).toEqual(mockResponse);
    });

    test('should use specified provider for chat', async () => {
      const mockResponse: ChatResponse = {
        content: 'OpenAI response',
        role: 'assistant', 
        metadata: {
          model: 'gpt-4',
          tokenUsage: { inputTokens: 8, outputTokens: 12, totalTokens: 20 }
        }
      };

      mockOpenAIProvider.chat.mockResolvedValueOnce(mockResponse);

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello OpenAI' }
      ];

      const response = await providerManager.chat(messages, { provider: 'openai' });
      
      expect(mockOpenAIProvider.chat).toHaveBeenCalledWith(messages, { provider: 'openai' });
      expect(response).toEqual(mockResponse);
    });

    test('should handle chat with options', async () => {
      const mockResponse: ChatResponse = {
        content: 'Response with options',
        role: 'assistant',
        metadata: {
          model: 'claude-3-sonnet-20240229',
          tokenUsage: { inputTokens: 15, outputTokens: 8, totalTokens: 23 }
        }
      };

      mockAnthropicProvider.chat.mockResolvedValueOnce(mockResponse);
      providerManager.setDefaultProvider('anthropic');

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Test with options' }
      ];

      const options = {
        temperature: 0.9,
        maxTokens: 2000,
        systemPrompt: 'You are a helpful assistant'
      };

      const response = await providerManager.chat(messages, options);
      
      expect(mockAnthropicProvider.chat).toHaveBeenCalledWith(messages, options);
      expect(response).toEqual(mockResponse);
    });

    test('should throw error when no providers registered', async () => {
      const emptyManager = new ProviderManager();
      
      await expect(
        emptyManager.chat([{ role: 'user', content: 'Hello' }])
      ).rejects.toThrow('No providers registered');
    });

    test('should throw error for unregistered provider', async () => {
      await expect(
        providerManager.chat(
          [{ role: 'user', content: 'Hello' }], 
          { provider: 'unregistered' as any }
        )
      ).rejects.toThrow('Provider unregistered not found');
    });
  });

  describe('Streaming Chat', () => {
    beforeEach(async () => {
      await providerManager.registerProvider('anthropic', mockAnthropicConfig);
    });

    test('should handle streaming chat', async () => {
      const mockStreamData = [
        { content: 'Hello', role: 'assistant' as const, metadata: { model: 'claude-3-sonnet-20240229' } },
        { content: ' world', role: 'assistant' as const, metadata: { model: 'claude-3-sonnet-20240229' } },
        { content: '!', role: 'assistant' as const, metadata: { model: 'claude-3-sonnet-20240229' } }
      ];

      const mockAsyncIterator = {
        async* [Symbol.asyncIterator]() {
          for (const chunk of mockStreamData) {
            yield chunk;
          }
        }
      };

      mockAnthropicProvider.streamChat.mockResolvedValueOnce(mockAsyncIterator as any);
      providerManager.setDefaultProvider('anthropic');

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Stream test' }
      ];

      const stream = await providerManager.streamChat(messages);
      const chunks = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(mockStreamData);
      expect(mockAnthropicProvider.streamChat).toHaveBeenCalledWith(messages, undefined);
    });

    test('should handle streaming with specified provider', async () => {
      await providerManager.registerProvider('openai', mockOpenAIConfig);

      const mockStreamData = [
        { content: 'OpenAI', role: 'assistant' as const, metadata: { model: 'gpt-4' } },
        { content: ' streaming', role: 'assistant' as const, metadata: { model: 'gpt-4' } }
      ];

      const mockAsyncIterator = {
        async* [Symbol.asyncIterator]() {
          for (const chunk of mockStreamData) {
            yield chunk;
          }
        }
      };

      mockOpenAIProvider.streamChat.mockResolvedValueOnce(mockAsyncIterator as any);

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Stream with OpenAI' }
      ];

      const stream = await providerManager.streamChat(messages, { provider: 'openai' });
      const chunks = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(mockStreamData);
      expect(mockOpenAIProvider.streamChat).toHaveBeenCalledWith(messages, { provider: 'openai' });
    });
  });

  describe('Provider Management Operations', () => {
    test('should get provider info', async () => {
      await providerManager.registerProvider('anthropic', mockAnthropicConfig);
      
      const info = providerManager.getProviderInfo('anthropic');
      
      expect(info).toEqual({
        name: 'anthropic',
        model: 'claude-3-sonnet-20240229',
        isInitialized: true
      });
    });

    test('should return null for non-existent provider info', () => {
      const info = providerManager.getProviderInfo('nonexistent');
      expect(info).toBeNull();
    });

    test('should unregister provider', async () => {
      await providerManager.registerProvider('anthropic', mockAnthropicConfig);
      expect(providerManager.getAvailableProviders()).toContain('anthropic');
      
      await providerManager.unregisterProvider('anthropic');
      
      expect(providerManager.getAvailableProviders()).not.toContain('anthropic');
      expect(mockAnthropicProvider.cleanup).toHaveBeenCalled();
    });

    test('should handle unregister of non-existent provider', async () => {
      await expect(
        providerManager.unregisterProvider('nonexistent')
      ).rejects.toThrow('Provider nonexistent not found');
    });

    test('should cleanup all providers', async () => {
      await providerManager.registerProvider('anthropic', mockAnthropicConfig);
      await providerManager.registerProvider('openai', mockOpenAIConfig);
      
      await providerManager.cleanup();
      
      expect(mockAnthropicProvider.cleanup).toHaveBeenCalled();
      expect(mockOpenAIProvider.cleanup).toHaveBeenCalled();
      expect(providerManager.getAvailableProviders()).toHaveLength(0);
    });
  });

  describe('Error Handling and Resilience', () => {
    beforeEach(async () => {
      await providerManager.registerProvider('anthropic', mockAnthropicConfig);
    });

    test('should handle provider chat errors gracefully', async () => {
      mockAnthropicProvider.chat.mockRejectedValueOnce(new Error('API rate limit exceeded'));
      
      const messages: ChatMessage[] = [
        { role: 'user', content: 'This will fail' }
      ];

      await expect(
        providerManager.chat(messages)
      ).rejects.toThrow('API rate limit exceeded');
    });

    test('should handle provider streaming errors', async () => {
      mockAnthropicProvider.streamChat.mockRejectedValueOnce(new Error('Streaming failed'));
      
      const messages: ChatMessage[] = [
        { role: 'user', content: 'This stream will fail' }
      ];

      await expect(
        providerManager.streamChat(messages)
      ).rejects.toThrow('Streaming failed');
    });

    test('should maintain provider state after error', async () => {
      mockAnthropicProvider.chat.mockRejectedValueOnce(new Error('Temporary error'));
      
      const messages: ChatMessage[] = [
        { role: 'user', content: 'First call fails' }
      ];

      await expect(providerManager.chat(messages)).rejects.toThrow('Temporary error');
      
      // Provider should still be available
      expect(providerManager.getAvailableProviders()).toContain('anthropic');
      
      // Subsequent calls should work
      const mockResponse: ChatResponse = {
        content: 'Recovery successful',
        role: 'assistant',
        metadata: { model: 'claude-3-sonnet-20240229' }
      };
      
      mockAnthropicProvider.chat.mockResolvedValueOnce(mockResponse);
      
      const response = await providerManager.chat(messages);
      expect(response.content).toBe('Recovery successful');
    });
  });

  describe('Configuration Management', () => {
    test('should validate provider config before registration', async () => {
      mockAnthropicProvider.validateConfig.mockReturnValueOnce(false);
      
      await expect(
        providerManager.registerProvider('anthropic', mockAnthropicConfig)
      ).rejects.toThrow('Invalid configuration for provider anthropic');
    });

    test('should handle provider re-registration with new config', async () => {
      await providerManager.registerProvider('anthropic', mockAnthropicConfig);
      
      const newConfig: ProviderConfig = {
        ...mockAnthropicConfig,
        model: 'claude-3-opus-20240229',
        temperature: 0.5
      };

      // Re-register should cleanup old provider and create new one
      await providerManager.registerProvider('anthropic', newConfig);
      
      expect(mockAnthropicProvider.cleanup).toHaveBeenCalled();
      expect(AnthropicProvider).toHaveBeenCalledWith(newConfig);
    });
  });
});