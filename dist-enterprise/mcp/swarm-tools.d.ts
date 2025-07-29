/**
 * Comprehensive MCP tools for swarm system functionality
 */
import type { MCPTool, MCPContext } from '../utils/types.js';
import type { ILogger } from '../core/logger.js';
export interface SwarmToolContext extends MCPContext {
    swarmCoordinator?: any;
    agentManager?: any;
    resourceManager?: any;
    messageBus?: any;
    monitor?: any;
}
export declare function createSwarmTools(logger: ILogger): MCPTool[];
export declare const dispatchAgentTool: {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            type: {
                type: string;
                enum: string[];
                description: string;
            };
            task: {
                type: string;
                description: string;
            };
            name: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
};
export declare const memoryStoreTool: {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            key: {
                type: string;
                description: string;
            };
            value: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
};
export declare const memoryRetrieveTool: {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            key: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
};
export declare const swarmStatusTool: {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {};
    };
};
export declare function handleDispatchAgent(args: any): Promise<any>;
export declare function handleSwarmStatus(args: any): Promise<any>;
export declare const swarmTools: {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {};
    };
}[];
//# sourceMappingURL=swarm-tools.d.ts.map