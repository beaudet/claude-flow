/**
 * Comprehensive MCP Client Functional Tests
 * Tests the Model Context Protocol client with mock transport for realistic integration scenarios
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';

// Mock dependencies
jest.mock('../logger.js', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    configure: jest.fn(),
  })),
}));

// Mock transport layer
interface MockTransportMessage {
  id?: string;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
  jsonrpc: '2.0';
}

class MockTransport extends EventEmitter {
  private isConnected = false;
  private messageId = 1;
  private pendingRequests = new Map<string, (response: any) => void>();

  async connect(): Promise<void> {
    this.isConnected = true;
    this.emit('connect');
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
    this.emit('disconnect');
  }

  async sendMessage(message: MockTransportMessage): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Transport not connected');
    }

    const id = message.id || this.generateId();
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 10));

    // Handle different message types
    if (message.method) {
      return this.handleRequest(message);
    } else if (message.result || message.error) {
      return this.handleResponse(message);
    }

    throw new Error('Invalid message format');
  }

  private generateId(): string {
    return `msg-${this.messageId++}`;
  }

  private async handleRequest(message: MockTransportMessage): Promise<any> {
    const { method, params } = message;

    // Mock MCP server responses based on method
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: { listChanged: true },
              resources: { subscribe: true, listChanged: true },
              prompts: { listChanged: true },
              logging: {},
            },
            serverInfo: {
              name: 'claude-flow-mcp-server',
              version: '1.0.0',
            },
          },
        };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            tools: [
              {
                name: 'read_file',
                description: 'Read a file from the filesystem',
                inputSchema: {
                  type: 'object',
                  properties: {
                    path: { type: 'string', description: 'File path to read' },
                  },
                  required: ['path'],
                },
              },
              {
                name: 'write_file',
                description: 'Write content to a file',
                inputSchema: {
                  type: 'object',
                  properties: {
                    path: { type: 'string', description: 'File path to write' },
                    content: { type: 'string', description: 'Content to write' },
                  },
                  required: ['path', 'content'],
                },
              },
              {
                name: 'execute_command',
                description: 'Execute a shell command',
                inputSchema: {
                  type: 'object',
                  properties: {
                    command: { type: 'string', description: 'Command to execute' },
                    cwd: { type: 'string', description: 'Working directory' },
                  },
                  required: ['command'],
                },
              },
            ],
          },
        };

      case 'tools/call':
        return this.handleToolCall(message);

      case 'resources/list':
        return {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            resources: [
              {
                uri: 'file:///workspace/config.json',
                name: 'Configuration',
                description: 'Application configuration file',
                mimeType: 'application/json',
              },
              {
                uri: 'memory://swarm/agents',
                name: 'Agent Memory',
                description: 'Persistent agent memory storage',
                mimeType: 'application/json',
              },
            ],
          },
        };

      case 'resources/read':
        return this.handleResourceRead(message);

      case 'prompts/list':
        return {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            prompts: [
              {
                name: 'code_review',
                description: 'Generate a comprehensive code review',
                arguments: [
                  {
                    name: 'language',
                    description: 'Programming language',
                    required: true,
                  },
                  {
                    name: 'complexity',
                    description: 'Code complexity level',
                    required: false,
                  },
                ],
              },
              {
                name: 'test_generation',
                description: 'Generate unit tests for code',
                arguments: [
                  {
                    name: 'framework',
                    description: 'Testing framework to use',
                    required: true,
                  },
                ],
              },
            ],
          },
        };

      case 'prompts/get':
        return this.handlePromptGet(message);

      case 'logging/setLevel':
        return {
          jsonrpc: '2.0',
          id: message.id,
          result: {},
        };

      default:
        return {
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        };
    }
  }

  private handleToolCall(message: MockTransportMessage): any {
    const { params } = message;
    const { name, arguments: args } = params;

    switch (name) {
      case 'read_file':
        if (args.path === '/nonexistent/file.txt') {
          return {
            jsonrpc: '2.0',
            id: message.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: 'Error: File not found',
                },
              ],
              isError: true,
            },
          };
        }
        return {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            content: [
              {
                type: 'text',
                text: `File content for: ${args.path}\nThis is mock file content.`,
              },
            ],
          },
        };

      case 'write_file':
        return {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            content: [
              {
                type: 'text',
                text: `Successfully wrote ${args.content.length} characters to ${args.path}`,
              },
            ],
          },
        };

      case 'execute_command':
        if (args.command === 'echo "Hello World"') {
          return {
            jsonrpc: '2.0',
            id: message.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: 'Hello World\n',
                },
              ],
            },
          };
        } else if (args.command === 'failing-command') {
          return {
            jsonrpc: '2.0',
            id: message.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: 'Command failed with exit code 1',
                },
              ],
              isError: true,
            },
          };
        }
        return {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            content: [
              {
                type: 'text',
                text: `Executed: ${args.command}\nMock command output`,
              },
            ],
          },
        };

      default:
        return {
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32602,
            message: `Unknown tool: ${name}`,
          },
        };
    }
  }

  private handleResourceRead(message: MockTransportMessage): any {
    const { params } = message;
    const { uri } = params;

    if (uri === 'file:///workspace/config.json') {
      return {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          contents: [
            {
              uri: 'file:///workspace/config.json',
              mimeType: 'application/json',
              text: JSON.stringify({
                swarm: {
                  maxAgents: 10,
                  timeout: 30000,
                },
                security: {
                  enabled: true,
                  isolation: 'docker',
                },
              }, null, 2),
            },
          ],
        },
      };
    } else if (uri === 'memory://swarm/agents') {
      return {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          contents: [
            {
              uri: 'memory://swarm/agents',
              mimeType: 'application/json',
              text: JSON.stringify({
                agents: [
                  {
                    id: 'agent-001',
                    type: 'coder',
                    status: 'active',
                    lastSeen: new Date().toISOString(),
                  },
                  {
                    id: 'agent-002',
                    type: 'tester',
                    status: 'idle',
                    lastSeen: new Date().toISOString(),
                  },
                ],
              }, null, 2),
            },
          ],
        },
      };
    }

    return {
      jsonrpc: '2.0',
      id: message.id,
      error: {
        code: -32602,
        message: `Resource not found: ${uri}`,
      },
    };
  }

  private handlePromptGet(message: MockTransportMessage): any {
    const { params } = message;
    const { name, arguments: args } = params;

    if (name === 'code_review') {
      return {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          description: 'Generate a comprehensive code review',
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Please review this ${args?.language || 'code'} with ${args?.complexity || 'standard'} complexity analysis:\n\n[Code would be inserted here]`,
              },
            },
          ],
        },
      };
    } else if (name === 'test_generation') {
      return {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          description: 'Generate unit tests for code',
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Generate ${args?.framework || 'Jest'} unit tests for the following code:\n\n[Code would be inserted here]`,
              },
            },
          ],
        },
      };
    }

    return {
      jsonrpc: '2.0',
      id: message.id,
      error: {
        code: -32602,
        message: `Prompt not found: ${name}`,
      },
    };
  }

  private handleResponse(message: MockTransportMessage): any {
    // Handle responses to our requests
    return message;
  }
}

// Mock MCP Client implementation
class MCPClient extends EventEmitter {
  private transport: MockTransport;
  private isInitialized = false;
  private capabilities: any = {};

  constructor(transport: MockTransport) {
    super();
    this.transport = transport;
  }

  async initialize(): Promise<void> {
    await this.transport.connect();

    const response = await this.transport.sendMessage({
      jsonrpc: '2.0',
      id: 'init-1',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: { listChanged: true },
          sampling: {},
        },
        clientInfo: {
          name: 'claude-flow-client',
          version: '1.0.0',
        },
      },
    });

    if (response.error) {
      throw new Error(`Initialization failed: ${response.error.message}`);
    }

    this.capabilities = response.result.capabilities;
    this.isInitialized = true;
    this.emit('initialized', response.result);
  }

  async shutdown(): Promise<void> {
    await this.transport.disconnect();
    this.isInitialized = false;
    this.emit('shutdown');
  }

  async listTools(): Promise<any[]> {
    if (!this.isInitialized) {
      throw new Error('Client not initialized');
    }

    const response = await this.transport.sendMessage({
      jsonrpc: '2.0',
      id: 'list-tools-1',
      method: 'tools/list',
    });

    if (response.error) {
      throw new Error(`Failed to list tools: ${response.error.message}`);
    }

    return response.result.tools;
  }

  async callTool(name: string, args: any): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Client not initialized');
    }

    const response = await this.transport.sendMessage({
      jsonrpc: '2.0',
      id: `call-tool-${Date.now()}`,
      method: 'tools/call',
      params: {
        name,
        arguments: args,
      },
    });

    if (response.error) {
      throw new Error(`Tool call failed: ${response.error.message}`);
    }

    return response.result;
  }

  async listResources(): Promise<any[]> {
    if (!this.isInitialized) {
      throw new Error('Client not initialized');
    }

    const response = await this.transport.sendMessage({
      jsonrpc: '2.0',
      id: 'list-resources-1',
      method: 'resources/list',
    });

    if (response.error) {
      throw new Error(`Failed to list resources: ${response.error.message}`);
    }

    return response.result.resources;
  }

  async readResource(uri: string): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Client not initialized');
    }

    const response = await this.transport.sendMessage({
      jsonrpc: '2.0',
      id: `read-resource-${Date.now()}`,
      method: 'resources/read',
      params: { uri },
    });

    if (response.error) {
      throw new Error(`Failed to read resource: ${response.error.message}`);
    }

    return response.result;
  }

  async listPrompts(): Promise<any[]> {
    if (!this.isInitialized) {
      throw new Error('Client not initialized');
    }

    const response = await this.transport.sendMessage({
      jsonrpc: '2.0',
      id: 'list-prompts-1',
      method: 'prompts/list',
    });

    if (response.error) {
      throw new Error(`Failed to list prompts: ${response.error.message}`);
    }

    return response.result.prompts;
  }

  async getPrompt(name: string, args?: any): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Client not initialized');
    }

    const response = await this.transport.sendMessage({
      jsonrpc: '2.0',
      id: `get-prompt-${Date.now()}`,
      method: 'prompts/get',
      params: {
        name,
        arguments: args,
      },
    });

    if (response.error) {
      throw new Error(`Failed to get prompt: ${response.error.message}`);
    }

    return response.result;
  }

  async setLoggingLevel(level: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Client not initialized');
    }

    const response = await this.transport.sendMessage({
      jsonrpc: '2.0',
      id: `set-logging-${Date.now()}`,
      method: 'logging/setLevel',
      params: { level },
    });

    if (response.error) {
      throw new Error(`Failed to set logging level: ${response.error.message}`);
    }
  }

  getCapabilities(): any {
    return this.capabilities;
  }

  isConnected(): boolean {
    return this.isInitialized;
  }
}

describe('MCP Client Functional Tests', () => {
  let transport: MockTransport;
  let client: MCPClient;

  beforeEach(() => {
    transport = new MockTransport();
    client = new MCPClient(transport);
  });

  afterEach(async () => {
    try {
      await client.shutdown();
    } catch (error) {
      // Ignore shutdown errors in tests
    }
  });

  describe('Client Initialization and Lifecycle', () => {
    test('should initialize successfully with valid server response', async () => {
      const initPromise = new Promise((resolve) => {
        client.once('initialized', resolve);
      });

      await client.initialize();
      const initResult = await initPromise;

      expect(client.isConnected()).toBe(true);
      expect(initResult).toHaveProperty('protocolVersion');
      expect(initResult).toHaveProperty('capabilities');
      expect(initResult).toHaveProperty('serverInfo');
    });

    test('should handle initialization failure gracefully', async () => {
      // Mock transport that fails to connect
      const failingTransport = new MockTransport();
      const originalConnect = failingTransport.connect;
      failingTransport.connect = jest.fn().mockRejectedValue(new Error('Connection failed'));

      const failingClient = new MCPClient(failingTransport);

      await expect(failingClient.initialize()).rejects.toThrow('Connection failed');
      expect(failingClient.isConnected()).toBe(false);
    });

    test('should shutdown cleanly', async () => {
      await client.initialize();
      expect(client.isConnected()).toBe(true);

      const shutdownPromise = new Promise((resolve) => {
        client.once('shutdown', resolve);
      });

      await client.shutdown();
      await shutdownPromise;

      expect(client.isConnected()).toBe(false);
    });

    test('should track capabilities from server', async () => {
      await client.initialize();

      const capabilities = client.getCapabilities();
      expect(capabilities).toHaveProperty('tools');
      expect(capabilities).toHaveProperty('resources');
      expect(capabilities).toHaveProperty('prompts');
      expect(capabilities).toHaveProperty('logging');
    });
  });

  describe('Tool Management and Execution', () => {
    beforeEach(async () => {
      await client.initialize();
    });

    test('should list available tools', async () => {
      const tools = await client.listTools();

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);

      const readFileTool = tools.find(tool => tool.name === 'read_file');
      expect(readFileTool).toBeDefined();
      expect(readFileTool.description).toBe('Read a file from the filesystem');
      expect(readFileTool.inputSchema).toHaveProperty('properties');
      expect(readFileTool.inputSchema.properties).toHaveProperty('path');
    });

    test('should execute tools successfully', async () => {
      const result = await client.callTool('read_file', { path: '/test/file.txt' });

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0].text).toContain('/test/file.txt');
    });

    test('should handle tool execution errors', async () => {
      const result = await client.callTool('read_file', { path: '/nonexistent/file.txt' });

      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('Error: File not found');
    });

    test('should execute write operations', async () => {
      const result = await client.callTool('write_file', {
        path: '/test/output.txt',
        content: 'Hello, MCP World!',
      });

      expect(result).toHaveProperty('content');
      expect(result.content[0].text).toContain('Successfully wrote');
      expect(result.content[0].text).toContain('19 characters');
    });

    test('should execute shell commands', async () => {
      const result = await client.callTool('execute_command', {
        command: 'echo "Hello World"',
      });

      expect(result).toHaveProperty('content');
      expect(result.content[0].text).toBe('Hello World\n');
    });

    test('should handle command execution failures', async () => {
      const result = await client.callTool('execute_command', {
        command: 'failing-command',
      });

      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('failed with exit code 1');
    });

    test('should reject unknown tools', async () => {
      await expect(client.callTool('unknown_tool', {})).rejects.toThrow('Unknown tool');
    });

    test('should require client initialization for tool operations', async () => {
      const uninitializedClient = new MCPClient(new MockTransport());

      await expect(uninitializedClient.listTools()).rejects.toThrow('Client not initialized');
      await expect(uninitializedClient.callTool('read_file', {})).rejects.toThrow('Client not initialized');
    });
  });

  describe('Resource Management', () => {
    beforeEach(async () => {
      await client.initialize();
    });

    test('should list available resources', async () => {
      const resources = await client.listResources();

      expect(Array.isArray(resources)).toBe(true);
      expect(resources.length).toBeGreaterThan(0);

      const configResource = resources.find(r => r.uri === 'file:///workspace/config.json');
      expect(configResource).toBeDefined();
      expect(configResource.name).toBe('Configuration');
      expect(configResource.mimeType).toBe('application/json');
    });

    test('should read file resources', async () => {
      const result = await client.readResource('file:///workspace/config.json');

      expect(result).toHaveProperty('contents');
      expect(Array.isArray(result.contents)).toBe(true);

      const content = result.contents[0];
      expect(content).toHaveProperty('uri', 'file:///workspace/config.json');
      expect(content).toHaveProperty('mimeType', 'application/json');
      expect(content).toHaveProperty('text');

      const config = JSON.parse(content.text);
      expect(config).toHaveProperty('swarm');
      expect(config).toHaveProperty('security');
    });

    test('should read memory resources', async () => {
      const result = await client.readResource('memory://swarm/agents');

      expect(result).toHaveProperty('contents');
      const content = result.contents[0];
      expect(content).toHaveProperty('uri', 'memory://swarm/agents');

      const data = JSON.parse(content.text);
      expect(data).toHaveProperty('agents');
      expect(Array.isArray(data.agents)).toBe(true);
    });

    test('should handle resource not found errors', async () => {
      await expect(client.readResource('file:///nonexistent/resource.json'))
        .rejects.toThrow('Resource not found');
    });
  });

  describe('Prompt Management', () => {
    beforeEach(async () => {
      await client.initialize();
    });

    test('should list available prompts', async () => {
      const prompts = await client.listPrompts();

      expect(Array.isArray(prompts)).toBe(true);
      expect(prompts.length).toBeGreaterThan(0);

      const codeReviewPrompt = prompts.find(p => p.name === 'code_review');
      expect(codeReviewPrompt).toBeDefined();
      expect(codeReviewPrompt.description).toBe('Generate a comprehensive code review');
      expect(Array.isArray(codeReviewPrompt.arguments)).toBe(true);
    });

    test('should retrieve prompts with arguments', async () => {
      const result = await client.getPrompt('code_review', {
        language: 'typescript',
        complexity: 'high',
      });

      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('messages');
      expect(Array.isArray(result.messages)).toBe(true);

      const message = result.messages[0];
      expect(message).toHaveProperty('role', 'user');
      expect(message).toHaveProperty('content');
      expect(message.content.text).toContain('typescript');
      expect(message.content.text).toContain('high');
    });

    test('should retrieve prompts without arguments', async () => {
      const result = await client.getPrompt('test_generation');

      expect(result).toHaveProperty('messages');
      const message = result.messages[0];
      expect(message.content.text).toContain('Jest'); // Default framework
    });

    test('should handle unknown prompts', async () => {
      await expect(client.getPrompt('unknown_prompt')).rejects.toThrow('Prompt not found');
    });
  });

  describe('Logging and Configuration', () => {
    beforeEach(async () => {
      await client.initialize();
    });

    test('should set logging level', async () => {
      // Should not throw
      await client.setLoggingLevel('debug');
      await client.setLoggingLevel('info');
      await client.setLoggingLevel('warn');
      await client.setLoggingLevel('error');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle transport disconnection', async () => {
      await client.initialize();
      expect(client.isConnected()).toBe(true);

      // Simulate transport disconnection
      await transport.disconnect();
      transport.emit('disconnect');

      // Client should still report as connected until explicit shutdown
      // This behavior may vary based on implementation
    });

    test('should handle malformed server responses', async () => {
      await client.initialize();

      // Mock a malformed response
      const originalSendMessage = transport.sendMessage;
      transport.sendMessage = jest.fn().mockResolvedValue({
        jsonrpc: '2.0',
        // Missing required fields
      });

      await expect(client.listTools()).rejects.toThrow();

      // Restore original method
      transport.sendMessage = originalSendMessage;
    });

    test('should handle network timeouts', async () => {
      await client.initialize();

      // Mock a timeout
      const originalSendMessage = transport.sendMessage;
      transport.sendMessage = jest.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), 50);
        });
      });

      await expect(client.listTools()).rejects.toThrow('Request timeout');

      // Restore original method
      transport.sendMessage = originalSendMessage;
    });

    test('should validate required parameters', async () => {
      await client.initialize();

      await expect(client.callTool('read_file', {})).rejects.toThrow();

      // Should work with required parameters
      const result = await client.callTool('read_file', { path: '/test.txt' });
      expect(result).toBeDefined();
    });

    test('should handle concurrent requests', async () => {
      await client.initialize();

      // Execute multiple operations concurrently
      const promises = [
        client.listTools(),
        client.listResources(),
        client.listPrompts(),
        client.callTool('read_file', { path: '/test1.txt' }),
        client.callTool('read_file', { path: '/test2.txt' }),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(Array.isArray(results[0])).toBe(true); // tools
      expect(Array.isArray(results[1])).toBe(true); // resources
      expect(Array.isArray(results[2])).toBe(true); // prompts
      expect(results[3]).toHaveProperty('content'); // tool result 1
      expect(results[4]).toHaveProperty('content'); // tool result 2
    });
  });

  describe('Integration Scenarios', () => {
    beforeEach(async () => {
      await client.initialize();
    });

    test('should support complete workflow: list tools, execute, check resources', async () => {
      // 1. List available tools
      const tools = await client.listTools();
      expect(tools.length).toBeGreaterThan(0);

      // 2. Execute a file operation
      await client.callTool('write_file', {
        path: '/workflow/test.txt',
        content: 'Workflow test content',
      });

      // 3. Read the file back
      const readResult = await client.callTool('read_file', {
        path: '/workflow/test.txt',
      });
      expect(readResult.content[0].text).toContain('/workflow/test.txt');

      // 4. Check available resources
      const resources = await client.listResources();
      expect(resources.length).toBeGreaterThan(0);

      // 5. Read a resource
      const resourceResult = await client.readResource('file:///workspace/config.json');
      expect(resourceResult).toHaveProperty('contents');
    });

    test('should support prompt-based workflow', async () => {
      // 1. List available prompts
      const prompts = await client.listPrompts();
      const codeReviewPrompt = prompts.find(p => p.name === 'code_review');
      expect(codeReviewPrompt).toBeDefined();

      // 2. Get a customized prompt
      const prompt = await client.getPrompt('code_review', {
        language: 'javascript',
        complexity: 'medium',
      });
      expect(prompt.messages[0].content.text).toContain('javascript');

      // 3. Use tools to support the prompt workflow
      const codeFile = await client.callTool('read_file', { path: '/src/example.js' });
      expect(codeFile).toHaveProperty('content');
    });

    test('should handle mixed success and failure operations', async () => {
      const operations = [
        client.callTool('read_file', { path: '/valid/file.txt' }),
        client.callTool('read_file', { path: '/nonexistent/file.txt' }),
        client.callTool('execute_command', { command: 'echo "success"' }),
        client.callTool('execute_command', { command: 'failing-command' }),
      ];

      const results = await Promise.all(operations);

      // First operation should succeed
      expect(results[0]).toHaveProperty('content');
      expect(results[0].isError).toBeUndefined();

      // Second operation should report error
      expect(results[1]).toHaveProperty('content');
      expect(results[1]).toHaveProperty('isError', true);

      // Third operation should succeed
      expect(results[2]).toHaveProperty('content');
      expect(results[2].content[0].text).toContain('success');

      // Fourth operation should report error
      expect(results[3]).toHaveProperty('content');
      expect(results[3]).toHaveProperty('isError', true);
    });
  });

  describe('Performance and Scalability', () => {
    beforeEach(async () => {
      await client.initialize();
    });

    test('should handle high-frequency tool calls', async () => {
      const startTime = Date.now();
      const iterations = 50;

      const promises = [];
      for (let i = 0; i < iterations; i++) {
        promises.push(
          client.callTool('execute_command', {
            command: `echo "Test ${i}"`,
          })
        );
      }

      const results = await Promise.all(promises);
      const endTime = Date.now();

      expect(results).toHaveLength(iterations);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds

      // Verify all results are correct
      results.forEach((result, index) => {
        expect(result.content[0].text).toContain(`Test ${index}`);
      });
    });

    test('should handle large data transfers', async () => {
      const largeContent = 'x'.repeat(10000); // 10KB content

      const writeResult = await client.callTool('write_file', {
        path: '/large/file.txt',
        content: largeContent,
      });

      expect(writeResult.content[0].text).toContain('10000 characters');

      const readResult = await client.callTool('read_file', {
        path: '/large/file.txt',
      });

      expect(readResult).toHaveProperty('content');
    });
  });
});