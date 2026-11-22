export type SeatId = "MUSE" | "M10" | "M01" | "M02" | "M03" | "M04" | "M05";

export type ModelSource = "builtin" | "gateway" | "gemini";

export type ReviewLevel = "Longgar" | "Santai" | "Sedang" | "Ketat";

export interface RelaySettings {
  enabled: boolean;
  activeCodeHash: string | null;
  codeCreatedAt: number | null;
  codeExpiresAt: number | null;
  codeUsedAt: number | null;
}

export interface Settings {
  ownerName: string;
  ownerAvatar: string;
  groupAvatar: string;
  diskusiBergilir: boolean;
  reviewLevel: ReviewLevel;
  gatewayBaseUrl: string;
  gatewayApiKey: string;
  geminiApiKey: string;
  lastGatewayModels: string[];
  lastGeminiModels: string[];
  relay: RelaySettings;
}

export interface PublicRelaySettings {
  enabled: boolean;
  hasActiveCode: boolean;
  codeExpiresAt: number | null;
  codeUsed: boolean;
}

export type StorageMode = "local" | "ephemeral" | "redis";

export interface PublicSettings {
  ownerName: string;
  ownerAvatar: string;
  groupAvatar: string;
  diskusiBergilir: boolean;
  reviewLevel: ReviewLevel;
  gatewayBaseUrl: string;
  gatewayApiKeyMasked: string;
  hasGatewayApiKey: boolean;
  geminiApiKeyMasked: string;
  hasGeminiApiKey: boolean;
  lastGatewayModels: string[];
  lastGeminiModels: string[];
  relay: PublicRelaySettings;
  storageMode: StorageMode;
}

export interface Seat {
  id: SeatId;
  code: string;
  displayName: string;
  role: string;
  description: string;
  avatar: string;
  source: ModelSource;
  gatewayModel: string;
  geminiModel: string;
  accentHex: string;
}

export type RelayMessageStatus = "pending" | "answered" | "timeout" | "error";

export interface Message {
  id: string;
  senderType: "owner" | "seat";
  senderId: "OWNER" | SeatId;
  senderName: string;
  senderRole: string;
  senderAvatar: string;
  text: string;
  imageUrl: string | null;
  sourceLabel: string | null;
  providerError: string | null;
  relayStatus: RelayMessageStatus | null;
  pipelineRunId: string | null;
  pipelineStage: number | null;
  createdAt: string;
  timeLabel: string;
}

export interface PipelineStage {
  stage: 1 | 2 | 3 | 4 | 5 | 6;
  seatId: SeatId;
  seatName: string;
  role: string;
  label: string;
  status: "pending" | "running" | "completed" | "failed";
  output: string | null;
  imageUrl: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface PipelineRun {
  id: string;
  triggerMessageId: string;
  prompt: string;
  reviewLevel: ReviewLevel;
  status: "running" | "completed" | "completed_with_errors";
  stages: PipelineStage[];
  createdAt: string;
  updatedAt: string;
}

export interface RelayRequest {
  id: string;
  messageId: string;
  kind: "chat" | "pipeline_final" | "progress";
  prompt: string;
  contextSummary: string;
  ownerName: string;
  pipelineRunId: string | null;
  status: RelayMessageStatus;
  answer: string | null;
  error: string | null;
  createdAt: number;
  timeoutAt: number;
  answeredAt: number | null;
}

export interface ActiveTypingState {
  activeSeatId: SeatId | null;
  queuedSeatIds: SeatId[];
  mode: "chat" | "pipeline" | "mention" | "image" | "progress" | null;
  updatedAt: number;
}

export interface AppDatabase {
  settings: Settings;
  seats: Seat[];
  messages: Message[];
  pipelineRuns: PipelineRun[];
  relayRequests: RelayRequest[];
  typing: ActiveTypingState;
}
