/**
 * Timezone utilities for Claude Flow
 * Provides consistent timezone handling across the application
 */
/**
 * Get current timestamp in user's local timezone
 * @returns {string} Formatted timestamp in local timezone
 */
export function getLocalTimestamp(): string;
/**
 * Get current timestamp in ISO format but with timezone offset
 * @returns {string} ISO timestamp with timezone
 */
export function getLocalISOTimestamp(): string;
/**
 * Convert UTC timestamp to local time display
 * @param {string|Date} timestamp - UTC timestamp
 * @returns {string} Formatted local timestamp
 */
export function convertToLocalTime(timestamp: string | Date): string;
/**
 * Get relative time description (e.g., "2 hours ago")
 * @param {string|Date} timestamp - Timestamp to compare
 * @returns {string} Relative time description
 */
export function getRelativeTime(timestamp: string | Date): string;
/**
 * Format timestamp for display with both absolute and relative time
 * @param {string|Date} timestamp - Timestamp to format
 * @returns {object} Object with formatted times
 */
export function formatTimestampForDisplay(timestamp: string | Date): object;
/**
 * Get user's timezone information
 * @returns {object} Timezone information
 */
export function getTimezoneInfo(): object;
//# sourceMappingURL=timezone-utils.d.ts.map