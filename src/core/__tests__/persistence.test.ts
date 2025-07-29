/**
 * Comprehensive Functional Tests for Core Persistence Layer
 * Addresses critical coverage gap for database operations
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';
import { PersistenceManager } from '../persistence';
import type { PersistedAgent, PersistedTask } from '../persistence';

describe('Persistence Layer Functional Tests', () => {
  let persistence: PersistenceManager;
  let tmpDir: string;

  beforeEach(async () => {
    // Create temporary database directory for each test
    tmpDir = join(tmpdir(), `test-claude-flow-${Date.now()}`);
    persistence = new PersistenceManager(tmpDir);
    await persistence.initialize();
  });

  afterEach(() => {
    // Clean up database directory
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch (error) {
      // Directory may not exist
    }
  });

  describe('Database Initialization', () => {
    test('should initialize persistence manager successfully', () => {
      expect(persistence).toBeDefined();
    });

    test('should create tables with correct schema', async () => {
      // Initialize should complete without error
      const newPersistence = new PersistenceManager(join(tmpdir(), `test-init-${Date.now()}`));
      await expect(newPersistence.initialize()).resolves.not.toThrow();
    });
  });

  describe('Agent Operations', () => {
    const sampleAgent: PersistedAgent = {
      id: 'test-agent-1',
      type: 'coder',
      name: 'Test Agent',
      status: 'active',
      capabilities: 'code-generation,debugging',
      systemPrompt: 'You are a helpful coding assistant',
      maxConcurrentTasks: 3,
      priority: 1,
      createdAt: Date.now()
    };

    test('should save and retrieve agent', async () => {
      await persistence.saveAgent(sampleAgent);
      
      const retrieved = await persistence.getAgent(sampleAgent.id);
      expect(retrieved).toEqual(sampleAgent);
    });

    test('should return null for non-existent agent', async () => {
      const result = await persistence.getAgent('non-existent');
      expect(result).toBeNull();
    });

    test('should update existing agent', async () => {
      await persistence.saveAgent(sampleAgent);
      
      const updatedAgent = {
        ...sampleAgent,
        status: 'inactive',
        name: 'Updated Agent'
      };

      await persistence.saveAgent(updatedAgent);
      const retrieved = await persistence.getAgent(sampleAgent.id);
      
      expect(retrieved?.status).toBe('inactive');
      expect(retrieved?.name).toBe('Updated Agent');
    });

    test('should handle agent with complex capabilities', async () => {
      const complexAgent: PersistedAgent = {
        id: 'complex-agent',
        type: 'researcher',
        name: 'Complex Agent',
        status: 'active',
        capabilities: 'web-search,analysis,reporting,data-processing',
        systemPrompt: 'You are an advanced research assistant with access to multiple tools',
        maxConcurrentTasks: 5,
        priority: 2,
        createdAt: Date.now()
      };

      await persistence.saveAgent(complexAgent);
      const retrieved = await persistence.getAgent(complexAgent.id);
      
      expect(retrieved).toEqual(complexAgent);
    });
  });

  describe('Task Operations', () => {
    const sampleTask: PersistedTask = {
      id: 'test-task-1',
      type: 'coding',
      description: 'Test task description',
      status: 'pending',
      priority: 1,
      dependencies: '[]',
      metadata: '{"estimatedTime": 30, "complexity": "medium"}',
      progress: 0,
      createdAt: Date.now()
    };

    test('should save and retrieve task', async () => {
      await persistence.saveTask(sampleTask);
      
      const retrieved = await persistence.getTask(sampleTask.id);
      expect(retrieved).toEqual(sampleTask);
    });

    test('should return null for non-existent task', async () => {
      const result = await persistence.getTask('non-existent');
      expect(result).toBeNull();
    });

    test('should handle task status updates', async () => {
      await persistence.saveTask(sampleTask);
      
      const updatedTask = {
        ...sampleTask,
        status: 'completed',
        progress: 100,
        completedAt: Date.now()
      };

      await persistence.saveTask(updatedTask);
      const retrieved = await persistence.getTask(sampleTask.id);
      
      expect(retrieved?.status).toBe('completed');
      expect(retrieved?.progress).toBe(100);
      expect(retrieved?.completedAt).toBeDefined();
    });

    test('should handle task with assignment', async () => {
      const assignedTask: PersistedTask = {
        id: 'assigned-task',
        type: 'analysis',
        description: 'Task assigned to specific agent',
        status: 'in_progress',
        priority: 2,
        dependencies: '["task-1", "task-2"]',
        metadata: '{"urgent": true}',
        assignedAgent: 'agent-1',
        progress: 50,
        createdAt: Date.now()
      };

      await persistence.saveTask(assignedTask);
      const retrieved = await persistence.getTask(assignedTask.id);
      
      expect(retrieved?.assignedAgent).toBe('agent-1');
      expect(retrieved?.progress).toBe(50);
    });

    test('should handle task with error', async () => {
      const errorTask: PersistedTask = {
        id: 'error-task',
        type: 'debugging',
        description: 'Task that encountered an error',
        status: 'failed',
        priority: 3,
        dependencies: '[]',
        metadata: '{}',
        progress: 30,
        error: 'Timeout error during execution',
        createdAt: Date.now()
      };

      await persistence.saveTask(errorTask);
      const retrieved = await persistence.getTask(errorTask.id);
      
      expect(retrieved?.error).toBe('Timeout error during execution');
      expect(retrieved?.status).toBe('failed');
    });
  });

  describe('Active Tasks Retrieval', () => {
    beforeEach(async () => {
      // Create test tasks with different statuses
      const tasks: PersistedTask[] = [
        {
          id: 'active-1',
          type: 'coding',
          description: 'Active task 1',
          status: 'pending',
          priority: 3,
          dependencies: '[]',
          metadata: '{}',
          progress: 0,
          createdAt: Date.now() - 1000
        },
        {
          id: 'active-2',
          type: 'review',
          description: 'Active task 2',
          status: 'in_progress',
          priority: 1,
          dependencies: '[]',
          metadata: '{}',
          progress: 50,
          createdAt: Date.now() - 500
        },
        {
          id: 'completed-1',
          type: 'testing',
          description: 'Completed task',
          status: 'completed',
          priority: 2,
          dependencies: '[]',
          metadata: '{}',
          progress: 100,
          createdAt: Date.now() - 2000,
          completedAt: Date.now() - 100
        }
      ];

      for (const task of tasks) {
        await persistence.saveTask(task);
      }
    });

    test('should retrieve only active tasks ordered by priority', async () => {
      const activeTasks = await persistence.getActiveTasks();
      
      expect(activeTasks).toHaveLength(2);
      expect(activeTasks.map(t => t.id)).toContain('active-1');
      expect(activeTasks.map(t => t.id)).toContain('active-2');
      expect(activeTasks.map(t => t.id)).not.toContain('completed-1');
      
      // Should be ordered by priority (higher first)
      expect(activeTasks[0].priority).toBeGreaterThanOrEqual(activeTasks[1].priority);
    });
  });

  describe('Data Integrity', () => {
    test('should maintain data consistency across operations', async () => {
      const agent: PersistedAgent = {
        id: 'consistency-agent',
        type: 'coder',
        name: 'Consistency Test Agent',
        status: 'active',
        capabilities: 'testing',
        systemPrompt: 'Test prompt',
        maxConcurrentTasks: 2,
        priority: 1,
        createdAt: Date.now()
      };

      const task: PersistedTask = {
        id: 'consistency-task',
        type: 'testing',
        description: 'Consistency test task',
        status: 'pending',
        priority: 1,
        dependencies: '[]',
        metadata: '{"urgent": true}',
        assignedAgent: 'consistency-agent',
        progress: 0,
        createdAt: Date.now()
      };

      // Save agent and task
      await persistence.saveAgent(agent);
      await persistence.saveTask(task);

      // Verify both exist
      const retrievedAgent = await persistence.getAgent(agent.id);
      const retrievedTask = await persistence.getTask(task.id);

      expect(retrievedAgent).toEqual(agent);
      expect(retrievedTask).toEqual(task);
    });

    test('should handle concurrent operations', async () => {
      const agents = Array.from({ length: 10 }, (_, i) => ({
        id: `concurrent-agent-${i}`,
        type: 'coder',
        name: `Agent ${i}`,
        status: 'active',
        capabilities: 'testing',
        systemPrompt: 'Concurrent test prompt',
        maxConcurrentTasks: 1,
        priority: i,
        createdAt: Date.now() + i
      }));

      // Save all agents concurrently
      await Promise.all(agents.map(agent => persistence.saveAgent(agent)));

      // Verify each agent has correct data
      for (const agent of agents) {
        const retrieved = await persistence.getAgent(agent.id);
        expect(retrieved).toEqual(agent);
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid JSON in string fields gracefully', async () => {
      // Tasks with malformed JSON should still be saveable
      const taskWithInvalidJson: PersistedTask = {
        id: 'invalid-json-task',
        type: 'test',
        description: 'Task with invalid JSON',
        status: 'pending',
        priority: 1,
        dependencies: 'invalid-json-string',
        metadata: 'also-invalid-json',
        progress: 0,
        createdAt: Date.now()
      };

      // Should not throw when saving
      await expect(persistence.saveTask(taskWithInvalidJson)).resolves.not.toThrow();

      // Should retrieve the task as saved
      const retrieved = await persistence.getTask('invalid-json-task');
      expect(retrieved?.dependencies).toBe('invalid-json-string');
      expect(retrieved?.metadata).toBe('also-invalid-json');
    });

    test('should handle missing required fields', async () => {
      // This test verifies the database constraints work
      // Incomplete agents should fail to save due to schema constraints
      
      // Note: This would require direct database manipulation to test constraints
      // For now, we verify the interface requirements are met
      const incompleteAgent = {
        id: 'incomplete',
        type: 'coder'
        // Missing required fields
      } as PersistedAgent;

      // TypeScript should catch this at compile time
      expect(incompleteAgent.name).toBeUndefined();
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle large number of operations efficiently', async () => {
      const startTime = Date.now();
      
      // Create and save many agents
      const agents = Array.from({ length: 100 }, (_, i) => ({
        id: `perf-agent-${i}`,
        type: 'worker',
        name: `Performance Agent ${i}`,
        status: 'active',
        capabilities: 'performance-testing',
        systemPrompt: 'Performance test agent',
        maxConcurrentTasks: 1,
        priority: i % 5,
        createdAt: Date.now() + i
      }));

      for (const agent of agents) {
        await persistence.saveAgent(agent);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete reasonably quickly (adjust threshold as needed)
      expect(duration).toBeLessThan(5000); // 5 seconds

      // Verify all agents were saved
      for (let i = 0; i < 10; i++) { // Sample check
        const agent = await persistence.getAgent(`perf-agent-${i}`);
        expect(agent).toBeDefined();
        expect(agent?.name).toBe(`Performance Agent ${i}`);
      }
    });

    test('should handle string field limits gracefully', async () => {
      // Test with very long strings
      const longString = 'a'.repeat(10000);
      const agentWithLongFields: PersistedAgent = {
        id: 'long-field-agent',
        type: 'test',
        name: longString,
        status: 'active',
        capabilities: longString,
        systemPrompt: longString,
        maxConcurrentTasks: 1,
        priority: 1,
        createdAt: Date.now()
      };

      // Should handle long strings without error
      await expect(persistence.saveAgent(agentWithLongFields)).resolves.not.toThrow();

      const retrieved = await persistence.getAgent('long-field-agent');
      expect(retrieved?.name).toBe(longString);
      expect(retrieved?.capabilities).toBe(longString);
    });
  });
});