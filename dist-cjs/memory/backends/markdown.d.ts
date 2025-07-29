/**
 * Markdown backend implementation for human-readable memory storage
 */
import type { IMemoryBackend } from './base.js';
import type { MemoryEntry, MemoryQuery } from '../../utils/types.js';
import type { ILogger } from '../../core/logger.js';
/**
 * Markdown-based memory backend
 */
export declare class MarkdownBackend implements IMemoryBackend {
    private baseDir;
    private logger;
    private entries;
    private indexPath;
    constructor(baseDir: string, logger: ILogger);
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
    private loadIndex;
    private saveIndex;
    private writeEntryToFile;
    private getEntryFilePath;
    private entryToMarkdown;
}
//# sourceMappingURL=markdown.d.ts.map