/**
 * HTTP transport for MCP
 */
import type { ITransport, RequestHandler, NotificationHandler } from './base.js';
import type { MCPRequest, MCPResponse, MCPNotification, MCPConfig } from '../../utils/types.js';
import type { ILogger } from '../../core/logger.js';
/**
 * HTTP transport implementation
 */
export declare class HttpTransport implements ITransport {
    private host;
    private port;
    private tlsEnabled;
    private logger;
    private config?;
    private requestHandler?;
    private notificationHandler?;
    private app;
    private server?;
    private wss?;
    private messageCount;
    private notificationCount;
    private running;
    private connections;
    private activeWebSockets;
    constructor(host: string, port: number, tlsEnabled: boolean, logger: ILogger, config?: MCPConfig | undefined);
    start(): Promise<void>;
    stop(): Promise<void>;
    onRequest(handler: RequestHandler): void;
    onNotification(handler: NotificationHandler): void;
    getHealthStatus(): Promise<{
        healthy: boolean;
        error?: string;
        metrics?: Record<string, number>;
    }>;
    private setupMiddleware;
    private setupRoutes;
    private setupWebSocketHandlers;
    private handleJsonRpcRequest;
    private handleRequestMessage;
    private handleNotificationMessage;
    private validateAuth;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    sendRequest(request: MCPRequest): Promise<MCPResponse>;
    sendNotification(notification: MCPNotification): Promise<void>;
}
//# sourceMappingURL=http.d.ts.map