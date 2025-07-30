/**
 * Hooks System Functional Tests
 * 
 * Comprehensive functional testing for the agentic-flow hooks system
 * covering hook registration, execution, workflows, and automation.
 */

import { EventEmitter } from 'events';
import { jest } from '@jest/globals';
import type {
  AgenticHookContext,
  AgenticHookType,
  HookFilter,
  HookHandler,
  HookHandlerResult,
  HookOptions,
  HookPayload,
  HookPipeline,
  HookRegistration,
  HookRegistry,
  Pattern,
  SideEffect,
  WorkflowDecision,
  Learning,
} from '../types.js';

// ===== Mock Hook Registry =====

interface MockHookRegistration extends HookRegistration {
  id: string;
  type: AgenticHookType;
  handler: HookHandler;
  priority: number;
  filter?: HookFilter;
  options?: HookOptions;
}

class MockHookRegistry extends EventEmitter implements HookRegistry {
  private hooks: Map<AgenticHookType, MockHookRegistration[]> = new Map();
  private pipelines: Map<string, HookPipeline> = new Map();
  private metrics: Map<string, number> = new Map();
  private executionHistory: Array<{
    type: AgenticHookType;
    payload: HookPayload;
    result: HookHandlerResult[];
    timestamp: number;
  }> = [];

  constructor() {
    super();
    this.initializeMetrics();
  }

  register(registration: HookRegistration): void {
    const { type, id } = registration;
    
    if (!this.hooks.has(type)) {
      this.hooks.set(type, []);
    }
    
    const hookList = this.hooks.get(type)!;
    
    // Check for duplicate ID
    if (hookList.some(h => h.id === id)) {
      throw new Error(`Hook with ID '${id}' already registered for type '${type}'`);
    }
    
    // Insert hook sorted by priority (higher priority first)
    const insertIndex = hookList.findIndex(h => h.priority < registration.priority);
    if (insertIndex === -1) {
      hookList.push(registration as MockHookRegistration);
    } else {
      hookList.splice(insertIndex, 0, registration as MockHookRegistration);
    }
    
    this.emit('hook:registered', { type, registration });
    this.updateMetric('hooks.registered', 1);
  }

  unregister(id: string): void {
    let found = false;
    
    for (const [type, hookList] of this.hooks.entries()) {
      const index = hookList.findIndex(h => h.id === id);
      if (index !== -1) {
        hookList.splice(index, 1);
        found = true;
        
        this.emit('hook:unregistered', { type, id });
        
        if (hookList.length === 0) {
          this.hooks.delete(type);
        }
        
        break;
      }
    }
    
    if (!found) {
      throw new Error(`Hook with ID '${id}' not found`);
    }
    
    this.updateMetric('hooks.unregistered', 1);
  }

  getHooks(type: AgenticHookType, filter?: HookFilter): HookRegistration[] {
    const hookList = this.hooks.get(type) || [];
    
    if (!filter) {
      return [...hookList];
    }
    
    return hookList.filter(hook => this.matchesFilter(hook, filter));
  }

  async executeHooks(
    type: AgenticHookType,
    payload: HookPayload,
    context: AgenticHookContext
  ): Promise<HookHandlerResult[]> {
    const startTime = Date.now();
    const results: HookHandlerResult[] = [];
    
    // Get applicable hooks with payload-based filtering
    const filter = this.createFilterFromPayload(payload);
    const hooks = this.getHooks(type, filter);
    
    this.emit('hooks:executing', { type, count: hooks.length });
    
    // Execute hooks in order
    let modifiedPayload = payload;
    for (const hook of hooks) {
      try {
        const result = await hook.handler(modifiedPayload, context);
        results.push(result);
        
        // Handle side effects
        if (result.sideEffects) {
          await this.processSideEffects(result.sideEffects, context);
        }
        
        // Update payload if modified
        if (result.modified && result.payload) {
          modifiedPayload = result.payload;
        }
        
        // Check if we should continue
        if (!result.continue) {
          break;
        }
      } catch (error) {
        this.handleHookError(hook, error as Error);
        
        // Use fallback if provided
        if (hook.options?.fallback) {
          const fallbackResult = await hook.options.fallback(modifiedPayload, context);
          results.push(fallbackResult);
        } else {
          throw error;
        }
      }
    }
    
    // Update metrics
    const duration = Date.now() - startTime;
    this.updateMetric('hooks.executions', 1);
    this.updateMetric('hooks.totalDuration', duration);
    
    // Store execution history
    this.executionHistory.push({
      type,
      payload,
      result: results,
      timestamp: Date.now(),
    });
    
    this.emit('hooks:executed', { type, results, duration });
    
    return results;
  }

  createPipeline(config: Partial<HookPipeline>): HookPipeline {
    const pipeline: HookPipeline = {
      id: config.id || this.generatePipelineId(),
      name: config.name || 'Unnamed Pipeline',
      stages: config.stages || [],
      errorStrategy: config.errorStrategy || 'fail-fast',
      metrics: {
        executions: 0,
        avgDuration: 0,
        errorRate: 0,
        throughput: 0,
      },
    };
    
    this.pipelines.set(pipeline.id, pipeline);
    return pipeline;
  }

  getMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {};
    
    for (const [key, value] of this.metrics.entries()) {
      metrics[key] = value;
    }
    
    // Add computed metrics
    metrics['hooks.count'] = this.getTotalHookCount();
    metrics['hooks.types'] = Array.from(this.hooks.keys());
    metrics['pipelines.count'] = this.pipelines.size;
    metrics['executions.history'] = this.executionHistory.length;
    
    return metrics;
  }

  // Test helper methods
  getExecutionHistory() {
    return this.executionHistory;
  }

  clearHistory() {
    this.executionHistory = [];
  }

  simulateHookError(hookId: string) {
    // Find and mark hook to throw error on next execution
    for (const hookList of this.hooks.values()) {
      const hook = hookList.find(h => h.id === hookId);
      if (hook) {
        const originalHandler = hook.handler;
        hook.handler = async () => {
          throw new Error(`Simulated error for hook ${hookId}`);
        };
        // Restore after one execution
        setTimeout(() => {
          hook.handler = originalHandler;
        }, 100);
        break;
      }
    }
  }

  private matchesFilter(hook: MockHookRegistration, filter: HookFilter): boolean {
    if (!hook.filter) {
      return true;
    }
    
    // Check providers
    if (filter.providers && hook.filter.providers) {
      const hasProvider = filter.providers.some(p => 
        hook.filter!.providers!.includes(p)
      );
      if (!hasProvider) return false;
    }
    
    // Check models
    if (filter.models && hook.filter.models) {
      const hasModel = filter.models.some(m => 
        hook.filter!.models!.includes(m)
      );
      if (!hasModel) return false;
    }
    
    // Check operations
    if (filter.operations && hook.filter.operations) {
      const hasOperation = filter.operations.some(o => 
        hook.filter!.operations!.includes(o)
      );
      if (!hasOperation) return false;
    }
    
    return true;
  }

  private async processSideEffects(
    sideEffects: SideEffect[],
    context: AgenticHookContext
  ): Promise<void> {
    for (const effect of sideEffects) {
      this.emit('sideEffect', { type: effect.type, action: effect.action, data: effect.data });
      
      switch (effect.type) {
        case 'memory':
          this.processMemorySideEffect(effect, context);
          break;
        case 'neural':
          this.processNeuralSideEffect(effect);
          break;
        case 'metric':
          this.processMetricSideEffect(effect);
          break;
        case 'notification':
          this.emit('notification', effect.data);
          break;
        case 'log':
          this.emit('log', effect.data);
          break;
      }
    }
  }

  private processMemorySideEffect(effect: SideEffect, context: AgenticHookContext): void {
    if (effect.action === 'store') {
      context.memory.cache.set(effect.data.key, effect.data.value);
    } else if (effect.action === 'retrieve') {
      context.memory.cache.get(effect.data.key);
    }
  }

  private processNeuralSideEffect(effect: SideEffect): void {
    this.emit('neural:action', { action: effect.action, data: effect.data });
  }

  private processMetricSideEffect(effect: SideEffect): void {
    if (effect.action === 'update') {
      this.updateMetric(effect.data.name, effect.data.value);
    } else if (effect.action === 'increment') {
      this.updateMetric(effect.data.name, 1);
    }
  }

  private handleHookError(hook: MockHookRegistration, error: Error): void {
    this.updateMetric('hooks.errors', 1);
    this.updateMetric(`hooks.${hook.id}.errors`, 1);
    
    this.emit('hook:error', {
      hookId: hook.id,
      type: hook.type,
      error,
    });
  }

  private getTotalHookCount(): number {
    let count = 0;
    for (const hookList of this.hooks.values()) {
      count += hookList.length;
    }
    return count;
  }

  private initializeMetrics(): void {
    this.metrics.set('hooks.registered', 0);
    this.metrics.set('hooks.unregistered', 0);
    this.metrics.set('hooks.executions', 0);
    this.metrics.set('hooks.errors', 0);
    this.metrics.set('hooks.totalDuration', 0);
  }

  private updateMetric(key: string, value: number): void {
    const current = this.metrics.get(key) || 0;
    this.metrics.set(key, current + value);
  }

  private generatePipelineId(): string {
    return `pipe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private createFilterFromPayload(payload: HookPayload): HookFilter | undefined {
    const filter: HookFilter = {};
    
    // Extract filter criteria from payload
    if ('provider' in payload) {
      filter.providers = [payload.provider];
    }
    
    if ('model' in payload) {
      filter.models = [payload.model];
    }
    
    if ('operation' in payload) {
      filter.operations = [payload.operation];
    }
    
    if ('namespace' in payload) {
      filter.namespaces = [payload.namespace];
    }
    
    return Object.keys(filter).length > 0 ? filter : undefined;
  }
}

// ===== Mock Context and Helpers =====

function createMockContext(): AgenticHookContext {
  return {
    sessionId: `session_${Date.now()}`,
    timestamp: Date.now(),
    correlationId: `corr_${Math.random().toString(36).substr(2, 9)}`,
    metadata: {},
    memory: {
      namespace: 'test',
      provider: 'mock',
      cache: new Map(),
    },
    neural: {
      modelId: 'test-model',
      patterns: {
        add: jest.fn(),
        get: jest.fn(),
        findSimilar: jest.fn(() => []),
        getByType: jest.fn(() => []),
        prune: jest.fn(),
        export: jest.fn(() => []),
        import: jest.fn(),
      },
      training: {
        epoch: 0,
        loss: 0,
        accuracy: 0,
        learningRate: 0.001,
        optimizer: 'adam',
        checkpoints: [],
      },
    },
    performance: {
      metrics: new Map(),
      bottlenecks: [],
      optimizations: [],
    },
  };
}

// ===== Test Suite =====

describe('Hooks System Functional Tests', () => {
  let hookRegistry: MockHookRegistry;
  let mockContext: AgenticHookContext;

  beforeEach(() => {
    hookRegistry = new MockHookRegistry();
    mockContext = createMockContext();
  });

  afterEach(() => {
    hookRegistry.removeAllListeners();
  });

  // ===== Hook Registration and Management =====

  describe('Hook Registration and Management', () => {
    test('should register hooks successfully', () => {
      const hook: HookRegistration = {
        id: 'test-hook',
        type: 'pre-llm-call',
        handler: async () => ({ continue: true }),
        priority: 100,
      };

      const registrationPromise = new Promise((resolve) => {
        hookRegistry.once('hook:registered', resolve);
      });

      hookRegistry.register(hook);

      expect(registrationPromise).resolves.toEqual({
        type: 'pre-llm-call',
        registration: expect.objectContaining({ id: 'test-hook' }),
      });

      const registeredHooks = hookRegistry.getHooks('pre-llm-call');
      expect(registeredHooks).toHaveLength(1);
      expect(registeredHooks[0].id).toBe('test-hook');
    });

    test('should prevent duplicate hook registration', () => {
      const hook: HookRegistration = {
        id: 'duplicate-hook',
        type: 'post-llm-call',
        handler: async () => ({ continue: true }),
        priority: 100,
      };

      hookRegistry.register(hook);

      expect(() => {
        hookRegistry.register(hook);
      }).toThrow("Hook with ID 'duplicate-hook' already registered");
    });

    test('should unregister hooks successfully', () => {
      const hook: HookRegistration = {
        id: 'removable-hook',
        type: 'llm-error',
        handler: async () => ({ continue: true }),
        priority: 100,
      };

      hookRegistry.register(hook);
      expect(hookRegistry.getHooks('llm-error')).toHaveLength(1);

      const unregistrationPromise = new Promise((resolve) => {
        hookRegistry.once('hook:unregistered', resolve);
      });

      hookRegistry.unregister('removable-hook');

      expect(unregistrationPromise).resolves.toEqual({
        type: 'llm-error',
        id: 'removable-hook',
      });

      expect(hookRegistry.getHooks('llm-error')).toHaveLength(0);
    });

    test('should handle hook registration with priorities', () => {
      const highPriorityHook: HookRegistration = {
        id: 'high-priority',
        type: 'pre-memory-store',
        handler: async () => ({ continue: true }),
        priority: 200,
      };

      const lowPriorityHook: HookRegistration = {
        id: 'low-priority',
        type: 'pre-memory-store',
        handler: async () => ({ continue: true }),
        priority: 50,
      };

      const mediumPriorityHook: HookRegistration = {
        id: 'medium-priority',
        type: 'pre-memory-store',
        handler: async () => ({ continue: true }),
        priority: 100,
      };

      // Register in random order
      hookRegistry.register(lowPriorityHook);
      hookRegistry.register(highPriorityHook);
      hookRegistry.register(mediumPriorityHook);

      const hooks = hookRegistry.getHooks('pre-memory-store');
      expect(hooks.map(h => h.id)).toEqual([
        'high-priority',
        'medium-priority',
        'low-priority',
      ]);
    });

    test('should filter hooks by criteria', () => {
      const openaiHook: HookRegistration = {
        id: 'openai-hook',
        type: 'pre-llm-call',
        handler: async () => ({ continue: true }),
        priority: 100,
        filter: { providers: ['openai'] },
      };

      const anthropicHook: HookRegistration = {
        id: 'anthropic-hook',
        type: 'pre-llm-call',
        handler: async () => ({ continue: true }),
        priority: 100,
        filter: { providers: ['anthropic'] },
      };

      hookRegistry.register(openaiHook);
      hookRegistry.register(anthropicHook);

      const openaiHooks = hookRegistry.getHooks('pre-llm-call', { providers: ['openai'] });
      expect(openaiHooks).toHaveLength(1);
      expect(openaiHooks[0].id).toBe('openai-hook');

      const anthropicHooks = hookRegistry.getHooks('pre-llm-call', { providers: ['anthropic'] });
      expect(anthropicHooks).toHaveLength(1);
      expect(anthropicHooks[0].id).toBe('anthropic-hook');
    });
  });

  // ===== Hook Execution =====

  describe('Hook Execution', () => {
    test('should execute hooks in priority order', async () => {
      const executionOrder: string[] = [];

      const hook1: HookRegistration = {
        id: 'hook-1',
        type: 'workflow-start',
        handler: async () => {
          executionOrder.push('hook-1');
          return { continue: true };
        },
        priority: 100,
      };

      const hook2: HookRegistration = {
        id: 'hook-2',
        type: 'workflow-start',
        handler: async () => {
          executionOrder.push('hook-2');
          return { continue: true };
        },
        priority: 200,
      };

      const hook3: HookRegistration = {
        id: 'hook-3',
        type: 'workflow-start',
        handler: async () => {
          executionOrder.push('hook-3');
          return { continue: true };
        },
        priority: 150,
      };

      hookRegistry.register(hook1);
      hookRegistry.register(hook2);
      hookRegistry.register(hook3);

      const payload = {
        workflowId: 'test-workflow',
        state: { initialized: true },
      };

      await hookRegistry.executeHooks('workflow-start', payload, mockContext);

      expect(executionOrder).toEqual(['hook-2', 'hook-3', 'hook-1']);
    });

    test('should handle payload modification between hooks', async () => {
      const modifyingHook: HookRegistration = {
        id: 'modifying-hook',
        type: 'workflow-step',
        handler: async (payload) => ({
          continue: true,
          modified: true,
          payload: {
            ...payload,
            modified: true,
            step: 'enhanced-step',
          },
        }),
        priority: 200,
      };

      const readingHook: HookRegistration = {
        id: 'reading-hook',
        type: 'workflow-step',
        handler: async (payload) => {
          expect(payload).toHaveProperty('modified', true);
          expect((payload as any).step).toBe('enhanced-step');
          return { continue: true };
        },
        priority: 100,
      };

      hookRegistry.register(modifyingHook);
      hookRegistry.register(readingHook);

      const payload = {
        workflowId: 'test-workflow',
        step: 'original-step',
        state: {},
      };

      await hookRegistry.executeHooks('workflow-step', payload, mockContext);
    });

    test('should stop execution when continue is false', async () => {
      const executionOrder: string[] = [];

      const stoppingHook: HookRegistration = {
        id: 'stopping-hook',
        type: 'workflow-decision',
        handler: async () => {
          executionOrder.push('stopping-hook');
          return { continue: false };
        },
        priority: 200,
      };

      const skippedHook: HookRegistration = {
        id: 'skipped-hook',
        type: 'workflow-decision',
        handler: async () => {
          executionOrder.push('skipped-hook');
          return { continue: true };
        },
        priority: 100,
      };

      hookRegistry.register(stoppingHook);
      hookRegistry.register(skippedHook);

      const payload = {
        workflowId: 'test-workflow',
        decision: {
          point: 'test-decision',
          options: ['A', 'B'],
          selected: 'A',
          confidence: 0.8,
          reasoning: 'Test decision',
          learnings: [],
        } as WorkflowDecision,
        state: {},
      };

      await hookRegistry.executeHooks('workflow-decision', payload, mockContext);

      expect(executionOrder).toEqual(['stopping-hook']);
    });

    test('should process side effects correctly', async () => {
      const sideEffects: SideEffect[] = [
        {
          type: 'memory',
          action: 'store',
          data: { key: 'test-key', value: 'test-value' },
        },
        {
          type: 'metric',
          action: 'increment',
          data: { name: 'test.counter' },
        },
        {
          type: 'notification',
          action: 'emit',
          data: { event: 'test', message: 'Test notification' },
        },
      ];

      const sideEffectHook: HookRegistration = {
        id: 'side-effect-hook',
        type: 'workflow-complete',
        handler: async () => ({
          continue: true,
          sideEffects,
        }),
        priority: 100,
      };

      hookRegistry.register(sideEffectHook);

      const sideEffectPromise = new Promise((resolve) => {
        const effects: any[] = [];
        hookRegistry.on('sideEffect', (effect) => {
          effects.push(effect);
          if (effects.length === 3) resolve(effects);
        });
      });

      const notificationPromise = new Promise((resolve) => {
        hookRegistry.once('notification', resolve);
      });

      const payload = {
        workflowId: 'test-workflow',
        state: { completed: true },
        metrics: { duration: 1000 },
      };

      await hookRegistry.executeHooks('workflow-complete', payload, mockContext);

      const processedEffects = await sideEffectPromise;
      expect(processedEffects).toHaveLength(3);

      const notification = await notificationPromise;
      expect(notification).toEqual({ event: 'test', message: 'Test notification' });

      // Verify memory side effect
      expect(mockContext.memory.cache.get('test-key')).toBe('test-value');

      // Verify metric side effect
      const metrics = hookRegistry.getMetrics();
      expect(metrics['test.counter']).toBe(1);
    });
  });

  // ===== Error Handling and Recovery =====

  describe('Error Handling and Recovery', () => {
    test('should handle hook execution errors gracefully', async () => {
      const failingHook: HookRegistration = {
        id: 'failing-hook',
        type: 'llm-error',
        handler: async () => {
          throw new Error('Hook execution failed');
        },
        priority: 100,
      };

      hookRegistry.register(failingHook);

      const errorPromise = new Promise((resolve) => {
        hookRegistry.once('hook:error', resolve);
      });

      const payload = {
        provider: 'openai',
        model: 'gpt-4',
        operation: 'completion' as const,
        request: { messages: [] },
        error: new Error('LLM call failed'),
      };

      await expect(
        hookRegistry.executeHooks('llm-error', payload, mockContext)
      ).rejects.toThrow('Hook execution failed');

      const error = await errorPromise;
      expect(error).toMatchObject({
        hookId: 'failing-hook',
        type: 'llm-error',
        error: expect.any(Error),
      });

      const metrics = hookRegistry.getMetrics();
      expect(metrics['hooks.errors']).toBe(1);
    });

    test('should use fallback handler when hook fails', async () => {
      let fallbackCalled = false;

      const failingHook: HookRegistration = {
        id: 'failing-with-fallback',
        type: 'pre-neural-train',
        handler: async () => {
          throw new Error('Primary handler failed');
        },
        priority: 100,
        options: {
          fallback: async () => {
            fallbackCalled = true;
            return { continue: true, metadata: { fallbackUsed: true } };
          },
        },
      };

      hookRegistry.register(failingHook);

      const payload = {
        operation: 'train' as const,
        modelId: 'test-model',
        patterns: [],
      };

      const results = await hookRegistry.executeHooks('pre-neural-train', payload, mockContext);

      expect(fallbackCalled).toBe(true);
      expect(results).toHaveLength(1);
      expect(results[0].metadata).toEqual({ fallbackUsed: true });
    });
  });

  // ===== LLM Hooks =====

  describe('LLM Hooks', () => {
    test('should execute pre-LLM call hooks with proper payload', async () => {
      let receivedPayload: any;

      const preLLMHook: HookRegistration = {
        id: 'pre-llm-test',
        type: 'pre-llm-call',
        handler: async (payload) => {
          receivedPayload = payload;
          return { continue: true };
        },
        priority: 100,
      };

      hookRegistry.register(preLLMHook);

      const payload = {
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        operation: 'completion' as const,
        request: {
          messages: [
            { role: 'user' as const, content: 'Hello, world!' },
          ],
          temperature: 0.7,
          maxTokens: 1000,
        },
      };

      await hookRegistry.executeHooks('pre-llm-call', payload, mockContext);

      expect(receivedPayload).toEqual(payload);
    });

    test('should execute post-LLM call hooks with response data', async () => {
      let receivedPayload: any;

      const postLLMHook: HookRegistration = {
        id: 'post-llm-test',
        type: 'post-llm-call',
        handler: async (payload) => {
          receivedPayload = payload;
          return { continue: true };
        },
        priority: 100,
      };

      hookRegistry.register(postLLMHook);

      const payload = {
        provider: 'openai',
        model: 'gpt-4',
        operation: 'completion' as const,
        request: {
          messages: [{ role: 'user' as const, content: 'Test' }],
        },
        response: {
          id: 'resp-123',
          choices: [{
            message: {
              role: 'assistant',
              content: 'Test response',
            },
            finishReason: 'stop',
            index: 0,
          }],
          usage: {
            promptTokens: 10,
            completionTokens: 20,
            totalTokens: 30,
          },
          model: 'gpt-4',
          created: Date.now(),
        },
        metrics: {
          latency: 1500,
          tokensPerSecond: 20,
          costEstimate: 0.03,
          cacheHit: false,
          retryCount: 0,
          providerHealth: 0.95,
        },
      };

      await hookRegistry.executeHooks('post-llm-call', payload, mockContext);

      expect(receivedPayload).toEqual(payload);
      expect(receivedPayload.response.choices[0].message.content).toBe('Test response');
    });

    test('should filter LLM hooks by provider', async () => {
      const executionOrder: string[] = [];

      const openaiHook: HookRegistration = {
        id: 'openai-specific',
        type: 'pre-llm-call',
        handler: async () => {
          executionOrder.push('openai');
          return { continue: true };
        },
        priority: 100,
        filter: { providers: ['openai'] },
      };

      const anthropicHook: HookRegistration = {
        id: 'anthropic-specific',
        type: 'pre-llm-call',
        handler: async () => {
          executionOrder.push('anthropic');
          return { continue: true };
        },
        priority: 100,
        filter: { providers: ['anthropic'] },
      };

      hookRegistry.register(openaiHook);
      hookRegistry.register(anthropicHook);

      const openaiPayload = {
        provider: 'openai',
        model: 'gpt-4',
        operation: 'completion' as const,
        request: { messages: [] },
      };

      await hookRegistry.executeHooks('pre-llm-call', openaiPayload, mockContext);

      expect(executionOrder).toEqual(['openai']);
    });
  });

  // ===== Memory Hooks =====

  describe('Memory Hooks', () => {
    test('should execute memory store hooks', async () => {
      let storePayload: any;

      const memoryStoreHook: HookRegistration = {
        id: 'memory-store-test',
        type: 'pre-memory-store',
        handler: async (payload) => {
          storePayload = payload;
          return { continue: true };
        },
        priority: 100,
      };

      hookRegistry.register(memoryStoreHook);

      const payload = {
        operation: 'store' as const,
        namespace: 'workflow-data',
        key: 'session-123',
        value: { data: 'test-data', timestamp: Date.now() },
        ttl: 3600,
        provider: 'sqlite',
        crossProvider: false,
      };

      await hookRegistry.executeHooks('pre-memory-store', payload, mockContext);

      expect(storePayload).toEqual(payload);
    });

    test('should execute memory retrieve hooks', async () => {
      const retrieveHook: HookRegistration = {
        id: 'memory-retrieve-test',
        type: 'post-memory-retrieve',
        handler: async (payload) => {
          return {
            continue: true,
            sideEffects: [{
              type: 'metric',
              action: 'increment',
              data: { name: 'memory.retrieval.count' },
            }],
          };
        },
        priority: 100,
      };

      hookRegistry.register(retrieveHook);

      const payload = {
        operation: 'retrieve' as const,
        namespace: 'agent-memory',
        key: 'conversation-history',
        provider: 'markdown',
      };

      await hookRegistry.executeHooks('post-memory-retrieve', payload, mockContext);

      const metrics = hookRegistry.getMetrics();
      expect(metrics['memory.retrieval.count']).toBe(1);
    });
  });

  // ===== Workflow Hooks =====

  describe('Workflow Hooks', () => {
    test('should execute complete workflow lifecycle', async () => {
      const workflowEvents: string[] = [];

      // Workflow start hook
      const startHook: HookRegistration = {
        id: 'workflow-start',
        type: 'workflow-start',
        handler: async (payload) => {
          workflowEvents.push('start');
          return {
            continue: true,
            modified: true,
            payload: {
              ...payload,
              state: {
                ...(payload as any).state,
                enhanced: true,
              },
            },
          };
        },
        priority: 100,
      };

      // Workflow step hook
      const stepHook: HookRegistration = {
        id: 'workflow-step',
        type: 'workflow-step',
        handler: async () => {
          workflowEvents.push('step');
          return { continue: true };
        },
        priority: 100,
      };

      // Workflow decision hook
      const decisionHook: HookRegistration = {
        id: 'workflow-decision',
        type: 'workflow-decision',
        handler: async (payload) => {
          workflowEvents.push('decision');
          const decision = (payload as any).decision;
          return {
            continue: true,
            modified: true,
            payload: {
              ...payload,
              decision: {
                ...decision,
                confidence: Math.min(decision.confidence * 1.1, 1.0),
              },
            },
          };
        },
        priority: 100,
      };

      // Workflow complete hook
      const completeHook: HookRegistration = {
        id: 'workflow-complete',
        type: 'workflow-complete',
        handler: async () => {
          workflowEvents.push('complete');
          return {
            continue: true,
            sideEffects: [{
              type: 'memory',
              action: 'store',
              data: {
                key: 'workflow-result',
                value: { success: true, completedAt: Date.now() },
              },
            }],
          };
        },
        priority: 100,
      };

      hookRegistry.register(startHook);
      hookRegistry.register(stepHook);
      hookRegistry.register(decisionHook);
      hookRegistry.register(completeHook);

      // Execute workflow lifecycle
      const workflowId = 'test-workflow-123';

      // Start
      await hookRegistry.executeHooks('workflow-start', {
        workflowId,
        state: { initialized: false },
      }, mockContext);

      // Step
      await hookRegistry.executeHooks('workflow-step', {
        workflowId,
        step: 'process-data',
        state: { enhanced: true },
      }, mockContext);

      // Decision
      const decision: WorkflowDecision = {
        point: 'data-processing',
        options: ['fast', 'accurate'],
        selected: 'accurate',
        confidence: 0.7,
        reasoning: 'Data quality is more important',
        learnings: [],
      };

      await hookRegistry.executeHooks('workflow-decision', {
        workflowId,
        decision,
        state: { enhanced: true },
      }, mockContext);

      // Complete
      await hookRegistry.executeHooks('workflow-complete', {
        workflowId,
        state: { enhanced: true, completed: true },
        metrics: { duration: 5000, steps: 3, decisions: 1 },
      }, mockContext);

      expect(workflowEvents).toEqual(['start', 'step', 'decision', 'complete']);

      // Verify workflow result was stored
      expect(mockContext.memory.cache.get('workflow-result')).toMatchObject({
        success: true,
        completedAt: expect.any(Number),
      });
    });

    test('should handle workflow errors with recovery', async () => {
      const errorHook: HookRegistration = {
        id: 'workflow-error-handler',
        type: 'workflow-error',
        handler: async (payload) => {
          const error = (payload as any).error;
          
          if (error.message.includes('timeout')) {
            return {
              continue: true,
              modified: true,
              payload: {
                ...payload,
                state: {
                  ...(payload as any).state,
                  retryConfig: { maxRetries: 3, backoff: 'exponential' },
                  shouldRetry: true,
                },
                error: undefined, // Clear error after recovery
              },
              sideEffects: [{
                type: 'log',
                action: 'write',
                data: {
                  level: 'info',
                  message: 'Applied timeout recovery strategy',
                },
              }],
            };
          }
          
          return { continue: true };
        },
        priority: 100,
      };

      hookRegistry.register(errorHook);

      const logPromise = new Promise((resolve) => {
        hookRegistry.once('log', resolve);
      });

      const payload = {
        workflowId: 'error-workflow',
        error: new Error('Request timeout after 30 seconds'),
        state: { currentStep: 'llm-call' },
      };

      const results = await hookRegistry.executeHooks('workflow-error', payload, mockContext);

      expect(results).toHaveLength(1);
      expect(results[0].modified).toBe(true);
      expect(results[0].payload.state.shouldRetry).toBe(true);
      expect(results[0].payload.error).toBeUndefined();

      const logEvent = await logPromise;
      expect(logEvent).toMatchObject({
        level: 'info',
        message: 'Applied timeout recovery strategy',
      });
    });
  });

  // ===== Performance and Optimization =====

  describe('Performance and Optimization', () => {
    test('should track performance metrics across hook executions', async () => {
      const performanceHook: HookRegistration = {
        id: 'performance-tracker',
        type: 'performance-metric',
        handler: async (payload) => {
          return {
            continue: true,
            sideEffects: [{
              type: 'metric',
              action: 'update',
              data: {
                name: `performance.${(payload as any).metric}`,
                value: (payload as any).value,
              },
            }],
          };
        },
        priority: 100,
      };

      hookRegistry.register(performanceHook);

      const metrics = [
        { metric: 'latency', value: 150, unit: 'ms' },
        { metric: 'throughput', value: 50, unit: 'req/s' },
        { metric: 'error_rate', value: 0.02, unit: 'percentage' },
      ];

      for (const metric of metrics) {
        await hookRegistry.executeHooks('performance-metric', {
          ...metric,
          context: { component: 'llm-processor' },
        }, mockContext);
      }

      const registryMetrics = hookRegistry.getMetrics();
      expect(registryMetrics['performance.latency']).toBe(150);
      expect(registryMetrics['performance.throughput']).toBe(50);
      expect(registryMetrics['performance.error_rate']).toBe(0.02);
    });

    test('should provide comprehensive metrics and statistics', () => {
      // Register multiple hooks of different types
      const hookTypes: AgenticHookType[] = [
        'pre-llm-call',
        'post-llm-call',
        'pre-memory-store',
        'workflow-start',
        'performance-metric',
      ];

      hookTypes.forEach((type, index) => {
        hookRegistry.register({
          id: `test-hook-${index}`,
          type,
          handler: async () => ({ continue: true }),
          priority: 100,
        });
      });

      const metrics = hookRegistry.getMetrics();

      expect(metrics['hooks.count']).toBe(5);
      expect(metrics['hooks.types']).toEqual(expect.arrayContaining(hookTypes));
      expect(metrics['hooks.registered']).toBe(5);
      expect(metrics['pipelines.count']).toBe(0);
    });

    test('should maintain execution history for analysis', async () => {
      const testHook: HookRegistration = {
        id: 'history-test',
        type: 'neural-pattern-detected',
        handler: async () => ({ continue: true }),
        priority: 100,
      };

      hookRegistry.register(testHook);

      const payload = {
        operation: 'analyze' as const,
        modelId: 'pattern-detector',
        patterns: [{
          id: 'pattern-1',
          type: 'success' as const,
          confidence: 0.85,
          occurrences: 5,
          context: { workflow: 'data-processing' },
        }],
      };

      await hookRegistry.executeHooks('neural-pattern-detected', payload, mockContext);

      const history = hookRegistry.getExecutionHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        type: 'neural-pattern-detected',
        payload,
        result: expect.any(Array),
        timestamp: expect.any(Number),
      });
    });
  });

  // ===== Hook Pipelines =====

  describe('Hook Pipelines', () => {
    test('should create and manage hook pipelines', () => {
      const pipeline = hookRegistry.createPipeline({
        name: 'LLM Processing Pipeline',
        stages: [
          {
            name: 'Pre-processing',
            hooks: [],
            parallel: false,
          },
          {
            name: 'Processing',
            hooks: [],
            parallel: true,
          },
          {
            name: 'Post-processing',
            hooks: [],
            parallel: false,
          },
        ],
        errorStrategy: 'continue',
      });

      expect(pipeline.name).toBe('LLM Processing Pipeline');
      expect(pipeline.stages).toHaveLength(3);
      expect(pipeline.errorStrategy).toBe('continue');
      expect(pipeline.metrics).toMatchObject({
        executions: 0,
        avgDuration: 0,
        errorRate: 0,
        throughput: 0,
      });

      const metrics = hookRegistry.getMetrics();
      expect(metrics['pipelines.count']).toBe(1);
    });
  });

  // ===== Integration and Cross-cutting Concerns =====

  describe('Integration and Cross-cutting Concerns', () => {
    test('should handle complex multi-hook workflows with side effects', async () => {
      const workflowState = new Map();
      
      const enhancerHook: HookRegistration = {
        id: 'workflow-enhancer',
        type: 'workflow-start',
        handler: async (payload) => {
          const workflowId = (payload as any).workflowId;
          workflowState.set(workflowId, { enhanced: true, startTime: Date.now() });
          
          return {
            continue: true,
            modified: true,
            payload: {
              ...payload,
              state: {
                ...(payload as any).state,
                provider: 'anthropic', // Select optimal provider
                optimizations: ['cache', 'parallel'],
              },
            },
            sideEffects: [{
              type: 'memory',
              action: 'store',
              data: {
                key: `workflow:${workflowId}:config`,
                value: { enhanced: true, provider: 'anthropic' },
              },
            }],
          };
        },
        priority: 200,
      };

      const loggerHook: HookRegistration = {
        id: 'workflow-logger',
        type: 'workflow-start',
        handler: async (payload) => {
          return {
            continue: true,
            sideEffects: [{
              type: 'log',
              action: 'write',
              data: {
                level: 'info',
                message: 'Workflow started with enhanced configuration',
                data: { workflowId: (payload as any).workflowId },
              },
            }],
          };
        },
        priority: 100,
      };

      const metricsHook: HookRegistration = {
        id: 'workflow-metrics',
        type: 'workflow-start',
        handler: async () => {
          return {
            continue: true,
            sideEffects: [{
              type: 'metric',
              action: 'increment',
              data: { name: 'workflows.started.enhanced' },
            }],
          };
        },
        priority: 50,
      };

      hookRegistry.register(enhancerHook);
      hookRegistry.register(loggerHook);
      hookRegistry.register(metricsHook);

      const logPromise = new Promise((resolve) => {
        hookRegistry.once('log', resolve);
      });

      const payload = {
        workflowId: 'complex-workflow-123',
        state: { initialized: false },
      };

      const results = await hookRegistry.executeHooks('workflow-start', payload, mockContext);

      expect(results).toHaveLength(3);
      expect(results[0].modified).toBe(true);
      expect(results[0].payload.state.provider).toBe('anthropic');
      expect(results[0].payload.state.optimizations).toEqual(['cache', 'parallel']);

      // Verify memory side effect
      expect(mockContext.memory.cache.get('workflow:complex-workflow-123:config')).toEqual({
        enhanced: true,
        provider: 'anthropic',
      });

      // Verify log side effect
      const logEvent = await logPromise;
      expect(logEvent).toMatchObject({
        level: 'info',
        message: 'Workflow started with enhanced configuration',
        data: { workflowId: 'complex-workflow-123' },
      });

      // Verify metrics
      const metrics = hookRegistry.getMetrics();
      expect(metrics['workflows.started.enhanced']).toBe(1);
    });

    test('should handle concurrent hook executions safely', async () => {
      const concurrentHook: HookRegistration = {
        id: 'concurrent-safe-hook',
        type: 'performance-metric',
        handler: async (payload) => {
          // Simulate async processing
          await new Promise(resolve => setTimeout(resolve, 10));
          
          return {
            continue: true,
            sideEffects: [{
              type: 'metric',
              action: 'increment',
              data: { name: 'concurrent.executions' },
            }],
          };
        },
        priority: 100,
      };

      hookRegistry.register(concurrentHook);

      // Execute multiple hooks concurrently
      const promises = Array.from({ length: 10 }, (_, i) =>
        hookRegistry.executeHooks('performance-metric', {
          metric: `test-metric-${i}`,
          value: i * 10,
          unit: 'ms',
          context: { test: true },
        }, mockContext)
      );

      await Promise.all(promises);

      const metrics = hookRegistry.getMetrics();
      expect(metrics['concurrent.executions']).toBe(10);
      expect(metrics['hooks.executions']).toBe(10);
    });
  });
});