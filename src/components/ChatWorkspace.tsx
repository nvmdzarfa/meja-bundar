"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  ActiveTypingState,
  Message,
  PipelineRun,
  PublicSettings,
  Seat,
} from "@/lib/types";
import {
  ArrowLeftIcon,
  AtIcon,
  GearIcon,
  ImageIcon,
  SendIcon,
  TrashIcon,
} from "./Icons";
import { SettingsModal } from "./SettingsModal";

interface ChatWorkspaceProps {
  initialSettings: PublicSettings;
  initialSeats: Seat[];
  initialMessages: Message[];
  initialTyping: ActiveTypingState;
  initialPipeline: PipelineRun | null;
}

export function ChatWorkspace({
  initialSettings,
  initialSeats,
  initialMessages,
  initialTyping,
  initialPipeline,
}: ChatWorkspaceProps) {
  const [settings, setSettings] = useState<PublicSettings>(initialSettings);
  const [seats, setSeats] = useState<Seat[]>(initialSeats);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [typing, setTyping] = useState<ActiveTypingState>(initialTyping);
  const [latestPipeline, setLatestPipeline] = useState<PipelineRun | null>(
    initialPipeline
  );

  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevCountRef = useRef<number>(initialMessages.length);

  const applyServerState = useCallback(
    (state: {
      messages: Message[];
      typing: ActiveTypingState;
      latestPipeline: PipelineRun | null;
      seats: Seat[];
      settings: PublicSettings;
    }) => {
      setMessages(state.messages);
      setTyping(state.typing);
      setLatestPipeline(state.latestPipeline);
      setSeats(state.seats);
      setSettings(state.settings);
      setLoadError(null);
    },
    []
  );

  const refreshState = useCallback(async () => {
    try {
      const res = await fetch("/api/messages", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        messages: Message[];
        typing: ActiveTypingState;
        latestPipeline: PipelineRun | null;
        seats: Seat[];
        settings: PublicSettings;
      };
      applyServerState(data);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Gagal memuat pembaruan pesan."
      );
    }
  }, [applyServerState]);

  useEffect(() => {
    const hasPendingRelay = messages.some((m) => m.relayStatus === "pending");
    const isWorking = Boolean(typing.activeSeatId) || sending || hasPendingRelay;
    if (settings.storageMode === "ephemeral" && !isWorking) {
      return;
    }
    const intervalMs = isWorking ? 850 : 4000;

    const timer = window.setInterval(() => {
      void refreshState();
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [typing.activeSeatId, sending, messages, settings.storageMode, refreshState]);

  useEffect(() => {
    if (messages.length > prevCountRef.current || typing.activeSeatId) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevCountRef.current = messages.length;
  }, [messages.length, typing.activeSeatId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMentionOpen(false);
        setClearModalOpen(false);
        setLightboxImage(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const museSeat = seats.find((s) => s.id === "MUSE") ?? seats[0];
  const seatById = Object.fromEntries(seats.map((s) => [s.id, s])) as Record<
    string,
    Seat
  >;

  async function sendChatMessage(raw: string) {
    const text = raw.trim();
    if (!text || sending) return;
    setSending(true);
    setMentionOpen(false);
    setLoadError(null);

    try {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as {
        error?: string;
        state?: {
          messages: Message[];
          typing: ActiveTypingState;
          latestPipeline: PipelineRun | null;
          seats: Seat[];
          settings: PublicSettings;
        };
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Gagal mengirim pesan.");
      }
      setInputText("");
      if (data.state) {
        applyServerState(data.state);
      } else {
        await refreshState();
      }
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Gagal mengirim pesan."
      );
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  async function handleAskProgress() {
    if (sending) return;
    setSending(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/chat/progress", { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        state?: {
          messages: Message[];
          typing: ActiveTypingState;
          latestPipeline: PipelineRun | null;
          seats: Seat[];
          settings: PublicSettings;
        };
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Gagal menanyakan progres.");
      }
      if (data.state) {
        applyServerState(data.state);
      } else {
        await refreshState();
      }
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Gagal menanyakan progres."
      );
    } finally {
      setSending(false);
    }
  }

  async function handleClearChat() {
    setClearing(true);
    try {
      await fetch("/api/chat/clear", { method: "POST" });
      setClearModalOpen(false);
      await refreshState();
    } finally {
      setClearing(false);
    }
  }

  function insertPrefix(prefix: string) {
    setInputText((prev) => {
      const trimmed = prev.trimStart();
      if (trimmed.startsWith(prefix.trim())) return prev;
      return `${prefix}${prev}`;
    });
    setMentionOpen(false);
    textareaRef.current?.focus();
  }

  function insertMention(displayName: string) {
    const token = `@${displayName} `;
    setInputText((prev) => (prev ? `${prev.trimEnd()} ${token}` : token));
    setMentionOpen(false);
    textareaRef.current?.focus();
  }

  const activeSeat = typing.activeSeatId ? seatById[typing.activeSeatId] : null;
  const queuedNames = typing.queuedSeatIds
    .map((id) => seatById[id]?.displayName ?? id)
    .filter(Boolean);

  return (
    <div className="flex h-[100dvh] flex-col bg-[#EFEAE2] text-[#18181B]">
      {/* Compact single-row header */}
      <header className="shrink-0 bg-[#1C1917] text-[#FAF8F5] border-b border-black/20">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-2 sm:px-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link
              href="/"
              aria-label="Kembali ke beranda"
              title="Kembali ke beranda"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#FAF8F5] hover:bg-white/10 shrink-0"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </Link>

            <img
              src={settings.groupAvatar}
              alt="Foto grup Meja Bundar"
              width={40}
              height={40}
              className="h-10 w-10 rounded-xl object-cover border border-white/15 shrink-0"
            />

            <div className="min-w-0">
              <h1 className="truncate text-base font-bold leading-tight text-white">
                Meja Bundar
              </h1>
              <p className="truncate text-xs text-[#D6D3D1]">
                Pemilik {settings.ownerName} - Admin {museSeat?.displayName ?? "Muse"} - Hadir 8/8
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setClearModalOpen(true)}
              aria-label="Bersihkan chat"
              title="Bersihkan chat"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#FAF8F5] hover:bg-white/10"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Buka pengaturan"
              title="Pengaturan"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-white/10 text-[#FAF8F5] hover:bg-white/20"
            >
              <GearIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Horizontal scrollable seat strip */}
        <div className="border-t border-white/10 bg-[#262220]">
          <div className="mx-auto flex max-w-5xl items-center gap-2 overflow-x-auto px-3 py-2 sm:px-4 [scrollbar-width:thin] [scrollbar-color:#57534E_#262220]">
            <div className="flex shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-2.5 py-1.5">
              <img
                src={settings.ownerAvatar}
                alt=""
                width={26}
                height={26}
                className="h-6 w-6 rounded-lg object-cover"
              />
              <div className="leading-none">
                <p className="text-xs font-semibold text-white">{settings.ownerName}</p>
                <p className="mt-0.5 text-[10px] text-[#D6D3D1]">Pemilik</p>
              </div>
              <span className="h-2 w-2 rounded-full bg-[#34D399]" aria-label="Online" />
            </div>

            {seats.map((seat) => {
              const isTyping = typing.activeSeatId === seat.id;
              const isQueued = typing.queuedSeatIds.includes(seat.id);
              return (
                <button
                  key={seat.id}
                  type="button"
                  onClick={() => insertMention(seat.displayName)}
                  title={`Mention @${seat.displayName} (${seat.role})`}
                  className={`flex shrink-0 items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition ${
                    isTyping
                      ? "border-[#FB923C] bg-[#9A3412]/50"
                      : "border-white/10 bg-white/5 hover:bg-white/15"
                  }`}
                >
                  <img
                    src={seat.avatar}
                    alt=""
                    width={26}
                    height={26}
                    className="h-6 w-6 rounded-lg object-cover"
                  />
                  <div className="leading-none">
                    <p className="text-xs font-semibold text-white">{seat.displayName}</p>
                    <p className="mt-0.5 text-[10px] text-[#D6D3D1]">{seat.role}</p>
                  </div>
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isTyping
                        ? "bg-[#FB923C]"
                        : isQueued
                          ? "bg-[#FBBF24]"
                          : "bg-[#34D399]"
                    }`}
                    aria-label={
                      isTyping ? "Mengetik" : isQueued ? "Antre" : "Online"
                    }
                  />
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main chat scroll area */}
      <main className="flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        <div className="mx-auto max-w-4xl space-y-3">
          {loadError && (
            <div
              role="alert"
              className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-2.5 text-xs font-semibold text-[#991B1B]"
            >
              Terjadi kesalahan: {loadError}
            </div>
          )}

          {latestPipeline && latestPipeline.status === "running" && (
            <div className="rounded-xl border border-[#FDBA74] bg-[#FFF7ED] px-3.5 py-2.5 text-xs text-[#9A3412]">
              <span className="font-bold">Pipeline Tugas berjalan:</span>{" "}
              {latestPipeline.stages
                .map(
                  (s) =>
                    `${s.stage}.${s.seatName} (${
                      s.status === "completed"
                        ? "selesai"
                        : s.status === "running"
                          ? "aktif"
                          : s.status === "failed"
                            ? "gagal"
                            : "antre"
                    })`
                )
                .join(" · ")}
            </div>
          )}

          {messages.length === 0 ? (
            <div className="mx-auto my-8 max-w-lg rounded-2xl border border-[#E2DDD5] bg-white p-6 text-center space-y-3">
              <img
                src={settings.groupAvatar}
                alt=""
                width={56}
                height={56}
                className="mx-auto h-14 w-14 rounded-2xl object-cover border border-[#E2DDD5]"
              />
              <h2 className="text-lg font-bold text-[#18181B]">
                Meja Bundar siap digunakan
                {settings.ownerName && settings.ownerName !== "Pemilik"
                  ? `, ${settings.ownerName}`
                  : ""}
              </h2>
              <p className="text-sm leading-relaxed text-[#52525B]">
                Kirim pesan biasa untuk berdiskusi, pakai <code className="font-mono">@NamaKursi</code>{" "}
                untuk memanggil satu kursi, awali dengan <code className="font-mono">Tugas:</code> untuk
                pipeline 6 tahap, atau <code className="font-mono">Gambar:</code> untuk membuat gambar.
              </p>
              {!settings.hasGeminiApiKey &&
                !settings.hasGatewayApiKey &&
                !settings.relay.enabled && (
                  <p className="rounded-xl border border-[#FDBA74] bg-[#FFF7ED] px-3.5 py-2.5 text-xs font-medium text-[#9A3412] text-left">
                    Belum ada API key atau model AI yang terhubung. Aplikasi ini tidak memakai
                    balasan template palsu — klik <strong>Atur Model &amp; API Key</strong> di bawah
                    untuk menyambungkan Gemini (Google AI Studio) atau Link API Gateway.
                  </p>
                )}
              <div className="pt-1 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => insertPrefix("Tugas: ")}
                  className="min-h-[44px] rounded-xl border border-[#D6D0C6] bg-[#FAF8F5] px-3.5 py-2 text-xs font-semibold text-[#18181B] hover:bg-[#EFEAE2]"
                >
                  Coba awalan Tugas:
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="min-h-[44px] rounded-xl bg-[#C2410C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#9A3412]"
                >
                  Atur Model & API Key
                </button>
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isOwner = msg.senderType === "owner";
              return (
                <div
                  key={msg.id}
                  className={`flex ${isOwner ? "justify-end" : "justify-start"}`}
                >
                  <article
                    className={`max-w-[92%] sm:max-w-[80%] rounded-2xl border px-3.5 py-2.5 shadow-[0_1px_1px_rgba(0,0,0,0.04)] ${
                      isOwner
                        ? "bg-[#FFF3E8] border-[#F3D5BD] text-[#18181B]"
                        : "bg-white border-[#E2DDD5] text-[#18181B]"
                    }`}
                  >
                    {/* Single compact metadata line */}
                    <div className="flex items-center gap-2 text-xs">
                      <img
                        src={msg.senderAvatar}
                        alt=""
                        width={22}
                        height={22}
                        className="h-5 w-5 rounded-md object-cover shrink-0"
                      />
                      <span className="font-bold text-[#18181B] truncate">
                        {msg.senderName}
                      </span>
                      <span className="text-[#52525B] truncate">{msg.senderRole}</span>
                      <span className="ml-auto font-mono text-[11px] text-[#52525B] shrink-0">
                        {msg.timeLabel}
                      </span>
                    </div>

                    {/* Message body */}
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-[#18181B]">
                      {msg.text}
                    </p>

                    {/* Visual image */}
                    {msg.imageUrl && (
                      <div className="mt-2.5 overflow-hidden rounded-xl border border-[#E2DDD5] bg-[#FAF8F5]">
                        <button
                          type="button"
                          onClick={() => setLightboxImage(msg.imageUrl)}
                          className="block w-full text-left"
                          aria-label="Perbesar gambar"
                        >
                          <img
                            src={msg.imageUrl}
                            alt={`Visual dari ${msg.senderName}`}
                            width={512}
                            height={320}
                            className="h-auto max-h-80 w-full object-contain"
                          />
                        </button>
                      </div>
                    )}

                    {/* Source label */}
                    {msg.sourceLabel && (
                      <p
                        className={`mt-2 border-t pt-1.5 text-[11px] font-medium ${
                          msg.relayStatus === "pending"
                            ? "border-[#FDBA74] text-[#9A3412]"
                            : msg.relayStatus === "timeout"
                              ? "border-[#FCA5A5] text-[#991B1B]"
                              : "border-[#EFEAE2] text-[#52525B]"
                        }`}
                      >
                        {msg.sourceLabel}
                      </p>
                    )}

                    {/* Raw provider error */}
                    {msg.providerError && (
                      <div
                        role="alert"
                        className="mt-2 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-xs text-[#991B1B]"
                      >
                        <p className="font-bold">Error asli provider:</p>
                        <p className="mt-0.5 break-words font-mono text-[11px]">
                          {msg.providerError}
                        </p>
                      </div>
                    )}
                  </article>
                </div>
              );
            })
          )}

          {/* Live typing / turn queue indicator */}
          {activeSeat && (
            <div className="flex justify-start">
              <div className="inline-flex flex-wrap items-center gap-2 rounded-2xl border border-[#E2DDD5] bg-white px-3.5 py-2 text-xs text-[#3F3F46]">
                <img
                  src={activeSeat.avatar}
                  alt=""
                  width={20}
                  height={20}
                  className="h-5 w-5 rounded-md object-cover"
                />
                <span className="font-semibold text-[#18181B]">
                  {activeSeat.displayName} ({activeSeat.role}) sedang mengetik
                </span>
                <span className="inline-flex items-center gap-1" aria-hidden="true">
                  <span className="typing-dot-1 h-1.5 w-1.5 rounded-full bg-[#EA580C]" />
                  <span className="typing-dot-2 h-1.5 w-1.5 rounded-full bg-[#EA580C]" />
                  <span className="typing-dot-3 h-1.5 w-1.5 rounded-full bg-[#EA580C]" />
                </span>
                {queuedNames.length > 0 && (
                  <span className="text-[#52525B]">
                    · Menunggu giliran: {queuedNames.join(", ")}
                  </span>
                )}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </main>

      {/* Sticky composer */}
      <footer className="shrink-0 border-t border-[#D6D0C6] bg-[#FAF8F5] px-3 pt-2.5 pb-3 sm:px-4">
        <div className="mx-auto max-w-4xl relative">
          {/* Mention popover */}
          {mentionOpen && (
            <div
              role="menu"
              aria-label="Pilih kursi untuk di-mention"
              className="absolute bottom-full left-0 mb-2 w-72 max-w-full rounded-2xl border border-[#D6D0C6] bg-white p-2 shadow-lg z-20"
            >
              <p className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#52525B]">
                Panggil satu kursi
              </p>
              <div className="mt-1 space-y-1">
                {seats.map((seat) => (
                  <button
                    key={seat.id}
                    type="button"
                    role="menuitem"
                    onClick={() => insertMention(seat.displayName)}
                    className="flex w-full min-h-[44px] items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left hover:bg-[#F6F4F0]"
                  >
                    <img
                      src={seat.avatar}
                      alt=""
                      width={26}
                      height={26}
                      className="h-6 w-6 rounded-md object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#18181B]">
                        @{seat.displayName}
                      </p>
                      <p className="truncate text-[11px] text-[#52525B]">
                        {seat.code} · {seat.role}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Action chips */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMentionOpen((o) => !o)}
              aria-expanded={mentionOpen}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#D6D0C6] bg-white px-3 py-2 text-xs font-semibold text-[#18181B] hover:bg-[#EFEAE2]"
            >
              <AtIcon className="h-3.5 w-3.5 text-[#C2410C]" />
              <span>@ Kursi</span>
            </button>

            <button
              type="button"
              disabled={sending}
              onClick={handleAskProgress}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#D6D0C6] bg-white px-3 py-2 text-xs font-semibold text-[#18181B] hover:bg-[#EFEAE2] disabled:opacity-60"
            >
              <span>Tanya Progres</span>
            </button>

            <button
              type="button"
              onClick={() => insertPrefix("Gambar: ")}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#D6D0C6] bg-white px-3 py-2 text-xs font-semibold text-[#18181B] hover:bg-[#EFEAE2]"
            >
              <ImageIcon className="h-3.5 w-3.5 text-[#9D174D]" />
              <span>Buat Gambar</span>
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendChatMessage(inputText);
            }}
            className="flex items-end gap-2"
          >
            <label htmlFor="chat-composer" className="sr-only">
              Tulis pesan ke Meja Bundar
            </label>
            <textarea
              ref={textareaRef}
              id="chat-composer"
              rows={1}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendChatMessage(inputText);
                }
              }}
              placeholder={`Pesan sebagai ${settings.ownerName} (Tugas:, Gambar:, @Kursi)...`}
              className="min-h-[52px] sm:min-h-[44px] max-h-36 flex-1 resize-y rounded-xl border border-[#D6D0C6] bg-white px-3.5 py-2.5 text-sm leading-snug text-[#18181B] placeholder:text-[#71717A]"
            />
            <button
              type="submit"
              disabled={sending || !inputText.trim()}
              aria-label="Kirim pesan"
              className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl bg-[#C2410C] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#9A3412] disabled:opacity-50"
            >
              <SendIcon className="h-5 w-5" />
            </button>
          </form>
        </div>
      </footer>

      {/* Clear chat confirmation modal */}
      {clearModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-dialog-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setClearModalOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-[#E2DDD5] bg-white p-5 shadow-xl space-y-4">
            <h2 id="clear-dialog-title" className="text-lg font-bold text-[#18181B]">
              Bersihkan isi chat?
            </h2>
            <p className="text-sm leading-relaxed text-[#52525B]">
              Semua pesan dan status pipeline terakhir akan dihapus. Nama pemilik, pengaturan
              kursi, API key, dan konfigurasi model tetap tersimpan.
            </p>
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setClearModalOpen(false)}
                className="min-h-[44px] rounded-xl border border-[#D6D0C6] bg-white px-4 py-2 text-sm font-semibold text-[#18181B]"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={clearing}
                onClick={handleClearChat}
                className="min-h-[44px] rounded-xl bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#991B1B]"
              >
                {clearing ? "Menghapus..." : "Hapus Pesan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Pratinjau gambar penuh"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-h-[90vh] max-w-4xl">
            <img
              src={lightboxImage}
              alt="Hasil gambar Meja Bundar"
              width={1024}
              height={768}
              className="max-h-[85vh] w-auto rounded-2xl object-contain"
            />
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              className="mt-3 mx-auto block min-h-[44px] rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#18181B]"
            >
              Tutup Pratinjau
            </button>
          </div>
        </div>
      )}

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        seats={seats}
        onSaved={(nextSettings, nextSeats) => {
          setSettings(nextSettings);
          setSeats(nextSeats);
        }}
        onClearChatConfirmed={handleClearChat}
      />
    </div>
  );
}
