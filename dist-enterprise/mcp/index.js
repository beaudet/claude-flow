/**
 * MCP (Model Context Protocol) Module
 * Export all MCP components for easy integration
 */
// Placeholder MCPOrchestrationIntegration class
class MCPOrchestrationIntegrationImpl {
    mcpConfig;
    orchestrationConfig;
    logger;
    constructor(mcpConfig, orchestrationConfig = {}, logger) {
        this.mcpConfig = mcpConfig;
        this.orchestrationConfig = orchestrationConfig;
        this.logger = logger;
    }
    async initialize() {
        // Implementation placeholder
    }
    async getServer() {
        return null;
    }
    async getLifecycleManager() {
        return null;
    }
    async getPerformanceMonitor() {
        return null;
    }
}
// Export placeholder implementation to avoid conflicts
export { MCPOrchestrationIntegrationImpl as MCPOrchestrationIntegrationPlaceholder };
// Core MCP Server
export { MCPServer } from './server.js';
// Lifecycle Management
export { MCPLifecycleManager, LifecycleState, } from './lifecycle-manager.js';
// Tool Registry and Management
export { ToolRegistry, } from './tools.js';
// Protocol Management
export { MCPProtocolManager, } from './protocol-manager.js';
// Authentication and Authorization
export { AuthManager,
// Temporarily commented out missing exports
// type AuthContext,
// type TokenInfo,
// type TokenGenerationOptions,
// type AuthSession,
 } from './auth.js';
export const Permissions = {};
// Performance Monitoring
export { MCPPerformanceMonitor, } from './performance-monitor.js';
// Orchestration Integration
export { MCPOrchestrationIntegration, } from './orchestration-integration.js';
export { StdioTransport } from './transports/stdio.js';
export { HttpTransport } from './transports/http.js';
// Request Routing
export { RequestRouter } from './router.js';
// Session Management
export { SessionManager } from './session-manager.js';
// Load Balancing
export { LoadBalancer, RequestQueue } from './load-balancer.js';
// Tool Implementations
export { createClaudeFlowTools } from './claude-flow-tools.js';
export { createSwarmTools } from './swarm-tools.js';
/**
 * MCP Integration Factory
 * Provides a simple way to create a complete MCP integration
 */
export class MCPIntegrationFactory {
    /**
     * Create a complete MCP integration with all components
     */
    static async createIntegration(config) {
        const { mcpConfig, orchestrationConfig = {}, components = {}, logger } = config;
        const integration = new MCPOrchestrationIntegrationImpl(mcpConfig, {
            enabledIntegrations: {
                orchestrator: true,
                swarm: true,
                agents: true,
                resources: true,
                memory: true,
                monitoring: true,
                terminals: true,
            },
            autoStart: true,
            healthCheckInterval: 30000,
            reconnectAttempts: 3,
            reconnectDelay: 5000,
            enableMetrics: true,
            enableAlerts: true,
            ...orchestrationConfig,
        }, logger);
        return integration;
    }
    /**
     * Create a standalone MCP server (without orchestration integration)
     */
    static async createStandaloneServer(config) {
        const { mcpConfig, logger, enableLifecycleManagement = true, enablePerformanceMonitoring = true, } = config;
        const eventBus = new (await import('node:events')).EventEmitter();
        const { MCPServer } = await import('./server.js');
        const server = new MCPServer(mcpConfig, eventBus, logger);
        let lifecycleManager;
        let performanceMonitor;
        if (enableLifecycleManagement) {
            const { MCPLifecycleManager } = await import('./lifecycle-manager.js');
            lifecycleManager = new MCPLifecycleManager(mcpConfig, logger, () => server);
        }
        if (enablePerformanceMonitoring) {
            const { MCPPerformanceMonitor } = await import('./performance-monitor.js');
            performanceMonitor = new MCPPerformanceMonitor(logger);
        }
        return {
            server,
            lifecycleManager,
            performanceMonitor,
        };
    }
    /**
     * Create a development/testing MCP setup
     */
    static async createDevelopmentSetup(logger) {
        const mcpConfig = {
            transport: 'stdio',
            enableMetrics: true,
            auth: {
                enabled: false,
                method: 'token',
            },
        };
        const { server, lifecycleManager, performanceMonitor } = await this.createStandaloneServer({
            mcpConfig,
            logger,
            enableLifecycleManagement: true,
            enablePerformanceMonitoring: true,
        });
        const { MCPProtocolManager } = await import('./protocol-manager.js');
        const protocolManager = new MCPProtocolManager(logger);
        return {
            server,
            lifecycleManager: lifecycleManager,
            performanceMonitor: performanceMonitor,
            protocolManager,
        };
    }
}
/**
 * Default MCP configuration for common use cases
 */
export const DefaultMCPConfigs = {
    /**
     * Development configuration with stdio transport
     */
    development: {
        transport: 'stdio',
        enableMetrics: true,
        auth: {
            enabled: false,
            method: 'token',
        },
    },
    /**
     * Production configuration with HTTP transport and authentication
     */
    production: {
        transport: 'http',
        host: '0.0.0.0',
        port: 3000,
        tlsEnabled: true,
        enableMetrics: true,
        auth: {
            enabled: true,
            method: 'token',
        },
        loadBalancer: {
            enabled: true,
            maxRequestsPerSecond: 100,
            maxConcurrentRequests: 50,
        },
        sessionTimeout: 3600000, // 1 hour
        maxSessions: 1000,
    },
    /**
     * Testing configuration with minimal features
     */
    testing: {
        transport: 'stdio',
        enableMetrics: false,
        auth: {
            enabled: false,
            method: 'token',
        },
    },
};
/**
 * MCP Utility Functions
 */
export const MCPUtils = {
    /**
     * Validate MCP protocol version
     */
    isValidProtocolVersion(version) {
        return (typeof version.major === 'number' &&
            typeof version.minor === 'number' &&
            typeof version.patch === 'number' &&
            version.major > 0);
    },
    /**
     * Compare two protocol versions
     */
    compareVersions(a, b) {
        if (a.major !== b.major)
            return a.major - b.major;
        if (a.minor !== b.minor)
            return a.minor - b.minor;
        return a.patch - b.patch;
    },
    /**
     * Format protocol version as string
     */
    formatVersion(version) {
        return `${version.major}.${version.minor}.${version.patch}`;
    },
    /**
     * Parse protocol version from string
     */
    parseVersion(versionString) {
        const parts = versionString.split('.').map((p) => parseInt(p, 10));
        if (parts.length !== 3 || parts.some((p) => isNaN(p))) {
            throw new Error(`Invalid version string: ${versionString}`);
        }
        return {
            major: parts[0],
            minor: parts[1],
            patch: parts[2],
        };
    },
    /**
     * Generate a random session ID
     */
    generateSessionId() {
        return `mcp_session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    },
    /**
     * Generate a random request ID
     */
    generateRequestId() {
        return `mcp_req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    },
};
//# sourceMappingURL=index.js.map