/**
 * Request router for MCP
 */
import type { MCPRequest } from '../utils/types.js';
import type { ILogger } from '../core/logger.js';
import type { ToolRegistry } from './tools.js';
/**
 * Request router implementation
 */
export declare class RequestRouter {
    private toolRegistry;
    private logger;
    private totalRequests;
    private successfulRequests;
    private failedRequests;
    constructor(toolRegistry: ToolRegistry, logger: ILogger);
    /**
     * Routes a request to the appropriate handler
     */
    route(request: MCPRequest): Promise<unknown>;
    /**
     * Gets router metrics
     */
    getMetrics(): {
        totalRequests: number;
        successfulRequests: number;
        failedRequests: number;
    };
    /**
     * Handles built-in RPC methods
     */
    private handleRPCMethod;
    /**
     * Handles tool-related methods
     */
    private handleToolMethod;
    /**
     * Discovers all available methods
     */
    private discoverMethods;
    /**
     * Describes a specific method
     */
    private describeMethod;
    /**
     * Invokes a tool
     */
    private invokeTool;
    /**
     * Describes a specific tool
     */
    private describeTool;
}
//# sourceMappingURL=router.d.ts.map