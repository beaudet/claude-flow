/**
 * Memory manager interface and implementation
 */
import type { MemoryEntry, MemoryQuery, MemoryConfig } from '../utils/types.js';
import type { IEventBus } from '../core/event-bus.js';
import type { ILogger } from '../core/logger.js';
export interface IMemoryManager {
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    createBank(agentId: string): Promise<string>;
    closeBank(bankId: string): Promise<void>;
    store(entry: MemoryEntry): Promise<void>;
    retrieve(id: string): Promise<MemoryEntry | undefined>;
    query(query: MemoryQuery): Promise<MemoryEntry[]>;
    update(id: string, updates: Partial<MemoryEntry>): Promise<void>;
    delete(id: string): Promise<void>;
    getHealthStatus(): Promise<{
        healthy: boolean;
        error?: string;
        metrics?: Record<string, number>;
    }>;
    performMaintenance(): Promise<void>;
}
/**
 * Memory manager implementation
 */
export declare class MemoryManager implements IMemoryManager {
    private config;
    private eventBus;
    private logger;
    private backend;
    private cache;
    private indexer;
    private banks;
    private initialized;
    private syncInterval?;
    constructor(config: MemoryConfig, eventBus: IEventBus, logger: ILogger);
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    createBank(agentId: string): Promise<string>;
    closeBank(bankId: string): Promise<void>;
    store(entry: MemoryEntry): Promise<void>;
    retrieve(id: string): Promise<MemoryEntry | undefined>;
    query(query: MemoryQuery): Promise<MemoryEntry[]>;
    update(id: string, updates: Partial<MemoryEntry>): Promise<void>;
    delete(id: string): Promise<void>;
    getHealthStatus(): Promise<{
        healthy: boolean;
        error?: string;
        metrics?: Record<string, number>;
    }>;
    performMaintenance(): Promise<void>;
    private createBackend;
    private startSyncInterval;
    private syncCache;
    private flushCache;
}
//# sourceMappingURL=manager.d.ts.map