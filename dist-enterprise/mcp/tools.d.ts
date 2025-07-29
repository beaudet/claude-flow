/**
 * Enhanced Tool registry for MCP with capability negotiation and discovery
 */
import type { MCPTool, MCPProtocolVersion } from '../utils/types.js';
import type { ILogger } from '../core/logger.js';
import { EventEmitter } from 'node:events';
export interface ToolCapability {
    name: string;
    version: string;
    description: string;
    category: string;
    tags: string[];
    requiredPermissions?: string[];
    supportedProtocolVersions: MCPProtocolVersion[];
    dependencies?: string[];
    deprecated?: boolean;
    deprecationMessage?: string;
}
export interface ToolMetrics {
    name: string;
    totalInvocations: number;
    successfulInvocations: number;
    failedInvocations: number;
    averageExecutionTime: number;
    lastInvoked?: Date;
    totalExecutionTime: number;
}
export interface ToolDiscoveryQuery {
    category?: string;
    tags?: string[];
    capabilities?: string[];
    protocolVersion?: MCPProtocolVersion;
    includeDeprecated?: boolean;
    permissions?: string[];
}
/**
 * Enhanced Tool registry implementation with capability negotiation
 */
export declare class ToolRegistry extends EventEmitter {
    private logger;
    private tools;
    private capabilities;
    private metrics;
    private categories;
    private tags;
    constructor(logger: ILogger);
    /**
     * Registers a new tool with enhanced capability information
     */
    register(tool: MCPTool, capability?: ToolCapability): void;
    /**
     * Unregisters a tool
     */
    unregister(name: string): void;
    /**
     * Gets a tool by name
     */
    getTool(name: string): MCPTool | undefined;
    /**
     * Lists all registered tools
     */
    listTools(): Array<{
        name: string;
        description: string;
    }>;
    /**
     * Gets the number of registered tools
     */
    getToolCount(): number;
    /**
     * Executes a tool with metrics tracking
     */
    executeTool(name: string, input: unknown, context?: any): Promise<unknown>;
    /**
     * Validates tool definition
     */
    private validateTool;
    /**
     * Validates input against tool schema
     */
    private validateInput;
    /**
     * Checks if a value matches a JSON Schema type
     */
    private checkType;
    /**
     * Register tool capability information
     */
    private registerCapability;
    /**
     * Extract category from tool name
     */
    private extractCategory;
    /**
     * Extract tags from tool definition
     */
    private extractTags;
    /**
     * Check tool capabilities and permissions
     */
    private checkToolCapabilities;
    /**
     * Check protocol version compatibility
     */
    private isProtocolVersionCompatible;
    /**
     * Discover tools based on query criteria
     */
    discoverTools(query?: ToolDiscoveryQuery): Array<{
        tool: MCPTool;
        capability: ToolCapability;
    }>;
    /**
     * Get tool capability information
     */
    getToolCapability(name: string): ToolCapability | undefined;
    /**
     * Get tool metrics
     */
    getToolMetrics(name?: string): ToolMetrics | ToolMetrics[];
    /**
     * Get all available categories
     */
    getCategories(): string[];
    /**
     * Get all available tags
     */
    getTags(): string[];
    /**
     * Reset metrics for a tool or all tools
     */
    resetMetrics(toolName?: string): void;
    /**
     * Get comprehensive registry statistics
     */
    getRegistryStats(): {
        totalTools: number;
        toolsByCategory: Record<string, number>;
        toolsByTag: Record<string, number>;
        totalInvocations: number;
        successRate: number;
        averageExecutionTime: number;
    };
}
//# sourceMappingURL=tools.d.ts.map