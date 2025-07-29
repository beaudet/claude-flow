/**
 * Inter-agent messaging system
 */
import { Message, CoordinationConfig } from '../utils/types.js';
import type { IEventBus } from '../core/event-bus.js';
import type { ILogger } from '../core/logger.js';
/**
 * Message router for inter-agent communication
 */
export declare class MessageRouter {
    private config;
    private eventBus;
    private logger;
    private queues;
    private pendingResponses;
    private messageCount;
    constructor(config: CoordinationConfig, eventBus: IEventBus, logger: ILogger);
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    send(from: string, to: string, payload: unknown): Promise<void>;
    sendWithResponse<T = unknown>(from: string, to: string, payload: unknown, timeoutMs?: number): Promise<T>;
    broadcast(from: string, payload: unknown): Promise<void>;
    subscribe(agentId: string, handler: (message: Message) => void): void;
    unsubscribe(agentId: string, handlerId: string): void;
    sendResponse(originalMessageId: string, response: unknown): Promise<void>;
    getHealthStatus(): Promise<{
        healthy: boolean;
        error?: string;
        metrics?: Record<string, number>;
    }>;
    private sendMessage;
    private processMessage;
    private ensureQueue;
    performMaintenance(): Promise<void>;
    private cleanup;
}
//# sourceMappingURL=messaging.d.ts.map