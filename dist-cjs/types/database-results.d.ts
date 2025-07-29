/**
 * Database Query Result Type Definitions
 * Proper interfaces for SQLite query results to prevent runtime errors
 */
export interface AgentRow {
    id: string;
    name: string;
    type: string;
    status: string;
    capabilities: string;
    created_at: number;
    updated_at: number;
    metadata?: string;
}
export interface TaskRow {
    id: string;
    name: string;
    type: string;
    status: string;
    priority: number;
    agent_id?: string;
    created_at: number;
    updated_at: number;
    completed_at?: number;
    metadata?: string;
}
export interface CountResult {
    count: number;
}
export interface AvgResult {
    avg: number | null;
}
export interface DatabaseRow {
    [key: string]: any;
}
//# sourceMappingURL=database-results.d.ts.map