/**
 * Resource manager for preventing conflicts and deadlocks
 */
import { CoordinationConfig } from '../utils/types.js';
import type { IEventBus } from '../core/event-bus.js';
import type { ILogger } from '../core/logger.js';
/**
 * Resource manager implementation
 */
export declare class ResourceManager {
    private config;
    private eventBus;
    private logger;
    private resources;
    private locks;
    private waitQueue;
    private agentResources;
    constructor(config: CoordinationConfig, eventBus: IEventBus, logger: ILogger);
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    acquire(resourceId: string, agentId: string, priority?: number): Promise<void>;
    release(resourceId: string, agentId: string): Promise<void>;
    releaseAllForAgent(agentId: string): Promise<void>;
    getAllocations(): Map<string, string>;
    getWaitingRequests(): Map<string, string[]>;
    getHealthStatus(): Promise<{
        healthy: boolean;
        error?: string;
        metrics?: Record<string, number>;
    }>;
    private lockResource;
    private unlockResource;
    performMaintenance(): Promise<void>;
    private cleanup;
}
//# sourceMappingURL=resources.d.ts.map