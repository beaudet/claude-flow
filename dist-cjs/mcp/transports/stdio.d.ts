/**
 * Standard I/O transport for MCP
 */
import type { ITransport, RequestHandler, NotificationHandler } from './base.js';
import type { MCPRequest, MCPResponse, MCPNotification } from '../../utils/types.js';
import type { ILogger } from '../../core/logger.js';
/**
 * Stdio transport implementation
 */
export declare class StdioTransport implements ITransport {
    private logger;
    private requestHandler?;
    private notificationHandler?;
    private readline?;
    private messageCount;
    private notificationCount;
    private running;
    constructor(logger: ILogger);
    start(): Promise<void>;
    stop(): Promise<void>;
    onRequest(handler: RequestHandler): void;
    onNotification(handler: NotificationHandler): void;
    getHealthStatus(): Promise<{
        healthy: boolean;
        error?: string;
        metrics?: Record<string, number>;
    }>;
    private processMessage;
    private handleRequest;
    private handleNotification;
    private sendResponse;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    sendRequest(request: MCPRequest): Promise<MCPResponse>;
    sendNotification(notification: MCPNotification): Promise<void>;
}
//# sourceMappingURL=stdio.d.ts.map