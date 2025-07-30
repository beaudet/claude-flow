/**
 * Simplified MCP Client Functional Tests
 * Tests core Model Context Protocol client functionality
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';

// Mock the logger before importing MCPClient
jest.mock('../../core/logger.js', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

import { MCPClient, type MCPClientConfig } from '../client';
import type { ITransport } from '../transports/base';
import type { MCPRequest, MCPResponse, MCPNotification } from '../../utils/types';

// Simple mock transport for testing
class SimpleMockTransport implements ITransport {
  private connected = false;
  private connectionFailure = false;

  async start(): Promise<void> {
    // No-op for tests
  }

  async stop(): Promise<void> {
    this.connected = false;
  }

  async connect(): Promise<void> {
    if (this.connectionFailure) {
      throw new Error('Mock connection failure');
    }
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  onRequest(handler: (request: MCPRequest) => Promise<MCPResponse>): void {
    // No-op for basic tests
  }

  onNotification(handler: (notification: MCPNotification) => Promise<void>): void {
    // No-op for basic tests
  }

  async sendRequest(request: MCPRequest): Promise<MCPResponse> {
    if (!this.connected) {
      throw new Error('Transport not connected');
    }

    return {
      jsonrpc: '2.0',
      id: request.id!,
      result: { success: true, method: request.method }
    };
  }

  async sendNotification(notification: MCPNotification): Promise<void> {
    if (!this.connected) {
      throw new Error('Transport not connected');
    }
  }

  async getHealthStatus(): Promise<{
    healthy: boolean;
    error?: string;
    metrics?: Record<string, number>;
  }> {
    return {
      healthy: this.connected,
      error: this.connected ? undefined : 'Not connected'
    };
  }

  // Test control methods
  setConnectionFailure(shouldFail: boolean): void {
    this.connectionFailure = shouldFail;
  }
}

describe('MCP Client Basic Functional Tests', () => {
  let client: MCPClient;
  let mockTransport: SimpleMockTransport;
  let config: MCPClientConfig;

  beforeEach(() => {
    mockTransport = new SimpleMockTransport();
    config = {
      transport: mockTransport,
      timeout: 5000,
      enableRecovery: false
    };
    client = new MCPClient(config);
  });

  afterEach(async () => {
    await client.cleanup();
  });

  describe('Basic Connection Management', () => {
    test('should create client instance', () => {
      expect(client).toBeDefined();
      expect(client.isConnected()).toBe(false);
    });

    test('should connect successfully', async () => {
      await client.connect();
      expect(client.isConnected()).toBe(true);
    });

    test('should handle connection failures', async () => {
      mockTransport.setConnectionFailure(true);
      await expect(client.connect()).rejects.toThrow('Mock connection failure');
      expect(client.isConnected()).toBe(false);
    });

    test('should disconnect successfully', async () => {
      await client.connect();
      expect(client.isConnected()).toBe(true);

      await client.disconnect();
      expect(client.isConnected()).toBe(false);
    });

    test('should handle disconnect when not connected', async () => {
      expect(client.isConnected()).toBe(false);
      await expect(client.disconnect()).resolves.not.toThrow();
    });
  });

  describe('Basic Request Handling', () => {
    beforeEach(async () => {
      await client.connect();
    });

    test('should send basic requests', async () => {
      const result = await client.request('testMethod', { data: 'test' });
      expect(result).toEqual({
        success: true,
        method: 'testMethod'
      });
    });

    test('should handle requests without parameters', async () => {
      const result = await client.request('simpleMethod');
      expect(result).toEqual({
        success: true,
        method: 'simpleMethod'
      });
    });

    test('should reject requests when disconnected', async () => {
      await client.disconnect();
      await expect(client.request('testMethod')).rejects.toThrow('Client not connected');
    });

    test('should handle concurrent requests', async () => {
      const requests = [
        client.request('method1'),
        client.request('method2'),
        client.request('method3')
      ];

      const results = await Promise.all(requests);
      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ success: true, method: 'method1' });
      expect(results[1]).toEqual({ success: true, method: 'method2' });
      expect(results[2]).toEqual({ success: true, method: 'method3' });
    });
  });

  describe('Basic Notification Handling', () => {
    beforeEach(async () => {
      await client.connect();
    });

    test('should send notifications', async () => {
      await expect(client.notify('testNotification', { data: 'test' })).resolves.not.toThrow();
    });

    test('should send notifications without parameters', async () => {
      await expect(client.notify('simpleNotification')).resolves.not.toThrow();
    });

    test('should reject notifications when disconnected', async () => {
      await client.disconnect();
      await expect(client.notify('testNotification')).rejects.toThrow('Client not connected');
    });

    test('should allow heartbeat notifications when disconnected', async () => {
      await client.disconnect();
      await expect(client.notify('heartbeat', { timestamp: Date.now() })).resolves.not.toThrow();
    });
  });

  describe('Basic Event Handling', () => {
    test('should emit connected event', async () => {
      let eventEmitted = false;
      client.once('connected', () => {
        eventEmitted = true;
      });

      await client.connect();
      expect(eventEmitted).toBe(true);
    });

    test('should emit disconnected event', async () => {
      let eventEmitted = false;
      
      await client.connect();
      client.once('disconnected', () => {
        eventEmitted = true;
      });

      await client.disconnect();
      expect(eventEmitted).toBe(true);
    });
  });

  describe('Basic Error Recovery', () => {
    test('should handle connection recovery', async () => {
      // Initial connection
      await client.connect();
      expect(client.isConnected()).toBe(true);

      // Disconnect
      await client.disconnect();
      expect(client.isConnected()).toBe(false);

      // Reconnect
      await client.connect();
      expect(client.isConnected()).toBe(true);

      // Should be able to make requests again
      const result = await client.request('recoveryTest');
      expect(result).toEqual({ success: true, method: 'recoveryTest' });
    });

    test('should handle intermittent failures', async () => {
      // First connection succeeds
      await client.connect();
      expect(client.isConnected()).toBe(true);

      // Disconnect and make connection fail
      await client.disconnect();
      mockTransport.setConnectionFailure(true);

      // Connection should fail
      await expect(client.connect()).rejects.toThrow();
      expect(client.isConnected()).toBe(false);

      // Fix connection and retry
      mockTransport.setConnectionFailure(false);
      await client.connect();
      expect(client.isConnected()).toBe(true);
    });
  });

  describe('Cleanup and Resource Management', () => {
    test('should cleanup successfully', async () => {
      await client.connect();
      expect(client.isConnected()).toBe(true);

      await client.cleanup();
      expect(client.isConnected()).toBe(false);
    });

    test('should handle cleanup when not connected', async () => {
      expect(client.isConnected()).toBe(false);
      await expect(client.cleanup()).resolves.not.toThrow();
    });

    test('should handle multiple cleanup calls', async () => {
      await client.connect();
      await client.cleanup();
      await expect(client.cleanup()).resolves.not.toThrow();
    });
  });

  describe('Recovery Configuration', () => {
    test('should initialize without recovery by default', () => {
      expect(client.getRecoveryStatus()).toBeUndefined();
    });

    test('should throw error when forcing recovery without recovery enabled', async () => {
      await expect(client.forceRecovery()).rejects.toThrow('Recovery not enabled');
    });
  });

  describe('Integration Workflow', () => {
    test('should handle complete workflow', async () => {
      // Connect
      await client.connect();
      expect(client.isConnected()).toBe(true);

      // Make requests
      const results = await Promise.all([
        client.request('getData'),
        client.request('setData', { value: 'test' }),
        client.request('deleteData')
      ]);

      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result).toHaveProperty('success', true);
      });

      // Send notifications
      await Promise.all([
        client.notify('dataChanged'),
        client.notify('userAction', { action: 'test' })
      ]);

      // Disconnect
      await client.disconnect();
      expect(client.isConnected()).toBe(false);
    });

    test('should handle high-level operations', async () => {
      await client.connect();

      // Perform multiple operations in sequence
      for (let i = 0; i < 10; i++) {
        const result = await client.request('operation', { index: i });
        expect(result).toEqual({ success: true, method: 'operation' });
        
        await client.notify('progress', { step: i });
      }

      // Connection should remain stable
      expect(client.isConnected()).toBe(true);
    });
  });
});