import crypto from "node:crypto";
import { buildSeatSystemPrompt } from "./personas";
import { callGeminiChat } from "./providers/gemini";
import { callGatewayChat, type ChatTurnMessage } from "./providers/gateway";
import { generateVisualImage } from "./providers/image";
import {
  formatPipelineIntegrationSummary,
  formatPipelineProgressReport,
} from "./providers/muse";
import { createPendingRelayTurn, expireTimedOutRelayRequests } from "./relay";
import {
  appendMessage,
  formatTimeLabel,
  mutateDb,
  readDb,
  setTypingState,
  upsertPipelineRun,
} from "./store";
import type {
  AppDatabase,
  Message,
  PipelineRun,
  PipelineStage,
  Seat,
  SeatId,
  Settings,
} from "./types";

const ROUND_ROBIN_ORDER: SeatId[] = ["M10", "M01", "M02", "M03", "M04", "M05", "MUSE"];

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
}

export function isSeatConfigured(seat: Seat, settings: Settings): boolean {
  if (seat.id === "MUSE" && settings.relay.enabled) {
    return true;
  }
  if (seat.source === "gemini") {
    return Boolean(settings.geminiApiKey.trim() && seat.geminiModel.trim());
  }
  if (seat.source === "gateway") {
    return Boolean(
      settings.gatewayBaseUrl.trim() &&
        settings.gatewayApiKey.trim() &&
        seat.gatewayModel.trim()
    );
  }
  return false;
}

export function buildContextMessages(
  messages: Message[],
  limit = 40
): ChatTurnMessage[] {
  const recent = messages.slice(-limit);
  return recent.map((m) => ({
    role: m.senderType === "owner" ? "user" : "assistant",
    content: `[${m.senderName} · ${m.senderRole}]: ${m.text}${
      m.providerError ? `\n[Error: ${m.providerError}]` : ""
    }`,
  }));
}

export function buildContextSummary(messages: Message[], ownerName: string): string {
  return messages
    .slice(-40)
    .map((m) => {
      const label =
        m.senderType === "owner" ? `${ownerName} (Pemilik)` : `${m.senderName} (${m.senderRole})`;
      return `${label}: ${m.text}`;
    })
    .join("\n");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findMentionedSeats(text: string, seats: Seat[]): Seat[] {
  const matched: Seat[] = [];
  for (const seat of seats) {
    const tokens = [seat.displayName, seat.id];
    if (seat.code && seat.code !== "—") {
      tokens.push(seat.code);
    }

    const hit = tokens.some((tok) => {
      const clean = tok.trim();
      if (!clean) return false;
      const rx = new RegExp(`(^|\\s)@${escapeRegex(clean)}(?=\\s|$|[.,!?:;])`, "i");
      return rx.test(text);
    });

    if (hit) {
      matched.push(seat);
    }
  }
  return matched;
}

async function generateSeatAiMessage(params: {
  seat: Seat;
  db: AppDatabase;
  isMentioned?: boolean;
  pipelineContext?: string;
  pipelineRunId?: string | null;
  pipelineStage?: number | null;
}): Promise<Message> {
  const { seat, db, isMentioned, pipelineContext, pipelineRunId, pipelineStage } = params;
  const { settings, seats, messages } = db;
  const now = new Date();
  const contextMessages = buildContextMessages(messages, 40);

  if (pipelineContext) {
    contextMessages.push({
      role: "user",
      content: pipelineContext,
    });
  }

  const systemPrompt = buildSeatSystemPrompt({
    seat,
    ownerName: settings.ownerName,
    reviewLevel: settings.reviewLevel,
    allSeats: seats,
    isMentioned,
  });

  let text = "";
  let sourceLabel = "";
  let providerError: string | null = null;

  if (seat.source === "gemini") {
    const hasKey = Boolean(settings.geminiApiKey.trim());
    const model = seat.geminiModel.trim();

    if (hasKey && model) {
      sourceLabel = `via Gemini (login Google) · ${model}`;
      try {
        text = await callGeminiChat({
          apiKey: settings.geminiApiKey,
          model,
          systemPrompt,
          messages: contextMessages,
        });
      } catch (err) {
        providerError = err instanceof Error ? err.message : String(err);
        text = `${settings.ownerName}, panggilan ke Gemini (${model}) gagal.`;
      }
    } else {
      const reason = !hasKey
        ? "API key Gemini belum diisi"
        : `model Gemini untuk kursi ${seat.displayName} belum dipilih`;
      sourceLabel = "Belum terhubung ke model AI";
      providerError = `${reason}. Buka Pengaturan untuk menghubungkan API key dan memilih model.`;
      text = `${settings.ownerName}, kursi ${seat.displayName} (${seat.role}) belum tersambung ke model AI.`;
    }
  } else if (seat.source === "gateway") {
    const hasGateway = Boolean(
      settings.gatewayBaseUrl.trim() && settings.gatewayApiKey.trim()
    );
    const model = seat.gatewayModel.trim();

    if (hasGateway && model) {
      sourceLabel = `via Link API (gateway) · ${model}`;
      try {
        text = await callGatewayChat({
          baseUrl: settings.gatewayBaseUrl,
          apiKey: settings.gatewayApiKey,
          model,
          systemPrompt,
          messages: contextMessages,
        });
      } catch (err) {
        providerError = err instanceof Error ? err.message : String(err);
        text = `${settings.ownerName}, panggilan ke Link API (${model}) gagal.`;
      }
    } else {
      const reason = !hasGateway
        ? "Link API gateway belum diisi"
        : `model gateway untuk kursi ${seat.displayName} belum dipilih`;
      sourceLabel = "Belum terhubung ke model AI";
      providerError = `${reason}. Buka Pengaturan untuk menghubungkan API key dan memilih model.`;
      text = `${settings.ownerName}, kursi ${seat.displayName} (${seat.role}) belum tersambung ke model AI.`;
    }
  } else {
    sourceLabel = "Belum terhubung ke model AI";
    providerError = `Kursi ${seat.displayName} belum dihubungkan ke Gemini, Link API Gateway, atau Relay. Atur di Pengaturan.`;
    text = `${settings.ownerName}, kursi ${seat.displayName} (${seat.role}) belum tersambung ke model AI.`;
  }

  return {
    id: makeId("msg"),
    senderType: "seat",
    senderId: seat.id,
    senderName: seat.displayName,
    senderRole: seat.role,
    senderAvatar: seat.avatar,
    text,
    imageUrl: null,
    sourceLabel,
    providerError,
    relayStatus: null,
    pipelineRunId: pipelineRunId ?? null,
    pipelineStage: pipelineStage ?? null,
    createdAt: now.toISOString(),
    timeLabel: formatTimeLabel(now),
  };
}

async function postMuseSetupNotice(db: AppDatabase): Promise<Message> {
  const museSeat = db.seats.find((s) => s.id === "MUSE")!;
  const now = new Date();
  const msg: Message = {
    id: makeId("msg"),
    senderType: "seat",
    senderId: "MUSE",
    senderName: museSeat.displayName,
    senderRole: museSeat.role,
    senderAvatar: museSeat.avatar,
    text: [
      `${db.settings.ownerName}, belum ada kursi AI yang tersambung ke model asli.`,
      "",
      "Meja Bundar tidak memakai balasan template/palsu. Buka Pengaturan (ikon roda gigi di kanan atas) untuk:",
      "1. Memasukkan API key Gemini (Google AI Studio) atau Base URL + API key Gateway.",
      "2. Mengambil daftar model dan memilih model untuk kursi yang ingin diajak berdiskusi.",
    ].join("\n"),
    imageUrl: null,
    sourceLabel: "Sistem Meja Bundar · Menunggu konfigurasi model AI",
    providerError:
      "Belum ada API key dan model aktif. Atur di Pengaturan → Daftar Kursi & Sumber Model.",
    relayStatus: null,
    pipelineRunId: null,
    pipelineStage: null,
    createdAt: now.toISOString(),
    timeLabel: formatTimeLabel(now),
  };
  await appendMessage(msg);
  return msg;
}

async function postMuseReply(params: {
  mode: "chat" | "pipeline_final" | "progress" | "mention";
  userPrompt: string;
  pipelineRunId?: string | null;
  pipelineStage?: number | null;
  pipelineResults?: Array<{
    stage: number;
    seatName: string;
    role: string;
    status: "completed" | "failed";
    output: string | null;
    error: string | null;
  }>;
}): Promise<Message> {
  const db = await readDb();
  const museSeat = db.seats.find((s) => s.id === "MUSE")!;

  if (db.settings.relay.enabled) {
    const { message } = await createPendingRelayTurn({
      kind:
        params.mode === "pipeline_final"
          ? "pipeline_final"
          : params.mode === "progress"
            ? "progress"
            : "chat",
      prompt: params.userPrompt,
      contextSummary: buildContextSummary(db.messages, db.settings.ownerName),
      pipelineRunId: params.pipelineRunId ?? null,
      pipelineStage: params.pipelineStage ?? null,
    });
    return message;
  }

  if (params.mode === "progress") {
    const latestRun = db.pipelineRuns[db.pipelineRuns.length - 1];
    const now = new Date();
    const msg: Message = {
      id: makeId("msg"),
      senderType: "seat",
      senderId: "MUSE",
      senderName: museSeat.displayName,
      senderRole: museSeat.role,
      senderAvatar: museSeat.avatar,
      text: formatPipelineProgressReport(db.settings.ownerName, latestRun),
      imageUrl: null,
      sourceLabel: "Muse bawaan · status pipeline aktual",
      providerError: null,
      relayStatus: null,
      pipelineRunId: params.pipelineRunId ?? null,
      pipelineStage: params.pipelineStage ?? null,
      createdAt: now.toISOString(),
      timeLabel: formatTimeLabel(now),
    };
    await appendMessage(msg);
    return msg;
  }

  if (params.mode === "pipeline_final" && params.pipelineResults) {
    if (museSeat.source === "gemini" || museSeat.source === "gateway") {
      const hasModel = isSeatConfigured(museSeat, db.settings);
      if (hasModel) {
        const integrationContext = [
          `Susun penutup pipeline dengan awalan tepat "Hasil Akhir - Integrasi" untuk tugas: "${params.userPrompt}".`,
          "Berikut hasil nyata tiap tahap (JANGAN mengarang hasil tahap yang gagal; laporkan errornya apa adanya):",
          ...params.pipelineResults.map((r) =>
            r.status === "failed"
              ? `- Tahap ${r.stage} (${r.seatName} · ${r.role}): GAGAL — ${r.error ?? "error tidak diketahui"}`
              : `- Tahap ${r.stage} (${r.seatName} · ${r.role}): ${r.output ?? "Selesai"}`
          ),
        ].join("\n");

        const aiMsg = await generateSeatAiMessage({
          seat: museSeat,
          db,
          pipelineContext: integrationContext,
          pipelineRunId: params.pipelineRunId,
          pipelineStage: params.pipelineStage,
        });

        if (!aiMsg.providerError) {
          if (!aiMsg.text.includes("Hasil Akhir - Integrasi")) {
            aiMsg.text = `Hasil Akhir - Integrasi\n\n${aiMsg.text}`;
          }
          await appendMessage(aiMsg);
          return aiMsg;
        }
      }
    }

    const now = new Date();
    const msg: Message = {
      id: makeId("msg"),
      senderType: "seat",
      senderId: "MUSE",
      senderName: museSeat.displayName,
      senderRole: museSeat.role,
      senderAvatar: museSeat.avatar,
      text: formatPipelineIntegrationSummary({
        ownerName: db.settings.ownerName,
        userPrompt: params.userPrompt,
        pipelineResults: params.pipelineResults,
      }),
      imageUrl: null,
      sourceLabel: "Muse bawaan · rekap hasil pipeline aktual",
      providerError: null,
      relayStatus: null,
      pipelineRunId: params.pipelineRunId ?? null,
      pipelineStage: params.pipelineStage ?? null,
      createdAt: now.toISOString(),
      timeLabel: formatTimeLabel(now),
    };
    await appendMessage(msg);
    return msg;
  }

  // Normal chat or @mention for Muse: only real AI model (Gemini/Gateway) or honest setup error
  const msg = await generateSeatAiMessage({
    seat: museSeat,
    db,
    isMentioned: params.mode === "mention",
    pipelineRunId: params.pipelineRunId,
    pipelineStage: params.pipelineStage,
  });
  await appendMessage(msg);
  return msg;
}

export async function runPipelineById(runId: string): Promise<void> {
  const initialDb = await readDb();
  const run = initialDb.pipelineRuns.find((r) => r.id === runId);
  if (!run) return;

  const priorOutputs: Array<{
    stage: number;
    seatName: string;
    role: string;
    status: "completed" | "failed";
    output: string | null;
    error: string | null;
  }> = [];

  try {
    const stageOrder: SeatId[] = ["M10", "M01", "M04", "M03", "M02", "MUSE"];

    for (let idx = 0; idx < run.stages.length; idx++) {
      const stage = run.stages[idx];
      const remainingQueue = stageOrder.slice(idx + 1);
      await setTypingState({
        activeSeatId: stage.seatId,
        queuedSeatIds: remainingQueue,
        mode: "pipeline",
      });

      stage.status = "running";
      stage.startedAt = new Date().toISOString();
      run.updatedAt = new Date().toISOString();
      await upsertPipelineRun(run);

      const currentDb = await readDb();
      const seat = currentDb.seats.find((s) => s.id === stage.seatId)!;

      const contextBlock =
        priorOutputs.length > 0
          ? [
              `Instruksi Tugas dari ${currentDb.settings.ownerName}: ${run.prompt}`,
              "Hasil tahap sebelumnya:",
              ...priorOutputs.map((p) =>
                p.status === "failed"
                  ? `- Tahap ${p.stage} (${p.seatName} · ${p.role}): GAGAL (${p.error})`
                  : `- Tahap ${p.stage} (${p.seatName} · ${p.role}): ${p.output}`
              ),
            ].join("\n")
          : `Instruksi Tugas dari ${currentDb.settings.ownerName}: ${run.prompt}`;

      if (stage.stage === 4) {
        const imgOutcome = await generateVisualImage({
          prompt: `${run.prompt}${
            priorOutputs.length > 0 ? ` — konteks: ${priorOutputs[0]?.output ?? ""}` : ""
          }`,
          seat,
          settings: currentDb.settings,
        });

        const now = new Date();
        const msg: Message = {
          id: makeId("msg"),
          senderType: "seat",
          senderId: seat.id,
          senderName: seat.displayName,
          senderRole: seat.role,
          senderAvatar: seat.avatar,
          text: imgOutcome.text,
          imageUrl: imgOutcome.imageUrl,
          sourceLabel: imgOutcome.sourceLabel,
          providerError: imgOutcome.providerError,
          relayStatus: null,
          pipelineRunId: run.id,
          pipelineStage: 4,
          createdAt: now.toISOString(),
          timeLabel: formatTimeLabel(now),
        };
        await appendMessage(msg);

        if (imgOutcome.providerError) {
          stage.status = "failed";
          stage.error = imgOutcome.providerError;
          priorOutputs.push({
            stage: 4,
            seatName: seat.displayName,
            role: seat.role,
            status: "failed",
            output: null,
            error: imgOutcome.providerError,
          });
        } else {
          stage.status = "completed";
          stage.output = imgOutcome.text;
          stage.imageUrl = imgOutcome.imageUrl;
          priorOutputs.push({
            stage: 4,
            seatName: seat.displayName,
            role: seat.role,
            status: "completed",
            output: `${imgOutcome.text} [Gambar terlampir: ${imgOutcome.imageUrl}]`,
            error: null,
          });
        }
        stage.completedAt = new Date().toISOString();
        run.updatedAt = new Date().toISOString();
        await upsertPipelineRun(run);
        continue;
      }

      if (stage.stage === 6) {
        const finalMsg = await postMuseReply({
          mode: "pipeline_final",
          userPrompt: run.prompt,
          pipelineRunId: run.id,
          pipelineStage: 6,
          pipelineResults: priorOutputs,
        });

        if (finalMsg.relayStatus === "pending") {
          stage.status = "running";
          stage.output = finalMsg.text;
        } else {
          stage.status = "completed";
          stage.output = finalMsg.text;
          stage.completedAt = new Date().toISOString();
        }
        run.status = run.stages.some((s) => s.status === "failed")
          ? "completed_with_errors"
          : finalMsg.relayStatus === "pending"
            ? "running"
            : "completed";
        run.updatedAt = new Date().toISOString();
        await upsertPipelineRun(run);
        continue;
      }

      const msg = await generateSeatAiMessage({
        seat,
        db: currentDb,
        pipelineContext: contextBlock,
        pipelineRunId: run.id,
        pipelineStage: stage.stage,
      });
      await appendMessage(msg);

      if (msg.providerError) {
        stage.status = "failed";
        stage.error = msg.providerError;
        priorOutputs.push({
          stage: stage.stage,
          seatName: seat.displayName,
          role: seat.role,
          status: "failed",
          output: null,
          error: msg.providerError,
        });
      } else {
        stage.status = "completed";
        stage.output = msg.text;
        priorOutputs.push({
          stage: stage.stage,
          seatName: seat.displayName,
          role: seat.role,
          status: "completed",
          output: msg.text,
          error: null,
        });
      }

      stage.completedAt = new Date().toISOString();
      run.updatedAt = new Date().toISOString();
      await upsertPipelineRun(run);
    }
  } finally {
    await setTypingState({
      activeSeatId: null,
      queuedSeatIds: [],
      mode: null,
    });
  }
}

async function runSeatSequence(params: {
  seatIds: SeatId[];
  userPrompt: string;
  isMentioned?: boolean;
  mode: "chat" | "mention";
}): Promise<void> {
  try {
    if (params.mode === "chat" && params.seatIds.length === 0) {
      const db = await readDb();
      await postMuseSetupNotice(db);
      return;
    }

    for (let i = 0; i < params.seatIds.length; i++) {
      const seatId = params.seatIds[i];
      await setTypingState({
        activeSeatId: seatId,
        queuedSeatIds: params.seatIds.slice(i + 1),
        mode: params.mode,
      });

      if (seatId === "MUSE") {
        await postMuseReply({
          mode: params.isMentioned ? "mention" : "chat",
          userPrompt: params.userPrompt,
        });
      } else {
        const db = await readDb();
        const seat = db.seats.find((s) => s.id === seatId)!;
        const msg = await generateSeatAiMessage({
          seat,
          db,
          isMentioned: params.isMentioned,
        });
        await appendMessage(msg);
      }
    }
  } finally {
    await setTypingState({
      activeSeatId: null,
      queuedSeatIds: [],
      mode: null,
    });
  }
}

async function runVisualImageTurn(prompt: string): Promise<void> {
  try {
    await setTypingState({
      activeSeatId: "M03",
      queuedSeatIds: [],
      mode: "image",
    });
    const db = await readDb();
    const visualSeat = db.seats.find((s) => s.id === "M03")!;
    const outcome = await generateVisualImage({
      prompt,
      seat: visualSeat,
      settings: db.settings,
    });
    const now = new Date();
    await appendMessage({
      id: makeId("msg"),
      senderType: "seat",
      senderId: visualSeat.id,
      senderName: visualSeat.displayName,
      senderRole: visualSeat.role,
      senderAvatar: visualSeat.avatar,
      text: outcome.text,
      imageUrl: outcome.imageUrl,
      sourceLabel: outcome.sourceLabel,
      providerError: outcome.providerError,
      relayStatus: null,
      pipelineRunId: null,
      pipelineStage: null,
      createdAt: now.toISOString(),
      timeLabel: formatTimeLabel(now),
    });
  } finally {
    await setTypingState({
      activeSeatId: null,
      queuedSeatIds: [],
      mode: null,
    });
  }
}

export async function handleUserMessage(
  rawText: string,
  options: { awaitCompletion?: boolean } = {}
): Promise<{
  ownerMessage: Message;
  mode: "pipeline" | "image" | "mention" | "chat";
  pipelineRunId?: string;
}> {
  await expireTimedOutRelayRequests();
  const text = rawText.trim();
  if (!text) {
    throw new Error("Pesan tidak boleh kosong.");
  }

  const db = await readDb();
  const now = new Date();

  const ownerMessage: Message = {
    id: makeId("msg"),
    senderType: "owner",
    senderId: "OWNER",
    senderName: db.settings.ownerName,
    senderRole: "Pemilik",
    senderAvatar: db.settings.ownerAvatar,
    text,
    imageUrl: null,
    sourceLabel: null,
    providerError: null,
    relayStatus: null,
    pipelineRunId: null,
    pipelineStage: null,
    createdAt: now.toISOString(),
    timeLabel: formatTimeLabel(now),
  };

  await appendMessage(ownerMessage);

  // 1. Pipeline Tugas:
  if (/^Tugas:\s*/i.test(text)) {
    const taskPrompt = text.replace(/^Tugas:\s*/i, "").trim() || text;
    const seatById = new Map(db.seats.map((s) => [s.id, s]));
    const stageDefs: Array<{ stage: 1 | 2 | 3 | 4 | 5 | 6; seatId: SeatId; label: string }> = [
      { stage: 1, seatId: "M10", label: "Menyusun rencana" },
      { stage: 2, seatId: "M01", label: "Mengeksekusi rencana" },
      { stage: 3, seatId: "M04", label: "Memberi masukan" },
      { stage: 4, seatId: "M03", label: "Membuat gambar" },
      { stage: 5, seatId: "M02", label: `Mereview (${db.settings.reviewLevel})` },
      { stage: 6, seatId: "MUSE", label: "Hasil Akhir - Integrasi" },
    ];

    const stages: PipelineStage[] = stageDefs.map((def) => {
      const seat = seatById.get(def.seatId)!;
      return {
        stage: def.stage,
        seatId: def.seatId,
        seatName: seat.displayName,
        role: seat.role,
        label: def.label,
        status: "pending",
        output: null,
        imageUrl: null,
        error: null,
        startedAt: null,
        completedAt: null,
      };
    });

    const run: PipelineRun = {
      id: makeId("run"),
      triggerMessageId: ownerMessage.id,
      prompt: taskPrompt,
      reviewLevel: db.settings.reviewLevel,
      status: "running",
      stages,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    await upsertPipelineRun(run);
    const work = runPipelineById(run.id);
    if (options.awaitCompletion) {
      await work;
    } else {
      void work;
    }

    return { ownerMessage, mode: "pipeline", pipelineRunId: run.id };
  }

  // 2. Gambar:
  if (/^Gambar:\s*/i.test(text)) {
    const work = runVisualImageTurn(text);
    if (options.awaitCompletion) {
      await work;
    } else {
      void work;
    }
    return { ownerMessage, mode: "image" };
  }

  // 3. @mention
  const mentioned = findMentionedSeats(text, db.seats);
  if (mentioned.length > 0) {
    const work = runSeatSequence({
      seatIds: mentioned.map((s) => s.id),
      userPrompt: text,
      isMentioned: true,
      mode: "mention",
    });
    if (options.awaitCompletion) {
      await work;
    } else {
      void work;
    }
    return { ownerMessage, mode: "mention" };
  }

  // 4. Normal chat (Diskusi Bergilir vs Muse only)
  const seatById = new Map(db.seats.map((s) => [s.id, s]));
  const seatIds: SeatId[] = db.settings.diskusiBergilir
    ? ROUND_ROBIN_ORDER.filter((id) => {
        const s = seatById.get(id);
        return s ? isSeatConfigured(s, db.settings) : false;
      })
    : ["MUSE"];

  const work = runSeatSequence({
    seatIds,
    userPrompt: text,
    isMentioned: false,
    mode: "chat",
  });

  if (options.awaitCompletion) {
    await work;
  } else {
    void work;
  }

  return { ownerMessage, mode: "chat" };
}

export async function handleProgressQuery(): Promise<Message> {
  await expireTimedOutRelayRequests();
  const db = await readDb();
  const now = new Date();

  const ownerMessage: Message = {
    id: makeId("msg"),
    senderType: "owner",
    senderId: "OWNER",
    senderName: db.settings.ownerName,
    senderRole: "Pemilik",
    senderAvatar: db.settings.ownerAvatar,
    text: "Tanya Progres tugas terakhir",
    imageUrl: null,
    sourceLabel: null,
    providerError: null,
    relayStatus: null,
    pipelineRunId: null,
    pipelineStage: null,
    createdAt: now.toISOString(),
    timeLabel: formatTimeLabel(now),
  };

  await appendMessage(ownerMessage);

  return postMuseReply({
    mode: "progress",
    userPrompt: "Tanya Progres tugas terakhir",
  });
}

export async function clearChatMessages(): Promise<void> {
  await mutateDb((db) => {
    db.messages = [];
    db.pipelineRuns = [];
    db.relayRequests = [];
    db.typing = {
      activeSeatId: null,
      queuedSeatIds: [],
      mode: null,
      updatedAt: Date.now(),
    };
  });
}

