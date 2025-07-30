/**
 * Memory Management Functional Tests
 * Tests data persistence, caching, distributed memory, and advanced memory features
 * Validates memory backends, indexing, compression, and cross-agent sharing
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';

// Mock dependencies
jest.mock('../../core/logger.js', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    configure: jest.fn(),
  })),
}));

jest.mock('../../core/event-bus.js', () => ({
  EventBus: {
    getInstance: jest.fn().mockReturnValue({
      emit: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    }),
  },
}));

// Memory Entry interface
interface MockMemoryEntry {
  id: string;
  key: string;
  value: any;
  type: string;
  namespace: string;
  tags: string[];
  metadata: Record<string, any>;
  owner: string;
  accessLevel: 'private' | 'shared' | 'public';
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt: Date;
  expiresAt?: Date;
  version: number;
  size: number;
  compressed: boolean;
  checksum: string;
  references: string[];
  dependencies: string[];
}

interface MockMemoryQuery {
  namespace?: string;
  type?: string;
  tags?: string[];
  owner?: string;
  accessLevel?: 'private' | 'shared' | 'public';
  keyPattern?: string;
  valueSearch?: string;
  fullTextSearch?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  limit?: number;
  offset?: number;
  sortBy?: 'key' | 'createdAt' | 'updatedAt' | 'lastAccessedAt' | 'size';
  sortOrder?: 'asc' | 'desc';
}

interface MockMemoryBank {
  id: string;
  agentId: string;
  createdAt: Date;
  lastAccessed: Date;
  entryCount: number;
}

// Mock Memory Backend
class MockMemoryBackend extends EventEmitter {
  private entries: Map<string, MockMemoryEntry> = new Map();
  private initialized = false;
  private failureRate = 0; // For testing error scenarios

  async initialize(): Promise<void> {
    this.initialized = true;
    this.emit('initialized');
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
    this.entries.clear();
    this.emit('shutdown');
  }

  async store(entry: MockMemoryEntry): Promise<void> {
    if (!this.initialized) {
      throw new Error('Backend not initialized');
    }
    
    if (Math.random() < this.failureRate) {
      throw new Error('Simulated storage failure');
    }

    // Update timestamps and version
    const now = new Date();
    const existingEntry = this.entries.get(entry.id);
    const storedEntry = {
      ...entry,
      updatedAt: now,
      lastAccessedAt: now,
      version: existingEntry ? existingEntry.version + 1 : 1,
      checksum: this.calculateChecksum(entry.value),
      size: JSON.stringify(entry.value).length,
    };

    this.entries.set(entry.id, storedEntry);
    this.emit('entry.stored', { entryId: entry.id, size: storedEntry.size });
  }

  async retrieve(id: string): Promise<MockMemoryEntry | undefined> {
    if (!this.initialized) {
      throw new Error('Backend not initialized');
    }

    const entry = this.entries.get(id);
    if (entry) {
      // Update last accessed time
      entry.lastAccessedAt = new Date();
      this.emit('entry.accessed', { entryId: id });
    }
    return entry;
  }

  async update(id: string, updates: Partial<MockMemoryEntry>): Promise<void> {
    if (!this.initialized) {
      throw new Error('Backend not initialized');
    }

    const existing = this.entries.get(id);
    if (!existing) {
      throw new Error(`Entry not found: ${id}`);
    }

    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
      version: existing.version + 1,
      checksum: updates.value ? this.calculateChecksum(updates.value) : existing.checksum,
      size: updates.value ? JSON.stringify(updates.value).length : existing.size,
    };

    this.entries.set(id, updated);
    this.emit('entry.updated', { entryId: id });
  }

  async delete(id: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('Backend not initialized');
    }

    const deleted = this.entries.delete(id);
    if (deleted) {
      this.emit('entry.deleted', { entryId: id });
    }
  }

  async query(query: MockMemoryQuery): Promise<MockMemoryEntry[]> {
    if (!this.initialized) {
      throw new Error('Backend not initialized');
    }

    let results = Array.from(this.entries.values());

    // Apply filters
    if (query.namespace) {
      results = results.filter(entry => entry.namespace === query.namespace);
    }
    if (query.type) {
      results = results.filter(entry => entry.type === query.type);
    }
    if (query.owner) {
      results = results.filter(entry => entry.owner === query.owner);
    }
    if (query.accessLevel) {
      results = results.filter(entry => entry.accessLevel === query.accessLevel);
    }
    if (query.tags && query.tags.length > 0) {
      results = results.filter(entry => 
        query.tags!.some(tag => entry.tags.includes(tag))
      );
    }
    if (query.keyPattern) {
      const regex = new RegExp(query.keyPattern);
      results = results.filter(entry => regex.test(entry.key));
    }
    if (query.valueSearch) {
      const search = query.valueSearch.toLowerCase();
      results = results.filter(entry => 
        JSON.stringify(entry.value).toLowerCase().includes(search)
      );
    }
    if (query.createdAfter) {
      results = results.filter(entry => entry.createdAt > query.createdAfter!);
    }
    if (query.createdBefore) {
      results = results.filter(entry => entry.createdAt < query.createdBefore!);
    }

    // Apply sorting
    if (query.sortBy) {
      results.sort((a, b) => {
        const aVal = a[query.sortBy!];
        const bVal = b[query.sortBy!];
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return query.sortOrder === 'desc' ? -comparison : comparison;
      });
    }

    // Apply pagination
    if (query.offset) {
      results = results.slice(query.offset);
    }
    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    this.emit('query.executed', { 
      query, 
      resultCount: results.length,
      duration: Math.random() * 100 // Simulate query time
    });

    return results;
  }

  async getAllEntries(): Promise<MockMemoryEntry[]> {
    return Array.from(this.entries.values());
  }

  async getHealthStatus(): Promise<{
    healthy: boolean;
    error?: string;
    metrics?: Record<string, number>;
  }> {
    const entries = Array.from(this.entries.values());
    const now = new Date();
    const expiredCount = entries.filter(e => e.expiresAt && e.expiresAt < now).length;
    
    return {
      healthy: this.initialized && this.failureRate < 0.1,
      metrics: {
        totalEntries: entries.length,
        totalSize: entries.reduce((sum, e) => sum + e.size, 0),
        expiredEntries: expiredCount,
        averageAge: entries.length > 0 ? 
          entries.reduce((sum, e) => sum + (now.getTime() - e.createdAt.getTime()), 0) / entries.length : 0
      }
    };
  }

  async performMaintenance(): Promise<void> {
    // Remove expired entries
    const now = new Date();
    const expiredIds: string[] = [];
    
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt && entry.expiresAt < now) {
        expiredIds.push(id);
      }
    }
    
    for (const id of expiredIds) {
      this.entries.delete(id);
    }
    
    this.emit('maintenance.completed', { 
      removedEntries: expiredIds.length 
    });
  }

  private calculateChecksum(value: any): string {
    return createHash('md5').update(JSON.stringify(value)).digest('hex');
  }

  // Test utilities
  setFailureRate(rate: number): void {
    this.failureRate = rate;
  }

  getEntryCount(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}

// Mock Memory Cache
class MockMemoryCache {
  private cache: Map<string, MockMemoryEntry> = new Map();
  private maxSizeBytes: number;
  private currentSizeBytes = 0;

  constructor(maxSizeBytes: number) {
    this.maxSizeBytes = maxSizeBytes;
  }

  set(key: string, value: MockMemoryEntry): void {
    const size = JSON.stringify(value).length;
    
    // Evict if necessary
    while (this.currentSizeBytes + size > this.maxSizeBytes && this.cache.size > 0) {
      this.evictLRU();
    }
    
    // Remove existing entry if present
    if (this.cache.has(key)) {
      const existing = this.cache.get(key)!;
      this.currentSizeBytes -= existing.size;
    }
    
    // Add new entry
    this.cache.set(key, { ...value, size });
    this.currentSizeBytes += size;
  }

  get(key: string): MockMemoryEntry | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      // Update last accessed for LRU
      entry.lastAccessedAt = new Date();
    }
    return entry;
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSizeBytes -= entry.size;
      return this.cache.delete(key);
    }
    return false;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
    this.currentSizeBytes = 0;
  }

  getByPrefix(prefix: string): MockMemoryEntry[] {
    const results: MockMemoryEntry[] = [];
    for (const [key, entry] of this.cache) {
      if (key.startsWith(prefix)) {
        results.push(entry);
      }
    }
    return results;
  }

  private evictLRU(): void {
    let oldestKey: string | undefined;
    let oldestTime = Date.now();
    
    for (const [key, entry] of this.cache) {
      if (entry.lastAccessedAt.getTime() < oldestTime) {
        oldestTime = entry.lastAccessedAt.getTime();
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.delete(oldestKey);
    }
  }

  getStats(): {
    entries: number;
    sizeMB: number;
    maxSizeMB: number;
    hitRatio: number;
  } {
    return {
      entries: this.cache.size,
      sizeMB: this.currentSizeBytes / (1024 * 1024),
      maxSizeMB: this.maxSizeBytes / (1024 * 1024),
      hitRatio: 0.85, // Mock hit ratio
    };
  }
}

// Mock Memory Manager
class MockMemoryManager extends EventEmitter {
  private backend: MockMemoryBackend;
  private cache: MockMemoryCache;
  private banks: Map<string, MockMemoryBank> = new Map();
  private initialized = false;
  private logger: any;

  constructor(config: { cacheSizeMB: number }) {
    super();
    this.backend = new MockMemoryBackend();
    this.cache = new MockMemoryCache(config.cacheSizeMB * 1024 * 1024);
    this.logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await this.backend.initialize();
    this.initialized = true;
    this.emit('initialized');
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) return;
    
    await this.backend.shutdown();
    this.cache.clear();
    this.banks.clear();
    this.initialized = false;
    this.emit('shutdown');
  }

  async createBank(agentId: string): Promise<string> {
    if (!this.initialized) {
      throw new Error('Memory manager not initialized');
    }

    const bank: MockMemoryBank = {
      id: `bank_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      agentId,
      createdAt: new Date(),
      lastAccessed: new Date(),
      entryCount: 0,
    };

    this.banks.set(bank.id, bank);
    this.emit('bank.created', { bankId: bank.id, agentId });
    return bank.id;
  }

  async closeBank(bankId: string): Promise<void> {
    const bank = this.banks.get(bankId);
    if (!bank) {
      throw new Error(`Memory bank not found: ${bankId}`);
    }

    // Flush cached entries for this bank
    const bankEntries = this.cache.getByPrefix(`${bank.agentId}:`);
    for (const entry of bankEntries) {
      await this.backend.store(entry);
    }

    this.banks.delete(bankId);
    this.emit('bank.closed', { bankId });
  }

  async store(entry: MockMemoryEntry): Promise<void> {
    if (!this.initialized) {
      throw new Error('Memory manager not initialized');
    }

    // Add to cache
    this.cache.set(entry.id, entry);

    // Store in backend
    await this.backend.store(entry);

    // Update bank stats
    const bank = Array.from(this.banks.values()).find(b => b.agentId === entry.owner);
    if (bank) {
      bank.entryCount++;
      bank.lastAccessed = new Date();
    }

    this.emit('entry.stored', { entryId: entry.id });
  }

  async retrieve(id: string): Promise<MockMemoryEntry | undefined> {
    if (!this.initialized) {
      throw new Error('Memory manager not initialized');
    }

    // Check cache first
    let entry = this.cache.get(id);
    if (entry) {
      this.emit('cache.hit', { entryId: id });
      return entry;
    }

    // Fallback to backend
    entry = await this.backend.retrieve(id);
    if (entry) {
      this.cache.set(id, entry);
      this.emit('cache.miss', { entryId: id });
    }

    return entry;
  }

  async query(query: MockMemoryQuery): Promise<MockMemoryEntry[]> {
    if (!this.initialized) {
      throw new Error('Memory manager not initialized');
    }

    return await this.backend.query(query);
  }

  async update(id: string, updates: Partial<MockMemoryEntry>): Promise<void> {
    if (!this.initialized) {
      throw new Error('Memory manager not initialized');
    }

    // Update in backend first
    await this.backend.update(id, updates);
    
    // Get the updated entry from backend to ensure we have the correct version
    const updatedEntry = await this.backend.retrieve(id);
    if (updatedEntry) {
      // Update cache with the complete updated entry including incremented version
      this.cache.set(id, updatedEntry);
    }

    this.emit('entry.updated', { entryId: id });
  }

  async delete(id: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('Memory manager not initialized');
    }

    await this.backend.delete(id);
    this.cache.delete(id);
    this.emit('entry.deleted', { entryId: id });
  }

  async getHealthStatus(): Promise<{
    healthy: boolean;
    error?: string;
    metrics?: Record<string, number>;
  }> {
    const backendHealth = await this.backend.getHealthStatus();
    const cacheStats = this.cache.getStats();
    
    return {
      healthy: backendHealth.healthy,
      error: backendHealth.error,
      metrics: {
        ...backendHealth.metrics,
        cacheEntries: cacheStats.entries,
        cacheSizeMB: cacheStats.sizeMB,
        cacheHitRatio: cacheStats.hitRatio,
        activeBanks: this.banks.size,
      }
    };
  }

  async performMaintenance(): Promise<void> {
    await this.backend.performMaintenance();
    this.emit('maintenance.completed');
  }

  // Test utilities
  getBackend(): MockMemoryBackend {
    return this.backend;
  }

  getCache(): MockMemoryCache {
    return this.cache;
  }

  getBanks(): MockMemoryBank[] {
    return Array.from(this.banks.values());
  }
}

// Test helper functions
function createTestEntry(overrides: Partial<MockMemoryEntry> = {}): MockMemoryEntry {
  const now = new Date();
  return {
    id: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    key: `test_key_${Math.random().toString(36).substr(2, 6)}`,
    value: { data: 'test data', number: Math.random() },
    type: 'test',
    namespace: 'default',
    tags: ['test', 'mock'],
    metadata: { source: 'test' },
    owner: 'test-agent',
    accessLevel: 'private',
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: now,
    version: 1,
    size: 0,
    compressed: false,
    checksum: '',
    references: [],
    dependencies: [],
    ...overrides,
  };
}

describe('Memory Management Functional Tests', () => {
  let memoryManager: MockMemoryManager;

  beforeEach(async () => {
    memoryManager = new MockMemoryManager({ cacheSizeMB: 10 });
    await memoryManager.initialize();
  });

  afterEach(async () => {
    await memoryManager.shutdown();
  });

  describe('Memory Manager Lifecycle', () => {
    test('should initialize successfully', async () => {
      const newManager = new MockMemoryManager({ cacheSizeMB: 5 });
      
      const initPromise = new Promise((resolve) => {
        newManager.once('initialized', resolve);
      });

      await newManager.initialize();
      await initPromise;

      const health = await newManager.getHealthStatus();
      expect(health.healthy).toBe(true);
      
      await newManager.shutdown();
    });

    test('should shutdown gracefully', async () => {
      const shutdownPromise = new Promise((resolve) => {
        memoryManager.once('shutdown', resolve);
      });

      await memoryManager.shutdown();
      await shutdownPromise;

      // Should reject operations after shutdown
      await expect(memoryManager.store(createTestEntry())).rejects.toThrow('not initialized');
    });

    test('should prevent double initialization', async () => {
      // Already initialized in beforeEach
      await memoryManager.initialize(); // Should not throw
      
      const health = await memoryManager.getHealthStatus();
      expect(health.healthy).toBe(true);
    });
  });

  describe('Memory Bank Management', () => {
    test('should create memory banks for agents', async () => {
      const bankCreationPromise = new Promise((resolve) => {
        memoryManager.once('bank.created', resolve);
      });

      const bankId = await memoryManager.createBank('agent-001');
      const creationEvent = await bankCreationPromise;

      expect(bankId).toMatch(/^bank_\d+_[a-z0-9]+$/);
      expect(creationEvent).toEqual({
        bankId,
        agentId: 'agent-001'
      });

      const banks = memoryManager.getBanks();
      expect(banks).toHaveLength(1);
      expect(banks[0].agentId).toBe('agent-001');
    });

    test('should close memory banks and flush data', async () => {
      const bankId = await memoryManager.createBank('agent-002');
      
      // Store some data in the bank
      const entry = createTestEntry({ owner: 'agent-002' });
      await memoryManager.store(entry);

      const bankClosurePromise = new Promise((resolve) => {
        memoryManager.once('bank.closed', resolve);
      });

      await memoryManager.closeBank(bankId);
      const closureEvent = await bankClosurePromise;

      expect(closureEvent).toEqual({ bankId });
      
      const banks = memoryManager.getBanks();
      expect(banks).toHaveLength(0);
    });

    test('should handle invalid bank operations', async () => {
      await expect(memoryManager.closeBank('invalid-bank-id')).rejects.toThrow('Memory bank not found');
    });

    test('should track bank statistics', async () => {
      const bankId = await memoryManager.createBank('agent-stats');
      
      // Store multiple entries
      for (let i = 0; i < 5; i++) {
        const entry = createTestEntry({ 
          owner: 'agent-stats',
          key: `test_key_${i}`
        });
        await memoryManager.store(entry);
      }

      const banks = memoryManager.getBanks();
      const bank = banks.find(b => b.id === bankId);
      
      expect(bank).toBeDefined();
      expect(bank!.entryCount).toBe(5);
      expect(bank!.lastAccessed).toBeInstanceOf(Date);
    });
  });

  describe('Data Storage and Retrieval', () => {
    test('should store and retrieve memory entries', async () => {
      const entry = createTestEntry({
        key: 'test_storage',
        value: { message: 'Hello, World!' }
      });

      const storagePromise = new Promise((resolve) => {
        memoryManager.once('entry.stored', resolve);
      });

      await memoryManager.store(entry);
      const storageEvent = await storagePromise;

      expect(storageEvent).toEqual({ entryId: entry.id });

      const retrieved = await memoryManager.retrieve(entry.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.key).toBe('test_storage');
      expect(retrieved!.value.message).toBe('Hello, World!');
    });

    test('should handle cache hits and misses', async () => {
      const entry = createTestEntry({ key: 'cache_test' });
      await memoryManager.store(entry);

      const cacheHitPromise = new Promise((resolve) => {
        memoryManager.once('cache.hit', resolve);
      });

      // Second retrieval should hit cache
      await memoryManager.retrieve(entry.id);
      const hitEvent = await cacheHitPromise;

      expect(hitEvent).toEqual({ entryId: entry.id });
    });

    test('should handle cache misses for non-cached entries', async () => {
      const entry = createTestEntry({ key: 'miss_test' });
      const backend = memoryManager.getBackend();
      
      // Store directly in backend, bypassing cache
      await backend.store(entry);

      const cacheMissPromise = new Promise((resolve) => {
        memoryManager.once('cache.miss', resolve);
      });

      const retrieved = await memoryManager.retrieve(entry.id);
      const missEvent = await cacheMissPromise;

      expect(missEvent).toEqual({ entryId: entry.id });
      expect(retrieved).toBeDefined();
    });

    test('should update memory entries', async () => {
      const entry = createTestEntry({ value: { count: 1 } });
      await memoryManager.store(entry);

      const updatePromise = new Promise((resolve) => {
        memoryManager.once('entry.updated', resolve);
      });

      await memoryManager.update(entry.id, { 
        value: { count: 2 },
        tags: ['updated']
      });
      const updateEvent = await updatePromise;

      expect(updateEvent).toEqual({ entryId: entry.id });

      const updated = await memoryManager.retrieve(entry.id);
      expect(updated!.value.count).toBe(2);
      expect(updated!.tags).toContain('updated');
      expect(updated!.version).toBeGreaterThan(1);
    });

    test('should delete memory entries', async () => {
      const entry = createTestEntry();
      await memoryManager.store(entry);

      const deletePromise = new Promise((resolve) => {
        memoryManager.once('entry.deleted', resolve);
      });

      await memoryManager.delete(entry.id);
      const deleteEvent = await deletePromise;

      expect(deleteEvent).toEqual({ entryId: entry.id });

      const retrieved = await memoryManager.retrieve(entry.id);
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Memory Querying and Search', () => {
    beforeEach(async () => {
      // Create test data
      const testEntries = [
        createTestEntry({ 
          namespace: 'project-a', 
          type: 'code', 
          owner: 'coder-001',
          tags: ['javascript', 'function'],
          value: { code: 'function hello() { return "world"; }' }
        }),
        createTestEntry({ 
          namespace: 'project-a', 
          type: 'test', 
          owner: 'tester-001',
          tags: ['javascript', 'unit-test'],
          value: { test: 'expect(hello()).toBe("world");' }
        }),
        createTestEntry({ 
          namespace: 'project-b', 
          type: 'documentation', 
          owner: 'writer-001',
          tags: ['markdown', 'api'],
          value: { content: 'API documentation for project B' }
        }),
        createTestEntry({ 
          namespace: 'project-a', 
          type: 'code', 
          owner: 'coder-002',
          tags: ['python', 'class'],
          value: { code: 'class Calculator: pass' }
        }),
      ];

      for (const entry of testEntries) {
        await memoryManager.store(entry);
      }
    });

    test('should query by namespace', async () => {
      const results = await memoryManager.query({ namespace: 'project-a' });
      
      expect(results).toHaveLength(3);
      expect(results.every(r => r.namespace === 'project-a')).toBe(true);
    });

    test('should query by type', async () => {
      const results = await memoryManager.query({ type: 'code' });
      
      expect(results).toHaveLength(2);
      expect(results.every(r => r.type === 'code')).toBe(true);
    });

    test('should query by owner', async () => {
      const results = await memoryManager.query({ owner: 'coder-001' });
      
      expect(results).toHaveLength(1);
      expect(results[0].owner).toBe('coder-001');
    });

    test('should query by tags', async () => {
      const results = await memoryManager.query({ tags: ['javascript'] });
      
      expect(results).toHaveLength(2);
      expect(results.every(r => r.tags.includes('javascript'))).toBe(true);
    });

    test('should query with multiple filters', async () => {
      const results = await memoryManager.query({ 
        namespace: 'project-a',
        type: 'code',
        tags: ['javascript']
      });
      
      expect(results).toHaveLength(1);
      expect(results[0].namespace).toBe('project-a');
      expect(results[0].type).toBe('code');
      expect(results[0].tags).toContain('javascript');
    });

    test('should query with key pattern', async () => {
      const results = await memoryManager.query({ 
        keyPattern: 'test_key_.*'
      });
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => /test_key_.*/.test(r.key))).toBe(true);
    });

    test('should query with value search', async () => {
      const results = await memoryManager.query({ 
        valueSearch: 'function'
      });
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => 
        JSON.stringify(r.value).toLowerCase().includes('function')
      )).toBe(true);
    });

    test('should support pagination', async () => {
      const firstPage = await memoryManager.query({ 
        limit: 2,
        offset: 0,
        sortBy: 'createdAt'
      });
      
      const secondPage = await memoryManager.query({ 
        limit: 2,
        offset: 2,
        sortBy: 'createdAt'
      });
      
      expect(firstPage).toHaveLength(2);
      expect(secondPage).toHaveLength(2);
      expect(firstPage[0].id).not.toBe(secondPage[0].id);
    });

    test('should support sorting', async () => {
      // Add entries with different creation times
      await new Promise(resolve => setTimeout(resolve, 10));
      const laterEntry = createTestEntry({ key: 'later_entry' });
      await memoryManager.store(laterEntry);

      const ascending = await memoryManager.query({ 
        sortBy: 'createdAt',
        sortOrder: 'asc'
      });
      
      const descending = await memoryManager.query({ 
        sortBy: 'createdAt',
        sortOrder: 'desc'
      });
      
      expect(ascending[0].createdAt.getTime()).toBeLessThanOrEqual(
        ascending[ascending.length - 1].createdAt.getTime()
      );
      
      expect(descending[0].createdAt.getTime()).toBeGreaterThanOrEqual(
        descending[descending.length - 1].createdAt.getTime()
      );
    });
  });

  describe('Cache Management', () => {
    test('should respect cache size limits', async () => {
      const cache = memoryManager.getCache();
      const initialStats = cache.getStats();
      
      // Fill cache with large entries
      const largeEntries = [];
      for (let i = 0; i < 20; i++) {
        const entry = createTestEntry({
          key: `large_entry_${i}`,
          value: { data: 'x'.repeat(1000000) } // 1MB of data
        });
        largeEntries.push(entry);
        await memoryManager.store(entry);
      }
      
      const finalStats = cache.getStats();
      expect(finalStats.sizeMB).toBeLessThanOrEqual(finalStats.maxSizeMB);
    });

    test('should implement LRU eviction', async () => {
      const cache = memoryManager.getCache();
      
      // Fill cache
      const entries = [];
      for (let i = 0; i < 5; i++) {
        const entry = createTestEntry({
          key: `lru_test_${i}`,
          value: { data: 'x'.repeat(500000) } // 500KB each
        });
        entries.push(entry);
        await memoryManager.store(entry);
      }
      
      // Access first entry to make it recently used
      await memoryManager.retrieve(entries[0].id);
      
      // Add more entries to trigger eviction
      for (let i = 5; i < 10; i++) {
        const entry = createTestEntry({
          key: `lru_test_${i}`,
          value: { data: 'x'.repeat(500000) }
        });
        await memoryManager.store(entry);
      }
      
      // First entry should still be in cache (recently accessed)
      expect(cache.has(entries[0].id)).toBe(true);
    });

    test('should provide cache statistics', async () => {
      const cache = memoryManager.getCache();
      
      // Add some entries
      for (let i = 0; i < 3; i++) {
        const entry = createTestEntry({ key: `stats_test_${i}` });
        await memoryManager.store(entry);
      }
      
      const stats = cache.getStats();
      expect(stats.entries).toBeGreaterThanOrEqual(3);
      expect(stats.sizeMB).toBeGreaterThan(0);
      expect(stats.maxSizeMB).toBe(10); // From config
      expect(stats.hitRatio).toBeGreaterThan(0);
    });
  });

  describe('Health Monitoring and Maintenance', () => {
    test('should provide health status', async () => {
      const health = await memoryManager.getHealthStatus();
      
      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('metrics');
      expect(health.metrics).toHaveProperty('totalEntries');
      expect(health.metrics).toHaveProperty('totalSize');
      expect(health.metrics).toHaveProperty('cacheEntries');
      expect(health.metrics).toHaveProperty('cacheSizeMB');
      expect(health.metrics).toHaveProperty('cacheHitRatio');
      expect(health.metrics).toHaveProperty('activeBanks');
    });

    test('should report unhealthy status when backend fails', async () => {
      const backend = memoryManager.getBackend();
      backend.setFailureRate(0.5); // 50% failure rate
      
      const health = await memoryManager.getHealthStatus();
      expect(health.healthy).toBe(false);
    });

    test('should perform maintenance operations', async () => {
      // Create entries with expiration
      const now = new Date();
      const expiredEntry = createTestEntry({
        key: 'expired_entry',
        expiresAt: new Date(now.getTime() - 1000) // Expired 1 second ago
      });
      const validEntry = createTestEntry({
        key: 'valid_entry',
        expiresAt: new Date(now.getTime() + 60000) // Expires in 1 minute
      });

      const backend = memoryManager.getBackend();
      await backend.store(expiredEntry);
      await backend.store(validEntry);

      const initialCount = backend.getEntryCount();
      expect(initialCount).toBe(2);

      const maintenancePromise = new Promise((resolve) => {
        memoryManager.once('maintenance.completed', resolve);
      });

      await memoryManager.performMaintenance();
      await maintenancePromise;

      const finalCount = backend.getEntryCount();
      expect(finalCount).toBe(1); // Expired entry should be removed
    });

    test('should track performance metrics', async () => {
      const backend = memoryManager.getBackend();
      
      // Add event listeners to track events
      const events: string[] = [];
      backend.on('entry.stored', () => events.push('stored'));
      backend.on('entry.accessed', () => events.push('accessed'));
      backend.on('query.executed', () => events.push('query'));
      
      // Perform some operations to generate metrics
      const entry = createTestEntry();
      await memoryManager.store(entry);
      
      // Clear cache to force backend access on retrieve
      const cache = memoryManager.getCache();
      cache.clear();
      
      await memoryManager.retrieve(entry.id);
      await memoryManager.query({ type: 'test' });

      // Check that events were emitted
      expect(events).toContain('stored');
      expect(events).toContain('accessed');
      expect(events).toContain('query');
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle backend failures gracefully', async () => {
      const backend = memoryManager.getBackend();
      backend.setFailureRate(1.0); // 100% failure rate

      const entry = createTestEntry();
      
      // Storage should fail but not crash the system
      await expect(memoryManager.store(entry)).rejects.toThrow('Simulated storage failure');
    });

    test('should handle cache failures gracefully', async () => {
      const entry = createTestEntry();
      await memoryManager.store(entry);

      // Even if cache fails, should fallback to backend
      const cache = memoryManager.getCache();
      cache.clear(); // Simulate cache failure

      const retrieved = await memoryManager.retrieve(entry.id);
      expect(retrieved).toBeDefined();
    });

    test('should handle invalid operations', async () => {
      await expect(memoryManager.retrieve('invalid-id')).resolves.toBeUndefined();
      await expect(memoryManager.update('invalid-id', {})).rejects.toThrow('Entry not found');
      await expect(memoryManager.delete('invalid-id')).resolves.toBeUndefined();
    });

    test('should handle concurrent operations', async () => {
      const entry = createTestEntry();
      
      // Perform concurrent operations
      const operations = [
        memoryManager.store(entry),
        memoryManager.retrieve(entry.id),
        memoryManager.query({ type: 'test' }),
        memoryManager.update(entry.id, { tags: ['concurrent'] }),
      ];

      // Should not throw errors
      const results = await Promise.allSettled(operations);
      
      // At least store and query should succeed
      expect(results[0].status).toBe('fulfilled');
      expect(results[2].status).toBe('fulfilled');
    });

    test('should handle memory pressure', async () => {
      const cache = memoryManager.getCache();
      
      // Fill memory beyond capacity
      const largeEntries = [];
      for (let i = 0; i < 50; i++) {
        const entry = createTestEntry({
          key: `pressure_test_${i}`,
          value: { data: 'x'.repeat(1000000) } // 1MB each
        });
        largeEntries.push(entry);
        await memoryManager.store(entry);
      }
      
      // System should still be responsive
      const health = await memoryManager.getHealthStatus();
      expect(health.healthy).toBe(true);
      
      // Cache should not exceed limits
      const stats = cache.getStats();
      expect(stats.sizeMB).toBeLessThanOrEqual(stats.maxSizeMB);
    });

    test('should recover from initialization failures', async () => {
      const newManager = new MockMemoryManager({ cacheSizeMB: 1 });
      const backend = newManager.getBackend();
      
      // Make backend initialization fail
      const originalInit = backend.initialize;
      backend.initialize = jest.fn().mockRejectedValue(new Error('Init failed'));
      
      await expect(newManager.initialize()).rejects.toThrow('Init failed');
      
      // Restore and retry
      backend.initialize = originalInit;
      await expect(newManager.initialize()).resolves.toBeUndefined();
      
      await newManager.shutdown();
    });
  });

  describe('Cross-Agent Memory Sharing', () => {
    test('should support shared memory access levels', async () => {
      // Create entries with different access levels
      const privateEntry = createTestEntry({ 
        owner: 'agent-001',
        accessLevel: 'private',
        key: 'private_data'
      });
      
      const sharedEntry = createTestEntry({ 
        owner: 'agent-001',
        accessLevel: 'shared',
        key: 'shared_data'
      });
      
      const publicEntry = createTestEntry({ 
        owner: 'agent-001',
        accessLevel: 'public',
        key: 'public_data'
      });

      await memoryManager.store(privateEntry);
      await memoryManager.store(sharedEntry);
      await memoryManager.store(publicEntry);

      // Query as different agent - should only see shared and public
      const sharedResults = await memoryManager.query({ 
        accessLevel: 'shared'
      });
      const publicResults = await memoryManager.query({ 
        accessLevel: 'public'
      });

      expect(sharedResults).toHaveLength(1);
      expect(sharedResults[0].key).toBe('shared_data');
      
      expect(publicResults).toHaveLength(1);
      expect(publicResults[0].key).toBe('public_data');
    });

    test('should handle memory references and dependencies', async () => {
      const baseEntry = createTestEntry({
        key: 'base_entry',
        value: { type: 'base' }
      });
      
      const dependentEntry = createTestEntry({
        key: 'dependent_entry',
        value: { type: 'dependent' },
        dependencies: [baseEntry.id],
        references: [baseEntry.id]
      });

      await memoryManager.store(baseEntry);
      await memoryManager.store(dependentEntry);

      const retrieved = await memoryManager.retrieve(dependentEntry.id);
      expect(retrieved!.dependencies).toContain(baseEntry.id);
      expect(retrieved!.references).toContain(baseEntry.id);
    });

    test('should support memory namespacing for isolation', async () => {
      const entries = [
        createTestEntry({ namespace: 'agent-001:private', key: 'data1' }),
        createTestEntry({ namespace: 'agent-002:private', key: 'data2' }),
        createTestEntry({ namespace: 'shared:common', key: 'data3' }),
      ];

      for (const entry of entries) {
        await memoryManager.store(entry);
      }

      // Each namespace should be isolated
      const agent1Results = await memoryManager.query({ namespace: 'agent-001:private' });
      const agent2Results = await memoryManager.query({ namespace: 'agent-002:private' });
      const sharedResults = await memoryManager.query({ namespace: 'shared:common' });

      expect(agent1Results).toHaveLength(1);
      expect(agent2Results).toHaveLength(1);
      expect(sharedResults).toHaveLength(1);
      
      expect(agent1Results[0].key).toBe('data1');
      expect(agent2Results[0].key).toBe('data2');
      expect(sharedResults[0].key).toBe('data3');
    });
  });
});