/**
 * Check if SQLite is available
 */
export function isSQLiteAvailable(): Promise<boolean>;
/**
 * Get SQLite Database constructor or null
 */
export function getSQLiteDatabase(): Promise<any>;
/**
 * Get the load error if any
 */
export function getLoadError(): any;
/**
 * Create a SQLite database instance with fallback
 */
export function createDatabase(dbPath: any): Promise<any>;
/**
 * Check if running on Windows
 */
export function isWindows(): boolean;
/**
 * Get platform-specific storage recommendations
 */
export function getStorageRecommendations(): {
    recommended: string;
    reason: string;
    alternatives: string[];
};
declare namespace _default {
    export { isSQLiteAvailable };
    export { getSQLiteDatabase };
    export { getLoadError };
    export { createDatabase };
    export { isWindows };
    export { getStorageRecommendations };
}
export default _default;
//# sourceMappingURL=sqlite-wrapper.d.ts.map