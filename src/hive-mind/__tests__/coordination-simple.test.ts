/**
 * Simple Coordination System Functional Tests
 * Tests basic swarm coordination, agent initialization, and core functionality
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';

// Import types and classes
import { Agent } from '../core/Agent';
import { Queen } from '../core/Queen';
import { HiveMind } from '../core/HiveMind';
import type { AgentConfig, QueenConfig, SwarmTopology, QueenMode } from '../types';

describe('Coordination System Basic Tests', () => {
  let tmpDir: string;

  beforeEach(() => {
    // Create temporary directory for each test
    tmpDir = join(tmpdir(), `test-coordination-${Date.now()}`);
  });

  afterEach(() => {
    // Clean up temporary directory
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch (error) {
      // Directory may not exist
    }
  });

  describe('Agent Basic Operations', () => {
    test('should create agent with valid configuration', () => {
      const agentConfig: AgentConfig = {
        id: 'test-agent-1',
        name: 'Test Agent',
        type: 'coder',
        swarmId: 'test-swarm',
        capabilities: ['code_generation', 'debugging']
      };

      const agent = new Agent(agentConfig);

      expect(agent.id).toBe('test-agent-1');
      expect(agent.name).toBe('Test Agent');
      expect(agent.type).toBe('coder');
      expect(agent.swarmId).toBe('test-swarm');
      expect(agent.capabilities).toEqual(['code_generation', 'debugging']);
      expect(agent.status).toBe('idle');
      expect(agent.currentTask).toBeNull();
    });

    test('should handle agent with different types', () => {
      const agentTypes = ['researcher', 'analyst', 'reviewer', 'tester'] as const;
      
      agentTypes.forEach((type, index) => {
        const agentConfig: AgentConfig = {
          id: `${type}-agent-${index}`,
          name: `${type} Agent`,
          type,
          swarmId: 'multi-type-swarm',
          capabilities: ['task_management']
        };

        const agent = new Agent(agentConfig);
        expect(agent.type).toBe(type);
        expect(agent.id).toBe(`${type}-agent-${index}`);
      });
    });

    test('should create agent with auto-generated ID if not provided', () => {
      const agentConfig: AgentConfig = {
        name: 'Auto ID Agent',
        type: 'coordinator',
        swarmId: 'auto-swarm',
        capabilities: ['consensus_building']
      };

      const agent = new Agent(agentConfig);
      expect(agent.id).toBeDefined();
      expect(agent.id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    });

    test('should handle various agent capabilities', () => {
      const capabilities = [
        'information_gathering',
        'pattern_recognition', 
        'knowledge_synthesis',
        'performance_metrics',
        'data_analysis'
      ] as const;

      const agentConfig: AgentConfig = {
        id: 'multi-capability-agent',
        name: 'Multi-Capability Agent',
        type: 'specialist',
        swarmId: 'capability-swarm',
        capabilities
      };

      const agent = new Agent(agentConfig);
      expect(agent.capabilities).toEqual(capabilities);
      expect(agent.capabilities).toHaveLength(5);
    });

    test('should track agent creation time', () => {
      const beforeCreation = new Date();
      
      const agentConfig: AgentConfig = {
        id: 'time-test-agent',
        name: 'Time Test Agent',
        type: 'monitor',
        swarmId: 'time-swarm',
        capabilities: ['monitoring']
      };

      const agent = new Agent(agentConfig);
      const afterCreation = new Date();

      expect(agent.createdAt).toBeInstanceOf(Date);
      expect(agent.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreation.getTime());
      expect(agent.createdAt.getTime()).toBeLessThanOrEqual(afterCreation.getTime());
    });
  });

  describe('Queen Basic Operations', () => {
    test('should create queen with valid configuration', () => {
      const queenConfig = {
        swarmId: 'test-swarm',
        mode: 'centralized' as QueenMode,
        topology: 'hierarchical' as SwarmTopology
      };

      const queen = new Queen(queenConfig);

      expect(queen).toBeDefined();
      // Test that it's an EventEmitter
      expect(typeof queen.on).toBe('function');
      expect(typeof queen.emit).toBe('function');
    });

    test('should handle different queen modes', () => {
      const modes: QueenMode[] = ['centralized', 'distributed'];
      
      modes.forEach(mode => {
        const queenConfig = {
          swarmId: `${mode}-swarm`,
          mode,
          topology: 'mesh' as SwarmTopology
        };

        const queen = new Queen(queenConfig);
        expect(queen).toBeDefined();
      });
    });

    test('should handle different swarm topologies', () => {
      const topologies: SwarmTopology[] = ['mesh', 'hierarchical', 'ring', 'star'];
      
      topologies.forEach(topology => {
        const queenConfig = {
          swarmId: `${topology}-swarm`,
          mode: 'centralized' as QueenMode,
          topology
        };

        const queen = new Queen(queenConfig);
        expect(queen).toBeDefined();
      });
    });
  });

  describe('HiveMind Basic Operations', () => {
    test('should create hive mind instance', () => {
      const hiveMindConfig = {
        name: 'test-hive',
        topology: 'hierarchical' as SwarmTopology,
        maxAgents: 10,
        queenMode: 'centralized' as QueenMode,
        memoryTTL: 3600000,
        consensusThreshold: 0.6,
        autoSpawn: false,
        createdAt: new Date()
      };

      const hiveMind = new HiveMind(hiveMindConfig, tmpDir);

      expect(hiveMind).toBeDefined();
      expect(typeof hiveMind.initialize).toBe('function');
      expect(typeof hiveMind.shutdown).toBe('function');
    });

    test('should handle different hive mind configurations', () => {
      const configs = [
        {
          name: 'small-hive',
          topology: 'mesh' as SwarmTopology,
          maxAgents: 5,
          queenMode: 'distributed' as QueenMode,
          memoryTTL: 1800000,
          consensusThreshold: 0.5,
          autoSpawn: true,
          createdAt: new Date()
        },
        {
          name: 'large-hive',
          topology: 'star' as SwarmTopology,
          maxAgents: 50,
          queenMode: 'centralized' as QueenMode,
          memoryTTL: 7200000,
          consensusThreshold: 0.8,
          autoSpawn: false,
          createdAt: new Date()
        }
      ];

      configs.forEach(config => {
        const hiveMind = new HiveMind(config, tmpDir);
        expect(hiveMind).toBeDefined();
      });
    });
  });

  describe('Integration Basic Tests', () => {
    test('should handle agent and queen interaction', () => {
      const agentConfig: AgentConfig = {
        id: 'integration-agent',
        name: 'Integration Agent',
        type: 'coordinator',
        swarmId: 'integration-swarm',
        capabilities: ['task_management', 'consensus_building']
      };

      const queenConfig = {
        swarmId: 'integration-swarm',
        mode: 'centralized' as QueenMode,
        topology: 'hierarchical' as SwarmTopology
      };

      const agent = new Agent(agentConfig);
      const queen = new Queen(queenConfig);

      expect(agent.swarmId).toBe(queenConfig.swarmId);
      expect(agent.capabilities).toContain('consensus_building');
    });

    test('should handle multiple agents with same swarm ID', () => {
      const swarmId = 'multi-agent-swarm';
      const agents = [];

      for (let i = 0; i < 5; i++) {
        const agentConfig: AgentConfig = {
          id: `agent-${i}`,
          name: `Agent ${i}`,
          type: 'specialist',
          swarmId,
          capabilities: ['pattern_recognition']
        };

        const agent = new Agent(agentConfig);
        agents.push(agent);
      }

      // All agents should belong to the same swarm
      agents.forEach(agent => {
        expect(agent.swarmId).toBe(swarmId);
      });

      // All agents should have unique IDs
      const ids = agents.map(agent => agent.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(agents.length);
    });

    test('should handle complex swarm configuration', () => {
      const swarmId = 'complex-swarm';
      
      // Create multiple agent types
      const agentConfigs: AgentConfig[] = [
        {
          id: 'coordinator-1',
          name: 'Main Coordinator',
          type: 'coordinator',
          swarmId,
          capabilities: ['task_management', 'resource_allocation']
        },
        {
          id: 'researcher-1',
          name: 'Research Agent',
          type: 'researcher',
          swarmId,
          capabilities: ['information_gathering', 'pattern_recognition']
        },
        {
          id: 'coder-1',
          name: 'Code Agent',
          type: 'coder',
          swarmId,
          capabilities: ['code_generation', 'debugging']
        },
        {
          id: 'analyst-1',
          name: 'Analysis Agent',
          type: 'analyst',
          swarmId,
          capabilities: ['data_analysis', 'performance_metrics']
        }
      ];

      const agents = agentConfigs.map(config => new Agent(config));
      
      const queenConfig = {
        swarmId,
        mode: 'centralized' as QueenMode,
        topology: 'hierarchical' as SwarmTopology
      };

      const queen = new Queen(queenConfig);

      const hiveMindConfig = {
        name: 'complex-hive',
        topology: 'hierarchical' as SwarmTopology,
        maxAgents: 20,
        queenMode: 'centralized' as QueenMode,
        memoryTTL: 3600000,
        consensusThreshold: 0.7,
        autoSpawn: false,
        createdAt: new Date()
      };

      const hiveMind = new HiveMind(hiveMindConfig, tmpDir);

      // Verify all components are created successfully
      expect(agents).toHaveLength(4);
      expect(queen).toBeDefined();
      expect(hiveMind).toBeDefined();

      // Verify agent diversity
      const agentTypes = agents.map(agent => agent.type);
      const uniqueTypes = new Set(agentTypes);
      expect(uniqueTypes.size).toBe(4);

      // Verify capability distribution
      const allCapabilities = agents.flatMap(agent => agent.capabilities);
      const uniqueCapabilities = new Set(allCapabilities);
      expect(uniqueCapabilities.size).toBeGreaterThan(4);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle agent with empty capabilities', () => {
      const agentConfig: AgentConfig = {
        id: 'no-capabilities-agent',
        name: 'No Capabilities Agent',
        type: 'monitor',
        swarmId: 'edge-case-swarm'
        // capabilities not provided
      };

      const agent = new Agent(agentConfig);
      expect(agent.capabilities).toEqual([]);
    });

    test('should handle very long agent names and IDs', () => {
      const longId = 'a'.repeat(100);
      const longName = 'Very Long Agent Name '.repeat(10);

      const agentConfig: AgentConfig = {
        id: longId,
        name: longName,
        type: 'specialist',
        swarmId: 'long-names-swarm',
        capabilities: ['pattern_recognition']
      };

      const agent = new Agent(agentConfig);
      expect(agent.id).toBe(longId);
      expect(agent.name).toBe(longName);
      expect(agent.name.length).toBeGreaterThan(100);
    });

    test('should handle special characters in configuration', () => {
      const agentConfig: AgentConfig = {
        id: 'special-chars-agent-123!@#',
        name: 'Agent with émojis 🤖 and spéciäl chars',
        type: 'specialist',
        swarmId: 'special-swarm-αβγ',
        capabilities: ['pattern_recognition']
      };

      const agent = new Agent(agentConfig);
      expect(agent.id).toContain('special-chars');
      expect(agent.name).toContain('🤖');
      expect(agent.swarmId).toContain('αβγ');
    });

    test('should handle maximum configuration values', () => {
      const hiveMindConfig = {
        name: 'max-config-hive',
        topology: 'mesh' as SwarmTopology,
        maxAgents: 1000,
        queenMode: 'distributed' as QueenMode,
        memoryTTL: Number.MAX_SAFE_INTEGER,
        consensusThreshold: 1.0,
        autoSpawn: true,
        enabledFeatures: Array.from({ length: 50 }, (_, i) => `feature-${i}`),
        createdAt: new Date()
      };

      const hiveMind = new HiveMind(hiveMindConfig, tmpDir);
      expect(hiveMind).toBeDefined();
    });
  });

  describe('Event System Basic Tests', () => {
    test('should emit events from agents', (done) => {
      const agentConfig: AgentConfig = {
        id: 'event-agent',
        name: 'Event Agent',
        type: 'monitor',
        swarmId: 'event-swarm',
        capabilities: ['monitoring']
      };

      const agent = new Agent(agentConfig);
      
      agent.on('test-event', (data) => {
        expect(data.message).toBe('test message');
        done();
      });

      agent.emit('test-event', { message: 'test message' });
    });

    test('should emit events from queen', (done) => {
      const queenConfig = {
        swarmId: 'event-swarm',
        mode: 'centralized' as QueenMode,
        topology: 'hierarchical' as SwarmTopology
      };

      const queen = new Queen(queenConfig);
      
      queen.on('test-queen-event', (data) => {
        expect(data.status).toBe('active');
        done();
      });

      queen.emit('test-queen-event', { status: 'active' });
    });

    test('should handle multiple event listeners', () => {
      const agentConfig: AgentConfig = {
        id: 'multi-listener-agent',
        name: 'Multi Listener Agent',
        type: 'coordinator',
        swarmId: 'listener-swarm',
        capabilities: ['task_management']
      };

      const agent = new Agent(agentConfig);
      let eventCount = 0;

      // Add multiple listeners
      agent.on('count-event', () => eventCount++);
      agent.on('count-event', () => eventCount++);
      agent.on('count-event', () => eventCount++);

      agent.emit('count-event');
      expect(eventCount).toBe(3);
    });
  });
});