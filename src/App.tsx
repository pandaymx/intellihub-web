import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import {
  type AgentStepTraceDto,
  ApiClientError,
  type FileParseResultDto,
  type PromptTemplateDto,
  type ScoredDocumentDto,
  type SystemInfoResponse,
  type ToolInfoResponse,
  intelliHubApi,
} from './api/intellihub';
import { MarkdownContent } from './components/MarkdownContent';

export interface ChatAttachmentSummary {
  fileName: string;
  fileFormat: string;
  characterCount: number;
}

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  channel?: string;
  latencyMs?: number;
  totalTokens?: number;
  reasoningContent?: string;
  stopReason?: string;
  awaitingApproval?: boolean;
  checkpointId?: string;
  steps?: AgentStepTraceDto[];
  citations?: ScoredDocumentDto[];
  structuredData?: Record<string, unknown>;
  isGuardBlocked?: boolean;
  errorCode?: number;
  attachments?: ChatAttachmentSummary[];
}

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessageItem[];
}

const DEFAULT_STRUCTURED_FIELDS = '客户姓名, 联系电话, 咨询产品, 诉求分类, 紧急程度, 预计预算';

export interface ModelOptionItem {
  id: string;
  shortLabel: string;
  title: string;
  subtitle: string;
  badge?: string;
}

const MODEL_OPTIONS: ModelOptionItem[] = [
  {
    id: 'gemini-primary',
    shortLabel: 'Gemini 3.5',
    title: 'Gemini 3.5 Flash Lite',
    subtitle: 'Google GenAI 原生在线推理 · 极速多轮工具与思考',
    badge: '真实在线',
  },
  {
    id: 'gemini-flash',
    shortLabel: 'Gemini 3.8',
    title: 'Gemini 3.8 Flash',
    subtitle: 'Google 最新旗舰 Flash 模型 · 深度思考增强',
    badge: 'New',
  },
  {
    id: 'default-ha',
    shortLabel: 'HA 路由',
    title: 'HA 高可用容灾组',
    subtitle: 'Gemini 主备自动故障转移与 KeyPool 半开探活',
    badge: '推荐',
  },
  {
    id: 'demo-mock',
    shortLabel: 'Mock 演示',
    title: 'Built-in Demo Mock',
    subtitle: '全能极速响应 · 内置离线免 Key 沙箱演示',
  },
  {
    id: 'deepseek-primary',
    shortLabel: 'DeepSeek',
    title: 'DeepSeek R1',
    subtitle: '深度思维链推理与复杂任务分析',
    badge: 'Pro',
  },
  {
    id: 'qwen-backup',
    shortLabel: 'Qwen',
    title: 'Qwen-Plus',
    subtitle: '通义千问长文档分析与稳健备用节点',
  },
  {
    id: 'ollama-local',
    shortLabel: 'Ollama',
    title: 'Ollama Local',
    subtitle: '本地私有化离线推理节点 (Qwen3)',
  },
];

const QUICK_SCENARIOS = [
  {
    icon: '🕒',
    label: '查询当前系统服务器时间与计算税额',
    prompt: '帮我查一下当前系统服务器几点了？另外算一下 1000 元 13% 增值税是多少？',
    enableAgent: true,
    enableRag: false,
    enableStructured: false,
  },
  {
    icon: '🛡️',
    label: '申请售后工单 ORD-20261110 原路退回 299 元',
    prompt: '客户售后订单 ORD-20261110 商品运输破损，请立即调用退款工具原路退回 299.00 元。',
    enableAgent: true,
    enableRag: false,
    enableStructured: false,
  },
  {
    icon: '📚',
    label: '当上游返回 401 鉴权失败时 KeyPool 如何隔离？',
    prompt:
      '在 IntelliHub 架构中，当上游模型返回 401 鉴权失败或 429 限流时 KeyPool 如何隔离？ReAct 智能体如何防止死循环？',
    enableAgent: true,
    enableRag: true,
    enableStructured: false,
  },
  {
    icon: '🧬',
    label: '从客户采购留言中提取结构化商机信息',
    prompt:
      '您好，我是华东区某科技公司的采购总监李明（联系电话 138-0013-8000），我们正在评估 IntelliHub 企业级 AI 中台，希望能咨询企业版私有化部署与高可用集群授权方案，内部立项预算在 50,000 元左右，目前项目处于 P0-高优 紧急状态。',
    enableAgent: false,
    enableRag: false,
    enableStructured: true,
  },
];

function formatTime(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export function App() {
  const [systemInfo, setSystemInfo] = useState<SystemInfoResponse | null>(null);
  const [tools, setTools] = useState<ToolInfoResponse[]>([]);
  const [kbChunks, setKbChunks] = useState<ScoredDocumentDto[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplateDto[]>([]);

  // 会话与消息列表状态
  const [sessions, setSessions] = useState<ChatSession[]>([
    {
      id: 'session-default',
      title: '全功能智能助手对话',
      updatedAt: formatTime(),
      messages: [],
    },
  ]);
  const [activeSessionId, setActiveSessionId] = useState<string>('session-default');

  // 对话工作台内联能力开关（全部集成在同一个聊天窗口中，Prompt 由后端统一管控）
  const [channel, setChannel] = useState<string>('gemini-primary');
  const [modelMenuOpen, setModelMenuOpen] = useState<boolean>(false);
  const [enableAgent, setEnableAgent] = useState<boolean>(true);
  const [enableRag, setEnableRag] = useState<boolean>(true);
  const [enableStructuredExtract, setEnableStructuredExtract] = useState<boolean>(false);
  const [targetFieldsInput, setTargetFieldsInput] = useState<string>(DEFAULT_STRUCTURED_FIELDS);

  // 输入框与发送状态
  const [inputMessage, setInputMessage] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);

  // 对话框多格式附件上传与解析状态
  const [chatAttachments, setChatAttachments] = useState<FileParseResultDto[]>([]);
  const [chatUploading, setChatUploading] = useState<boolean>(false);
  const [syncChatAttachmentsToKb, setSyncChatAttachmentsToKb] = useState<boolean>(true);
  const [chatUploadHint, setChatUploadHint] = useState<string | null>(null);
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);
  const kbFileInputRef = useRef<HTMLInputElement | null>(null);
  const kbPreviewFileInputRef = useRef<HTMLInputElement | null>(null);
  const [kbParsedResults, setKbParsedResults] = useState<FileParseResultDto[]>([]);

  // 用户提问复制与内联重新编辑状态
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');

  // 气泡内人工审批备注与处理状态
  const [approvalNotes, setApprovalNotes] = useState<Record<string, string>>({});
  const [resumingMessageId, setResumingMessageId] = useState<string | null>(null);

  // 侧滑后台管理抽屉状态（知识库管理 / 后端 Prompt 模板管理 / 工具与路由拓扑）
  const [activeDrawer, setActiveDrawer] = useState<'none' | 'kb' | 'prompts' | 'system'>('none');
  const [newDocTitle, setNewDocTitle] = useState<string>('企业售后服务与退换货 SLA 规范');
  const [newDocContent, setNewDocContent] = useState<string>(
    `# 企业售后服务与退换货 SLA 规范\n\n## 1. 极速退款标准\n凡订单金额在 500 元以内且商品未拆封的退货申请，系统支持 2 小时内极速原路退回；超过 500 元或涉及特殊赔付的售后单，必须触发 execute_refund_transfer 人工复核审批流。\n\n## 2. 赔付标准\n若因物流破损导致商品无法使用，除全额退回订单款项外，额外补偿客户 20 元无门槛现金券。`,
  );
  const [kbSearchKeyword, setKbSearchKeyword] = useState<string>('路由 401 死循环 退款');
  const [kbBusy, setKbBusy] = useState<boolean>(false);
  const [kbFeedback, setKbFeedback] = useState<string | null>(null);

  // 后端 Prompt 模板管理表单状态
  const [tplId, setTplId] = useState<string>('default-copilot-system');
  const [tplVersion, setTplVersion] = useState<string>('v1');
  const [tplDesc, setTplDesc] = useState<string>(
    '对话工作台后端全局主控系统提示词模板（由后端统一管控，不对普通聊天用户开放修改）',
  );
  const [tplSystem, setTplSystem] = useState<string>(
    '你是 IntelliHub 企业级智能助手。你可以在同一对话窗口中协助用户解答架构规范问题、调用工具查询时间或计算税费、执行带人工审批的敏感操作，并在引用知识库时标注 [#1] 角标。',
  );
  const [tplUser, setTplUser] = useState<string>('{message}');
  const [tplSaving, setTplSaving] = useState<boolean>(false);
  const [tplFeedback, setTplFeedback] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const sessionsLoadedRef = useRef<boolean>(false);

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? sessions[0];
  const activeModelOption = MODEL_OPTIONS.find((m) => m.id === channel) ?? MODEL_OPTIONS[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setModelMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 启动时从后端持久化接口（或本地缓存）恢复历史会话
  useEffect(() => {
    void (async () => {
      try {
        const persisted = await intelliHubApi.getChatSessions<ChatSession>();
        if (Array.isArray(persisted) && persisted.length > 0) {
          setSessions(persisted);
          setActiveSessionId(persisted[0].id);
          sessionsLoadedRef.current = true;
          return;
        }
      } catch {
        // fallback to localStorage
      }
      try {
        const localRaw = localStorage.getItem('intellihub_chat_sessions');
        if (localRaw) {
          const parsed = JSON.parse(localRaw) as ChatSession[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setSessions(parsed);
            setActiveSessionId(parsed[0].id);
          }
        }
      } catch {
        // ignore parse error
      }
      sessionsLoadedRef.current = true;
    })();
  }, []);

  // 会话变更时自动同步至后端磁盘与 localStorage
  useEffect(() => {
    if (!sessionsLoadedRef.current) return;
    try {
      localStorage.setItem('intellihub_chat_sessions', JSON.stringify(sessions));
    } catch {
      // ignore storage quota
    }
    void intelliHubApi.saveChatSessions(sessions).catch(() => {});
  }, [sessions]);

  const refreshSystemMetadata = useCallback(async () => {
    try {
      const [info, toolList, chunks, tplIds] = await Promise.all([
        intelliHubApi.getSystemInfo(),
        intelliHubApi.getAgentTools(),
        intelliHubApi.listDocuments(30),
        intelliHubApi.listPromptIds(),
      ]);
      setSystemInfo(info);
      setTools(toolList);
      setKbChunks(chunks);

      const loadedTemplates = await Promise.all(
        tplIds.map((id) => intelliHubApi.getPromptTemplate(id)),
      );
      setPromptTemplates(loadedTemplates);
    } catch {
      // ignore initial metadata load error
    }
  }, []);

  useEffect(() => {
    void refreshSystemMetadata();
  }, [refreshSystemMetadata]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 60);
  }, []);

  const updateSessionMessages = useCallback(
    (
      sessionId: string,
      updater: (prev: ChatMessageItem[]) => ChatMessageItem[],
      newTitle?: string,
    ) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          return {
            ...s,
            title: newTitle && s.messages.length === 0 ? newTitle : s.title,
            updatedAt: formatTime(),
            messages: updater(s.messages),
          };
        }),
      );
    },
    [],
  );

  // 发送对话消息（支持在同一个聊天流中融合 Agent、RAG、结构化提取与安全护栏）
  const handleSendMessage = async (overrideOptions?: {
    text?: string;
    agent?: boolean;
    rag?: boolean;
    structured?: boolean;
    baseMessages?: ChatMessageItem[];
  }) => {
    const pendingAttachments = overrideOptions ? [] : chatAttachments;
    const rawInputText = (overrideOptions?.text ?? inputMessage).trim();
    const textToSend =
      rawInputText ||
      (pendingAttachments.length > 0
        ? `请分析并总结我上传的 ${pendingAttachments.map((a) => a.fileName).join('、')} 的核心内容。`
        : '');
    if (!textToSend || sending || chatUploading) return;

    const useAgent = overrideOptions?.agent ?? enableAgent;
    const useRag = overrideOptions?.rag ?? enableRag;
    const useStructured = overrideOptions?.structured ?? enableStructuredExtract;

    if (overrideOptions) {
      setEnableAgent(useAgent);
      setEnableRag(useRag);
      setEnableStructuredExtract(useStructured);
    }

    const userMsgItem: ChatMessageItem = {
      id: `msg-user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: formatTime(),
      attachments:
        pendingAttachments.length > 0
          ? pendingAttachments.map((a) => ({
              fileName: a.fileName,
              fileFormat: a.fileFormat,
              characterCount: a.characterCount,
            }))
          : undefined,
    };

    const sourceMessages = overrideOptions?.baseMessages ?? activeSession.messages;
    const shortTitle = textToSend.length > 16 ? `${textToSend.slice(0, 16)}...` : textToSend;
    const historyForTurn = sourceMessages
      .filter((m) => !m.isGuardBlocked)
      .slice(-8)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    updateSessionMessages(
      activeSession.id,
      (prev) => [...(overrideOptions?.baseMessages ?? prev), userMsgItem],
      shortTitle,
    );
    if (!overrideOptions?.text) {
      setInputMessage('');
      setChatAttachments([]);
      setChatUploadHint(null);
    }
    setSending(true);
    scrollToBottom();

    try {
      const targetFields = useStructured
        ? targetFieldsInput
            .split(/[,，]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;

      const res = await intelliHubApi.unifiedChatTurn({
        message: textToSend,
        history: historyForTurn,
        channel,
        enableAgent: useAgent,
        enableRag: useRag,
        enableStructuredExtract: useStructured,
        targetFields,
        attachments:
          pendingAttachments.length > 0
            ? pendingAttachments.map((a) => ({
                fileName: a.fileName,
                fileFormat: a.fileFormat,
                content: a.markdownContent,
              }))
            : undefined,
      });

      const assistantMsg: ChatMessageItem = {
        id: `msg-ai-${Date.now()}`,
        role: 'assistant',
        content: res.content,
        timestamp: formatTime(),
        channel: res.channel,
        latencyMs: res.latencyMs,
        totalTokens: res.totalTokens,
        reasoningContent: res.reasoningContent,
        stopReason: res.stopReason,
        awaitingApproval: res.awaitingApproval,
        checkpointId: res.checkpointId,
        steps: res.steps,
        citations: res.citations,
        structuredData: res.structuredData,
      };

      if (res.awaitingApproval && res.checkpointId) {
        setApprovalNotes((prev) => ({
          ...prev,
          [assistantMsg.id]: '已核实售后物流破损凭证，同意原路退回款项',
        }));
      }

      updateSessionMessages(activeSession.id, (prev) => [...prev, assistantMsg]);
    } catch (err) {
      const isGuard = err instanceof ApiClientError && err.code === 1001000006;
      const errorMsg: ChatMessageItem = {
        id: `msg-err-${Date.now()}`,
        role: 'assistant',
        content:
          err instanceof ApiClientError
            ? err.message
            : err instanceof Error
              ? err.message
              : '请求发生未知异常',
        timestamp: formatTime(),
        channel,
        isGuardBlocked: isGuard,
        errorCode: err instanceof ApiClientError ? err.code : 500,
      };
      updateSessionMessages(activeSession.id, (prev) => [...prev, errorMsg]);
    } finally {
      setSending(false);
      scrollToBottom();
    }
  };

  // 在聊天气泡内直接点击【批准并继续】或【拒绝拦截】恢复挂起的 Agent 任务
  const handleInlineApprovalResume = async (msg: ChatMessageItem, approved: boolean) => {
    if (!msg.checkpointId || resumingMessageId) return;
    setResumingMessageId(msg.id);
    const note =
      approvalNotes[msg.id] ||
      (approved ? '审批人已确认放行该高风险操作' : '审批人拒绝执行该高风险操作');

    try {
      const resumed = await intelliHubApi.resumeAgent({
        checkpointId: msg.checkpointId,
        approved,
        reviewerNote: note,
        channel: msg.channel || channel,
      });

      updateSessionMessages(activeSession.id, (prev) =>
        prev.map((item) => {
          if (item.id !== msg.id) return item;
          return {
            ...item,
            content: resumed.output,
            stopReason: resumed.stopReason,
            awaitingApproval: resumed.awaitingApproval,
            checkpointId: resumed.checkpointId,
            steps: resumed.steps,
            totalTokens: resumed.totalTokens,
            latencyMs: (item.latencyMs ?? 0) + resumed.totalLatencyMs,
          };
        }),
      );
    } catch (err) {
      const errText = err instanceof Error ? err.message : '恢复审批执行失败';
      updateSessionMessages(activeSession.id, (prev) =>
        prev.map((item) =>
          item.id === msg.id ? { ...item, content: `${item.content}\n\n❌ ${errText}` } : item,
        ),
      );
    } finally {
      setResumingMessageId(null);
      scrollToBottom();
    }
  };

  const handleCreateNewSession = () => {
    const newId = `session-${Date.now()}`;
    const newSession: ChatSession = {
      id: newId,
      title: `新对话 ${sessions.length + 1}`,
      updatedAt: formatTime(),
      messages: [],
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newId);
  };

  const handleDeleteSession = (id: string) => {
    if (sessions.length <= 1) {
      updateSessionMessages(id, () => [], '全功能智能助手对话');
      return;
    }
    const nextSessions = sessions.filter((s) => s.id !== id);
    setSessions(nextSessions);
    if (activeSessionId === id) {
      setActiveSessionId(nextSessions[0].id);
    }
  };

  // 复制用户提问与内联修改重新发送
  const handleCopyUserMessage = async (msg: ChatMessageItem) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedMsgId(msg.id);
      setTimeout(() => {
        setCopiedMsgId((prev) => (prev === msg.id ? null : prev));
      }, 1500);
    } catch {
      // ignore clipboard error
    }
  };

  const handleStartEditUserMessage = (msg: ChatMessageItem) => {
    setEditingMsgId(msg.id);
    setEditingText(msg.content);
  };

  const handleSubmitEditedUserMessage = async (msgId: string) => {
    const trimmed = editingText.trim();
    if (!trimmed || sending) return;
    const msgIndex = activeSession.messages.findIndex((m) => m.id === msgId);
    const priorMessages =
      msgIndex >= 0 ? activeSession.messages.slice(0, msgIndex) : activeSession.messages;
    setEditingMsgId(null);
    setEditingText('');
    await handleSendMessage({
      text: trimmed,
      baseMessages: priorMessages,
    });
  };

  // 知识库抽屉内上传与检索操作
  const handleIngestDoc = async () => {
    if (!newDocContent.trim() || kbBusy) return;
    setKbBusy(true);
    setKbFeedback(null);
    try {
      const res = await intelliHubApi.ingestDocument({
        title: newDocTitle.trim() || '未命名知识文档',
        content: newDocContent,
        tenantId: 'default',
        kbId: 'builtin',
      });
      setKbFeedback(
        `✅ 摄取成功！已切分为 ${res.chunkCount} 个语义分片并入库，现在可直接在聊天窗口提问测试。`,
      );
      await refreshSystemMetadata();
    } catch (e) {
      setKbFeedback(`❌ 入库失败：${e instanceof Error ? e.message : '未知错误'}`);
    } finally {
      setKbBusy(false);
    }
  };

  // 知识库抽屉：多格式文件一键上传、解析、切分并向量化入库
  const handleKbUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || kbBusy) return;
    const files = Array.from(fileList);
    setKbBusy(true);
    setKbFeedback(null);
    try {
      const res = await intelliHubApi.uploadAndIngestFiles(files, {
        tenantId: 'default',
        kbId: 'builtin',
      });
      setKbParsedResults(res.files);
      if (res.files.length > 0) {
        setNewDocTitle(res.files[0].title);
        setNewDocContent(res.files[0].markdownContent);
      }
      setKbFeedback(
        `✅ 成功上传并解析 ${res.fileCount} 个文件（${res.files.map((f) => `${f.fileName}[${f.fileFormat}]`).join('、')}），共生成 ${res.totalChunkCount} 个语义切片并写入向量库！`,
      );
      await refreshSystemMetadata();
    } catch (e) {
      setKbFeedback(`❌ 文件解析入库失败：${e instanceof Error ? e.message : '未知错误'}`);
    } finally {
      setKbBusy(false);
      if (kbFileInputRef.current) kbFileInputRef.current.value = '';
    }
  };

  // 知识库抽屉：仅解析文件并加载到下方 Markdown 编辑器供预览修改
  const handleKbParsePreviewFile = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || kbBusy) return;
    const files = Array.from(fileList);
    setKbBusy(true);
    setKbFeedback(null);
    try {
      const parsedList = await intelliHubApi.parseFiles(files);
      setKbParsedResults(parsedList);
      if (parsedList.length > 0) {
        const first = parsedList[0];
        setNewDocTitle(first.title);
        setNewDocContent(
          parsedList.length === 1
            ? first.markdownContent
            : parsedList.map((p) => p.markdownContent).join('\n\n---\n\n'),
        );
        setKbFeedback(
          `📄 已将 ${parsedList.map((p) => `${p.fileName} (${p.fileFormat}, ${p.characterCount}字)`).join('、')} 解析为结构化 Markdown 并填入编辑器，确认后点击下方按钮即可入库。`,
        );
      }
    } catch (e) {
      setKbFeedback(`❌ 文件解析失败：${e instanceof Error ? e.message : '未知错误'}`);
    } finally {
      setKbBusy(false);
      if (kbPreviewFileInputRef.current) kbPreviewFileInputRef.current.value = '';
    }
  };

  // 对话框：上传多格式文件作为当前对话附件（可选同步入库）
  const handleChatSelectFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || chatUploading) return;
    const files = Array.from(fileList);
    setChatUploading(true);
    setChatUploadHint('正在解析多格式文档...');
    try {
      if (syncChatAttachmentsToKb) {
        const res = await intelliHubApi.uploadAndIngestFiles(files, {
          tenantId: 'default',
          kbId: 'builtin',
        });
        setChatAttachments((prev) => [...prev, ...res.files]);
        setChatUploadHint(
          `✅ 已解析 ${res.fileCount} 个文件并同步写入知识库（新增 ${res.totalChunkCount} 个向量切片）`,
        );
        await refreshSystemMetadata();
      } else {
        const parsed = await intelliHubApi.parseFiles(files);
        setChatAttachments((prev) => [...prev, ...parsed]);
        setChatUploadHint(`✅ 已解析 ${parsed.length} 个文件，发送消息即可直接分析`);
      }
    } catch (e) {
      setChatUploadHint(`❌ 解析失败：${e instanceof Error ? e.message : '未知错误'}`);
    } finally {
      setChatUploading(false);
      if (chatFileInputRef.current) chatFileInputRef.current.value = '';
    }
  };

  const handleRemoveChatAttachment = (index: number) => {
    setChatAttachments((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSearchKbInDrawer = async () => {
    if (!kbSearchKeyword.trim()) return;
    setKbBusy(true);
    try {
      const hits = await intelliHubApi.searchKnowledge({
        query: kbSearchKeyword.trim(),
        topK: 10,
      });
      setKbChunks(hits);
    } finally {
      setKbBusy(false);
    }
  };

  const handleDeleteChunk = async (chunkId: string) => {
    await intelliHubApi.deleteDocument(chunkId);
    await handleSearchKbInDrawer();
    await refreshSystemMetadata();
  };

  const handleSelectTemplateForAdmin = (tpl: PromptTemplateDto) => {
    setTplId(tpl.id);
    setTplVersion(tpl.version);
    setTplDesc(tpl.description);
    setTplSystem(tpl.systemTemplate ?? '');
    setTplUser(tpl.userTemplate);
    setTplFeedback(null);
  };

  const handleSaveBackendTemplate = async () => {
    if (!tplId.trim() || !tplUser.trim() || tplSaving) return;
    setTplSaving(true);
    setTplFeedback(null);
    try {
      const saved = await intelliHubApi.registerPromptTemplate({
        id: tplId.trim(),
        version: tplVersion.trim() || 'v1',
        description: tplDesc.trim(),
        systemTemplate: tplSystem.trim(),
        userTemplate: tplUser.trim(),
        guardInjection: true,
        wrapUserVariablesInXmlTag: true,
      });
      setTplFeedback(
        `✅ 后端模板 [${saved.id}@${saved.version}] 已更新生效！对话引擎将自动加载最新后端配置。`,
      );
      await refreshSystemMetadata();
    } catch (e) {
      setTplFeedback(`❌ 保存失败：${e instanceof Error ? e.message : '未知错误'}`);
    } finally {
      setTplSaving(false);
    }
  };

  const ACCEPTED_FILE_EXTENSIONS =
    '.pdf,.docx,.xlsx,.pptx,.csv,.tsv,.md,.markdown,.txt,.log,.html,.htm,.xml,.json,.jsonl,.yaml,.yml,.properties,.toml,.java,.kt,.py,.ts,.tsx,.js,.go,.rs,.sql,.sh';

  const renderChatAttachmentBar = () => {
    if (chatAttachments.length === 0 && !chatUploading && !chatUploadHint) return null;
    return (
      <div className="chat-attachments-bar">
        <div className="chat-attachments-chips">
          {chatAttachments.map((att, idx) => (
            <div key={`${att.fileName}-${att.characterCount}`} className="chat-attachment-chip">
              <span className="att-format-tag">{att.fileFormat}</span>
              <span className="att-name" title={att.fileName}>
                {att.fileName}
              </span>
              <span className="att-chars">{att.characterCount} 字</span>
              <button
                type="button"
                className="att-remove-btn"
                title="移除附件"
                onClick={() => handleRemoveChatAttachment(idx)}
              >
                ×
              </button>
            </div>
          ))}
          <label className="att-sync-toggle" title="上传对话附件时是否自动切分并存入向量知识库">
            <input
              type="checkbox"
              checked={syncChatAttachmentsToKb}
              onChange={(e) => setSyncChatAttachmentsToKb(e.target.checked)}
            />
            <span>同步写入知识库</span>
          </label>
        </div>
        {(chatUploading || chatUploadHint) && (
          <div className="chat-upload-status">{chatUploadHint}</div>
        )}
      </div>
    );
  };

  // 渲染对齐 Google Gemini 官网的自定义悬浮模型选择器 (Popover)
  const renderModelPicker = (direction: 'down' | 'up') => (
    <div className="model-picker-wrap" ref={modelMenuRef}>
      <button
        type="button"
        className={`model-picker-trigger ${modelMenuOpen ? 'open' : ''}`}
        onClick={() => setModelMenuOpen((prev) => !prev)}
        title="选择模型"
      >
        <span className="picker-trigger-label">{activeModelOption.shortLabel}</span>
        <svg
          className={`picker-chevron ${modelMenuOpen ? 'rotated' : ''}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {modelMenuOpen && (
        <div className={`model-picker-popover ${direction === 'up' ? 'popover-up' : ''}`}>
          <div className="model-popover-header">选择模型</div>
          <div className="model-popover-list">
            {MODEL_OPTIONS.map((opt) => {
              const isSelected = opt.id === channel;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`model-option-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    setChannel(opt.id);
                    setModelMenuOpen(false);
                  }}
                >
                  <div className="model-option-info">
                    <div className="model-option-title-row">
                      <span className="model-option-title">{opt.title}</span>
                      {opt.badge && <span className="model-option-badge">{opt.badge}</span>}
                    </div>
                    <span className="model-option-subtitle">{opt.subtitle}</span>
                  </div>
                  <div className="model-option-check">
                    {isSelected && (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="copilot-shell">
      {/* 左侧会话列表与后台管理抽屉导航栏 */}
      <aside className="copilot-sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo">IH</div>
          <div>
            <h1>IntelliHub AI</h1>
            <p>All-in-One 智能对话工作台</p>
          </div>
        </div>

        <button type="button" className="new-chat-btn" onClick={handleCreateNewSession}>
          <span>＋ 开启新对话</span>
        </button>

        <div className="session-list-header">最近对话记录</div>
        <div className="session-list">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`session-item ${s.id === activeSession.id ? 'active' : ''}`}
              onClick={() => setActiveSessionId(s.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setActiveSessionId(s.id);
              }}
            >
              <span className="session-icon">💬</span>
              <div className="session-meta">
                <div className="session-title">{s.title}</div>
                <div className="session-time">
                  {s.messages.length} 条消息 · {s.updatedAt}
                </div>
              </div>
              <button
                type="button"
                className="session-del-btn"
                title="清空或删除会话"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteSession(s.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* 底部后台管理抽屉入口（知识库、后端 Prompt 模板管理、工具拓扑） */}
        <div className="sidebar-footer">
          <button
            type="button"
            className={`drawer-trigger-btn ${activeDrawer === 'kb' ? 'active' : ''}`}
            onClick={() => setActiveDrawer(activeDrawer === 'kb' ? 'none' : 'kb')}
          >
            <span>📚 知识库文档管理</span>
            <span className="count-pill">{systemInfo?.knowledgeBaseChunkCount ?? 2} 切片</span>
          </button>
          <button
            type="button"
            className={`drawer-trigger-btn ${activeDrawer === 'prompts' ? 'active' : ''}`}
            onClick={() => setActiveDrawer(activeDrawer === 'prompts' ? 'none' : 'prompts')}
          >
            <span>📝 后端 Prompt 模板管理</span>
            <span className="count-pill">{promptTemplates.length || 3} 模板</span>
          </button>
          <button
            type="button"
            className={`drawer-trigger-btn ${activeDrawer === 'system' ? 'active' : ''}`}
            onClick={() => setActiveDrawer(activeDrawer === 'system' ? 'none' : 'system')}
          >
            <span>🛠️ 已挂载工具与路由</span>
            <span className="count-pill">{tools.length || 3} 工具</span>
          </button>
        </div>
      </aside>

      {/* 中央一体化全能聊天主界面 */}
      <main className="copilot-main">
        <input
          ref={chatFileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_FILE_EXTENSIONS}
          style={{ display: 'none' }}
          onChange={(e) => void handleChatSelectFiles(e.target.files)}
        />
        {/* 顶部栏：仅保留会话标题与引擎在线状态，模型切换统一收敛至输入胶囊内 */}
        <header className="copilot-header">
          <div className="header-left">
            <span className="chat-active-title">{activeSession.title}</span>
            <span className="online-badge">● 引擎在线</span>
          </div>
        </header>

        {/* 消息流区域 */}
        <div className="chat-stream-container">
          {activeSession.messages.length === 0 ? (
            <div className="gemini-start-screen">
              <h2 className="gemini-start-title">我们从哪里开始？</h2>

              {renderChatAttachmentBar()}

              {/* 居中输入胶囊栏（完全对齐截图交互） */}
              <div className="gemini-pill-box">
                <button
                  type="button"
                  className="pill-plus-btn"
                  title="上传多格式文件（PDF / Word / Excel / PPT / CSV / Markdown / JSON / 代码等）"
                  disabled={chatUploading}
                  onClick={() => chatFileInputRef.current?.click()}
                >
                  ＋
                </button>
                <input
                  type="text"
                  className="pill-text-input"
                  placeholder={
                    chatAttachments.length > 0
                      ? '输入针对已上传文件的提问（直接回车默认总结分析）...'
                      : '提问、输入指令，或点击左侧 ＋ 上传多格式文档...'
                  }
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleSendMessage();
                    }
                  }}
                />
                {renderModelPicker('down')}
                <button
                  type="button"
                  className="pill-send-icon-btn"
                  disabled={
                    sending ||
                    chatUploading ||
                    (!inputMessage.trim() && chatAttachments.length === 0)
                  }
                  onClick={() => void handleSendMessage()}
                  title="发送"
                >
                  ↑
                </button>
              </div>

              {/* 居中功能切换胶囊（对齐截图的 Chat / Task 切换风格） */}
              <div className="gemini-mode-tabs">
                <button
                  type="button"
                  className={`gemini-mode-tab ${enableAgent ? 'active' : ''}`}
                  onClick={() => setEnableAgent(!enableAgent)}
                >
                  智能体工具
                </button>
                <button
                  type="button"
                  className={`gemini-mode-tab ${enableRag ? 'active' : ''}`}
                  onClick={() => setEnableRag(!enableRag)}
                >
                  知识库检索
                </button>
                <button
                  type="button"
                  className={`gemini-mode-tab ${enableStructuredExtract ? 'active' : ''}`}
                  onClick={() => setEnableStructuredExtract(!enableStructuredExtract)}
                >
                  结构化提取
                </button>
              </div>

              {enableStructuredExtract && (
                <div className="structured-fields-bar centered-fields-bar">
                  <span className="fields-bar-label">提取字段：</span>
                  <input
                    type="text"
                    className="fields-bar-input"
                    value={targetFieldsInput}
                    onChange={(e) => setTargetFieldsInput(e.target.value)}
                  />
                </div>
              )}

              {/* 极简常见问题列表（无边框纯文本行 + 小图标） */}
              <div className="gemini-suggestion-list">
                {QUICK_SCENARIOS.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="gemini-suggestion-row"
                    onClick={() =>
                      void handleSendMessage({
                        text: item.prompt,
                        agent: item.enableAgent,
                        rag: item.enableRag,
                        structured: item.enableStructured,
                      })
                    }
                  >
                    <span className="suggestion-row-icon">{item.icon}</span>
                    <span className="suggestion-row-text">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="message-list">
              {activeSession.messages.map((msg) => (
                <div key={msg.id} className={`message-row ${msg.role}`}>
                  <div className="message-bubble-wrapper">
                    {/* 仅在助手消息且有耗时/状态元信息时展示轻量标签条 */}
                    {msg.role === 'assistant' && (
                      <div className="message-meta-bar">
                        {msg.latencyMs !== undefined && (
                          <span className="meta-pill">{msg.latencyMs} ms</span>
                        )}
                        {msg.totalTokens !== undefined && msg.totalTokens > 0 && (
                          <span className="meta-pill">{msg.totalTokens} tokens</span>
                        )}
                        {msg.awaitingApproval && (
                          <span className="meta-pill warning">⏸️ 等待人工审批</span>
                        )}
                        {msg.isGuardBlocked && (
                          <span className="meta-pill danger">
                            🛡️ 安全护栏已拦截 ({msg.errorCode})
                          </span>
                        )}
                      </div>
                    )}

                    <div
                      className={`message-bubble ${msg.isGuardBlocked ? 'guard-blocked' : ''} ${
                        msg.awaitingApproval ? 'awaiting-border' : ''
                      }`}
                    >
                      {/* 1. 深度思考过程折叠面板 (<think>) */}
                      {msg.reasoningContent && (
                        <details className="inline-collapse think-collapse">
                          <summary>🧠 深度思考过程 (Chain of Thought)</summary>
                          <div className="think-md-wrapper">
                            <MarkdownContent content={msg.reasoningContent} />
                          </div>
                        </details>
                      )}

                      {/* 2. ReAct 智能体工具调用轨迹折叠面板 */}
                      {msg.steps?.some((s) => s.toolCalls && s.toolCalls.length > 0) && (
                        <details className="inline-collapse tools-collapse" open>
                          <summary>
                            🔧 已执行{' '}
                            {msg.steps.reduce(
                              (acc, s) => acc + (s.toolCalls ? s.toolCalls.length : 0),
                              0,
                            )}{' '}
                            次工具调用轨迹
                          </summary>
                          <div className="inline-tool-list">
                            {msg.steps.map((step) =>
                              step.toolCalls?.map((tc) => (
                                <div key={tc.callId} className="inline-tool-item">
                                  <div className="tool-item-head">
                                    <span className="tool-fn-name">⚡ {tc.toolName}</span>
                                    <span
                                      className={`tool-status-badge ${
                                        tc.approvalRejected
                                          ? 'rejected'
                                          : tc.success
                                            ? 'ok'
                                            : 'pending'
                                      }`}
                                    >
                                      {tc.approvalRejected
                                        ? '🚫 已被人工拒绝拦截'
                                        : tc.success
                                          ? `✅ 成功 (${tc.durationMs}ms)`
                                          : '⏸️ 挂起等待审批'}
                                    </span>
                                  </div>
                                  <div className="tool-io-row">
                                    <span className="io-label">入参:</span>
                                    <code>{tc.arguments}</code>
                                  </div>
                                  <div className="tool-io-row">
                                    <span className="io-label">返回:</span>
                                    <code>{tc.observation}</code>
                                  </div>
                                </div>
                              )),
                            )}
                          </div>
                        </details>
                      )}

                      {/* 3. 正文内容（用户消息支持内联重新编辑；AI 回复采用 Gemini 风格富文本 Markdown 渲染） */}
                      {msg.role === 'user' && editingMsgId === msg.id ? (
                        <div className="user-edit-box">
                          <textarea
                            className="user-edit-textarea"
                            rows={3}
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                void handleSubmitEditedUserMessage(msg.id);
                              } else if (e.key === 'Escape') {
                                setEditingMsgId(null);
                              }
                            }}
                          />
                          <div className="user-edit-actions">
                            <button
                              type="button"
                              className="edit-btn cancel"
                              onClick={() => setEditingMsgId(null)}
                            >
                              取消
                            </button>
                            <button
                              type="button"
                              className="edit-btn submit"
                              disabled={!editingText.trim() || sending}
                              onClick={() => void handleSubmitEditedUserMessage(msg.id)}
                            >
                              发送并重新生成
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="message-content-text">
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="msg-attachments-row">
                              {msg.attachments.map((att) => (
                                <span
                                  key={`${att.fileName}-${att.characterCount}`}
                                  className="msg-att-badge"
                                >
                                  📎 <strong>{att.fileName}</strong>
                                  <span className="msg-att-meta">
                                    {att.fileFormat} · {att.characterCount}字
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}
                          {msg.isGuardBlocked ? (
                            <div className="guard-alert-box">
                              <div className="guard-alert-title">
                                🛡️ PromptInjectionGuard 安全护栏已拦截该指令
                              </div>
                              <p>{msg.content}</p>
                              <div className="guard-alert-foot">
                                触发规则：检测到企图覆盖系统指令或越狱的敏感特征（错误码：
                                <code>{msg.errorCode}</code>）
                              </div>
                            </div>
                          ) : msg.role === 'assistant' ? (
                            <MarkdownContent content={msg.content} />
                          ) : (
                            msg.content
                          )}
                        </div>
                      )}

                      {/* 4. 气泡内联：高风险工具人工审批卡片 (Human-in-the-Loop) */}
                      {msg.awaitingApproval && msg.checkpointId && (
                        <div className="inline-hitl-card">
                          <div className="hitl-card-header">
                            <span className="hitl-badge">⏸️ 高风险敏感操作人工审批门禁</span>
                            <code className="hitl-checkpoint">快照 ID: {msg.checkpointId}</code>
                          </div>
                          <p className="hitl-desc">
                            智能体请求执行高风险工具 <code>execute_refund_transfer</code>
                            ，已被安全治理中心挂起。请直接在当前对话中复核并决定是否放行：
                          </p>
                          <div className="hitl-form-row">
                            <input
                              type="text"
                              className="hitl-note-input"
                              placeholder="输入审批复核备注..."
                              value={approvalNotes[msg.id] ?? ''}
                              onChange={(e) =>
                                setApprovalNotes((prev) => ({
                                  ...prev,
                                  [msg.id]: e.target.value,
                                }))
                              }
                            />
                            <div className="hitl-btn-group">
                              <button
                                type="button"
                                className="hitl-btn approve"
                                disabled={resumingMessageId === msg.id}
                                onClick={() => void handleInlineApprovalResume(msg, true)}
                              >
                                {resumingMessageId === msg.id
                                  ? '正在恢复执行...'
                                  : '✅ 批准并继续执行'}
                              </button>
                              <button
                                type="button"
                                className="hitl-btn reject"
                                disabled={resumingMessageId === msg.id}
                                onClick={() => void handleInlineApprovalResume(msg, false)}
                              >
                                🚫 拒绝并拦截
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 5. 气泡内联：结构化数据提取结果卡片 */}
                      {msg.structuredData && Object.keys(msg.structuredData).length > 0 && (
                        <div className="inline-structured-card">
                          <div className="structured-card-head">
                            <span>🧬 结构化提取数据表 (Structured Output)</span>
                          </div>
                          <div className="structured-kv-grid">
                            {Object.entries(msg.structuredData).map(([k, v]) => (
                              <div key={k} className="structured-kv-item">
                                <span className="kv-key">{k}</span>
                                <span className="kv-val">{String(v)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 6. 气泡内联：RAG 知识库引用溯源切片卡片 ([#1], [#2]) */}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="inline-citations-box">
                          <div className="citations-title">
                            📑 知识库检索引用溯源 ({msg.citations.length} 个匹配分片)
                          </div>
                          <div className="citations-list">
                            {msg.citations.map((cit, idx) => (
                              <details key={cit.id} className="citation-chip">
                                <summary>
                                  <span className="citation-num">[#{idx + 1}]</span>
                                  <span className="citation-sec">
                                    {String(
                                      cit.metadata?.section_path || cit.metadata?.title || cit.id,
                                    )}
                                  </span>
                                  <span className="citation-score">
                                    Rerank: {cit.score.toFixed(3)}
                                  </span>
                                </summary>
                                <p className="citation-body">{cit.text}</p>
                              </details>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 用户提问气泡下方：复制提问 & 修改提问 快捷按钮栏（对齐截图风格） */}
                    {msg.role === 'user' && editingMsgId !== msg.id && (
                      <div className="user-msg-actions">
                        <button
                          type="button"
                          className="user-action-icon-btn"
                          title="复制提问内容"
                          onClick={() => void handleCopyUserMessage(msg)}
                        >
                          {copiedMsgId === msg.id ? (
                            <span className="copied-tip">✓ 已复制</span>
                          ) : (
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          )}
                        </button>
                        <button
                          type="button"
                          className="user-action-icon-btn"
                          title="修改提问并重新生成"
                          onClick={() => handleStartEditUserMessage(msg)}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {sending && (
                <div className="message-row assistant">
                  <div className="message-bubble-wrapper">
                    <div className="message-bubble typing-indicator">
                      <span className="dot" />
                      <span className="dot" />
                      <span className="dot" />
                      <span className="typing-text">
                        正在思考并调度 {enableAgent ? 'ReAct 工具 / ' : ''}
                        {enableRag ? 'RAG 知识检索' : '模型生成'}...
                      </span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* 底部全功能合一输入工作台（与初始态保持完全一致的 Gemini 胶囊输入框 + 向上弹出模型选择框） */}
        {activeSession.messages.length > 0 && (
          <footer className="copilot-composer">
            <div className="bottom-pill-container">
              {enableStructuredExtract && (
                <div className="structured-fields-bar">
                  <span className="fields-bar-label">提取字段：</span>
                  <input
                    type="text"
                    className="fields-bar-input"
                    value={targetFieldsInput}
                    onChange={(e) => setTargetFieldsInput(e.target.value)}
                    placeholder="例如：客户姓名, 联系电话, 咨询产品, 预计预算"
                  />
                </div>
              )}

              {renderChatAttachmentBar()}

              <div className="gemini-pill-box">
                <button
                  type="button"
                  className="pill-plus-btn"
                  title="上传多格式文件（PDF / Word / Excel / PPT / CSV / Markdown / JSON / 代码等）"
                  disabled={chatUploading}
                  onClick={() => chatFileInputRef.current?.click()}
                >
                  ＋
                </button>
                <input
                  type="text"
                  className="pill-text-input"
                  placeholder={
                    chatAttachments.length > 0
                      ? '输入针对已上传文件的提问（直接回车默认总结分析）...'
                      : '继续提问、输入指令，或点击 ＋ 上传文件...'
                  }
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleSendMessage();
                    }
                  }}
                />
                {renderModelPicker('up')}
                <button
                  type="button"
                  className="pill-send-icon-btn"
                  disabled={
                    sending ||
                    chatUploading ||
                    (!inputMessage.trim() && chatAttachments.length === 0)
                  }
                  onClick={() => void handleSendMessage()}
                  title="发送"
                >
                  ↑
                </button>
              </div>

              <div className="gemini-mode-tabs bottom-mode-tabs">
                <button
                  type="button"
                  className={`gemini-mode-tab ${enableAgent ? 'active' : ''}`}
                  onClick={() => setEnableAgent(!enableAgent)}
                >
                  智能体工具
                </button>
                <button
                  type="button"
                  className={`gemini-mode-tab ${enableRag ? 'active' : ''}`}
                  onClick={() => setEnableRag(!enableRag)}
                >
                  知识库检索
                </button>
                <button
                  type="button"
                  className={`gemini-mode-tab ${enableStructuredExtract ? 'active' : ''}`}
                  onClick={() => setEnableStructuredExtract(!enableStructuredExtract)}
                >
                  结构化提取
                </button>
              </div>
            </div>
          </footer>
        )}
      </main>

      {/* 右侧滑出式抽屉 1：知识库文档上传与切片管理（不中断当前聊天） */}
      {activeDrawer === 'kb' && (
        <aside className="copilot-drawer">
          <div className="drawer-header">
            <h3>📚 知识库实时管理</h3>
            <button
              type="button"
              className="drawer-close-btn"
              onClick={() => setActiveDrawer('none')}
            >
              ✕
            </button>
          </div>
          <div className="drawer-body">
            <div className="drawer-section">
              <h4>📂 多格式文档上传与智能解析</h4>
              <p className="drawer-hint">
                支持一键上传并解析{' '}
                <strong>
                  PDF、Word (.docx)、Excel (.xlsx)、PPT (.pptx)、CSV/TSV、HTML、JSON/YAML、源代码与
                  Markdown/TXT
                </strong>
                ，自动保留章节层级、表格表头与围栏代码块：
              </p>
              <input
                ref={kbFileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_FILE_EXTENSIONS}
                style={{ display: 'none' }}
                onChange={(e) => void handleKbUploadFiles(e.target.files)}
              />
              <input
                ref={kbPreviewFileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_FILE_EXTENSIONS}
                style={{ display: 'none' }}
                onChange={(e) => void handleKbParsePreviewFile(e.target.files)}
              />
              <div className="kb-upload-btn-group">
                <button
                  type="button"
                  className="drawer-primary-btn"
                  disabled={kbBusy}
                  onClick={() => kbFileInputRef.current?.click()}
                >
                  {kbBusy ? '正在解析处理...' : '📤 选择多格式文件并直接向量化入库'}
                </button>
                <button
                  type="button"
                  className="drawer-sec-btn"
                  disabled={kbBusy}
                  onClick={() => kbPreviewFileInputRef.current?.click()}
                >
                  🔍 仅解析预览到下方编辑器
                </button>
              </div>
              {kbParsedResults.length > 0 && (
                <div className="kb-parsed-summary-list">
                  {kbParsedResults.map((f) => (
                    <div
                      key={`${f.fileName}-${f.characterCount}`}
                      className="kb-parsed-summary-item"
                    >
                      <span className="att-format-tag">{f.fileFormat}</span>
                      <strong className="kb-parsed-name">{f.fileName}</strong>
                      <span className="meta-pill">{f.characterCount} 字符</span>
                      {f.chunkCount > 0 && (
                        <span className="meta-pill">{f.chunkCount} 个切片已入库</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="drawer-section">
              <h4>➕ 手动编辑 / 投喂 Markdown 知识文档</h4>
              <p className="drawer-hint">
                入库后无需重启，直接在左侧聊天框提问（如“物流破损怎么赔付？”）即可实时引用。
              </p>
              <input
                type="text"
                className="drawer-input"
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
                placeholder="文档标题"
              />
              <textarea
                className="drawer-textarea"
                rows={5}
                value={newDocContent}
                onChange={(e) => setNewDocContent(e.target.value)}
                placeholder="输入 Markdown 格式知识内容..."
              />
              <button
                type="button"
                className="drawer-primary-btn"
                disabled={kbBusy}
                onClick={() => void handleIngestDoc()}
              >
                {kbBusy ? '正在切分入库...' : '📥 语义切分并写入知识库'}
              </button>
              {kbFeedback && <div className="drawer-feedback">{kbFeedback}</div>}
            </div>

            <div className="drawer-section">
              <h4>
                🔍 已入库知识切片 ({kbChunks.length}){' '}
                <span className="meta-pill">
                  {systemInfo?.embeddingEnabled
                    ? `Gemini Embedding (${systemInfo.embeddingDimensions || 768}维) · 已向量化 ${systemInfo.vectorizedChunkCount ?? kbChunks.length} 条`
                    : 'BM25 词法索引'}
                </span>
              </h4>
              <div className="drawer-search-row">
                <input
                  type="text"
                  className="drawer-input"
                  value={kbSearchKeyword}
                  onChange={(e) => setKbSearchKeyword(e.target.value)}
                  placeholder="输入关键词检索切片..."
                />
                <button
                  type="button"
                  className="drawer-sec-btn"
                  onClick={() => void handleSearchKbInDrawer()}
                >
                  检索
                </button>
              </div>
              <div className="drawer-chunk-list">
                {kbChunks.map((c) => (
                  <div key={c.id} className="drawer-chunk-card">
                    <div className="chunk-card-head">
                      <div>
                        <code>{c.id}</code>
                        {c.vectorScore != null && (
                          <span className="meta-pill" style={{ marginLeft: '6px' }}>
                            Vec: {c.vectorScore.toFixed(3)}
                          </span>
                        )}
                        {c.bm25Score != null && (
                          <span className="meta-pill" style={{ marginLeft: '6px' }}>
                            BM25: {c.bm25Score.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="chunk-del-btn"
                        onClick={() => void handleDeleteChunk(c.id)}
                      >
                        删除
                      </button>
                    </div>
                    <p>{c.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* 右侧滑出式抽屉 2：后端 Prompt 模板统一配置与管理（不对前端普通聊天用户开放选择） */}
      {activeDrawer === 'prompts' && (
        <aside className="copilot-drawer">
          <div className="drawer-header">
            <h3>📝 后端 Prompt 模板管理</h3>
            <button
              type="button"
              className="drawer-close-btn"
              onClick={() => setActiveDrawer('none')}
            >
              ✕
            </button>
          </div>
          <div className="drawer-body">
            <div className="drawer-section">
              <h4>🔒 后端已注册 Prompt 模板 ({promptTemplates.length})</h4>
              <p className="drawer-hint">
                角色与 Prompt
                模板仅由服务端统一管控，不在用户聊天界面开放切换。点击下方卡片可加载至右侧表单进行后端版本更新：
              </p>
              <div className="drawer-chunk-list">
                {promptTemplates.map((tpl) => (
                  <div key={tpl.id} className="drawer-chunk-card">
                    <div className="chunk-card-head">
                      <strong>
                        {tpl.id} <span className="meta-pill">{tpl.version}</span>
                      </strong>
                      <button
                        type="button"
                        className="drawer-sec-btn"
                        onClick={() => handleSelectTemplateForAdmin(tpl)}
                      >
                        加载编辑
                      </button>
                    </div>
                    <p>{tpl.description}</p>
                    {tpl.systemTemplate && (
                      <div className="tool-io-row">
                        <span className="io-label">System:</span>
                        <code>{tpl.systemTemplate}</code>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="drawer-section">
              <h4>⚙️ 新增 / 更新后端 Prompt 模板版本</h4>
              <div className="drawer-search-row">
                <input
                  type="text"
                  className="drawer-input"
                  value={tplId}
                  onChange={(e) => setTplId(e.target.value)}
                  placeholder="模板 ID (如 default-copilot-system)"
                />
                <input
                  type="text"
                  className="drawer-input"
                  style={{ width: '90px' }}
                  value={tplVersion}
                  onChange={(e) => setTplVersion(e.target.value)}
                  placeholder="版本号 (v1)"
                />
              </div>
              <input
                type="text"
                className="drawer-input"
                value={tplDesc}
                onChange={(e) => setTplDesc(e.target.value)}
                placeholder="模板用途说明"
              />
              <textarea
                className="drawer-textarea"
                rows={4}
                value={tplSystem}
                onChange={(e) => setTplSystem(e.target.value)}
                placeholder="后端管控的 System Prompt..."
              />
              <textarea
                className="drawer-textarea"
                rows={3}
                value={tplUser}
                onChange={(e) => setTplUser(e.target.value)}
                placeholder="User Template (例如 {message})..."
              />
              <button
                type="button"
                className="drawer-primary-btn"
                disabled={tplSaving}
                onClick={() => void handleSaveBackendTemplate()}
              >
                {tplSaving ? '正在同步至后端...' : '💾 保存并发布至后端 PromptRegistry'}
              </button>
              {tplFeedback && <div className="drawer-feedback">{tplFeedback}</div>}
            </div>
          </div>
        </aside>
      )}

      {/* 右侧滑出式抽屉 3：系统已挂载工具与路由拓扑 */}
      {activeDrawer === 'system' && (
        <aside className="copilot-drawer">
          <div className="drawer-header">
            <h3>🛠️ 已挂载工具与模型拓扑</h3>
            <button
              type="button"
              className="drawer-close-btn"
              onClick={() => setActiveDrawer('none')}
            >
              ✕
            </button>
          </div>
          <div className="drawer-body">
            <div className="drawer-section">
              <h4>🔧 智能体可调用工具 ({tools.length})</h4>
              <p className="drawer-hint">
                在聊天窗口开启「🤖 智能体工具」时，模型将根据对话内容自动选择调用以下工具：
              </p>
              <div className="drawer-chunk-list">
                {tools.map((t) => (
                  <div key={t.name} className="drawer-chunk-card">
                    <div className="chunk-card-head">
                      <strong>⚡ {t.name}</strong>
                      <span className={`risk-tag ${t.highRisk ? 'high' : 'safe'}`}>
                        {t.highRisk ? '高风险 · 需人工审批' : '常规自动执行'}
                      </span>
                    </div>
                    <p>{t.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="drawer-section">
              <h4>🌐 运行时环境信息</h4>
              <div className="sys-kv-list">
                <div>
                  <span>应用服务：</span>
                  <strong>{systemInfo?.application ?? 'intellihub-server'}</strong>
                </div>
                <div>
                  <span>Java / Spring Boot：</span>
                  <strong>
                    Java {systemInfo?.javaVersion ?? '25'} / Boot{' '}
                    {systemInfo?.springBootVersion ?? '4.0.5'}
                  </strong>
                </div>
                <div>
                  <span>可用模型通道：</span>
                  <strong>{systemInfo?.channels?.join(', ') || 'demo-mock'}</strong>
                </div>
                <div>
                  <span>高可用路由组：</span>
                  <strong>{systemInfo?.routes?.join(', ') || 'demo-mock, default-ha'}</strong>
                </div>
                <div>
                  <span>向量化引擎：</span>
                  <strong>
                    {systemInfo?.embeddingEnabled
                      ? `gemini-embedding-001 (${systemInfo.embeddingDimensions || 768} 维)`
                      : '未启用'}
                  </strong>
                </div>
                <div>
                  <span>本地持久化：</span>
                  <strong>
                    {systemInfo?.knowledgeStorePersistent
                      ? `已开启 (${systemInfo.vectorizedChunkCount ?? 0}/${systemInfo.knowledgeBaseChunkCount} 条已落盘)`
                      : '内存模式'}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

export default App;
