#!/usr/bin/env node
/**
 * Creates an isolated NPX cache environment
 * @returns {Object} Environment variables with isolated cache
 */
export function createIsolatedCache(): Object;
/**
 * Gets environment variables for isolated NPX execution
 * @param {Object} additionalEnv - Additional environment variables
 * @returns {Object} Merged environment with isolated cache
 */
export function getIsolatedNpxEnv(additionalEnv?: Object): Object;
/**
 * Manually cleanup all caches (useful for testing)
 */
export function cleanupAllCaches(): Promise<void>;
//# sourceMappingURL=npx-isolated-cache.d.ts.map