/**
 * Load balancer and rate limiting for MCP
 */
import type { MCPLoadBalancerConfig, MCPRequest, MCPResponse, MCPSession } from '../utils/types.js';
import type { ILogger } from '../core/logger.js';
export interface RequestMetrics {
    requestId: string;
    sessionId: string;
    method: string;
    startTime: number;
    endTime?: number;
    success?: boolean;
    error?: string;
}
export interface LoadBalancerMetrics {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    rateLimitedRequests: number;
    averageResponseTime: number;
    requestsPerSecond: number;
    circuitBreakerTrips: number;
    lastReset: Date;
}
export interface ILoadBalancer {
    shouldAllowRequest(session: MCPSession, request: MCPRequest): Promise<boolean>;
    recordRequestStart(session: MCPSession, request: MCPRequest): RequestMetrics;
    recordRequestEnd(metrics: RequestMetrics, response?: MCPResponse, error?: Error): void;
    getMetrics(): LoadBalancerMetrics;
    resetMetrics(): void;
    isCircuitBreakerOpen(): boolean;
}
/**
 * Load balancer implementation
 */
export declare class LoadBalancer implements ILoadBalancer {
    private config;
    private logger;
    private rateLimiter;
    private circuitBreaker;
    private sessionRateLimiters;
    private metrics;
    private requestTimes;
    private requestsInLastSecond;
    private lastSecondTimestamp;
    constructor(config: MCPLoadBalancerConfig, logger: ILogger);
    shouldAllowRequest(session: MCPSession, request: MCPRequest): Promise<boolean>;
    recordRequestStart(session: MCPSession, request: MCPRequest): RequestMetrics;
    recordRequestEnd(metrics: RequestMetrics, response?: MCPResponse, error?: Error): void;
    getMetrics(): LoadBalancerMetrics;
    resetMetrics(): void;
    isCircuitBreakerOpen(): boolean;
    getDetailedMetrics(): {
        loadBalancer: LoadBalancerMetrics;
        circuitBreaker: {
            state: string;
            failureCount: number;
            successCount: number;
        };
        rateLimiter: {
            tokens: number;
            maxTokens: number;
        };
        sessions: number;
    };
    private getSessionRateLimiter;
    private calculateAverageResponseTime;
    private updateRequestsPerSecond;
    private cleanupSessionRateLimiters;
}
/**
 * Request queue for handling backpressure
 */
export declare class RequestQueue {
    private logger;
    private queue;
    private processing;
    private maxQueueSize;
    private requestTimeout;
    constructor(maxQueueSize: number | undefined, requestTimeout: number | undefined, // 30 seconds
    logger: ILogger);
    enqueue<T>(session: MCPSession, request: MCPRequest, processor: (session: MCPSession, request: MCPRequest) => Promise<T>): Promise<T>;
    private processQueue;
    private cleanupExpiredRequests;
    getQueueSize(): number;
    isProcessing(): boolean;
}
//# sourceMappingURL=load-balancer.d.ts.map