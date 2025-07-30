/**
 * Comprehensive Functional Tests for Coordination System
 * Tests swarm coordination, task management, and agent orchestration
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';

// Import core coordination classes
import { Agent } from '../core/Agent';
import { Queen } from '../core/Queen';
import { HiveMind } from '../core/HiveMind';
import { Communication } from '../core/Communication';
import { Memory } from '../core/Memory';

describe('Coordination System Functional Tests', () => {
  let tmpDir: string;
  let hiveMind: HiveMind;
  let queen: Queen;
  let communication: Communication;
  let memory: Memory;

  beforeEach(async () => {
    // Create temporary directory for each test
    tmpDir = join(tmpdir(), `test-coordination-${Date.now()}`);
    
    // Initialize core components
    memory = new Memory();
    communication = new Communication();
    queen = new Queen({ memory, communication });
    hiveMind = new HiveMind({
      dataDir: tmpDir,
      coordination: queen,
      memory,
      communication
    });

    await hiveMind.initialize();
  });

  afterEach(async () => {
    await hiveMind.shutdown();
    // Clean up temporary directory
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch (error) {
      // Directory may not exist
    }
  });

  describe('Agent Creation and Management', () => {
    test('should create agent with basic configuration', () => {
      const agent = new Agent({
        id: 'test-agent-1',
        type: 'coder',
        name: 'Test Coder Agent',
        capabilities: ['code-generation', 'debugging'],
        maxConcurrentTasks: 3,
        priority: 1
      });

      expect(agent.getId()).toBe('test-agent-1');
      expect(agent.getType()).toBe('coder');
      expect(agent.getName()).toBe('Test Coder Agent');
      expect(agent.getCapabilities()).toEqual(['code-generation', 'debugging']);
      expect(agent.getMaxConcurrentTasks()).toBe(3);
      expect(agent.getPriority()).toBe(1);
      expect(agent.getStatus()).toBe('idle');
    });

    test('should handle agent with complex capabilities', () => {
      const agent = new Agent({
        id: 'complex-agent',
        type: 'researcher',
        name: 'Advanced Research Agent',
        capabilities: [
          'web-search',
          'data-analysis', 
          'report-generation',
          'multi-language',
          'scientific-research'
        ],
        maxConcurrentTasks: 5,
        priority: 2,
        metadata: {
          specialization: 'machine-learning',
          languages: ['python', 'r', 'julia'],
          expertise: 'deep-learning'
        }
      });

      expect(agent.getCapabilities()).toHaveLength(5);
      expect(agent.getMetadata()).toHaveProperty('specialization', 'machine-learning');
      expect(agent.getMetadata()?.languages).toEqual(['python', 'r', 'julia']);
    });

    test('should validate agent configuration', () => {
      expect(() => {
        new Agent({
          id: '',
          type: 'invalid',
          name: '',
          capabilities: [],
          maxConcurrentTasks: 0,
          priority: -1
        });
      }).toThrow();
    });

    test('should update agent status and properties', () => {
      const agent = new Agent({
        id: 'updatable-agent',
        type: 'worker',
        name: 'Worker Agent',
        capabilities: ['task-execution'],
        maxConcurrentTasks: 2,
        priority: 1
      });

      // Test status updates
      agent.setStatus('active');
      expect(agent.getStatus()).toBe('active');

      agent.setStatus('busy');
      expect(agent.getStatus()).toBe('busy');

      // Test capability updates
      agent.addCapability('data-processing');
      expect(agent.getCapabilities()).toContain('data-processing');

      agent.removeCapability('task-execution');
      expect(agent.getCapabilities()).not.toContain('task-execution');
    });

    test('should handle agent task assignment', () => {
      const agent = new Agent({
        id: 'task-agent',
        type: 'executor',
        name: 'Task Executor',
        capabilities: ['execution'],
        maxConcurrentTasks: 3,
        priority: 1
      });

      const task1 = { id: 'task-1', type: 'simple', description: 'Simple task' };
      const task2 = { id: 'task-2', type: 'complex', description: 'Complex task' };
      const task3 = { id: 'task-3', type: 'urgent', description: 'Urgent task' };

      // Assign tasks
      agent.assignTask(task1);
      expect(agent.getCurrentTasks()).toHaveLength(1);
      expect(agent.getAvailableCapacity()).toBe(2);

      agent.assignTask(task2);
      agent.assignTask(task3);
      expect(agent.getCurrentTasks()).toHaveLength(3);
      expect(agent.getAvailableCapacity()).toBe(0);
      expect(agent.getStatus()).toBe('busy');

      // Try to assign one more task (should fail)
      const task4 = { id: 'task-4', type: 'overflow', description: 'Overflow task' };
      expect(() => agent.assignTask(task4)).toThrow();

      // Complete a task
      agent.completeTask('task-1');
      expect(agent.getCurrentTasks()).toHaveLength(2);
      expect(agent.getAvailableCapacity()).toBe(1);
    });
  });

  describe('Queen Coordination', () => {
    test('should initialize queen with dependencies', () => {
      expect(queen).toBeDefined();
      expect(queen.isActive()).toBe(false);
    });

    test('should register agents with queen', async () => {
      const agent1 = new Agent({
        id: 'queen-agent-1',
        type: 'coder',
        name: 'Coder 1',
        capabilities: ['coding'],
        maxConcurrentTasks: 2,
        priority: 1
      });

      const agent2 = new Agent({
        id: 'queen-agent-2', 
        type: 'reviewer',
        name: 'Reviewer 1',
        capabilities: ['code-review'],
        maxConcurrentTasks: 3,
        priority: 2
      });

      await queen.registerAgent(agent1);
      await queen.registerAgent(agent2);

      const registeredAgents = queen.getRegisteredAgents();
      expect(registeredAgents).toHaveLength(2);
      expect(registeredAgents.map(a => a.getId())).toContain('queen-agent-1');
      expect(registeredAgents.map(a => a.getId())).toContain('queen-agent-2');
    });

    test('should coordinate task assignment across agents', async () => {
      // Register multiple agents with different capabilities
      const coderAgent = new Agent({
        id: 'coder-agent',
        type: 'coder',
        name: 'Coding Agent',
        capabilities: ['coding', 'debugging'],
        maxConcurrentTasks: 2,
        priority: 1
      });

      const reviewerAgent = new Agent({
        id: 'reviewer-agent',
        type: 'reviewer', 
        name: 'Review Agent',
        capabilities: ['code-review', 'testing'],
        maxConcurrentTasks: 3,
        priority: 2
      });

      await queen.registerAgent(coderAgent);
      await queen.registerAgent(reviewerAgent);

      // Create tasks requiring different capabilities
      const codingTask = {
        id: 'coding-task',
        type: 'implementation',
        description: 'Implement feature X',
        requiredCapabilities: ['coding'],
        priority: 1
      };

      const reviewTask = {
        id: 'review-task',
        type: 'review',
        description: 'Review code changes',
        requiredCapabilities: ['code-review'],
        priority: 2
      };

      // Queen should assign tasks to appropriate agents
      const assignment1 = await queen.assignTask(codingTask);
      expect(assignment1.agentId).toBe('coder-agent');

      const assignment2 = await queen.assignTask(reviewTask);
      expect(assignment2.agentId).toBe('reviewer-agent');
    });

    test('should handle agent load balancing', async () => {
      // Register agents with same capabilities but different capacities
      const agent1 = new Agent({
        id: 'load-agent-1',
        type: 'worker',
        name: 'Worker 1',
        capabilities: ['general-work'],
        maxConcurrentTasks: 1,
        priority: 1
      });

      const agent2 = new Agent({
        id: 'load-agent-2',
        type: 'worker',
        name: 'Worker 2', 
        capabilities: ['general-work'],
        maxConcurrentTasks: 3,
        priority: 1
      });

      await queen.registerAgent(agent1);
      await queen.registerAgent(agent2);

      // Create multiple similar tasks
      const tasks = Array.from({ length: 4 }, (_, i) => ({
        id: `load-task-${i}`,
        type: 'work',
        description: `Work task ${i}`,
        requiredCapabilities: ['general-work'],
        priority: 1
      }));

      // Assign all tasks
      const assignments = await Promise.all(
        tasks.map(task => queen.assignTask(task))
      );

      // Verify load balancing - agent2 should get more tasks due to higher capacity
      const agent1Assignments = assignments.filter(a => a.agentId === 'load-agent-1');
      const agent2Assignments = assignments.filter(a => a.agentId === 'load-agent-2');

      expect(agent1Assignments).toHaveLength(1);
      expect(agent2Assignments).toHaveLength(3);
    });

    test('should prioritize high-priority tasks', async () => {
      const agent = new Agent({
        id: 'priority-agent',
        type: 'worker',
        name: 'Priority Worker',
        capabilities: ['work'],
        maxConcurrentTasks: 1,
        priority: 1
      });

      await queen.registerAgent(agent);

      // Create tasks with different priorities
      const lowPriorityTask = {
        id: 'low-priority',
        type: 'work',
        description: 'Low priority task',
        requiredCapabilities: ['work'],
        priority: 1
      };

      const highPriorityTask = {
        id: 'high-priority',
        type: 'work',
        description: 'High priority task',
        requiredCapabilities: ['work'],
        priority: 5
      };

      // Assign low priority task first
      await queen.assignTask(lowPriorityTask);

      // High priority task should be queued
      const queuedAssignment = await queen.assignTask(highPriorityTask);
      expect(queuedAssignment.status).toBe('queued');

      // Complete low priority task
      await queen.completeTask('low-priority', 'priority-agent');

      // High priority task should now be assigned
      const taskQueue = queen.getTaskQueue();
      expect(taskQueue.some(t => t.id === 'high-priority')).toBe(true);
    });
  });

  describe('Communication System', () => {
    test('should initialize communication system', () => {
      expect(communication).toBeDefined();
      expect(communication.isConnected()).toBe(false);
    });

    test('should handle message routing between agents', async () => {
      await communication.initialize();

      const sender = new Agent({
        id: 'sender-agent',
        type: 'communicator',
        name: 'Sender',
        capabilities: ['communication'],
        maxConcurrentTasks: 1,
        priority: 1
      });

      const receiver = new Agent({
        id: 'receiver-agent',
        type: 'listener',
        name: 'Receiver',
        capabilities: ['listening'],
        maxConcurrentTasks: 1,
        priority: 1
      });

      // Register agents with communication system
      await communication.registerAgent(sender);
      await communication.registerAgent(receiver);

      const message = {
        id: 'test-message',
        from: 'sender-agent',
        to: 'receiver-agent',
        type: 'task-update',
        content: { status: 'progress', percentage: 50 },
        timestamp: Date.now()
      };

      // Send message
      const sent = await communication.sendMessage(message);
      expect(sent).toBe(true);

      // Verify message delivery
      const receivedMessages = await communication.getMessagesFor('receiver-agent');
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].content.percentage).toBe(50);
    });

    test('should handle broadcast messages', async () => {
      await communication.initialize();

      const agents = Array.from({ length: 3 }, (_, i) => new Agent({
        id: `broadcast-agent-${i}`,
        type: 'listener',
        name: `Listener ${i}`,
        capabilities: ['listening'],
        maxConcurrentTasks: 1,
        priority: 1
      }));

      // Register all agents
      for (const agent of agents) {
        await communication.registerAgent(agent);
      }

      const broadcastMessage = {
        id: 'broadcast-message',
        from: 'system',
        to: 'all',
        type: 'system-announcement',
        content: { message: 'System maintenance scheduled' },
        timestamp: Date.now()
      };

      // Broadcast message
      const sent = await communication.broadcast(broadcastMessage);
      expect(sent).toBe(true);

      // Verify all agents received the message
      for (const agent of agents) {
        const messages = await communication.getMessagesFor(agent.getId());
        expect(messages).toHaveLength(1);
        expect(messages[0].content.message).toBe('System maintenance scheduled');
      }
    });

    test('should handle message queuing and delivery', async () => {
      await communication.initialize();

      const busyAgent = new Agent({
        id: 'busy-agent',
        type: 'worker',
        name: 'Busy Worker',
        capabilities: ['work'],
        maxConcurrentTasks: 1,
        priority: 1
      });

      await communication.registerAgent(busyAgent);

      // Send multiple messages while agent is busy
      const messages = Array.from({ length: 5 }, (_, i) => ({
        id: `queued-message-${i}`,
        from: 'system',
        to: 'busy-agent',
        type: 'task-instruction',
        content: { instruction: `Do task ${i}` },
        timestamp: Date.now() + i
      }));

      // Send all messages
      for (const message of messages) {
        await communication.sendMessage(message);
      }

      // Verify messages are queued
      const queuedMessages = await communication.getMessagesFor('busy-agent');
      expect(queuedMessages).toHaveLength(5);

      // Messages should be ordered by timestamp
      for (let i = 0; i < 4; i++) {
        expect(queuedMessages[i].timestamp).toBeLessThanOrEqual(queuedMessages[i + 1].timestamp);
      }
    });
  });

  describe('Memory System Integration', () => {
    test('should initialize memory system', () => {
      expect(memory).toBeDefined();
    });

    test('should store and retrieve coordination state', async () => {
      await memory.initialize();

      const coordinationState = {
        activeAgents: 3,
        queuedTasks: 5,
        completedTasks: 12,
        systemStatus: 'operational',
        lastUpdate: Date.now()
      };

      // Store coordination state
      await memory.store('coordination-state', coordinationState);

      // Retrieve and verify
      const retrieved = await memory.retrieve('coordination-state');
      expect(retrieved).toEqual(coordinationState);
    });

    test('should handle agent state persistence', async () => {
      await memory.initialize();

      const agent = new Agent({
        id: 'persistent-agent',
        type: 'persistent-worker',
        name: 'Persistent Worker',
        capabilities: ['persistence', 'work'],
        maxConcurrentTasks: 2,
        priority: 1
      });

      // Assign tasks to agent
      const task1 = { id: 'persist-task-1', type: 'work', description: 'Work 1' };
      const task2 = { id: 'persist-task-2', type: 'work', description: 'Work 2' };
      
      agent.assignTask(task1);
      agent.assignTask(task2);
      agent.setStatus('busy');

      // Store agent state
      const agentState = {
        id: agent.getId(),
        status: agent.getStatus(),
        currentTasks: agent.getCurrentTasks(),
        capabilities: agent.getCapabilities(),
        metadata: agent.getMetadata()
      };

      await memory.store(`agent-state-${agent.getId()}`, agentState);

      // Retrieve and verify agent state
      const retrievedState = await memory.retrieve(`agent-state-${agent.getId()}`);
      expect(retrievedState.status).toBe('busy');
      expect(retrievedState.currentTasks).toHaveLength(2);
      expect(retrievedState.capabilities).toContain('persistence');
    });

    test('should handle task history and analytics', async () => {
      await memory.initialize();

      const taskHistory = Array.from({ length: 10 }, (_, i) => ({
        taskId: `history-task-${i}`,
        agentId: `agent-${i % 3}`,
        type: 'analytical-work',
        status: i < 8 ? 'completed' : 'in-progress',
        startTime: Date.now() - (10 - i) * 60000,
        endTime: i < 8 ? Date.now() - (10 - i - 1) * 60000 : undefined,
        duration: i < 8 ? 60000 : undefined
      }));

      // Store task history
      await memory.store('task-history', taskHistory);

      // Retrieve and analyze
      const retrieved = await memory.retrieve('task-history');
      expect(retrieved).toHaveLength(10);

      const completedTasks = retrieved.filter((t: any) => t.status === 'completed');
      const inProgressTasks = retrieved.filter((t: any) => t.status === 'in-progress');

      expect(completedTasks).toHaveLength(8);
      expect(inProgressTasks).toHaveLength(2);

      // Calculate average completion time
      const avgDuration = completedTasks.reduce((sum: number, task: any) => sum + task.duration, 0) / completedTasks.length;
      expect(avgDuration).toBe(60000);
    });
  });

  describe('HiveMind Integration', () => {
    test('should initialize hive mind with all components', () => {
      expect(hiveMind).toBeDefined();
      expect(hiveMind.isActive()).toBe(true);
    });

    test('should coordinate end-to-end task workflow', async () => {
      // Create a complete workflow with multiple agents and tasks
      const agents = [
        new Agent({
          id: 'workflow-coder',
          type: 'coder',
          name: 'Workflow Coder',
          capabilities: ['coding', 'implementation'],
          maxConcurrentTasks: 2,
          priority: 1
        }),
        new Agent({
          id: 'workflow-reviewer',
          type: 'reviewer',
          name: 'Workflow Reviewer',
          capabilities: ['code-review', 'quality-assurance'],
          maxConcurrentTasks: 3,
          priority: 2
        }),
        new Agent({
          id: 'workflow-tester',
          type: 'tester',
          name: 'Workflow Tester',
          capabilities: ['testing', 'validation'],
          maxConcurrentTasks: 2,
          priority: 1
        })
      ];

      // Register all agents
      for (const agent of agents) {
        await hiveMind.registerAgent(agent);
      }

      // Create workflow tasks
      const workflowTasks = [
        {
          id: 'workflow-code',
          type: 'implementation',
          description: 'Implement user authentication',
          requiredCapabilities: ['coding'],
          priority: 3,
          dependencies: []
        },
        {
          id: 'workflow-review',
          type: 'review',
          description: 'Review authentication code',
          requiredCapabilities: ['code-review'],
          priority: 2,
          dependencies: ['workflow-code']
        },
        {
          id: 'workflow-test',
          type: 'testing',
          description: 'Test authentication flow',
          requiredCapabilities: ['testing'],
          priority: 1,
          dependencies: ['workflow-review']
        }
      ];

      // Execute workflow
      const workflowResults = [];
      for (const task of workflowTasks) {
        const result = await hiveMind.executeTask(task);
        workflowResults.push(result);
        
        // Mark task as completed to satisfy dependencies
        await hiveMind.completeTask(task.id);
      }

      expect(workflowResults).toHaveLength(3);
      workflowResults.forEach(result => {
        expect(result.status).toBe('assigned');
        expect(result.agentId).toBeDefined();
      });

      // Verify task assignment to correct agent types
      expect(workflowResults[0].agentId).toBe('workflow-coder'); // coding task
      expect(workflowResults[1].agentId).toBe('workflow-reviewer'); // review task
      expect(workflowResults[2].agentId).toBe('workflow-tester'); // testing task
    });

    test('should handle system scaling and performance', async () => {
      // Test with larger number of agents and tasks
      const agents = Array.from({ length: 20 }, (_, i) => new Agent({
        id: `scale-agent-${i}`,
        type: i % 4 === 0 ? 'coder' : i % 4 === 1 ? 'reviewer' : i % 4 === 2 ? 'tester' : 'worker',
        name: `Scale Agent ${i}`,
        capabilities: i % 4 === 0 ? ['coding'] : i % 4 === 1 ? ['reviewing'] : i % 4 === 2 ? ['testing'] : ['general'],
        maxConcurrentTasks: Math.floor(Math.random() * 3) + 1,
        priority: Math.floor(Math.random() * 3) + 1
      }));

      // Register all agents
      for (const agent of agents) {
        await hiveMind.registerAgent(agent);
      }

      // Create many tasks
      const tasks = Array.from({ length: 50 }, (_, i) => ({
        id: `scale-task-${i}`,
        type: 'work',
        description: `Scale test task ${i}`,
        requiredCapabilities: i % 4 === 0 ? ['coding'] : i % 4 === 1 ? ['reviewing'] : i % 4 === 2 ? ['testing'] : ['general'],
        priority: Math.floor(Math.random() * 5) + 1
      }));

      // Execute all tasks concurrently
      const startTime = Date.now();
      const results = await Promise.all(
        tasks.map(task => hiveMind.executeTask(task))
      );
      const endTime = Date.now();

      expect(results).toHaveLength(50);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds

      // Verify all tasks were assigned
      const assignedTasks = results.filter(r => r.status === 'assigned' || r.status === 'queued');
      expect(assignedTasks.length).toBeGreaterThan(0);
    });

    test('should handle error recovery and resilience', async () => {
      const agent = new Agent({
        id: 'failure-agent',
        type: 'unreliable',
        name: 'Unreliable Agent',
        capabilities: ['unreliable-work'],
        maxConcurrentTasks: 1,
        priority: 1
      });

      await hiveMind.registerAgent(agent);

      const task = {
        id: 'failure-task',
        type: 'risky-work',
        description: 'Task that might fail',
        requiredCapabilities: ['unreliable-work'],
        priority: 1
      };

      // Execute task
      const result = await hiveMind.executeTask(task);
      expect(result.agentId).toBe('failure-agent');

      // Simulate task failure
      await hiveMind.failTask('failure-task', 'Agent became unresponsive');

      // Verify system handles failure gracefully
      const systemStats = await hiveMind.getSystemStats();
      expect(systemStats.failedTasks).toBeGreaterThan(0);
      expect(systemStats.activeAgents).toBe(1); // Agent should still be registered
    });
  });

  describe('Performance and Load Testing', () => {
    test('should handle high-frequency task creation', async () => {
      const worker = new Agent({
        id: 'high-freq-worker',
        type: 'worker',
        name: 'High Frequency Worker',
        capabilities: ['rapid-work'],
        maxConcurrentTasks: 10,
        priority: 1
      });

      await hiveMind.registerAgent(worker);

      // Create tasks rapidly
      const taskCount = 100;
      const tasks = Array.from({ length: taskCount }, (_, i) => ({
        id: `rapid-task-${i}`,
        type: 'rapid-work',
        description: `Rapid task ${i}`,
        requiredCapabilities: ['rapid-work'],
        priority: Math.floor(Math.random() * 3) + 1
      }));

      const startTime = Date.now();
      const results = await Promise.all(
        tasks.map(task => hiveMind.executeTask(task))
      );
      const endTime = Date.now();

      expect(results).toHaveLength(taskCount);
      expect(endTime - startTime).toBeLessThan(2000); // Should be fast

      // Verify distribution
      const assignedCount = results.filter(r => r.status === 'assigned').length;
      const queuedCount = results.filter(r => r.status === 'queued').length;

      expect(assignedCount).toBeLessThanOrEqual(10); // Limited by agent capacity
      expect(queuedCount).toBe(taskCount - assignedCount);
    });

    test('should maintain performance under memory pressure', async () => {
      // Create large amounts of data in memory
      const largeDataSets = Array.from({ length: 100 }, (_, i) => ({
        id: `dataset-${i}`,
        data: Array.from({ length: 1000 }, (_, j) => ({
          index: j,
          value: Math.random(),
          metadata: `Large metadata string for item ${j} in dataset ${i}`,
          timestamp: Date.now() + j
        }))
      }));

      // Store large datasets
      for (const dataset of largeDataSets) {
        await memory.store(`large-dataset-${dataset.id}`, dataset);
      }

      // Continue normal operations
      const agent = new Agent({
        id: 'memory-pressure-agent',
        type: 'data-processor',
        name: 'Data Processing Agent',
        capabilities: ['data-processing'],
        maxConcurrentTasks: 5,
        priority: 1
      });

      await hiveMind.registerAgent(agent);

      const tasks = Array.from({ length: 20 }, (_, i) => ({
        id: `memory-task-${i}`,
        type: 'data-processing',
        description: `Process dataset ${i}`,
        requiredCapabilities: ['data-processing'],
        priority: 1
      }));

      // Execute tasks under memory pressure
      const startTime = Date.now();
      const results = await Promise.all(
        tasks.map(task => hiveMind.executeTask(task))
      );
      const endTime = Date.now();

      expect(results).toHaveLength(20);
      expect(endTime - startTime).toBeLessThan(3000); // Should still be reasonably fast

      // Verify system stability
      const systemStats = await hiveMind.getSystemStats();
      expect(systemStats.activeAgents).toBe(1);
      expect(systemStats.memoryUsage).toBeDefined();
    });
  });
});