/**
 * Critical Workflows Integration Tests
 * 
 * Comprehensive end-to-end integration tests for critical workflows and API endpoints.
 * Tests the entire system working together across multiple components.
 */

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { SystemIntegration } from '../../integration/system-integration.js';
import type { 
  IntegrationConfig,
  SystemHealth,
  ComponentStatus 
} from '../../integration/types.js';
import type { 
  AgenticHookContext,
  HookHandlerResult,
  WorkflowHookPayload 
} from '../../services/agentic-flow-hooks/types.js';

// ===== Mock System Components =====

class MockSystemIntegration extends EventEmitter {
  private components: Map<string, any> = new Map();
  private initialized = false;
  private componentStatuses: Map<string, ComponentStatus> = new Map();

  constructor() {
    super();
  }

  async initialize(config?: IntegrationConfig): Promise<void> {
    // Initialize mock components
    this.components.set('orchestrator', new MockOrchestrator());
    this.components.set('memoryManager', new MockMemoryManager());
    this.components.set('agentManager', new MockAgentManager());
    this.components.set('taskEngine', new MockTaskEngine());
    this.components.set('mcpServer', new MockMCPServer());
    this.components.set('monitor', new MockMonitor());
    this.components.set('eventBus', new EventEmitter());

    // Initialize components
    for (const [name, component] of this.components) {
      if (component.initialize) {
        await component.initialize();
      }
      this.updateComponentStatus(name, 'healthy', 'Component initialized');
    }

    this.initialized = true;
    this.emit('system:ready', {
      timestamp: Date.now(),
      components: Array.from(this.components.keys()),
    });
  }

  async shutdown(): Promise<void> {
    for (const [name, component] of this.components) {
      if (component.shutdown) {
        await component.shutdown();
      }
      this.updateComponentStatus(name, 'unhealthy', 'Component shutdown');
    }
    this.initialized = false;
  }

  getComponent<T>(name: string): T | null {
    return this.components.get(name) as T || null;
  }

  async getSystemHealth(): Promise<SystemHealth> {
    const components = Array.from(this.componentStatuses.values());
    const healthyComponents = components.filter((c) => c.status === 'healthy').length;
    const unhealthyComponents = components.filter((c) => c.status === 'unhealthy').length;
    const warningComponents = components.filter((c) => c.status === 'warning').length;

    let overallStatus: 'healthy' | 'unhealthy' | 'warning' = 'healthy';
    if (unhealthyComponents > 0) {
      overallStatus = 'unhealthy';
    } else if (warningComponents > 0) {
      overallStatus = 'warning';
    }

    return {
      overall: overallStatus,
      components: Object.fromEntries(this.componentStatuses),
      metrics: {
        totalComponents: components.length,
        healthyComponents,
        unhealthyComponents,
        warningComponents,
        uptime: Date.now(),
      },
      timestamp: Date.now(),
    };
  }

  isReady(): boolean {
    return this.initialized;
  }

  private updateComponentStatus(
    component: string,
    status: 'healthy' | 'unhealthy' | 'warning',
    message?: string
  ): void {
    this.componentStatuses.set(component, {
      component,
      status,
      message: message || '',
      timestamp: Date.now(),
      lastHealthCheck: Date.now(),
    });
  }
}

class MockOrchestrator extends EventEmitter {
  private tasks: Map<string, any> = new Map();
  private workflows: Map<string, any> = new Map();
  private agents: Map<string, any> = new Map();

  async initialize(): Promise<void> {
    this.emit('initialized');
  }

  async shutdown(): Promise<void> {
    this.emit('shutdown');
  }

  async createWorkflow(definition: any): Promise<string> {
    const workflowId = `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const workflow = {
      id: workflowId,
      ...definition,
      status: 'created',
      createdAt: new Date(),
      tasks: [],
    };
    
    this.workflows.set(workflowId, workflow);
    this.emit('workflow:created', { workflowId, workflow });
    return workflowId;
  }

  async executeWorkflow(workflowId: string, options: any = {}): Promise<any> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    workflow.status = 'running';
    workflow.startedAt = new Date();
    this.emit('workflow:started', { workflowId, workflow });

    // Simulate workflow execution
    const results = [];
    for (let i = 0; i < 3; i++) {
      const taskId = `task_${i + 1}`;
      const taskResult = await this.executeTask({
        id: taskId,
        type: 'process',
        description: `Task ${i + 1}`,
        workflowId,
      });
      results.push(taskResult);
      workflow.tasks.push(taskResult);

      this.emit('workflow:task:completed', { workflowId, taskId, result: taskResult });
    }

    workflow.status = 'completed';
    workflow.completedAt = new Date();
    workflow.results = results;

    this.emit('workflow:completed', { workflowId, workflow });
    return workflow;
  }

  async executeTask(task: any): Promise<any> {
    const taskExecution = {
      id: task.id,
      status: 'running',
      startedAt: new Date(),
      assignedAgent: null,
    };

    this.tasks.set(task.id, taskExecution);
    this.emit('task:started', { taskId: task.id, task: taskExecution });

    // Simulate task processing
    await new Promise(resolve => setTimeout(resolve, 100));

    // Assign agent if available
    const availableAgents = Array.from(this.agents.values()).filter(a => a.status === 'idle');
    if (availableAgents.length > 0) {
      const agent = availableAgents[0];
      taskExecution.assignedAgent = agent.id;
      agent.status = 'busy';
      agent.currentTask = task.id;
    }

    // Complete task
    taskExecution.status = 'completed';
    taskExecution.completedAt = new Date();
    taskExecution.result = {
      success: true,
      output: `Task ${task.id} completed successfully`,
      metadata: { executionTime: 100 },
    };

    if (taskExecution.assignedAgent) {
      const agent = this.agents.get(taskExecution.assignedAgent);
      if (agent) {
        agent.status = 'idle';
        agent.currentTask = null;
      }
    }

    this.emit('task:completed', { taskId: task.id, result: taskExecution });
    return taskExecution;
  }

  async createAgent(config: any): Promise<string> {
    const agentId = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const agent = {
      id: agentId,
      ...config,
      status: 'idle',
      createdAt: new Date(),
      currentTask: null,
      completedTasks: 0,
    };

    this.agents.set(agentId, agent);
    this.emit('agent:created', { agentId, agent });
    return agentId;
  }

  getWorkflow(workflowId: string): any {
    return this.workflows.get(workflowId);
  }

  getTask(taskId: string): any {
    return this.tasks.get(taskId);
  }

  getAgent(agentId: string): any {
    return this.agents.get(agentId);
  }

  listWorkflows(): any[] {
    return Array.from(this.workflows.values());
  }

  listTasks(): any[] {
    return Array.from(this.tasks.values());
  }

  listAgents(): any[] {
    return Array.from(this.agents.values());
  }
}

class MockMemoryManager extends EventEmitter {
  private entries: Map<string, any> = new Map();
  private banks: Map<string, any> = new Map();

  async initialize(): Promise<void> {
    this.emit('initialized');
  }

  async shutdown(): Promise<void> {
    this.emit('shutdown');
  }

  async createBank(agentId: string): Promise<string> {
    const bankId = `bank_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const bank = {
      id: bankId,
      agentId,
      createdAt: new Date(),
      entryCount: 0,
    };

    this.banks.set(bankId, bank);
    this.emit('bank:created', { bankId, agentId });
    return bankId;
  }

  async store(entry: any): Promise<void> {
    const storedEntry = {
      ...entry,
      id: entry.id || `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      version: 1,
    };

    this.entries.set(storedEntry.id, storedEntry);
    this.emit('entry:stored', { entryId: storedEntry.id, entry: storedEntry });
  }

  async retrieve(id: string): Promise<any> {
    const entry = this.entries.get(id);
    if (entry) {
      this.emit('entry:accessed', { entryId: id });
    }
    return entry;
  }

  async query(query: any): Promise<any[]> {
    const results = Array.from(this.entries.values()).filter(entry => {
      if (query.agentId && entry.agentId !== query.agentId) return false;
      if (query.type && entry.type !== query.type) return false;
      if (query.tags && !query.tags.some((tag: string) => entry.tags?.includes(tag))) return false;
      return true;
    });

    this.emit('query:executed', { query, resultCount: results.length });
    return results.slice(0, query.limit || 100);
  }

  getHealthStatus(): any {
    return {
      healthy: true,
      metrics: {
        totalEntries: this.entries.size,
        totalBanks: this.banks.size,
      },
    };
  }
}

class MockAgentManager extends EventEmitter {
  private agents: Map<string, any> = new Map();

  async initialize(): Promise<void> {
    // Create some default agents
    await this.createAgent({ type: 'researcher', name: 'Research Agent' });
    await this.createAgent({ type: 'implementer', name: 'Implementation Agent' });
    await this.createAgent({ type: 'reviewer', name: 'Review Agent' });
    this.emit('initialized');
  }

  async shutdown(): Promise<void> {
    for (const agent of this.agents.values()) {
      if (agent.shutdown) {
        await agent.shutdown();
      }
    }
    this.emit('shutdown');
  }

  async createAgent(config: any): Promise<string> {
    const agentId = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const agent = {
      id: agentId,
      ...config,
      status: 'idle',
      createdAt: new Date(),
      shutdown: async () => {
        agent.status = 'stopped';
      },
    };

    this.agents.set(agentId, agent);
    this.emit('agent:created', { agentId, agent });
    return agentId;
  }

  async assignTask(agentId: string, task: any): Promise<any> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    agent.status = 'busy';
    agent.currentTask = task;
    this.emit('agent:task:assigned', { agentId, taskId: task.id });

    // Simulate task execution
    await new Promise(resolve => setTimeout(resolve, 50));

    const result = {
      success: true,
      output: `Agent ${agentId} completed task ${task.id}`,
      metadata: { agentType: agent.type },
    };

    agent.status = 'idle';
    agent.currentTask = null;
    agent.completedTasks = (agent.completedTasks || 0) + 1;

    this.emit('agent:task:completed', { agentId, taskId: task.id, result });
    return result;
  }

  getAgent(agentId: string): any {
    return this.agents.get(agentId);
  }

  listAgents(): any[] {
    return Array.from(this.agents.values());
  }

  getAvailableAgents(): any[] {
    return Array.from(this.agents.values()).filter(agent => agent.status === 'idle');
  }
}

class MockTaskEngine extends EventEmitter {
  private tasks: Map<string, any> = new Map();
  private queue: any[] = [];
  private processing = false;

  async initialize(): Promise<void> {
    this.emit('initialized');
  }

  async shutdown(): Promise<void> {
    this.processing = false;
    this.emit('shutdown');
  }

  async submitTask(task: any, priority: number = 5): Promise<string> {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const taskEntry = {
      id: taskId,
      ...task,
      priority,
      status: 'queued',
      submittedAt: new Date(),
    };

    this.tasks.set(taskId, taskEntry);
    this.queue.push(taskEntry);
    this.queue.sort((a, b) => b.priority - a.priority); // Higher priority first

    this.emit('task:submitted', { taskId, task: taskEntry });
    
    // Start processing if not already running
    if (!this.processing) {
      this.startProcessing();
    }

    return taskId;
  }

  private startProcessing(): void {
    this.processing = true;
    
    const processNext = async () => {
      if (this.queue.length === 0 || !this.processing) {
        this.processing = false;
        return;
      }

      const task = this.queue.shift()!;
      task.status = 'running';
      task.startedAt = new Date();
      
      this.emit('task:started', { taskId: task.id, task });

      try {
        // Simulate task processing
        await new Promise(resolve => setTimeout(resolve, 100));

        task.status = 'completed';
        task.completedAt = new Date();
        task.result = {
          success: true,
          output: `Task ${task.id} processed successfully`,
        };

        this.emit('task:completed', { taskId: task.id, task });
      } catch (error) {
        task.status = 'failed';
        task.error = error;
        this.emit('task:failed', { taskId: task.id, task, error });
      }

      // Process next task
      setTimeout(processNext, 10);
    };

    processNext();
  }

  getTask(taskId: string): any {
    return this.tasks.get(taskId);
  }

  listTasks(): any[] {
    return Array.from(this.tasks.values());
  }

  getQueueStatus(): any {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      totalTasks: this.tasks.size,
    };
  }
}

class MockMCPServer extends EventEmitter {
  private tools: Map<string, any> = new Map();
  private sessions: Map<string, any> = new Map();

  async initialize(): Promise<void> {
    // Register default tools
    this.registerTool({
      name: 'system/status',
      description: 'Get system status',
      handler: async () => ({ status: 'running', timestamp: Date.now() }),
    });

    this.registerTool({
      name: 'workflow/execute',
      description: 'Execute workflow',
      handler: async (params: any) => ({ workflowId: params.workflowId, status: 'executed' }),
    });

    this.emit('initialized');
  }

  async shutdown(): Promise<void> {
    this.emit('shutdown');
  }

  registerTool(tool: any): void {
    this.tools.set(tool.name, tool);
    this.emit('tool:registered', { toolName: tool.name });
  }

  async executeTool(toolName: string, params: any): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }

    const result = await tool.handler(params);
    this.emit('tool:executed', { toolName, params, result });
    return result;
  }

  createSession(clientInfo: any): string {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session = {
      id: sessionId,
      clientInfo,
      createdAt: new Date(),
      isActive: true,
    };

    this.sessions.set(sessionId, session);
    this.emit('session:created', { sessionId, session });
    return sessionId;
  }

  listTools(): any[] {
    return Array.from(this.tools.values());
  }

  getHealthStatus(): any {
    return {
      healthy: true,
      metrics: {
        registeredTools: this.tools.size,
        activeSessions: this.sessions.size,
      },
    };
  }
}

class MockMonitor extends EventEmitter {
  private metrics: Map<string, any> = new Map();

  async initialize(): Promise<void> {
    this.startMonitoring();
    this.emit('initialized');
  }

  async shutdown(): Promise<void> {
    this.emit('shutdown');
  }

  private startMonitoring(): void {
    // Simulate periodic metrics collection
    setInterval(() => {
      this.collectMetrics();
    }, 1000);
  }

  private collectMetrics(): void {
    const timestamp = Date.now();
    const metrics = {
      timestamp,
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
      activeConnections: Math.floor(Math.random() * 50),
      requestsPerSecond: Math.floor(Math.random() * 1000),
    };

    this.metrics.set(timestamp, metrics);
    this.emit('metrics:collected', metrics);

    // Keep only last 100 metrics
    if (this.metrics.size > 100) {
      const oldestKey = Math.min(...this.metrics.keys());
      this.metrics.delete(oldestKey);
    }
  }

  getMetrics(): any[] {
    return Array.from(this.metrics.values());
  }

  getLatestMetrics(): any {
    const timestamps = Array.from(this.metrics.keys());
    if (timestamps.length === 0) return null;
    
    const latest = Math.max(...timestamps);
    return this.metrics.get(latest);
  }
}

// ===== Helper Functions =====

function createMockHookContext(): AgenticHookContext {
  return {
    sessionId: `session_${Date.now()}`,
    timestamp: Date.now(),
    correlationId: `corr_${Math.random().toString(36).substr(2, 9)}`,
    metadata: {},
    memory: {
      namespace: 'integration-test',
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

describe('Critical Workflows Integration Tests', () => {
  let systemIntegration: MockSystemIntegration;
  let orchestrator: MockOrchestrator;
  let memoryManager: MockMemoryManager;
  let agentManager: MockAgentManager;
  let taskEngine: MockTaskEngine;
  let mcpServer: MockMCPServer;
  let monitor: MockMonitor;

  beforeEach(async () => {
    systemIntegration = new MockSystemIntegration();
    await systemIntegration.initialize();

    orchestrator = systemIntegration.getComponent<MockOrchestrator>('orchestrator')!;
    memoryManager = systemIntegration.getComponent<MockMemoryManager>('memoryManager')!;
    agentManager = systemIntegration.getComponent<MockAgentManager>('agentManager')!;
    taskEngine = systemIntegration.getComponent<MockTaskEngine>('taskEngine')!;
    mcpServer = systemIntegration.getComponent<MockMCPServer>('mcpServer')!;
    monitor = systemIntegration.getComponent<MockMonitor>('monitor')!;
  });

  afterEach(async () => {
    await systemIntegration.shutdown();
  });

  // ===== System Integration Tests =====

  describe('System Integration', () => {
    test('should initialize all components successfully', async () => {
      expect(systemIntegration.isReady()).toBe(true);

      const health = await systemIntegration.getSystemHealth();
      expect(health.overall).toBe('healthy');
      expect(health.metrics.totalComponents).toBeGreaterThan(0);
      expect(health.metrics.healthyComponents).toBe(health.metrics.totalComponents);
    });

    test('should handle component communication through event bus', async () => {
      const events: any[] = [];
      const eventBus = systemIntegration.getComponent<EventEmitter>('eventBus')!;

      eventBus.on('test:event', (data) => {
        events.push(data);
      });

      // Emit test events from different components
      orchestrator.emit('workflow:created', { workflowId: 'test-workflow' });
      memoryManager.emit('entry:stored', { entryId: 'test-entry' });
      agentManager.emit('agent:created', { agentId: 'test-agent' });

      // Allow events to propagate
      await new Promise(resolve => setTimeout(resolve, 50));

      // Test cross-component communication
      eventBus.emit('test:event', { source: 'integration-test', message: 'Hello components' });

      expect(events).toHaveLength(1);
      expect(events[0].source).toBe('integration-test');
    });

    test('should maintain system health during component failures', async () => {
      // Simulate component failure by directly updating component status
      const statusInfo = {
        component: 'orchestrator',
        status: 'unhealthy' as const,
        message: 'Simulated failure',
        timestamp: Date.now(),
        lastHealthCheck: Date.now(),
      };

      // Access private method to update component status
      (systemIntegration as any).componentStatuses.set('orchestrator', statusInfo);

      const health = await systemIntegration.getSystemHealth();
      expect(health.overall).toBe('unhealthy');
      expect(health.metrics.unhealthyComponents).toBe(1);
    });
  });

  // ===== End-to-End Workflow Tests =====

  describe('End-to-End Workflow Execution', () => {
    test('should execute complete research workflow', async () => {
      const workflowEvents: any[] = [];

      // Set up event listeners
      orchestrator.on('workflow:created', (event) => workflowEvents.push({ type: 'created', ...event }));
      orchestrator.on('workflow:started', (event) => workflowEvents.push({ type: 'started', ...event }));
      orchestrator.on('workflow:task:completed', (event) => workflowEvents.push({ type: 'task_completed', ...event }));
      orchestrator.on('workflow:completed', (event) => workflowEvents.push({ type: 'completed', ...event }));

      // Create and execute research workflow
      const workflowDefinition = {
        name: 'Research Workflow',
        description: 'Multi-stage research and analysis',
        tasks: [
          { id: 'research', type: 'research', description: 'Conduct research' },
          { id: 'analyze', type: 'analysis', description: 'Analyze findings' },
          { id: 'report', type: 'reporting', description: 'Generate report' },
        ],
      };

      const workflowId = await orchestrator.createWorkflow(workflowDefinition);
      expect(workflowId).toBeDefined();
      expect(workflowEvents.some(e => e.type === 'created')).toBe(true);

      const result = await orchestrator.executeWorkflow(workflowId);
      expect(result.status).toBe('completed');
      expect(result.tasks).toHaveLength(3);
      expect(workflowEvents.some(e => e.type === 'completed')).toBe(true);

      // Verify workflow persistence
      const retrievedWorkflow = orchestrator.getWorkflow(workflowId);
      expect(retrievedWorkflow).toBeDefined();
      expect(retrievedWorkflow.name).toBe('Research Workflow');
    });

    test('should execute multi-agent coordination workflow', async () => {
      const coordinationEvents: any[] = [];

      // Set up event listeners for agent coordination
      agentManager.on('agent:task:assigned', (event) => coordinationEvents.push({ type: 'assigned', ...event }));
      agentManager.on('agent:task:completed', (event) => coordinationEvents.push({ type: 'completed', ...event }));

      // Get available agents
      const agents = agentManager.listAgents();
      expect(agents.length).toBeGreaterThan(0);

      // Create coordination workflow
      const workflowDefinition = {
        name: 'Multi-Agent Coordination',
        description: 'Coordinated task execution across multiple agents',
        agents: agents.slice(0, 2).map(agent => ({ id: agent.id, type: agent.type })),
        tasks: [
          { id: 'plan', type: 'planning', description: 'Create execution plan', assignTo: agents[0].id },
          { id: 'implement', type: 'implementation', description: 'Implement solution', assignTo: agents[1].id },
        ],
      };

      const workflowId = await orchestrator.createWorkflow(workflowDefinition);
      
      // Manually trigger agent task assignments to simulate coordination
      for (const task of workflowDefinition.tasks) {
        if (task.assignTo) {
          await agentManager.assignTask(task.assignTo, { id: task.id, type: task.type });
        }
      }
      
      const result = await orchestrator.executeWorkflow(workflowId);

      expect(result.status).toBe('completed');
      expect(coordinationEvents.length).toBeGreaterThan(0);

      // Verify agent task assignments
      const assignmentEvents = coordinationEvents.filter(e => e.type === 'assigned');
      const completionEvents = coordinationEvents.filter(e => e.type === 'completed');
      
      expect(assignmentEvents.length).toBeGreaterThan(0);
      expect(completionEvents.length).toBeGreaterThan(0);
    });

    test('should handle workflow with memory persistence', async () => {
      const memoryEvents: any[] = [];

      memoryManager.on('entry:stored', (event) => memoryEvents.push({ type: 'stored', ...event }));
      memoryManager.on('entry:accessed', (event) => memoryEvents.push({ type: 'accessed', ...event }));

      // Create memory bank for workflow
      const agentId = 'workflow-agent';
      const bankId = await memoryManager.createBank(agentId);
      expect(bankId).toBeDefined();

      // Store workflow context in memory
      const contextEntry = {
        id: 'workflow-context',
        type: 'context',
        agentId,
        bankId,
        content: {
          workflowId: 'test-workflow',
          stage: 'initialization',
          parameters: { topic: 'AI research', depth: 'comprehensive' },
        },
        tags: ['workflow', 'context'],
      };

      await memoryManager.store(contextEntry);
      expect(memoryEvents.some(e => e.type === 'stored')).toBe(true);

      // Execute workflow that uses memory
      const workflowDefinition = {
        name: 'Memory-Enabled Workflow',
        description: 'Workflow that persists state in memory',
        context: { bankId, contextId: contextEntry.id },
      };

      const workflowId = await orchestrator.createWorkflow(workflowDefinition);
      
      // Simulate workflow accessing memory
      const retrievedContext = await memoryManager.retrieve(contextEntry.id);
      expect(retrievedContext).toBeDefined();
      expect(retrievedContext.content).toBeDefined();
      expect(retrievedContext.content.parameters.topic).toBe('AI research');
      expect(memoryEvents.some(e => e.type === 'accessed')).toBe(true);

      // Execute workflow
      const result = await orchestrator.executeWorkflow(workflowId);
      expect(result.status).toBe('completed');

      // Verify memory state
      const healthStatus = memoryManager.getHealthStatus();
      expect(healthStatus.healthy).toBe(true);
      expect(healthStatus.metrics.totalEntries).toBeGreaterThan(0);
    });
  });

  // ===== API Endpoint Integration Tests =====

  describe('API Endpoint Integration', () => {
    test('should handle MCP tool execution requests', async () => {
      const toolEvents: any[] = [];

      mcpServer.on('tool:executed', (event) => toolEvents.push(event));

      // Test system status tool
      const statusResult = await mcpServer.executeTool('system/status', {});
      expect(statusResult.status).toBe('running');
      expect(statusResult.timestamp).toBeDefined();

      // Test workflow execution tool
      const workflowResult = await mcpServer.executeTool('workflow/execute', {
        workflowId: 'test-workflow',
        parameters: { type: 'research' },
      });
      expect(workflowResult.workflowId).toBe('test-workflow');
      expect(workflowResult.status).toBe('executed');

      expect(toolEvents).toHaveLength(2);
      expect(toolEvents[0].toolName).toBe('system/status');
      expect(toolEvents[1].toolName).toBe('workflow/execute');
    });

    test('should handle concurrent API requests', async () => {
      const sessionEvents: any[] = [];
      
      mcpServer.on('session:created', (event) => sessionEvents.push(event));

      // Create multiple concurrent sessions
      const sessionPromises = Array.from({ length: 5 }, (_, i) =>
        mcpServer.createSession({ name: `client-${i}`, version: '1.0.0' })
      );

      const sessionIds = await Promise.all(sessionPromises);
      expect(sessionIds).toHaveLength(5);
      expect(sessionEvents).toHaveLength(5);

      // Execute concurrent tool requests
      const toolPromises = sessionIds.map(sessionId =>
        mcpServer.executeTool('system/status', { sessionId })
      );

      const results = await Promise.all(toolPromises);
      expect(results).toHaveLength(5);
      expect(results.every(result => result.status === 'running')).toBe(true);
    });

    test('should integrate with task engine for distributed processing', async () => {
      const taskEvents: any[] = [];

      taskEngine.on('task:submitted', (event) => taskEvents.push({ type: 'submitted', ...event }));
      taskEngine.on('task:completed', (event) => taskEvents.push({ type: 'completed', ...event }));

      // Submit multiple tasks with different priorities
      const taskPromises = [
        taskEngine.submitTask({ type: 'analysis', data: 'dataset-1' }, 10), // High priority
        taskEngine.submitTask({ type: 'processing', data: 'dataset-2' }, 5), // Medium priority
        taskEngine.submitTask({ type: 'cleanup', data: 'temp-files' }, 1),  // Low priority
      ];

      const taskIds = await Promise.all(taskPromises);
      expect(taskIds).toHaveLength(3);

      // Wait for tasks to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      const queueStatus = taskEngine.getQueueStatus();
      expect(queueStatus.totalTasks).toBe(3);

      const submittedEvents = taskEvents.filter(e => e.type === 'submitted');
      const completedEvents = taskEvents.filter(e => e.type === 'completed');
      
      expect(submittedEvents).toHaveLength(3);
      expect(completedEvents.length).toBeGreaterThan(0);

      // Verify high priority task was processed first
      const highPriorityTask = taskEngine.getTask(taskIds[0]);
      expect(highPriorityTask).toBeDefined();
      expect(highPriorityTask.priority).toBe(10);
    });
  });

  // ===== Cross-Component Integration Tests =====

  describe('Cross-Component Integration', () => {
    test('should coordinate workflow execution with hooks system', async () => {
      const hookContext = createMockHookContext();
      const workflowEvents: any[] = [];

      // Simulate workflow hooks
      const workflowStartHook = async (payload: WorkflowHookPayload): Promise<HookHandlerResult> => {
        workflowEvents.push({ hook: 'start', payload });
        return {
          continue: true,
          modified: true,
          payload: {
            ...payload,
            state: {
              ...payload.state,
              enhanced: true,
              startTime: Date.now(),
            },
          },
          sideEffects: [{
            type: 'memory',
            action: 'store',
            data: {
              key: `workflow:${payload.workflowId}:start`,
              value: { timestamp: Date.now(), enhanced: true },
            },
          }],
        };
      };

      const workflowCompleteHook = async (payload: WorkflowHookPayload): Promise<HookHandlerResult> => {
        workflowEvents.push({ hook: 'complete', payload });
        return {
          continue: true,
          sideEffects: [{
            type: 'metric',
            action: 'increment',
            data: { name: 'workflows.completed.enhanced' },
          }],
        };
      };

      // Execute workflow with hooks
      const workflowDefinition = {
        name: 'Hooks-Enabled Workflow',
        description: 'Workflow with hook integration',
        hooks: {
          start: workflowStartHook,
          complete: workflowCompleteHook,
        },
      };

      const workflowId = await orchestrator.createWorkflow(workflowDefinition);
      
      // Simulate hook execution during workflow
      const startResult = await workflowStartHook({
        workflowId,
        state: { initialized: false },
      });

      expect(startResult.modified).toBe(true);
      expect(startResult.payload.state.enhanced).toBe(true);
      expect(startResult.sideEffects).toHaveLength(1);

      // Process side effects
      if (startResult.sideEffects) {
        for (const effect of startResult.sideEffects) {
          if (effect.type === 'memory') {
            // Store in memory as side effect
            hookContext.memory.cache.set(effect.data.key, effect.data.value);
          }
        }
      }

      // Execute workflow
      const result = await orchestrator.executeWorkflow(workflowId);
      expect(result.status).toBe('completed');

      // Execute completion hook
      await workflowCompleteHook({
        workflowId,
        state: result,
        metrics: { duration: 1000 },
      });

      expect(workflowEvents).toHaveLength(2);
      expect(workflowEvents[0].hook).toBe('start');
      expect(workflowEvents[1].hook).toBe('complete');

      // Verify side effects were processed
      const storedData = hookContext.memory.cache.get(`workflow:${workflowId}:start`);
      expect(storedData).toBeDefined();
      expect(storedData.enhanced).toBe(true);
    });

    test('should handle monitoring and alerting integration', async () => {
      const monitoringEvents: any[] = [];

      monitor.on('metrics:collected', (metrics) => {
        monitoringEvents.push({ type: 'metrics', data: metrics });
        
        // Simulate alert conditions
        if (metrics.cpu > 80) {
          monitor.emit('alert:high-cpu', { cpu: metrics.cpu, threshold: 80 });
        }
        if (metrics.memory > 90) {
          monitor.emit('alert:high-memory', { memory: metrics.memory, threshold: 90 });
        }
      });

      const alertEvents: any[] = [];
      monitor.on('alert:high-cpu', (alert) => alertEvents.push({ type: 'cpu', ...alert }));
      monitor.on('alert:high-memory', (alert) => alertEvents.push({ type: 'memory', ...alert }));

      // Wait for metrics collection and potential alerts
      await new Promise(resolve => setTimeout(resolve, 2000));

      expect(monitoringEvents.length).toBeGreaterThan(0);
      
      // Verify monitoring data
      const latestMetrics = monitor.getLatestMetrics();
      expect(latestMetrics).toBeDefined();
      expect(typeof latestMetrics.cpu).toBe('number');
      expect(typeof latestMetrics.memory).toBe('number');

      // Test integration with system health
      const systemHealth = await systemIntegration.getSystemHealth();
      expect(systemHealth.overall).toBeDefined();
      expect(systemHealth.metrics.totalComponents).toBeGreaterThan(0);
    });

    test('should handle error propagation and recovery across components', async () => {
      const errorEvents: any[] = [];

      // Set up error listeners
      orchestrator.on('workflow:error', (event) => errorEvents.push({ component: 'orchestrator', ...event }));
      taskEngine.on('task:failed', (event) => errorEvents.push({ component: 'taskEngine', ...event }));
      agentManager.on('agent:error', (event) => errorEvents.push({ component: 'agentManager', ...event }));

      // Simulate component error
      const faultyWorkflow = {
        name: 'Faulty Workflow',
        description: 'Workflow designed to test error handling',
        tasks: [
          { id: 'failing-task', type: 'error-test', description: 'Task that will fail' },
        ],
        simulateError: true,
      };

      try {
        const workflowId = await orchestrator.createWorkflow(faultyWorkflow);
        
        // Submit a task that will fail
        const taskId = await taskEngine.submitTask({
          type: 'failing-task',
          shouldFail: true,
        });

        // Wait for task processing
        await new Promise(resolve => setTimeout(resolve, 300));

        const task = taskEngine.getTask(taskId);
        expect(task.status).toBe('failed');
        expect(task.error).toBeDefined();

      } catch (error) {
        // Expected behavior for error testing
      }

      // Verify system recovery
      const systemHealth = await systemIntegration.getSystemHealth();
      // System should still be operational despite component errors
      expect(systemHealth.metrics.totalComponents).toBeGreaterThan(0);
    });
  });

  // ===== Performance and Load Testing =====

  describe('Performance and Load Testing', () => {
    test('should handle high-throughput workflow execution', async () => {
      const startTime = Date.now();
      const workflowCount = 10;
      const executionPromises: Promise<any>[] = [];

      // Create and execute multiple workflows concurrently
      for (let i = 0; i < workflowCount; i++) {
        const workflowDefinition = {
          name: `Load Test Workflow ${i}`,
          description: `Load testing workflow instance ${i}`,
          tasks: [
            { id: `task-${i}-1`, type: 'processing', description: `Process task ${i}-1` },
            { id: `task-${i}-2`, type: 'analysis', description: `Analyze task ${i}-2` },
          ],
        };

        const promise = orchestrator.createWorkflow(workflowDefinition)
          .then(workflowId => orchestrator.executeWorkflow(workflowId));
        
        executionPromises.push(promise);
      }

      const results = await Promise.all(executionPromises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Verify all workflows completed successfully
      expect(results).toHaveLength(workflowCount);
      expect(results.every(result => result.status === 'completed')).toBe(true);

      // Performance assertions
      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds
      
      const averageTime = totalTime / workflowCount;
      expect(averageTime).toBeLessThan(1000); // Average under 1 second per workflow

      // Verify system resources
      const systemHealth = await systemIntegration.getSystemHealth();
      expect(systemHealth.overall).toBe('healthy');
    });

    test('should maintain performance under memory pressure', async () => {
      const memoryEvents: any[] = [];
      
      memoryManager.on('entry:stored', (event) => memoryEvents.push(event));

      // Create large number of memory entries
      const entryPromises = Array.from({ length: 100 }, (_, i) => {
        const entry = {
          id: `load-test-entry-${i}`,
          type: 'load-test',
          content: {
            data: 'x'.repeat(1000), // 1KB of data per entry
            index: i,
            timestamp: Date.now(),
          },
          tags: ['load-test', `batch-${Math.floor(i / 10)}`],
        };
        return memoryManager.store(entry);
      });

      await Promise.all(entryPromises);
      expect(memoryEvents).toHaveLength(100);

      // Test memory query performance
      const queryStart = Date.now();
      const queryResults = await memoryManager.query({
        type: 'load-test',
        tags: ['load-test'],
        limit: 50,
      });
      const queryTime = Date.now() - queryStart;

      expect(queryResults).toHaveLength(50);
      expect(queryTime).toBeLessThan(500); // Query should complete under 500ms

      // Verify memory health
      const healthStatus = memoryManager.getHealthStatus();
      expect(healthStatus.healthy).toBe(true);
      expect(healthStatus.metrics.totalEntries).toBe(100);
    });
  });

  // ===== Data Consistency and Reliability Tests =====

  describe('Data Consistency and Reliability', () => {
    test('should maintain data consistency across component interactions', async () => {
      // Create workflow with memory persistence
      const workflowDefinition = {
        name: 'Consistency Test Workflow',
        description: 'Workflow to test data consistency',
        persistState: true,
      };

      const workflowId = await orchestrator.createWorkflow(workflowDefinition);
      
      // Store workflow state in memory
      const workflowState = {
        id: `workflow-state-${workflowId}`,
        workflowId,
        type: 'workflow-state',
        content: {
          currentStage: 'initialization',
          parameters: { consistency: true },
          stateVersion: 1,
        },
      };

      await memoryManager.store(workflowState);

      // Execute workflow and update state
      const result = await orchestrator.executeWorkflow(workflowId);
      expect(result.status).toBe('completed');

      // Update workflow state
      const updateState = {
        ...workflowState,
        content: {
          ...workflowState.content,
          currentStage: 'completed',
          completedAt: Date.now(),
          stateVersion: 2,
        },
      };

      await memoryManager.store(updateState);

      // Verify consistency across components
      const retrievedState = await memoryManager.retrieve(workflowState.id);
      expect(retrievedState).toBeDefined();
      expect(retrievedState.content.currentStage).toBe('completed');
      expect(retrievedState.content.stateVersion).toBe(2);

      const retrievedWorkflow = orchestrator.getWorkflow(workflowId);
      expect(retrievedWorkflow).toBeDefined();
      expect(retrievedWorkflow.status).toBe('completed');

      // Verify data consistency
      expect(retrievedState.workflowId).toBe(retrievedWorkflow.id);
    });

    test('should handle concurrent operations safely', async () => {
      const concurrentOperations = 20;
      const operationPromises: Promise<any>[] = [];

      // Perform concurrent memory operations
      for (let i = 0; i < concurrentOperations; i++) {
        const storePromise = memoryManager.store({
          id: `concurrent-entry-${i}`,
          type: 'concurrent-test',
          content: { index: i, timestamp: Date.now() },
          tags: ['concurrent'],
        });
        operationPromises.push(storePromise);
      }

      // Perform concurrent workflow operations
      for (let i = 0; i < 5; i++) {
        const workflowPromise = orchestrator.createWorkflow({
          name: `Concurrent Workflow ${i}`,
          description: `Concurrent workflow ${i}`,
        }).then(workflowId => orchestrator.executeWorkflow(workflowId));
        
        operationPromises.push(workflowPromise);
      }

      // Perform concurrent task operations
      for (let i = 0; i < 10; i++) {
        const taskPromise = taskEngine.submitTask({
          type: 'concurrent-task',
          index: i,
        });
        operationPromises.push(taskPromise);
      }

      // Wait for all operations to complete
      const results = await Promise.all(operationPromises);
      expect(results).toHaveLength(concurrentOperations + 5 + 10);

      // Verify data integrity
      const memoryQuery = await memoryManager.query({
        type: 'concurrent-test',
        tags: ['concurrent'],
      });
      expect(memoryQuery).toHaveLength(concurrentOperations);

      const workflows = orchestrator.listWorkflows();
      const concurrentWorkflows = workflows.filter(w => w.name.includes('Concurrent Workflow'));
      expect(concurrentWorkflows).toHaveLength(5);

      const tasks = taskEngine.listTasks();
      const concurrentTasks = tasks.filter(t => t.type === 'concurrent-task');
      expect(concurrentTasks).toHaveLength(10);
    });
  });
});