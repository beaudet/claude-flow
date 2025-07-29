/**
 * SQLite backend implementation for memory storage
 */
import type { IMemoryBackend } from './base.js';
import type { MemoryEntry, MemoryQuery } from '../../utils/types.js';
import type { ILogger } from '../../core/logger.js';
/**
 * SQLite-based memory backend
 */
export declare class SQLiteBackend implements IMemoryBackend {
    private dbPath;
    private logger;
    private db?;
    private sqliteLoaded;
    constructor(dbPath: string, logger: ILogger);
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    store(entry: MemoryEntry): Promise<void>;
    retrieve(id: string): Promise<MemoryEntry | undefined>;
    update(id: string, entry: MemoryEntry): Promise<void>;
    delete(id: string): Promise<void>;
    query(query: MemoryQuery): Promise<MemoryEntry[]>;
    getAllEntries(): Promise<MemoryEntry[]>;
    getHealthStatus(): Promise<{
        healthy: boolean;
        error?: string;
        metrics?: Record<string, number>;
    }>;
    private createTables;
    private createIndexes;
    private rowToEntry;
}
//# sourceMappingURL=sqlite.d.ts.map