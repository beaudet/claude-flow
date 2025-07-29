/**
 * Comprehensive Functional Tests for Utility Helpers
 * Tests critical utility functions for reliability
 */

import { describe, test, expect, jest } from '@jest/globals';
import { execAsync, add, helloWorld, generateId, timeout } from '../helpers';

describe('Utility Helpers Functional Tests', () => {
  describe('execAsync', () => {
    test('should execute simple commands', async () => {
      const result = await execAsync('echo "test"');
      expect(result.stdout.trim()).toBe('test');
      expect(result.stderr).toBe('');
    });

    test('should handle command with output', async () => {
      const result = await execAsync('pwd');
      expect(result.stdout).toContain('/');
      expect(typeof result.stdout).toBe('string');
    });

    test('should handle command errors', async () => {
      await expect(execAsync('nonexistent-command')).rejects.toThrow();
    });

    test('should handle commands with arguments', async () => {
      const result = await execAsync('echo "hello world"');
      expect(result.stdout.trim()).toBe('hello world');
    });
  });

  describe('add', () => {
    test('should add positive numbers correctly', () => {
      expect(add(2, 3)).toBe(5);
      expect(add(10, 15)).toBe(25);
      expect(add(100, 200)).toBe(300);
    });

    test('should add negative numbers correctly', () => {
      expect(add(-5, -3)).toBe(-8);
      expect(add(-10, 5)).toBe(-5);
      expect(add(10, -3)).toBe(7);
    });

    test('should handle zero values', () => {
      expect(add(0, 0)).toBe(0);
      expect(add(5, 0)).toBe(5);
      expect(add(0, -3)).toBe(-3);
    });

    test('should handle decimal numbers', () => {
      expect(add(1.5, 2.3)).toBeCloseTo(3.8);
      expect(add(0.1, 0.2)).toBeCloseTo(0.3);
      expect(add(-1.5, 3.7)).toBeCloseTo(2.2);
    });

    test('should handle very large numbers', () => {
      expect(add(Number.MAX_SAFE_INTEGER, 0)).toBe(Number.MAX_SAFE_INTEGER);
      expect(add(1000000000, 2000000000)).toBe(3000000000);
    });

    test('should handle very small numbers', () => {
      expect(add(Number.MIN_VALUE, Number.MIN_VALUE)).toBe(Number.MIN_VALUE * 2);
      expect(add(0.000001, 0.000002)).toBeCloseTo(0.000003);
    });
  });

  describe('helloWorld', () => {
    test('should return correct greeting', () => {
      expect(helloWorld()).toBe('Hello, World!');
    });

    test('should return consistent result', () => {
      const result1 = helloWorld();
      const result2 = helloWorld();
      expect(result1).toBe(result2);
    });

    test('should return string type', () => {
      expect(typeof helloWorld()).toBe('string');
    });
  });

  describe('generateId', () => {
    test('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(typeof id2).toBe('string');
    });

    test('should include prefix when provided', () => {
      const id = generateId('test');
      expect(id).toMatch(/^test_/);
    });

    test('should generate different prefixed IDs', () => {
      const id1 = generateId('prefix1');
      const id2 = generateId('prefix2');
      
      expect(id1).toMatch(/^prefix1_/);
      expect(id2).toMatch(/^prefix2_/);
      expect(id1).not.toBe(id2);
    });

    test('should handle empty prefix', () => {
      const id = generateId('');
      // Empty prefix should still generate valid ID without underscore prefix
      expect(id.split('_')).toHaveLength(2);
      expect(id.length).toBeGreaterThan(0);
    });

    test('should handle special characters in prefix', () => {
      const id = generateId('test-prefix_123');
      expect(id).toMatch(/^test-prefix_123_/);
    });

    test('should generate IDs with consistent format', () => {
      const id = generateId();
      // Should be timestamp_random format
      expect(id.split('_')).toHaveLength(2);
    });

    test('should generate many unique IDs quickly', () => {
      const ids = new Set();
      const count = 1000;
      
      for (let i = 0; i < count; i++) {
        ids.add(generateId());
      }
      
      expect(ids.size).toBe(count); // All should be unique
    });
  });

  describe('timeout', () => {
    test('should resolve when promise resolves before timeout', async () => {
      const quickPromise = Promise.resolve('success');
      const result = await timeout(quickPromise, 1000);
      
      expect(result).toBe('success');
    });

    test('should reject when promise takes too long', async () => {
      const slowPromise = new Promise(resolve => setTimeout(() => resolve('late'), 200));
      
      await expect(timeout(slowPromise, 100)).rejects.toThrow('Operation timed out');
    });

    test('should use custom timeout message', async () => {
      const slowPromise = new Promise(resolve => setTimeout(() => resolve('late'), 200));
      
      await expect(timeout(slowPromise, 100, 'Custom timeout message')).rejects.toThrow('Custom timeout message');
    });

    test('should handle promise rejection before timeout', async () => {
      const rejectingPromise = Promise.reject(new Error('Promise error'));
      
      await expect(timeout(rejectingPromise, 1000)).rejects.toThrow('Promise error');
    });

    test('should handle different data types', async () => {
      const numberPromise = Promise.resolve(42);
      const objectPromise = Promise.resolve({ key: 'value' });
      const arrayPromise = Promise.resolve([1, 2, 3]);
      
      expect(await timeout(numberPromise, 1000)).toBe(42);
      expect(await timeout(objectPromise, 1000)).toEqual({ key: 'value' });
      expect(await timeout(arrayPromise, 1000)).toEqual([1, 2, 3]);
    });

    test('should handle very short timeouts', async () => {
      const promise = new Promise(resolve => setTimeout(() => resolve('done'), 50));
      
      await expect(timeout(promise, 1)).rejects.toThrow('Operation timed out');
    });

    test('should handle zero timeout', async () => {
      const promise = new Promise(resolve => setTimeout(() => resolve('done'), 10));
      
      await expect(timeout(promise, 0)).rejects.toThrow('Operation timed out');
    });
  });

  describe('Integration Tests', () => {
    test('should work together in realistic scenarios', async () => {
      // Generate unique ID and use it in a command
      const taskId = generateId('task');
      const greeting = helloWorld();
      const sum = add(10, 20);
      
      expect(taskId).toMatch(/^task_/);
      expect(greeting).toBe('Hello, World!');
      expect(sum).toBe(30);
      
      // Use execAsync to echo the generated ID
      const result = await execAsync(`echo "Processing ${taskId}"`);
      expect(result.stdout.trim()).toContain(taskId);
    });

    test('should handle error scenarios gracefully', async () => {
      // Test timeout with failed command
      const failedCommand = execAsync('exit 1');
      
      await expect(timeout(failedCommand, 1000)).rejects.toThrow();
    });

    test('should handle mathematical operations with generated values', () => {
      const id1 = generateId();
      const id2 = generateId();
      
      // Extract timestamp parts for mathematical operations
      const timestamp1 = parseInt(id1.split('_')[0], 36);
      const timestamp2 = parseInt(id2.split('_')[0], 36);
      
      // Timestamp2 should be >= timestamp1 (generated after)
      expect(timestamp2).toBeGreaterThanOrEqual(timestamp1);
      
      // Test addition with extracted values
      const sum = add(timestamp1, timestamp2);
      expect(sum).toBeGreaterThan(timestamp1);
      expect(sum).toBeGreaterThan(timestamp2);
    });

    test('should handle command execution with timeout', async () => {
      // Quick command should complete
      const quickCommand = execAsync('echo "quick"');
      const result = await timeout(quickCommand, 5000);
      expect(result.stdout.trim()).toBe('quick');
      
      // Slow command should timeout
      const slowCommand = execAsync('sleep 2 && echo "slow"');
      await expect(timeout(slowCommand, 100)).rejects.toThrow('Operation timed out');
    });
  });

  describe('Performance Tests', () => {
    test('should generate IDs efficiently', () => {
      const startTime = Date.now();
      const ids: string[] = [];
      
      for (let i = 0; i < 10000; i++) {
        ids.push(generateId());
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(ids).toHaveLength(10000);
      
      // Verify uniqueness
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(10000);
    });

    test('should perform arithmetic operations efficiently', () => {
      const startTime = Date.now();
      
      let sum = 0;
      for (let i = 0; i < 100000; i++) {
        sum = add(sum, i);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(100); // Should be very fast
      expect(sum).toBe(4999950000); // Sum of 0 to 99999
    });

    test('should handle concurrent operations', async () => {
      const promises = [];
      
      // Create multiple concurrent operations
      for (let i = 0; i < 50; i++) {
        promises.push(execAsync(`echo "concurrent-${i}"`));
      }
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(50);
      results.forEach((result, index) => {
        expect(result.stdout.trim()).toBe(`concurrent-${index}`);
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle unusual number inputs for add', () => {
      expect(add(Infinity, 1)).toBe(Infinity);
      expect(add(-Infinity, 1)).toBe(-Infinity);
      expect(add(Infinity, -Infinity)).toBeNaN();
      expect(add(NaN, 5)).toBeNaN();
    });

    test('should handle very long prefixes for generateId', () => {
      const longPrefix = 'a'.repeat(1000);
      const id = generateId(longPrefix);
      
      expect(id).toMatch(new RegExp(`^${longPrefix}_`));
      expect(id.length).toBeGreaterThan(1000);
    });

    test('should handle invalid commands gracefully', async () => {
      const commands = [
        'command-that-does-not-exist',
        'echo "test" | invalid-pipe-command'
      ];
      
      for (const cmd of commands) {
        await expect(execAsync(cmd)).rejects.toThrow();
      }
    });

    test('should handle timeout edge cases', async () => {
      // Test with already resolved promise and small timeout
      const promise = Promise.resolve('test');
      // Since promise is already resolved, it should return immediately
      const result = await timeout(promise, 1);
      expect(result).toBe('test');
      
      // Very large timeout with quick promise
      const quickPromise = Promise.resolve('quick');
      const result2 = await timeout(quickPromise, Number.MAX_SAFE_INTEGER);
      expect(result2).toBe('quick');
    });
  });
});