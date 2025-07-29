/**
 * MCP (Model Context Protocol) server implementation
 */
import { MCPConfig, MCPTool, MCPSession, MCPMetrics } from '../utils/types.js';
import type { IEventBus } from '../core/event-bus.js';
import type { ILogger } from '../core/logger.js';
export interface IMCPServer {
    start(): Promise<void>;
    stop(): Promise<void>;
    registerTool(tool: MCPTool): void;
    getHealthStatus(): Promise<{
        healthy: boolean;
        error?: string;
        metrics?: Record<string, number>;
    }>;
    getMetrics(): MCPMetrics;
    getSessions(): MCPSession[];
    getSession(sessionId: string): MCPSession | undefined;
    terminateSession(sessionId: string): void;
}
/**
 * MCP server implementation
 */
export declare class MCPServer implements IMCPServer {
    private config;
    private eventBus;
    private logger;
    private orchestrator?;
    private swarmCoordinator?;
    private agentManager?;
    private resourceManager?;
    private messagebus?;
    private monitor?;
    private transport;
    private toolRegistry;
    private router;
    private sessionManager;
    private authManager;
    private loadBalancer?;
    private requestQueue?;
    private running;
    private currentSession?;
    private readonly serverInfo;
    private readonly supportedProtocolVersion;
    private readonly serverCapabilities;
    constructor(config: MCPConfig, eventBus: IEventBus, logger: ILogger, orchestrator?: any | undefined, // Reference to orchestrator instance
    swarmCoordinator?: any | undefined, // Reference to swarm coordinator instance
    agentManager?: any | undefined, // Reference to agent manager instance
    resourceManager?: any | undefined, // Reference to resource manager instance
    messagebus?: any | undefined, // Reference to message bus instance
    monitor?: any | undefined);
    start(): Promise<void>;
    stop(): Promise<void>;
    registerTool(tool: MCPTool): void;
    getHealthStatus(): Promise<{
        healthy: boolean;
        error?: string;
        metrics?: Record<string, number>;
    }>;
    getMetrics(): MCPMetrics;
    getSessions(): MCPSession[];
    getSession(sessionId: string): MCPSession | undefined;
    terminateSession(sessionId: string): void;
    private handleRequest;
    private handleInitialize;
    private getOrCreateSession;
    private createTransport;
    private registerBuiltInTools;
    /**
     * Register ruv-swarm MCP tools if available
     */
    private registerRuvSwarmTools;
    private errorToMCPError;
}
//# sourceMappingURL=server.d.ts.map