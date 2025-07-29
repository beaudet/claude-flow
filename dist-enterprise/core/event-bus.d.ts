/**
 * Event bus implementation for Claude-Flow
 */
export interface IEventBus {
    emit(event: string, data?: unknown): void;
    on(event: string, handler: (data: unknown) => void): void;
    off(event: string, handler: (data: unknown) => void): void;
    once(event: string, handler: (data: unknown) => void): void;
}
/**
 * Global event bus for system-wide communication
 */
export declare class EventBus implements IEventBus {
    private static instance;
    private typedBus;
    private constructor();
    /**
     * Gets the singleton instance of the event bus
     */
    static getInstance(debug?: boolean): EventBus;
    /**
     * Emits an event
     */
    emit(event: string, data?: unknown): void;
    /**
     * Registers an event handler
     */
    on(event: string, handler: (data: unknown) => void): void;
    /**
     * Removes an event handler
     */
    off(event: string, handler: (data: unknown) => void): void;
    /**
     * Registers a one-time event handler
     */
    once(event: string, handler: (data: unknown) => void): void;
    /**
     * Waits for an event to occur
     */
    waitFor(event: string, timeoutMs?: number): Promise<unknown>;
    /**
     * Creates a filtered event listener
     */
    onFiltered(event: string, filter: (data: unknown) => boolean, handler: (data: unknown) => void): void;
    /**
     * Get event statistics
     */
    getEventStats(): {
        event: string;
        count: number;
        lastEmitted: Date | null;
    }[];
    /**
     * Reset event statistics
     */
    resetStats(): void;
    /**
     * Remove all listeners for an event
     */
    removeAllListeners(event?: string): void;
}
export declare const eventBus: EventBus;
//# sourceMappingURL=event-bus.d.ts.map