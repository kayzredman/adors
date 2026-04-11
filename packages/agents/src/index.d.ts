export type BotId = 'orabot' | 'msbot' | 'marbot';
export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}
export interface ConnectionContext {
    connectionName: string;
    dbType: string;
    environment: string;
    healthScore?: number;
    healthStatus?: string;
    activeAlerts?: number;
    blockedSessions?: number;
    metrics?: Record<string, unknown>;
}
export interface AgentContext {
    fleet?: ConnectionContext[];
    focusedConnection?: ConnectionContext;
}
export interface ToolCallRequest {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}
export interface ToolCallResult {
    toolCallId: string;
    result: Record<string, unknown>;
}
export declare function streamChat(botId: BotId, history: ChatMessage[], context?: AgentContext, onToolCall?: (req: ToolCallRequest) => Promise<ToolCallResult>): AsyncGenerator<string>;
//# sourceMappingURL=index.d.ts.map