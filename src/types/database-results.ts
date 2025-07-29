/**
 * Database Query Result Type Definitions
 * Proper interfaces for SQLite query results to prevent runtime errors
 */

// Agent Database Results
export interface AgentRow {
  id: string;
  name: string;
  type: string;
  status: string;
  capabilities: string; // JSON string
  created_at: number;
  updated_at: number;
  metadata?: string; // JSON string
}

// Task Database Results
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
  metadata?: string; // JSON string
}

// Statistics Results
export interface CountResult {
  count: number;
}

export interface AvgResult {
  avg: number | null;
}

// Generic database row for unknown structure
export interface DatabaseRow {
  [key: string]: any;
}