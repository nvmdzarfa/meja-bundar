import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir = "";

import {
  buildContextMessages,
  clearChatMessages,
  handleProgressQuery,
  handleUserMessage,
} from "@/lib/chat-engine";
import {
  createRelayCode,
  expireTimedOutRelayRequests,
  getPendingRelayRequests,
  RELAY_CODE_TTL_MS,
  RELAY_REQUEST_TIMEOUT_MS,
  setRelayEnabled,
  submitRelayAnswer,
} from "@/lib/relay";
import {
  getStorageMode,
  mutateDb,
  readDb,
  resolveDefaultOwnerName,
  toPublicSettings,
} from "@/lib/store";
import type { Message } from "@/lib/types";

// Valid 1x1 PNG base64 for mocked image generation response
const SAMPLE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0WQAAAAASUVORK5CYII=";

describe("Meja Bundar chat engine, security, and relay", () => {
  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meja-bundar-test-"));
    process.env.MEJA_BUNDAR_DATA_DIR = tempDir;
    delete process.env.MEJA_BUNDAR_OWNER_NAME;
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    const dbPath = path.join(tempDir, "meja-bundar.json");
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults ownerName to 'Pemilik' without reading OS username", async () => {
    expect(resolveDefaultOwnerName()).toBe("Pemilik");
    const db = await readDb();
    expect(db.settings.ownerName).toBe("Pemilik");
  });

  it("masks API keys in public settings and never returns plaintext keys", async () => {
    await mutateDb((db) => {
      db.settings.gatewayBaseUrl = "https://gw.example.com";
      db.settings.gatewayApiKey = "sk-secret-gateway-key-9876";
      db.settings.geminiApiKey = "AIzaSySecretGeminiKey1234";
    });

    const db = await readDb();
    const pub = toPublicSettings(db.settings);
    const serialized = JSON.stringify(pub);

    expect(serialized).not.toContain("sk-secret-gateway-key-9876");
    expect(serialized).not.toContain("AIzaSySecretGeminiKey1234");
    expect(pub.hasGatewayApiKey).toBe(true);
    expect(pub.hasGeminiApiKey).toBe(true);
    expect(pub.gatewayApiKeyMasked).toContain("sk-s");
    expect(pub.gatewayApiKeyMasked).toContain("9876");
  });

  it("never generates fake template replies when no AI model is configured", async () => {
    await handleUserMessage("test", { awaitCompletion: true });
    const db = await readDb();
    // 1 owner message + 1 clear setup notice from Muse (no 7 fake persona templates)
    expect(db.messages).toHaveLength(2);
    expect(db.messages[1].senderId).toBe("MUSE");
    expect(db.messages[1].providerError).toContain("Pengaturan");
    expect(db.messages[1].text).not.toContain("kerangka rencana");

    await clearChatMessages();
    await handleUserMessage("@Opus halo", { awaitCompletion: true });
    const db2 = await readDb();
    expect(db2.messages).toHaveLength(2);
    expect(db2.messages[1].senderId).toBe("M10");
    expect(db2.messages[1].providerError).toContain("Pengaturan");
    expect(db2.messages[1].sourceLabel).toBe("Belum terhubung ke model AI");
  });

  it("runs only configured seats with real AI calls in Diskusi Bergilir ON vs Muse-only OFF", async () => {
    await mutateDb((db) => {
      db.settings.ownerName = "Ketua Uji";
      db.settings.geminiApiKey = "AIzaTestKey1234";
      for (const s of db.seats) {
        s.source = "gemini";
        s.geminiModel = "gemini-3.8-flash";
      }
    });

    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: "Respons AI asli untuk Ketua Uji." }] } },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await handleUserMessage("Halo meja bundar", { awaitCompletion: true });
    let db = await readDb();
    // 1 owner + 7 real AI seat responses = 8
    expect(db.messages).toHaveLength(8);
    expect(db.messages[1].sourceLabel).toBe("via Gemini (login Google) · gemini-3.8-flash");
    expect(db.messages[7].senderId).toBe("MUSE");
    expect(db.messages[7].sourceLabel).toBe("via Gemini (login Google) · gemini-3.8-flash");

    await clearChatMessages();
    await mutateDb((state) => {
      state.settings.diskusiBergilir = false;
    });

    await handleUserMessage("Pesan tunggal", { awaitCompletion: true });
    db = await readDb();
    // 1 owner + 1 Muse = 2
    expect(db.messages).toHaveLength(2);
    expect(db.messages[1].senderId).toBe("MUSE");
    expect(db.messages[1].text).toContain("Respons AI asli");
  });

  it("handles @mention to single configured seat using ownerName", async () => {
    await mutateDb((db) => {
      db.settings.ownerName = "Ketua Uji";
      db.settings.geminiApiKey = "AIzaTestKey1234";
      const m10 = db.seats.find((s) => s.id === "M10")!;
      m10.source = "gemini";
      m10.geminiModel = "gemini-3.8-flash";
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: "Halo Ketua Uji, ini jadwal rilisnya." }] } },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    await handleUserMessage("@Opus tolong susun jadwal rilis", {
      awaitCompletion: true,
    });
    const db = await readDb();
    expect(db.messages).toHaveLength(2);
    expect(db.messages[1].senderId).toBe("M10");
    expect(db.messages[1].text).toContain("Ketua Uji");
    expect(db.messages[1].providerError).toBeNull();
  });

  it("caps model context at 40 messages", () => {
    const dummy: Message[] = Array.from({ length: 55 }, (_, i) => ({
      id: `m-${i}`,
      senderType: i % 2 === 0 ? "owner" : "seat",
      senderId: i % 2 === 0 ? "OWNER" : "M10",
      senderName: i % 2 === 0 ? "Pemilik" : "Opus",
      senderRole: i % 2 === 0 ? "Pemilik" : "Perencana",
      senderAvatar: "/avatars/owner.svg",
      text: `Pesan ke-${i}`,
      imageUrl: null,
      sourceLabel: null,
      providerError: null,
      relayStatus: null,
      pipelineRunId: null,
      pipelineStage: null,
      createdAt: new Date().toISOString(),
      timeLabel: "02:55",
    }));

    const ctx = buildContextMessages(dummy, 40);
    expect(ctx).toHaveLength(40);
    expect(ctx[0].content).toContain("Pesan ke-15");
    expect(ctx[39].content).toContain("Pesan ke-54");
  });

  it("runs 6-stage Tugas: pipeline, reports real provider errors without silent fallback, and answers Tanya Progres", async () => {
    await mutateDb((db) => {
      db.settings.ownerName = "Ketua Uji";
      db.settings.gatewayBaseUrl = "https://gw.example.com";
      db.settings.gatewayApiKey = "sk-test-1234";
      db.settings.geminiApiKey = "AIzaTest1234";
      const m10 = db.seats.find((s) => s.id === "M10")!;
      m10.source = "gateway";
      m10.gatewayModel = "gpt-test";

      const m01 = db.seats.find((s) => s.id === "M01")!;
      m01.source = "gemini";
      m01.geminiModel = "gemini-3.8-flash";

      const m03 = db.seats.find((s) => s.id === "M03")!;
      m03.source = "gateway";
      m03.gatewayModel = "img-test";
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("gw.example.com/v1/images/generations")) {
        return new Response(
          JSON.stringify({ data: [{ b64_json: SAMPLE_PNG_BASE64 }] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("gw.example.com")) {
        return new Response("Gateway upstream 503 overload", { status: 503 });
      }
      if (url.includes("generativelanguage.googleapis.com")) {
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "Eksekusi Gemini sukses untuk Ketua Uji." }] } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await handleUserMessage("Tugas: Buat kampanye peluncuran kopi lokal", {
      awaitCompletion: true,
    });

    const db = await readDb();
    const run = db.pipelineRuns[0];
    expect(run).toBeDefined();
    expect(run.stages).toHaveLength(6);

    // Stage 1 (M10 gateway) failed with real error
    expect(run.stages[0].status).toBe("failed");
    expect(run.stages[0].error).toContain("503");

    // Stage 2 (M01 gemini) succeeded despite stage 1 failure
    expect(run.stages[1].status).toBe("completed");
    expect(run.stages[1].output).toContain("Eksekusi Gemini sukses");

    // Stage 4 (Visual gateway) created a real PNG image URL
    expect(run.stages[3].status).toBe("completed");
    expect(run.stages[3].imageUrl).toMatch(/^\/api\/images\/img-.*\.png$/);

    // Stage 6 (Muse) ended with exact label "Hasil Akhir - Integrasi"
    const museMsg = db.messages.find(
      (m) => m.senderId === "MUSE" && m.pipelineStage === 6
    )!;
    expect(museMsg.text).toContain("Hasil Akhir - Integrasi");
    expect(museMsg.sourceLabel).toContain("Muse bawaan");

    // Verify Gemini message has exact required label
    const m01Msg = db.messages.find(
      (m) => m.senderId === "M01" && m.pipelineStage === 2
    )!;
    expect(m01Msg.sourceLabel).toBe("via Gemini (login Google) · gemini-3.8-flash");

    // Verify Tanya Progres reports stage statuses
    const progressMsg = await handleProgressQuery();
    expect(progressMsg.text).toContain("1. Opus (Perencana) — Gagal");
    expect(progressMsg.text).toContain("2. Plamo (Pelaksana) — Selesai");
    expect(progressMsg.text).toContain("6. Muse (Admin dan Integrasi) — Selesai");
  });

  it("returns honest error for Gambar: when unconfigured, and saves PNG when image provider succeeds", async () => {
    await handleUserMessage("Gambar: Poster kedai kopi hangat pagi hari", {
      awaitCompletion: true,
    });
    let db = await readDb();
    let visualMsg = db.messages.find((m) => m.senderId === "M03")!;
    expect(visualMsg.imageUrl).toBeNull();
    expect(visualMsg.providerError).toContain("Pengaturan");

    await clearChatMessages();
    await mutateDb((state) => {
      state.settings.gatewayBaseUrl = "https://gw.example.com";
      state.settings.gatewayApiKey = "sk-test";
      const m03 = state.seats.find((s) => s.id === "M03")!;
      m03.source = "gateway";
      m03.gatewayModel = "img-model";
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ data: [{ b64_json: SAMPLE_PNG_BASE64 }] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    await handleUserMessage("Gambar: Poster kedai kopi hangat pagi hari", {
      awaitCompletion: true,
    });
    db = await readDb();
    visualMsg = db.messages.find((m) => m.senderId === "M03")!;
    expect(visualMsg.imageUrl).toMatch(/^\/api\/images\/img-.*\.png$/);
    const fileName = visualMsg.imageUrl!.split("/").pop()!;
    const diskBytes = fs.readFileSync(path.join(tempDir, "generated", fileName));
    expect(diskBytes.subarray(0, 4).toString("hex")).toBe("89504e47");
  });

  it("enforces Relay mode single-use 8-char code, placeholder, answer, timeout, and disable", async () => {
    const { code } = await createRelayCode();
    expect(code).toMatch(/^[A-Z2-9]{8}$/);

    // Code is NOT exposed in public settings
    let db = await readDb();
    const pub = toPublicSettings(db.settings);
    expect(JSON.stringify(pub)).not.toContain(code);
    expect(pub.relay.enabled).toBe(true);
    expect(pub.relay.hasActiveCode).toBe(true);

    // Muse turn becomes pending placeholder
    await mutateDb((s) => {
      s.settings.diskusiBergilir = false;
    });
    await handleUserMessage("Cek relay ke Muse utama", { awaitCompletion: true });

    db = await readDb();
    const placeholder = db.messages.find((m) => m.senderId === "MUSE")!;
    expect(placeholder.text).toBe("Menunggu Muse utama menjawab lewat relay…");
    expect(placeholder.relayStatus).toBe("pending");

    // Invalid code rejected
    const badPending = await getPendingRelayRequests("WRONGCOD");
    expect(badPending.ok).toBe(false);

    // Valid code fetches pending request
    const pendingRes = await getPendingRelayRequests(code);
    expect(pendingRes.ok).toBe(true);
    if (pendingRes.ok) {
      expect(pendingRes.requests).toHaveLength(1);
    }

    // Answer fills placeholder and consumes code
    const ansRes = await submitRelayAnswer({
      code,
      answer: "Jawaban langsung dari Muse utama di chat utama.",
    });
    expect(ansRes.ok).toBe(true);
    if (ansRes.ok) {
      expect(ansRes.message.text).toBe("Jawaban langsung dari Muse utama di chat utama.");
      expect(ansRes.message.sourceLabel).toBe(
        "via Relay — dijawab Muse utama (agen di chat utama)"
      );
    }

    // Reusing single-use code fails
    const reuseRes = await getPendingRelayRequests(code);
    expect(reuseRes.ok).toBe(false);

    // Expired code (>30 min) rejected
    const { code: code2 } = await createRelayCode();
    const expiredPending = await getPendingRelayRequests(
      code2,
      Date.now() + RELAY_CODE_TTL_MS + 1000
    );
    expect(expiredPending.ok).toBe(false);

    // 10-minute pending request timeout
    await handleUserMessage("Pesan yang akan timeout", { awaitCompletion: true });
    await expireTimedOutRelayRequests(Date.now() + RELAY_REQUEST_TIMEOUT_MS + 1000);
    db = await readDb();
    const timedOutMsg = db.messages.at(-1)!;
    expect(timedOutMsg.relayStatus).toBe("timeout");
    expect(timedOutMsg.text).toContain("timeout");

    // Disabling relay gives honest unconfigured notice for Muse when no AI model is attached
    await setRelayEnabled(false);
    await handleUserMessage("Setelah relay mati", { awaitCompletion: true });
    db = await readDb();
    const lastMuse = db.messages.at(-1)!;
    expect(lastMuse.relayStatus).toBeNull();
    expect(lastMuse.providerError).toContain("Pengaturan");
  });

  it("detects local, ephemeral (Vercel), and redis storage modes cleanly", () => {
    const prevDir = process.env.MEJA_BUNDAR_DATA_DIR;
    const prevVercel = process.env.VERCEL;
    const prevRedisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const prevRedisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    try {
      expect(getStorageMode()).toBe("local");

      delete process.env.MEJA_BUNDAR_DATA_DIR;
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      process.env.VERCEL = "1";
      expect(getStorageMode()).toBe("ephemeral");

      process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "token-test";
      expect(getStorageMode()).toBe("redis");
    } finally {
      if (prevDir !== undefined) process.env.MEJA_BUNDAR_DATA_DIR = prevDir;
      else delete process.env.MEJA_BUNDAR_DATA_DIR;
      if (prevVercel !== undefined) process.env.VERCEL = prevVercel;
      else delete process.env.VERCEL;
      if (prevRedisUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = prevRedisUrl;
      else delete process.env.UPSTASH_REDIS_REST_URL;
      if (prevRedisToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = prevRedisToken;
      else delete process.env.UPSTASH_REDIS_REST_TOKEN;
    }
  });
});

