export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  timestamp: number;
}

export interface SystemInfoResponse {
  application: string;
  javaVersion: string;
  springBootVersion: string;
  defaultTarget: string;
  channels: string[];
  routes: string[];
  registeredTools: string[];
  promptTemplateIds: string[];
  knowledgeBaseChunkCount: number;
  vectorizedChunkCount?: number;
  embeddingEnabled?: boolean;
  embeddingDimensions?: number;
  knowledgeStorePersistent?: boolean;
  persistencePath?: string;
}

export interface ChannelInfoResponse {
  defaultTarget: string;
  channels: string[];
  routes: string[];
}

export interface ChatCompletionRequest {
  prompt: string;
  systemPrompt?: string;
  channel?: string;
  model?: string;
  temperature?: number;
  stream?: boolean;
}

export interface ChatCompletionResponse {
  content: string;
  reasoningContent?: string;
  rawContent?: string;
  channel: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs: number;
}

export interface PromptTemplateDto {
  id: string;
  version: string;
  description: string;
  systemTemplate?: string;
  userTemplate: string;
  requiredVariables: string[];
  defaultVariables?: Record<string, unknown>;
  guardInjection: boolean;
  wrapUserVariablesInXmlTag: boolean;
}

export interface PromptRenderRequest {
  version?: string;
  variables: Record<string, unknown>;
}

export interface PromptRenderResponse {
  templateId: string;
  version: string;
  systemMessage: string;
  userMessage: string;
}

export interface StructuredExtractRequest {
  text: string;
  targetFields?: string[];
  channel?: string;
}

export interface StructuredExtractResponse {
  data: Record<string, unknown>;
  channel: string;
  latencyMs: number;
}

export type RagSearchMode = 'HYBRID' | 'VECTOR_ONLY' | 'BM25_ONLY';

export interface DocumentIngestRequest {
  content: string;
  title?: string;
  tenantId?: string;
  kbId?: string;
  metadata?: Record<string, unknown>;
}

export interface IngestResultResponse {
  chunkCount: number;
  chunkIds: string[];
}

export interface FileParseResultDto {
  fileName: string;
  fileFormat: string;
  title: string;
  markdownContent: string;
  characterCount: number;
  chunkCount: number;
  chunkIds: string[];
  metadata?: Record<string, unknown>;
}

export interface BatchFileIngestResponse {
  fileCount: number;
  totalChunkCount: number;
  allChunkIds: string[];
  files: FileParseResultDto[];
}

export interface RagSearchApiRequest {
  query: string;
  topK?: number;
  searchMode?: RagSearchMode;
  tenantId?: string;
  kbId?: string;
}

export interface ScoredDocumentDto {
  id: string;
  text: string;
  score: number;
  vectorScore?: number;
  bm25Score?: number;
  rerankScore?: number;
  metadata?: Record<string, unknown>;
}

export interface RagQueryApiRequest {
  question: string;
  topK?: number;
  channel?: string;
  searchMode?: RagSearchMode;
  tenantId?: string;
  kbId?: string;
}

export interface RagQueryApiResponse {
  answer: string;
  query: string;
  citations: ScoredDocumentDto[];
  retrievalLatencyMs: number;
  generationLatencyMs: number;
  channel: string;
}

export interface ToolInfoResponse {
  name: string;
  description: string;
  inputSchema: string;
  highRisk: boolean;
}

export type AgentStopReason =
  | 'COMPLETED'
  | 'MAX_ITERATIONS_REACHED'
  | 'MAX_TOOL_CALLS_REACHED'
  | 'MAX_TOKENS_REACHED'
  | 'AWAITING_APPROVAL'
  | 'TIMEOUT';

export interface ToolCallDto {
  callId: string;
  toolName: string;
  arguments: string;
  observation: string;
  success: boolean;
  loopBlocked: boolean;
  approvalRejected: boolean;
  durationMs: number;
}

export interface AgentStepTraceDto {
  iteration: number;
  thought: string;
  toolCalls: ToolCallDto[];
  latencyMs: number;
}

export interface AgentRunApiRequest {
  userGoal: string;
  systemPrompt?: string;
  channel?: string;
  enabledTools?: string[];
  toolContext?: Record<string, unknown>;
  maxIterations?: number;
  maxTotalToolCalls?: number;
  maxDuplicateToolCalls?: number;
  maxTotalTokens?: number;
  maxExecutionDurationSeconds?: number;
}

export interface AgentRunApiResponse {
  output: string;
  stopReason: AgentStopReason;
  awaitingApproval: boolean;
  checkpointId?: string;
  totalIterations: number;
  totalToolCalls: number;
  totalTokens: number;
  totalLatencyMs: number;
  channel: string;
  steps: AgentStepTraceDto[];
}

export interface AgentResumeApiRequest {
  checkpointId: string;
  approved: boolean;
  reviewerNote?: string;
  channel?: string;
  toolContext?: Record<string, unknown>;
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AttachedDocumentContext {
  fileName: string;
  fileFormat: string;
  content: string;
}

export interface UnifiedChatTurnRequest {
  message: string;
  history?: HistoryMessage[];
  channel?: string;
  enableAgent?: boolean;
  enableRag?: boolean;
  enableStructuredExtract?: boolean;
  targetFields?: string[];
  tenantId?: string;
  kbId?: string;
  temperature?: number;
  attachments?: AttachedDocumentContext[];
}

export interface UnifiedChatTurnResponse {
  content: string;
  reasoningContent?: string;
  channel: string;
  model?: string;
  totalTokens?: number;
  latencyMs: number;
  stopReason: AgentStopReason;
  awaitingApproval: boolean;
  checkpointId?: string;
  steps: AgentStepTraceDto[];
  citations: ScoredDocumentDto[];
  structuredData?: Record<string, unknown>;
}

export class ApiClientError extends Error {
  readonly code: number;
  readonly httpStatus: number;

  constructor(code: number, message: string, httpStatus: number) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || payload.code !== 0) {
    throw new ApiClientError(
      payload?.code ?? response.status,
      payload?.message || `HTTP ${response.status}`,
      response.status,
    );
  }
  return payload.data;
}

export const intelliHubApi = {
  getSystemInfo(): Promise<SystemInfoResponse> {
    return requestJson<SystemInfoResponse>('/api/v1/system/info');
  },

  getChannels(): Promise<ChannelInfoResponse> {
    return requestJson<ChannelInfoResponse>('/api/v1/chat/channels');
  },

  unifiedChatTurn(req: UnifiedChatTurnRequest): Promise<UnifiedChatTurnResponse> {
    return requestJson<UnifiedChatTurnResponse>('/api/v1/chat/turn', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    return requestJson<ChatCompletionResponse>('/api/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async streamChatCompletion(
    req: ChatCompletionRequest,
    onChunk: (chunkText: string) => void,
    onDone: () => void,
  ): Promise<void> {
    const response = await fetch('/api/v1/chat/completions/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(req),
    });

    if (!response.ok || !response.body) {
      let errMsg = `Stream HTTP ${response.status}`;
      try {
        const errJson = (await response.json()) as ApiResponse<unknown>;
        if (errJson?.message) {
          errMsg = `[${errJson.code}] ${errJson.message}`;
        }
      } catch {
        // ignore parse error
      }
      throw new Error(errMsg);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const rawEvent of events) {
        const lines = rawEvent.split('\n');
        let eventType = 'message';
        const dataParts: string[] = [];
        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataParts.push(line.slice(5));
          }
        }
        const dataText = dataParts.join('\n');
        if (eventType === 'done' || dataText === '[DONE]') {
          onDone();
          return;
        }
        if (dataText) {
          onChunk(dataText);
        }
      }
    }
    onDone();
  },

  listPromptIds(): Promise<string[]> {
    return requestJson<string[]>('/api/v1/prompts');
  },

  getPromptTemplate(id: string, version?: string): Promise<PromptTemplateDto> {
    const query = version ? `?version=${encodeURIComponent(version)}` : '';
    return requestJson<PromptTemplateDto>(`/api/v1/prompts/${encodeURIComponent(id)}${query}`);
  },

  registerPromptTemplate(dto: Partial<PromptTemplateDto>): Promise<PromptTemplateDto> {
    return requestJson<PromptTemplateDto>('/api/v1/prompts', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  renderPromptTemplate(id: string, req: PromptRenderRequest): Promise<PromptRenderResponse> {
    return requestJson<PromptRenderResponse>(`/api/v1/prompts/${encodeURIComponent(id)}/render`, {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  extractStructuredData(req: StructuredExtractRequest): Promise<StructuredExtractResponse> {
    return requestJson<StructuredExtractResponse>('/api/v1/prompts/structured-extract', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  ingestDocument(req: DocumentIngestRequest): Promise<IngestResultResponse> {
    return requestJson<IngestResultResponse>('/api/v1/rag/documents', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async parseFiles(files: File[]): Promise<FileParseResultDto[]> {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    const response = await fetch('/api/v1/rag/documents/parse', {
      method: 'POST',
      body: formData,
    });
    const payload = (await response.json()) as ApiResponse<FileParseResultDto[]>;
    if (!response.ok || payload.code !== 0) {
      throw new ApiClientError(
        payload?.code ?? response.status,
        payload?.message || `HTTP ${response.status}`,
        response.status,
      );
    }
    return payload.data;
  },

  async uploadAndIngestFiles(
    files: File[],
    options?: { title?: string; tenantId?: string; kbId?: string },
  ): Promise<BatchFileIngestResponse> {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    if (options?.title) formData.append('title', options.title);
    if (options?.tenantId) formData.append('tenantId', options.tenantId);
    if (options?.kbId) formData.append('kbId', options.kbId);

    const response = await fetch('/api/v1/rag/documents/upload', {
      method: 'POST',
      body: formData,
    });
    const payload = (await response.json()) as ApiResponse<BatchFileIngestResponse>;
    if (!response.ok || payload.code !== 0) {
      throw new ApiClientError(
        payload?.code ?? response.status,
        payload?.message || `HTTP ${response.status}`,
        response.status,
      );
    }
    return payload.data;
  },

  searchKnowledge(req: RagSearchApiRequest): Promise<ScoredDocumentDto[]> {
    return requestJson<ScoredDocumentDto[]>('/api/v1/rag/search', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  queryRag(req: RagQueryApiRequest): Promise<RagQueryApiResponse> {
    return requestJson<RagQueryApiResponse>('/api/v1/rag/query', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  deleteDocument(id: string): Promise<boolean> {
    return requestJson<boolean>(`/api/v1/rag/documents?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  listDocuments(limit = 50): Promise<ScoredDocumentDto[]> {
    return requestJson<ScoredDocumentDto[]>(`/api/v1/rag/documents?limit=${limit}`);
  },

  getRagStats(): Promise<{
    totalChunks: number;
    vectorizedChunks?: number;
    vectorAvailable?: boolean;
    vectorDimensions?: number;
    persistent?: boolean;
    persistencePath?: string;
  }> {
    return requestJson('/api/v1/rag/stats');
  },

  getChatSessions<T>(): Promise<T[]> {
    return requestJson<T[]>('/api/v1/chat/sessions');
  },

  saveChatSessions<T>(sessions: T[]): Promise<number> {
    return requestJson<number>('/api/v1/chat/sessions', {
      method: 'PUT',
      body: JSON.stringify(sessions),
    });
  },

  deleteChatSession(sessionId: string): Promise<boolean> {
    return requestJson<boolean>(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
  },

  getAgentTools(): Promise<ToolInfoResponse[]> {
    return requestJson<ToolInfoResponse[]>('/api/v1/agent/tools');
  },

  runAgent(req: AgentRunApiRequest): Promise<AgentRunApiResponse> {
    return requestJson<AgentRunApiResponse>('/api/v1/agent/run', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  resumeAgent(req: AgentResumeApiRequest): Promise<AgentRunApiResponse> {
    return requestJson<AgentRunApiResponse>('/api/v1/agent/resume', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },
};
