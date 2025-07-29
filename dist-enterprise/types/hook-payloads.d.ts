/**
 * Hook Payload Type Definitions
 * Proper interfaces for agentic flow hooks to prevent runtime errors
 */
export interface MemoryStorePayload {
    namespace: string;
    key: string;
    value: any;
    ttl?: number;
    provider?: string;
}
export interface MemorySyncPayload {
    namespace: string;
    key: string;
    value: any;
    crossProvider?: boolean;
    syncTargets?: string[];
}
export interface MemoryRetrievePayload {
    namespace: string;
    key: string;
}
export interface MemoryOperationPayload {
    operation: string;
    namespace: string;
    provider?: string;
    syncTargets?: string[];
}
export interface MemoryNamespacePayload {
    namespace: string;
}
export interface LLMRequestPayload {
    provider: string;
    model: string;
    operation: string;
    request: any;
}
export interface LLMResponsePayload {
    provider: string;
    model: string;
    request: any;
    response: any;
    metrics: any;
    operation: string;
}
export interface LLMErrorPayload {
    provider: string;
    model: string;
    error: any;
}
export interface LLMMetricsPayload {
    provider: string;
    model: string;
    metrics: any;
}
export interface NeuralTrainingPayload {
    operation: string;
    modelId: string;
    trainingData: any;
}
export interface NeuralModelPayload {
    modelId: string;
    accuracy?: number;
    trainingData?: any;
}
export interface NeuralPatternsPayload {
    patterns: any[];
}
export interface NeuralPredictionPayload {
    prediction: any;
    modelId: string;
}
export interface NeuralAdaptationPayload {
    adaptations: any;
    modelId: string;
}
export interface PerformanceBottleneckPayload {
    bottleneck: {
        component: string;
        metric: string;
        threshold: number;
        current: number;
    };
}
export interface PerformanceOptimizationPayload {
    optimization: {
        type: string;
        target: string;
        improvement: number;
    };
}
export interface WorkflowStepPayload {
    workflowId: string;
    step: any;
    state: any;
}
export interface WorkflowDecisionPayload {
    workflowId: string;
    decision: any;
    state: any;
}
export interface WorkflowErrorPayload {
    workflowId: string;
    error: any;
    state: any;
}
//# sourceMappingURL=hook-payloads.d.ts.map