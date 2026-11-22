import crypto from "node:crypto";
import { formatTimeLabel, mutateDb, readDb } from "./store";
import type { AppDatabase, Message, RelayRequest } from "./types";

const RELAY_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const RELAY_CODE_TTL_MS = 30 * 60 * 1000;
export const RELAY_REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

export function hashRelayCode(code: string): string {
  return crypto
    .createHash("sha256")
    .update(code.trim().toUpperCase())
    .digest("hex");
}

function makeRawCode(): string {
  const bytes = crypto.randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += RELAY_CHARSET[bytes[i] % RELAY_CHARSET.length];
  }
  return out;
}

export async function createRelayCode(): Promise<{
  code: string;
  expiresAt: number;
}> {
  const code = makeRawCode();
  const codeHash = hashRelayCode(code);
  const now = Date.now();
  const expiresAt = now + RELAY_CODE_TTL_MS;

  await mutateDb((db) => {
    db.settings.relay = {
      enabled: true,
      activeCodeHash: codeHash,
      codeCreatedAt: now,
      codeExpiresAt: expiresAt,
      codeUsedAt: null,
    };
  });

  return { code, expiresAt };
}

export async function setRelayEnabled(enabled: boolean): Promise<void> {
  await mutateDb((db) => {
    db.settings.relay.enabled = enabled;
    if (!enabled) {
      db.settings.relay.activeCodeHash = null;
      db.settings.relay.codeCreatedAt = null;
      db.settings.relay.codeExpiresAt = null;
      db.settings.relay.codeUsedAt = null;
    }
  });
}

export async function expireTimedOutRelayRequests(now = Date.now()): Promise<boolean> {
  const db = await readDb();
  const hasExpired = db.relayRequests.some(
    (r) => r.status === "pending" && now >= r.timeoutAt
  );
  if (!hasExpired) return false;

  await mutateDb((state) => {
    for (const req of state.relayRequests) {
      if (req.status === "pending" && now >= req.timeoutAt) {
        req.status = "timeout";
        const msg = state.messages.find((m) => m.id === req.messageId);
        if (msg) {
          msg.relayStatus = "timeout";
          msg.text = `${state.settings.ownerName}, permintaan relay ke Muse utama tidak dijawab dalam 10 menit dan ditandai timeout.`;
          msg.sourceLabel = "via Relay — timeout (tidak dijawab dalam 10 menit)";
        }
      }
    }
  });
  return true;
}

export function validateRelayCode(
  db: AppDatabase,
  rawCode: string,
  now = Date.now()
): { valid: true } | { valid: false; reason: string; status: number } {
  const relay = db.settings.relay;
  if (!relay.enabled) {
    return { valid: false, reason: "Mode Relay sedang nonaktif.", status: 403 };
  }
  if (!relay.activeCodeHash) {
    return { valid: false, reason: "Belum ada kode relay aktif.", status: 401 };
  }
  if (!relay.codeExpiresAt || now > relay.codeExpiresAt) {
    return {
      valid: false,
      reason: "Kode relay sudah kedaluwarsa (melebihi 30 menit).",
      status: 401,
    };
  }

  const candidate = hashRelayCode(rawCode);
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(relay.activeCodeHash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: "Kode relay tidak valid.", status: 401 };
  }

  return { valid: true };
}

export async function createPendingRelayTurn(params: {
  kind: "chat" | "pipeline_final" | "progress";
  prompt: string;
  contextSummary: string;
  pipelineRunId?: string | null;
  pipelineStage?: number | null;
}): Promise<{ message: Message; relayRequest: RelayRequest }> {
  const now = Date.now();
  return mutateDb((db) => {
    const museSeat = db.seats.find((s) => s.id === "MUSE")!;
    const messageId = `msg-${now}-${crypto.randomBytes(3).toString("hex")}`;
    const requestId = `relay-${now}-${crypto.randomBytes(3).toString("hex")}`;

    const message: Message = {
      id: messageId,
      senderType: "seat",
      senderId: "MUSE",
      senderName: museSeat.displayName,
      senderRole: museSeat.role,
      senderAvatar: museSeat.avatar,
      text: "Menunggu Muse utama menjawab lewat relay…",
      imageUrl: null,
      sourceLabel: "via Relay — menunggu Muse utama (agen di chat utama)",
      providerError: null,
      relayStatus: "pending",
      pipelineRunId: params.pipelineRunId ?? null,
      pipelineStage: params.pipelineStage ?? null,
      createdAt: new Date(now).toISOString(),
      timeLabel: formatTimeLabel(new Date(now)),
    };

    const relayRequest: RelayRequest = {
      id: requestId,
      messageId,
      kind: params.kind,
      prompt: params.prompt,
      contextSummary: params.contextSummary,
      ownerName: db.settings.ownerName,
      pipelineRunId: params.pipelineRunId ?? null,
      status: "pending",
      answer: null,
      error: null,
      createdAt: now,
      timeoutAt: now + RELAY_REQUEST_TIMEOUT_MS,
      answeredAt: null,
    };

    db.messages.push(message);
    db.relayRequests.push(relayRequest);
    return { message, relayRequest };
  });
}

export async function getPendingRelayRequests(
  code: string,
  now = Date.now()
): Promise<
  | { ok: true; requests: RelayRequest[] }
  | { ok: false; reason: string; status: number }
> {
  await expireTimedOutRelayRequests(now);
  const db = await readDb();
  const check = validateRelayCode(db, code, now);
  if (!check.valid) {
    return { ok: false, reason: check.reason, status: check.status };
  }

  const pending = db.relayRequests.filter((r) => r.status === "pending");
  return { ok: true, requests: pending };
}

export async function submitRelayAnswer(params: {
  code: string;
  requestId?: string;
  answer?: string;
  error?: string;
  now?: number;
}): Promise<
  | { ok: true; request: RelayRequest; message: Message }
  | { ok: false; reason: string; status: number }
> {
  const now = params.now ?? Date.now();
  await expireTimedOutRelayRequests(now);

  return mutateDb((db) => {
    const check = validateRelayCode(db, params.code, now);
    if (!check.valid) {
      return { ok: false as const, reason: check.reason, status: check.status };
    }

    const pending = params.requestId
      ? db.relayRequests.find((r) => r.id === params.requestId)
      : db.relayRequests.find((r) => r.status === "pending");

    if (!pending) {
      return {
        ok: false as const,
        reason: "Permintaan relay tidak ditemukan.",
        status: 404,
      };
    }

    if (pending.status !== "pending") {
      return {
        ok: false as const,
        reason: `Permintaan relay sudah berstatus "${pending.status}".`,
        status: 409,
      };
    }

    const answerText = params.answer?.trim();
    const errorText = params.error?.trim();
    if (!answerText && !errorText) {
      return {
        ok: false as const,
        reason: "Isi jawaban atau error harus disediakan.",
        status: 400,
      };
    }

    pending.answeredAt = now;
    const msg = db.messages.find((m) => m.id === pending.messageId);

    if (errorText) {
      pending.status = "error";
      pending.error = errorText;
      if (msg) {
        msg.relayStatus = "error";
        msg.text = `${db.settings.ownerName}, Muse utama mengembalikan error melalui relay.`;
        msg.providerError = errorText;
        msg.sourceLabel = "via Relay — dijawab Muse utama (agen di chat utama)";
      }
    } else {
      pending.status = "answered";
      pending.answer = answerText!;
      if (msg) {
        msg.relayStatus = "answered";
        msg.text = answerText!;
        msg.providerError = null;
        msg.sourceLabel = "via Relay — dijawab Muse utama (agen di chat utama)";
      }
    }

    if (pending.pipelineRunId) {
      const run = db.pipelineRuns.find((p) => p.id === pending.pipelineRunId);
      if (run) {
        const stage6 = run.stages.find((s) => s.stage === 6);
        if (stage6) {
          stage6.status = errorText ? "failed" : "completed";
          stage6.output = errorText ? null : answerText!;
          stage6.error = errorText ?? null;
          stage6.completedAt = new Date(now).toISOString();
          run.status = run.stages.some((s) => s.status === "failed")
            ? "completed_with_errors"
            : "completed";
          run.updatedAt = new Date(now).toISOString();
        }
      }
    }

    return { ok: true as const, request: pending, message: msg! };
  });
}
