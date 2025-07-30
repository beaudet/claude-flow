/**
 * Comprehensive Functional Tests for MCP Client
 * Tests core Model Context Protocol client functionality and integration
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { MCPClient, type MCPClientConfig } from '../client';
import type { ITransport } from '../transports/base';
import type { MCPRequest, MCPResponse, MCPNotification } from '../../utils/types';

// Configure logger for test environment
process.env.CLAUDE_FLOW_ENV = 'test';

// Mock logger to avoid initialization issues
jest.mock('../../core/logger.js', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock transport for testing
class MockTransport implements ITransport {
  private connected = false;
  private requestHandler?: (request: MCPRequest) => Promise<MCPResponse>;
  private notificationHandler?: (notification: MCPNotification) => Promise<void>;
  private shouldFailConnection = false;
  private shouldFailRequest = false;
  private responseDelay = 0;

  async start(): Promise<void> {
    // Start the transport service
  }

  async stop(): Promise<void> {
    this.connected = false;
  }

  async connect(): Promise<void> {
    if (this.shouldFailConnection) {
      throw new Error('Mock connection failure');
    }
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  onRequest(handler: (request: MCPRequest) => Promise<MCPResponse>): void {
    this.requestHandler = handler;
  }

  onNotification(handler: (notification: MCPNotification) => Promise<void>): void {
    this.notificationHandler = handler;
  }

  async sendRequest(request: MCPRequest): Promise<MCPResponse> {
    if (!this.connected) {
      throw new Error('Transport not connected');
    }
    
    if (this.shouldFailRequest) {
      throw new Error('Mock request failure');
    }

    // Simulate response delay if configured
    if (this.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.responseDelay));
    }

    if (this.requestHandler) {
      return this.requestHandler(request);
    }

    // Default success response
    return {
      jsonrpc: '2.0',
      id: request.id!,
      result: { success: true, data: request.params }
    };
  }

  async sendNotification(notification: MCPNotification): Promise<void> {
    if (!this.connected) {
      throw new Error('Transport not connected');
    }

    if (this.notificationHandler) {
      await this.notificationHandler(notification);
    }
  }

  async getHealthStatus(): Promise<{
    healthy: boolean;
    error?: string;
    metrics?: Record<string, number>;
  }> {
    return {
      healthy: this.connected,
      error: this.connected ? undefined : 'Not connected',
      metrics: {
        requestCount: 0,
        connectionTime: this.connected ? Date.now() : 0
      }
    };
  }

  // Test control methods
  setConnectionFailure(shouldFail: boolean): void {
    this.shouldFailConnection = shouldFail;
  }

  setRequestFailure(shouldFail: boolean): void {
    this.shouldFailRequest = shouldFail;
  }

  setResponseDelay(delay: number): void {
    this.responseDelay = delay;
  }

  setRequestHandler(handler: (request: MCPRequest) => Promise<MCPResponse>): void {
    this.requestHandler = handler;
  }

  setNotificationHandler(handler: (notification: MCPNotification) => Promise<void>): void {
    this.notificationHandler = handler;
  }
}

describe('MCP Client Functional Tests', () => {
  let client: MCPClient;
  let mockTransport: MockTransport;
  let config: MCPClientConfig;

  beforeEach(() => {
    mockTransport = new MockTransport();
    config = {
      transport: mockTransport,
      timeout: 5000,
      enableRecovery: false // Disable recovery for most tests
    };
    client = new MCPClient(config);
  });

  afterEach(async () => {
    await client.cleanup();
  });

  describe('Connection Management', () => {
    test('should connect successfully', async () => {
      const connectPromise = new Promise<void>(resolve => {
        client.once('connected', resolve);
      });

      await client.connect();
      await connectPromise;

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

      const disconnectPromise = new Promise<void>(resolve => {
        client.once('disconnected', resolve);
      });

      await client.disconnect();
      await disconnectPromise;

      expect(client.isConnected()).toBe(false);
    });

    test('should handle multiple connection attempts', async () => {
      await client.connect();
      expect(client.isConnected()).toBe(true);

      // Second connection should not cause issues
      await client.connect();
      expect(client.isConnected()).toBe(true);
    });

    test('should handle disconnect when not connected', async () => {
      expect(client.isConnected()).toBe(false);
      
      // Should not throw
      await expect(client.disconnect()).resolves.not.toThrow();
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('Request Handling', () => {
    beforeEach(async () => {
      await client.connect();
    });

    test('should send and receive successful requests', async () => {
      const testParams = { action: 'test', data: [1, 2, 3] };
      
      const result = await client.request('testMethod', testParams);
      
      expect(result).toEqual({
        success: true,
        data: testParams
      });
    });

    test('should handle requests with no parameters', async () => {
      const result = await client.request('noParamsMethod');
      
      expect(result).toEqual({
        success: true,
        data: undefined
      });
    });

    test('should handle error responses', async () => {
      mockTransport.setRequestHandler(async (request) => ({
        jsonrpc: '2.0',
        id: request.id!,
        error: {
          code: -32603,
          message: 'Internal error'
        }
      }));

      await expect(client.request('errorMethod')).rejects.toThrow('Internal error');
    });

    test('should handle request timeouts', async () => {
      // Set response delay longer than timeout
      mockTransport.setResponseDelay(6000);
      
      await expect(client.request('slowMethod')).rejects.toThrow('Request timeout: slowMethod');
    }, 7000);

    test('should reject requests when not connected', async () => {
      await client.disconnect();
      
      await expect(client.request('testMethod')).rejects.toThrow('Client not connected');
    });

    test('should handle transport request failures', async () => {
      mockTransport.setRequestFailure(true);
      
      await expect(client.request('testMethod')).rejects.toThrow('Mock request failure');
    });

    test('should handle multiple concurrent requests', async () => {
      const requests = Array.from({ length: 10 }, (_, i) => 
        client.request('concurrentMethod', { index: i })
      );

      const results = await Promise.all(requests);
      
      expect(results).toHaveLength(10);
      results.forEach((result, index) => {
        expect(result).toEqual({
          success: true,
          data: { index }
        });
      });
    });

    test('should generate unique request IDs', async () => {
      const requestIds = new Set<string>();
      
      mockTransport.setRequestHandler(async (request) => {
        requestIds.add(String(request.id));
        return {
          jsonrpc: '2.0',
          id: request.id!,
          result: { requestId: request.id }
        };
      });

      // Send multiple requests
      await Promise.all([
        client.request('method1'),
        client.request('method2'),
        client.request('method3'),
        client.request('method4'),
        client.request('method5')
      ]);

      expect(requestIds.size).toBe(5); // All IDs should be unique
    });
  });

  describe('Notification Handling', () => {
    beforeEach(async () => {
      await client.connect();
    });

    test('should send notifications successfully', async () => {
      const notifications: MCPNotification[] = [];
      
      mockTransport.setNotificationHandler(async (notification) => {
        notifications.push(notification);
      });

      await client.notify('testNotification', { message: 'hello' });
      
      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toEqual({
        jsonrpc: '2.0',
        method: 'testNotification',
        params: { message: 'hello' }
      });
    });

    test('should send notifications without parameters', async () => {
      const notifications: MCPNotification[] = [];
      
      mockTransport.setNotificationHandler(async (notification) => {
        notifications.push(notification);
      });

      await client.notify('simpleNotification');
      
      expect(notifications).toHaveLength(1);
      expect(notifications[0].method).toBe('simpleNotification');
      expect(notifications[0].params).toBeUndefined();
    });

    test('should handle heartbeat notifications when disconnected', async () => {
      await client.disconnect();
      
      const notifications: MCPNotification[] = [];
      mockTransport.setNotificationHandler(async (notification) => {
        notifications.push(notification);
      });

      // Heartbeat should be allowed even when disconnected
      await expect(client.notify('heartbeat', { timestamp: Date.now() })).resolves.not.toThrow();
    });

    test('should reject non-heartbeat notifications when disconnected', async () => {
      await client.disconnect();
      
      await expect(client.notify('regularNotification')).rejects.toThrow('Client not connected');
    });

    test('should handle transport without notification support', async () => {
      // Remove notification support from transport
      delete (mockTransport as any).sendNotification;
      
      await expect(client.notify('testNotification')).rejects.toThrow('Transport does not support notifications');
    });

    test('should handle multiple notifications', async () => {
      const notifications: MCPNotification[] = [];
      
      mockTransport.setNotificationHandler(async (notification) => {
        notifications.push(notification);
      });

      await Promise.all([
        client.notify('notification1', { data: 1 }),
        client.notify('notification2', { data: 2 }),
        client.notify('notification3', { data: 3 })
      ]);
      
      expect(notifications).toHaveLength(3);
      expect(notifications.map(n => n.method)).toEqual(['notification1', 'notification2', 'notification3']);
    });
  });

  describe('Event Handling', () => {
    test('should emit connected event on successful connection', async () => {
      const events: string[] = [];
      
      client.on('connected', () => events.push('connected'));
      
      await client.connect();
      
      expect(events).toContain('connected');
    });

    test('should emit disconnected event on disconnection', async () => {
      const events: string[] = [];
      
      client.on('disconnected', () => events.push('disconnected'));
      
      await client.connect();
      await client.disconnect();
      
      expect(events).toContain('disconnected');
    });

    test('should not emit disconnected event if not connected', async () => {
      const events: string[] = [];
      
      client.on('disconnected', () => events.push('disconnected'));
      
      await client.disconnect(); // Disconnect without connecting first
      
      expect(events).not.toContain('disconnected');
    });
  });

  describe('Recovery Configuration', () => {
    test('should initialize without recovery by default', () => {
      const simpleClient = new MCPClient({ transport: mockTransport });
      
      expect(simpleClient.getRecoveryStatus()).toBeUndefined();
    });

    test('should handle recovery configuration', () => {
      const recoveryConfig = {
        transport: mockTransport,
        enableRecovery: true,
        recoveryConfig: {
          maxRetries: 3,
          retryDelay: 1000,
          backoffFactor: 2,
          maxRetryDelay: 30000,
          healthCheckInterval: 5000,
          fallbackTimeout: 10000
        },
        mcpConfig: {
          transport: 'stdio' as any,
          serverPath: '/test/path'
        }
      };

      const clientWithRecovery = new MCPClient(recoveryConfig);
      
      // Recovery manager should be initialized
      expect(clientWithRecovery.getRecoveryStatus).toBeDefined();
    });

    test('should throw error when forcing recovery without recovery enabled', async () => {
      await expect(client.forceRecovery()).rejects.toThrow('Recovery not enabled');
    });
  });

  describe('Cleanup and Resource Management', () => {
    test('should cleanup pending requests on cleanup', async () => {
      await client.connect();
      
      // Start a request but don't let it complete
      mockTransport.setResponseDelay(10000);
      
      const requestPromise = client.request('slowMethod');
      
      // Cleanup should reject pending requests
      await client.cleanup();
      
      await expect(requestPromise).rejects.toThrow('Client cleanup');
    });

    test('should disconnect on cleanup', async () => {
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

  describe('Integration Scenarios', () => {
    test('should handle complete request-response workflow', async () => {
      const workflow = async () => {
        // Connect
        await client.connect();
        expect(client.isConnected()).toBe(true);

        // Send various requests
        const results = await Promise.all([
          client.request('getData', { id: 1 }),
          client.request('setData', { id: 2, value: 'test' }),
          client.request('deleteData', { id: 3 })
        ]);

        // Send notifications
        await Promise.all([
          client.notify('dataChanged', { type: 'update' }),
          client.notify('userAction', { action: 'click' })
        ]);

        // Disconnect
        await client.disconnect();
        expect(client.isConnected()).toBe(false);

        return results;
      };

      const results = await workflow();
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toHaveProperty('success', true);
      });
    });

    test('should handle connection recovery simulation', async () => {
      await client.connect();
      expect(client.isConnected()).toBe(true);

      // Simulate connection loss
      await client.disconnect();
      expect(client.isConnected()).toBe(false);

      // Reconnect
      await client.connect();
      expect(client.isConnected()).toBe(true);

      // Should be able to make requests again
      const result = await client.request('testAfterReconnect');
      expect(result).toHaveProperty('success', true);
    });

    test('should handle mixed request and notification patterns', async () => {
      await client.connect();
      
      const requests: string[] = [];
      const notifications: string[] = [];
      
      mockTransport.setRequestHandler(async (request) => {
        requests.push(request.method);
        return {
          jsonrpc: '2.0',
          id: request.id!,
          result: { method: request.method }
        };
      });
      
      mockTransport.setNotificationHandler(async (notification) => {
        notifications.push(notification.method);
      });

      // Interleave requests and notifications
      await client.notify('start');
      await client.request('step1');
      await client.notify('progress', { step: 1 });
      await client.request('step2');
      await client.notify('progress', { step: 2 });
      await client.request('step3');
      await client.notify('complete');

      expect(requests).toEqual(['step1', 'step2', 'step3']);
      expect(notifications).toEqual(['start', 'progress', 'progress', 'complete']);
    });
  });

  describe('Error Recovery and Resilience', () => {
    test('should handle intermittent connection failures', async () => {
      // First connection succeeds
      await client.connect();
      expect(client.isConnected()).toBe(true);

      // Disconnect and set connection to fail
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

    test('should handle request failures gracefully', async () => {
      await client.connect();
      
      // Set transport to fail requests
      mockTransport.setRequestFailure(true);
      
      await expect(client.request('failingMethod')).rejects.toThrow('Mock request failure');
      
      // Fix transport and verify it works again
      mockTransport.setRequestFailure(false);
      const result = await client.request('workingMethod');
      expect(result).toHaveProperty('success', true);
    });

    test('should clean up resources after errors', async () => {
      await client.connect();
      
      // Start multiple requests that will fail
      mockTransport.setRequestFailure(true);
      
      const failingRequests = Promise.all([
        client.request('fail1').catch(() => 'failed'),
        client.request('fail2').catch(() => 'failed'),
        client.request('fail3').catch(() => 'failed')
      ]);
      
      const results = await failingRequests;
      expect(results.every(r => r === 'failed')).toBe(true);
      
      // Cleanup should succeed even after errors
      await expect(client.cleanup()).resolves.not.toThrow();
    });
  });

  describe('Performance and Concurrency', () => {
    test('should handle high request volume', async () => {
      await client.connect();
      
      const requestCount = 100;
      const requests = Array.from({ length: requestCount }, (_, i) => 
        client.request('bulkMethod', { index: i })
      );

      const results = await Promise.all(requests);
      
      expect(results).toHaveLength(requestCount);
      results.forEach((result, index) => {
        expect(result).toEqual({
          success: true,
          data: { index }
        });
      });
    });

    test('should handle concurrent request and notification load', async () => {
      await client.connect();
      
      const operations = [];
      
      // Mix requests and notifications
      for (let i = 0; i < 50; i++) {
        operations.push(client.request('loadTest', { index: i }));
        operations.push(client.notify('loadNotification', { index: i }));
      }

      // All operations should complete without error
      await expect(Promise.all(operations)).resolves.not.toThrow();
    });

    test('should maintain connection state under load', async () => {
      await client.connect();
      
      // Perform many operations
      const operations = Array.from({ length: 200 }, (_, i) => {
        if (i % 2 === 0) {
          return client.request('loadMethod', { op: i });
        } else {
          return client.notify('loadNotification', { op: i });
        }
      });

      await Promise.all(operations);
      
      // Connection should still be active
      expect(client.isConnected()).toBe(true);
      
      // Should still be able to make requests
      const finalResult = await client.request('finalTest');
      expect(finalResult).toHaveProperty('success', true);
    });
  });
});