/**
 * Memory indexer for fast querying
 */
import type { MemoryEntry, MemoryQuery } from '../utils/types.js';
import type { ILogger } from '../core/logger.js';
/**
 * Memory indexer for efficient querying
 */
export declare class MemoryIndexer {
    private logger;
    private entries;
    private agentIndex;
    private sessionIndex;
    private typeIndex;
    private tagIndex;
    private timeIndex;
    constructor(logger: ILogger);
    /**
     * Builds index from a list of entries
     */
    buildIndex(entries: MemoryEntry[]): Promise<void>;
    /**
     * Adds an entry to the index
     */
    addEntry(entry: MemoryEntry): void;
    /**
     * Updates an entry in the index
     */
    updateEntry(entry: MemoryEntry): void;
    /**
     * Removes an entry from the index
     */
    removeEntry(id: string): void;
    /**
     * Searches entries using the index
     */
    search(query: MemoryQuery): MemoryEntry[];
    /**
     * Gets index metrics
     */
    getMetrics(): {
        totalEntries: number;
        indexSizes: Record<string, number>;
    };
    /**
     * Clears all indexes
     */
    clear(): void;
    private intersectSets;
    private unionSets;
}
//# sourceMappingURL=indexer.d.ts.map