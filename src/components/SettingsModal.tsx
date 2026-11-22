"use client";

import React, { useEffect, useState } from "react";
import type { PublicSettings, ReviewLevel, Seat, SeatId } from "@/lib/types";
import { CloseIcon, ExternalLinkIcon } from "./Icons";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: PublicSettings;
  seats: Seat[];
  onSaved: (settings: PublicSettings, seats: Seat[]) => void;
  onClearChatConfirmed: () => Promise<void>;
}

const REVIEW_LEVELS: ReviewLevel[] = ["Longgar", "Santai", "Sedang", "Ketat"];

export function SettingsModal({
  open,
  onClose,
  settings,
  seats,
  onSaved,
  onClearChatConfirmed,
}: SettingsModalProps) {
  const [ownerName, setOwnerName] = useState(settings.ownerName);
  const [ownerAvatar, setOwnerAvatar] = useState(settings.ownerAvatar);
  const [groupAvatar, setGroupAvatar] = useState(settings.groupAvatar);
  const [diskusiBergilir, setDiskusiBergilir] = useState(settings.diskusiBergilir);
  const [reviewLevel, setReviewLevel] = useState<ReviewLevel>(settings.reviewLevel);
  const [gatewayBaseUrl, setGatewayBaseUrl] = useState(settings.gatewayBaseUrl);
  const [gatewayApiKeyInput, setGatewayApiKeyInput] = useState(
    settings.gatewayApiKeyMasked
  );
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState(
    settings.geminiApiKeyMasked
  );
  const [clearGatewayKey, setClearGatewayKey] = useState(false);
  const [clearGeminiKey, setClearGeminiKey] = useState(false);
  const [draftSeats, setDraftSeats] = useState<Seat[]>(seats);

  const [lastGatewayModels, setLastGatewayModels] = useState<string[]>(
    settings.lastGatewayModels
  );
  const [lastGeminiModels, setLastGeminiModels] = useState<string[]>(
    settings.lastGeminiModels
  );
  const [relayState, setRelayState] = useState(settings.relay);
  const [freshRelayCode, setFreshRelayCode] = useState<{
    code: string;
    expiresAt: number;
  } | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const [gatewayTesting, setGatewayTesting] = useState(false);
  const [gatewayFeedback, setGatewayFeedback] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const [geminiFetching, setGeminiFetching] = useState(false);
  const [geminiFeedback, setGeminiFeedback] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const [relayBusy, setRelayBusy] = useState(false);
  const [relayFeedback, setRelayFeedback] = useState<string | null>(null);

  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const prevOpenRef = React.useRef(false);

  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;
    if (!justOpened) return;
    setOwnerName(settings.ownerName);
    setOwnerAvatar(settings.ownerAvatar);
    setGroupAvatar(settings.groupAvatar);
    setDiskusiBergilir(settings.diskusiBergilir);
    setReviewLevel(settings.reviewLevel);
    setGatewayBaseUrl(settings.gatewayBaseUrl);
    setGatewayApiKeyInput(settings.gatewayApiKeyMasked);
    setGeminiApiKeyInput(settings.geminiApiKeyMasked);
    setClearGatewayKey(false);
    setClearGeminiKey(false);
    setDraftSeats(seats.map((s) => ({ ...s })));
    setLastGatewayModels(settings.lastGatewayModels);
    setLastGeminiModels(settings.lastGeminiModels);
    setRelayState(settings.relay);
    setSaveMessage(null);
    setGatewayFeedback(null);
    setGeminiFeedback(null);
    setRelayFeedback(null);
    setConfirmClear(false);
  }, [open, settings, seats]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function updateSeatField(
    id: SeatId,
    patch: Partial<Pick<Seat, "displayName" | "source" | "gatewayModel" | "geminiModel">>
  ) {
    setDraftSeats((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  }

  function handleImageUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: string) => void
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setSaveMessage({
        type: "err",
        text: "Ukuran gambar maksimal 2 MB.",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setter(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  function applyModelToAllTextSeats(source: "gemini" | "gateway", model: string) {
    if (!model.trim()) return;
    setDraftSeats((prev) =>
      prev.map((s) => {
        // Leave Visual (M03) intact unless user explicitly picks an image model for it
        if (s.id === "M03") return s;
        return source === "gemini"
          ? { ...s, source: "gemini", geminiModel: model.trim() }
          : { ...s, source: "gateway", gatewayModel: model.trim() };
      })
    );
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerName,
          ownerAvatar,
          groupAvatar,
          diskusiBergilir,
          reviewLevel,
          gatewayBaseUrl,
          gatewayApiKey: clearGatewayKey ? undefined : gatewayApiKeyInput,
          clearGatewayApiKey: clearGatewayKey,
          geminiApiKey: clearGeminiKey ? undefined : geminiApiKeyInput,
          clearGeminiApiKey: clearGeminiKey,
          seats: draftSeats.map((s) => ({
            id: s.id,
            displayName: s.displayName,
            source: s.source,
            gatewayModel: s.gatewayModel,
            geminiModel: s.geminiModel,
          })),
        }),
      });
      const data = (await res.json()) as {
        settings?: PublicSettings;
        seats?: Seat[];
        error?: string;
      };
      if (!res.ok || !data.settings || !data.seats) {
        throw new Error(data.error ?? "Gagal menyimpan pengaturan.");
      }
      setGatewayApiKeyInput(data.settings.gatewayApiKeyMasked);
      setGeminiApiKeyInput(data.settings.geminiApiKeyMasked);
      setClearGatewayKey(false);
      setClearGeminiKey(false);
      onSaved(data.settings, data.seats);
      setSaveMessage({ type: "ok", text: "Pengaturan berhasil disimpan." });
    } catch (err) {
      setSaveMessage({
        type: "err",
        text: err instanceof Error ? err.message : "Gagal menyimpan.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleTestGateway() {
    setGatewayTesting(true);
    setGatewayFeedback(null);
    try {
      const res = await fetch("/api/providers/gateway/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: gatewayBaseUrl,
          apiKey: clearGatewayKey ? "" : gatewayApiKeyInput,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        models?: string[];
        settings?: PublicSettings;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.models) {
        throw new Error(data.error ?? "Gagal menguji koneksi gateway.");
      }
      setLastGatewayModels(data.models);
      if (data.settings) {
        setGatewayApiKeyInput(data.settings.gatewayApiKeyMasked);
        onSaved(data.settings, draftSeats);
      }
      setGatewayFeedback({
        type: "ok",
        text: `Koneksi berhasil. Ditemukan ${data.models.length} model asli dari /models.`,
      });
    } catch (err) {
      setGatewayFeedback({
        type: "err",
        text: err instanceof Error ? err.message : "Tes koneksi gagal.",
      });
    } finally {
      setGatewayTesting(false);
    }
  }

  async function handleFetchGeminiModels() {
    setGeminiFetching(true);
    setGeminiFeedback(null);
    try {
      const res = await fetch("/api/providers/gemini/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: clearGeminiKey ? "" : geminiApiKeyInput,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        models?: string[];
        settings?: PublicSettings;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.models) {
        throw new Error(data.error ?? "Gagal mengambil daftar model Gemini.");
      }
      setLastGeminiModels(data.models);
      if (data.settings) {
        setGeminiApiKeyInput(data.settings.geminiApiKeyMasked);
        onSaved(data.settings, draftSeats);
      }
      setGeminiFeedback({
        type: "ok",
        text: `Berhasil memuat ${data.models.length} model asli dari akun Google AI Studio.`,
      });
    } catch (err) {
      setGeminiFeedback({
        type: "err",
        text: err instanceof Error ? err.message : "Gagal memuat model Gemini.",
      });
    } finally {
      setGeminiFetching(false);
    }
  }

  async function handleGenerateRelayCode() {
    setRelayBusy(true);
    setRelayFeedback(null);
    try {
      const res = await fetch("/api/relay/code", { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        code?: string;
        expiresAt?: number;
        settings?: PublicSettings;
      };
      if (!res.ok || !data.code || !data.expiresAt) {
        throw new Error("Gagal membuat kode relay.");
      }
      setFreshRelayCode({ code: data.code, expiresAt: data.expiresAt });
      if (data.settings) {
        setRelayState(data.settings.relay);
        onSaved(data.settings, draftSeats);
      }
      setRelayFeedback(
        "Kode relay dibuat dan Relay diaktifkan. Salin kode di atas sekarang karena hanya ditampilkan sekali."
      );
    } catch (err) {
      setRelayFeedback(
        err instanceof Error ? err.message : "Gagal membuat kode relay."
      );
    } finally {
      setRelayBusy(false);
    }
  }

  async function handleToggleRelay(enabled: boolean) {
    setRelayBusy(true);
    setRelayFeedback(null);
    try {
      const res = enabled
        ? await fetch("/api/relay/code", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: true }),
          })
        : await fetch("/api/relay/disable", { method: "POST" });
      const data = (await res.json()) as { settings?: PublicSettings };
      if (data.settings) {
        setRelayState(data.settings.relay);
        onSaved(data.settings, draftSeats);
      }
      if (!enabled) {
        setFreshRelayCode(null);
        setRelayFeedback(
          "Relay dimatikan. Kursi Muse kembali memakai model bawaan aplikasi."
        );
      } else {
        setRelayFeedback(
          "Relay diaktifkan. Buat kode relay baru jika belum memiliki kode aktif."
        );
      }
    } finally {
      setRelayBusy(false);
    }
  }

  async function handleClearChat() {
    setClearing(true);
    try {
      await onClearChatConfirmed();
      setConfirmClear(false);
      setSaveMessage({
        type: "ok",
        text: "Riwayat pesan dan pipeline dibersihkan. Pengaturan dan konfigurasi model tetap aman.",
      });
    } finally {
      setClearing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full w-full max-w-2xl flex-col bg-[#FAF8F5] text-[#18181B] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#E2DDD5] bg-white px-5 py-4">
          <div>
            <h2 id="settings-modal-title" className="text-lg font-bold text-[#18181B]">
              Pengaturan Meja Bundar
            </h2>
            <p className="text-xs text-[#52525B]">
              Kunci API tersimpan di server dalam kondisi ter-mask dan tidak pernah dikirim terbuka.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pengaturan"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[#E2DDD5] bg-white text-[#18181B] hover:bg-[#F6F4F0]"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSaveSettings} className="flex-1 overflow-y-auto px-5 py-6 space-y-8">
          {settings.storageMode === "ephemeral" && (
            <div className="rounded-2xl border border-[#FDBA74] bg-[#FFF7ED] px-4 py-3 text-xs leading-relaxed text-[#9A3412]">
              <strong>Mode Vercel sementara (/tmp):</strong> Tanpa database Redis, pengaturan dan
              riwayat chat dapat hilang saat cold start. Untuk penyimpanan permanen di Vercel,
              pasang <strong>Upstash Redis</strong> dari Vercel Marketplace (atau isi{" "}
              <code className="font-mono">UPSTASH_REDIS_REST_URL</code> &amp;{" "}
              <code className="font-mono">UPSTASH_REDIS_REST_TOKEN</code>).
            </div>
          )}
          {settings.storageMode === "redis" && (
            <div className="rounded-2xl border border-[#A7F3D0] bg-[#ECFDF5] px-4 py-2.5 text-xs font-medium text-[#065F46]">
              Penyimpanan Redis aktif — pengaturan, riwayat chat, dan gambar tersimpan permanen.
            </div>
          )}

          {/* 1. Profil Grup */}
          <section className="rounded-2xl border border-[#E2DDD5] bg-white p-5 space-y-4">
            <h3 className="text-base font-bold text-[#18181B]">1. Profil Grup</h3>

            <div>
              <label
                htmlFor="owner-name-input"
                className="block text-sm font-semibold text-[#18181B]"
              >
                Nama Pemilik
              </label>
              <input
                id="owner-name-input"
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                required
                className="mt-1.5 w-full rounded-xl border border-[#D6D0C6] bg-white px-3.5 py-2.5 text-sm text-[#18181B]"
              />
              <p className="mt-1 text-[11px] text-[#52525B]">
                Default: Pemilik. Nama ini dipakai AI saat menyapamu di ruang chat.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="owner-avatar-input"
                  className="block text-sm font-semibold text-[#18181B]"
                >
                  Foto Pemilik (URL atau unggah)
                </label>
                <div className="mt-1.5 flex items-center gap-3">
                  <img
                    src={ownerAvatar}
                    alt="Pratinjau foto pemilik"
                    width={44}
                    height={44}
                    className="h-11 w-11 rounded-xl object-cover border border-[#E2DDD5] shrink-0"
                  />
                  <input
                    id="owner-avatar-input"
                    type="text"
                    value={ownerAvatar}
                    onChange={(e) => setOwnerAvatar(e.target.value)}
                    className="w-full min-w-0 rounded-xl border border-[#D6D0C6] bg-white px-3 py-2 text-xs text-[#18181B]"
                  />
                </div>
                <label className="mt-2 inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-[#D6D0C6] bg-[#F6F4F0] px-3 py-2 text-xs font-semibold text-[#18181B] hover:bg-[#EFEAE2]">
                  Unggah Foto Pemilik
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => handleImageUpload(e, setOwnerAvatar)}
                  />
                </label>
              </div>

              <div>
                <label
                  htmlFor="group-avatar-input"
                  className="block text-sm font-semibold text-[#18181B]"
                >
                  Foto Grup (URL atau unggah)
                </label>
                <div className="mt-1.5 flex items-center gap-3">
                  <img
                    src={groupAvatar}
                    alt="Pratinjau foto grup"
                    width={44}
                    height={44}
                    className="h-11 w-11 rounded-xl object-cover border border-[#E2DDD5] shrink-0"
                  />
                  <input
                    id="group-avatar-input"
                    type="text"
                    value={groupAvatar}
                    onChange={(e) => setGroupAvatar(e.target.value)}
                    className="w-full min-w-0 rounded-xl border border-[#D6D0C6] bg-white px-3 py-2 text-xs text-[#18181B]"
                  />
                </div>
                <label className="mt-2 inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-[#D6D0C6] bg-[#F6F4F0] px-3 py-2 text-xs font-semibold text-[#18181B] hover:bg-[#EFEAE2]">
                  Unggah Foto Grup
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => handleImageUpload(e, setGroupAvatar)}
                  />
                </label>
              </div>
            </div>
          </section>

          {/* 2. Daftar Kursi */}
          <section className="rounded-2xl border border-[#E2DDD5] bg-white p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-[#18181B]">2. Daftar Kursi</h3>
              <p className="mt-1 text-xs text-[#52525B]">
                Kode kursi dan peran bersifat tetap. Setiap kursi hanya menjawab menggunakan model
                AI asli yang dipilih (atau Relay khusus Muse).
              </p>
            </div>

            {(lastGeminiModels.length > 0 || lastGatewayModels.length > 0) && (
              <div className="rounded-xl border border-[#E2DDD5] bg-[#FAF8F5] p-3 space-y-2">
                <p className="text-xs font-semibold text-[#18181B]">
                  Terapkan 1 model ke semua kursi teks (kecuali Visual):
                </p>
                <div className="flex flex-wrap gap-2">
                  {lastGeminiModels.length > 0 && (
                    <select
                      aria-label="Terapkan model Gemini ke semua kursi teks"
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          applyModelToAllTextSeats("gemini", e.target.value);
                          e.target.value = "";
                        }
                      }}
                      className="max-w-full rounded-lg border border-[#D6D0C6] bg-white px-2.5 py-1.5 font-mono text-xs text-[#18181B]"
                    >
                      <option value="">-- Terapkan model Gemini --</option>
                      {lastGeminiModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  )}
                  {lastGatewayModels.length > 0 && (
                    <select
                      aria-label="Terapkan model Gateway ke semua kursi teks"
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          applyModelToAllTextSeats("gateway", e.target.value);
                          e.target.value = "";
                        }
                      }}
                      className="max-w-full rounded-lg border border-[#D6D0C6] bg-white px-2.5 py-1.5 font-mono text-xs text-[#18181B]"
                    >
                      <option value="">-- Terapkan model Gateway --</option>
                      {lastGatewayModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {draftSeats.map((seat) => {
                const isMuse = seat.id === "MUSE";
                const usesExternalModel = seat.source === "gemini" || seat.source === "gateway";
                const currentModel =
                  seat.source === "gemini" ? seat.geminiModel : seat.gatewayModel;
                const modelCatalog =
                  seat.source === "gemini" ? lastGeminiModels : lastGatewayModels;
                const hasMissingWarning =
                  usesExternalModel &&
                  Boolean(currentModel.trim()) &&
                  modelCatalog.length > 0 &&
                  !modelCatalog.includes(currentModel.trim());

                return (
                  <div
                    key={seat.id}
                    className="rounded-xl border border-[#E2DDD5] bg-[#FAF8F5] p-3.5 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={seat.avatar}
                          alt=""
                          width={32}
                          height={32}
                          className="h-8 w-8 rounded-lg object-cover"
                        />
                        <span className="rounded bg-[#1C1917] px-2 py-0.5 font-mono text-xs font-semibold text-white">
                          {seat.code}
                        </span>
                        <span className="text-xs font-semibold text-[#52525B]">
                          Peran tetap: {seat.role}
                        </span>
                      </div>
                      {isMuse && (
                        <span className="rounded-md bg-[#FFF7ED] border border-[#FDBA74] px-2 py-0.5 text-xs font-semibold text-[#9A3412]">
                          Koordinator / Model AI / Relay
                        </span>
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label
                          htmlFor={`seat-name-${seat.id}`}
                          className="block text-xs font-semibold text-[#3F3F46]"
                        >
                          Nama tampil
                        </label>
                        <input
                          id={`seat-name-${seat.id}`}
                          type="text"
                          value={seat.displayName}
                          onChange={(e) =>
                            updateSeatField(seat.id, { displayName: e.target.value })
                          }
                          className="mt-1 w-full rounded-lg border border-[#D6D0C6] bg-white px-2.5 py-2 text-sm text-[#18181B]"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`seat-source-${seat.id}`}
                          className="block text-xs font-semibold text-[#3F3F46]"
                        >
                          Sumber model
                        </label>
                        <select
                          id={`seat-source-${seat.id}`}
                          value={seat.source}
                          onChange={(e) =>
                            updateSeatField(seat.id, {
                              source: e.target.value as "builtin" | "gateway" | "gemini",
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-[#D6D0C6] bg-white px-2.5 py-2 text-sm text-[#18181B]"
                        >
                          {isMuse && (
                            <option value="builtin">Koordinator bawaan (progres/rekap)</option>
                          )}
                          <option value="gateway">Link API (gateway)</option>
                          <option value="gemini">Gemini (login Google)</option>
                        </select>
                      </div>

                      {usesExternalModel && (
                        <div>
                          <label
                            htmlFor={`seat-model-${seat.id}`}
                            className="block text-xs font-semibold text-[#3F3F46]"
                          >
                            Model ({seat.source === "gemini" ? "Gemini" : "Gateway"})
                          </label>
                          <input
                            id={`seat-model-${seat.id}`}
                            type="text"
                            list={
                              modelCatalog.length > 0
                                ? `datalist-${seat.id}-${seat.source}`
                                : undefined
                            }
                            placeholder={
                              seat.source === "gemini"
                                ? "mis. gemini-3.8-flash"
                                : "mis. gpt-4o-mini"
                            }
                            value={currentModel}
                            onChange={(e) =>
                              updateSeatField(
                                seat.id,
                                seat.source === "gemini"
                                  ? { geminiModel: e.target.value }
                                  : { gatewayModel: e.target.value }
                              )
                            }
                            className="mt-1 w-full rounded-lg border border-[#D6D0C6] bg-white px-2.5 py-2 font-mono text-xs text-[#18181B]"
                          />
                          {modelCatalog.length > 0 && (
                            <datalist id={`datalist-${seat.id}-${seat.source}`}>
                              {modelCatalog.map((m) => (
                                <option key={m} value={m} />
                              ))}
                            </datalist>
                          )}
                        </div>
                      )}
                    </div>

                    {usesExternalModel && modelCatalog.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-medium text-[#52525B]">
                          Pilih cepat:
                        </span>
                        <select
                          aria-label={`Pilih model ${seat.displayName} dari daftar`}
                          value={modelCatalog.includes(currentModel) ? currentModel : ""}
                          onChange={(e) => {
                            if (!e.target.value) return;
                            updateSeatField(
                              seat.id,
                              seat.source === "gemini"
                                ? { geminiModel: e.target.value }
                                : { gatewayModel: e.target.value }
                            );
                          }}
                          className="max-w-full rounded-lg border border-[#D6D0C6] bg-white px-2 py-1 font-mono text-xs text-[#18181B]"
                        >
                          <option value="">-- pilih dari daftar hasil fetch --</option>
                          {modelCatalog.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {hasMissingWarning && (
                      <p className="rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-2.5 py-1.5 text-xs font-medium text-[#991B1B]">
                        Model &quot;{currentModel}&quot; tidak ditemukan di daftar model{" "}
                        {seat.source === "gemini" ? "Gemini" : "gateway"} terakhir.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* 3. Diskusi Bergilir */}
          <section className="rounded-2xl border border-[#E2DDD5] bg-white p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-[#18181B]">3. Diskusi Bergilir</h3>
                <p className="mt-1 text-xs text-[#52525B]">
                  Jika aktif, semua 7 kursi ikut membalas pesan biasa bergiliran. Jika nonaktif,
                  hanya Muse yang menjawab pesan biasa tanpa @mention.
                </p>
              </div>
              <label className="inline-flex min-h-[44px] items-center gap-2 font-semibold text-sm">
                <input
                  type="checkbox"
                  checked={diskusiBergilir}
                  onChange={(e) => setDiskusiBergilir(e.target.checked)}
                  className="h-5 w-5 accent-[#C2410C]"
                />
                <span>{diskusiBergilir ? "Aktif" : "Nonaktif"}</span>
              </label>
            </div>
          </section>

          {/* 4. Level Review */}
          <section className="rounded-2xl border border-[#E2DDD5] bg-white p-5 space-y-3">
            <div>
              <h3 className="text-base font-bold text-[#18181B]">4. Level Review</h3>
              <p className="mt-1 text-xs text-[#52525B]">
                Mengatur seberapa ketat kursi Peninjau mengaudit tahap sebelumnya pada pipeline Tugas:.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {REVIEW_LEVELS.map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setReviewLevel(lvl)}
                  aria-pressed={reviewLevel === lvl}
                  className={`min-h-[44px] rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                    reviewLevel === lvl
                      ? "border-[#C2410C] bg-[#C2410C] text-white"
                      : "border-[#D6D0C6] bg-[#FAF8F5] text-[#18181B] hover:bg-[#EFEAE2]"
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </section>

          {/* 5. Link API (gateway) */}
          <section className="rounded-2xl border border-[#E2DDD5] bg-white p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-[#18181B]">5. Link API (Gateway)</h3>
              <p className="mt-1 text-xs text-[#52525B]">
                Endpoint OpenAI-compatible (<code className="font-mono">/v1/chat/completions</code>{" "}
                dan <code className="font-mono">/models</code>). Panggilan dilakukan dari server.
              </p>
            </div>

            <div>
              <label
                htmlFor="gateway-url-input"
                className="block text-sm font-semibold text-[#18181B]"
              >
                Base URL Gateway
              </label>
              <input
                id="gateway-url-input"
                type="url"
                placeholder="https://gateway-anda.example.com"
                value={gatewayBaseUrl}
                onChange={(e) => setGatewayBaseUrl(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#D6D0C6] bg-white px-3.5 py-2.5 font-mono text-xs text-[#18181B]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="gateway-key-input"
                  className="block text-sm font-semibold text-[#18181B]"
                >
                  API Key Gateway
                </label>
                {settings.hasGatewayApiKey && (
                  <button
                    type="button"
                    onClick={() => {
                      setClearGatewayKey(true);
                      setGatewayApiKeyInput("");
                    }}
                    className="text-xs font-semibold text-[#991B1B] underline"
                  >
                    Hapus key tersimpan
                  </button>
                )}
              </div>
              <input
                id="gateway-key-input"
                type="password"
                autoComplete="off"
                placeholder={
                  settings.hasGatewayApiKey
                    ? "Tersimpan (ketik nilai baru untuk mengganti)"
                    : "Masukkan API key gateway"
                }
                value={gatewayApiKeyInput}
                onChange={(e) => {
                  setClearGatewayKey(false);
                  setGatewayApiKeyInput(e.target.value);
                }}
                className="mt-1.5 w-full rounded-xl border border-[#D6D0C6] bg-white px-3.5 py-2.5 font-mono text-xs text-[#18181B]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={gatewayTesting}
                onClick={handleTestGateway}
                className="min-h-[44px] rounded-xl border border-[#1C1917] bg-[#1C1917] px-4 py-2 text-sm font-semibold text-white hover:bg-[#292524] disabled:opacity-60"
              >
                {gatewayTesting ? "Menguji..." : "Tes Koneksi"}
              </button>
              {lastGatewayModels.length > 0 && (
                <span className="text-xs font-medium text-[#52525B]">
                  Daftar model terakhir: {lastGatewayModels.length} model
                </span>
              )}
            </div>

            {gatewayFeedback && (
              <p
                className={`rounded-xl border px-3 py-2 text-xs font-medium ${
                  gatewayFeedback.type === "ok"
                    ? "border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]"
                    : "border-[#FCA5A5] bg-[#FEF2F2] text-[#991B1B]"
                }`}
              >
                {gatewayFeedback.text}
              </p>
            )}
          </section>

          {/* 6. Model Gemini — Login Google */}
          <section className="rounded-2xl border border-[#E2DDD5] bg-white p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-[#18181B]">
                6. Model Gemini — Login Google
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-[#3F3F46]">
                Gemini API tidak menyediakan login OAuth langsung di dalam aplikasi ini. Jadi
                &quot;login Google&quot; berarti kamu masuk ke Google AI Studio dengan akun Google
                milikmu sendiri, membuat API key Gemini di sana, lalu menempelkannya satu kali di
                kolom bawah ini.
              </p>
            </div>

            <div>
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#D6D0C6] bg-[#FAF8F5] px-4 py-2 text-sm font-semibold text-[#18181B] hover:bg-[#EFEAE2]"
              >
                <span>Buka Google AI Studio</span>
                <ExternalLinkIcon className="h-4 w-4" />
              </a>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="gemini-key-input"
                  className="block text-sm font-semibold text-[#18181B]"
                >
                  API Key Gemini
                </label>
                {settings.hasGeminiApiKey && (
                  <button
                    type="button"
                    onClick={() => {
                      setClearGeminiKey(true);
                      setGeminiApiKeyInput("");
                    }}
                    className="text-xs font-semibold text-[#991B1B] underline"
                  >
                    Hapus key tersimpan
                  </button>
                )}
              </div>
              <input
                id="gemini-key-input"
                type="password"
                autoComplete="off"
                placeholder={
                  settings.hasGeminiApiKey
                    ? "Tersimpan (ketik nilai baru untuk mengganti)"
                    : "Tempel API key Gemini dari Google AI Studio"
                }
                value={geminiApiKeyInput}
                onChange={(e) => {
                  setClearGeminiKey(false);
                  setGeminiApiKeyInput(e.target.value);
                }}
                className="mt-1.5 w-full rounded-xl border border-[#D6D0C6] bg-white px-3.5 py-2.5 font-mono text-xs text-[#18181B]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={geminiFetching}
                onClick={handleFetchGeminiModels}
                className="min-h-[44px] rounded-xl border border-[#1E3A8A] bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#172554] disabled:opacity-60"
              >
                {geminiFetching ? "Mengambil..." : "Ambil Daftar Model Gemini"}
              </button>
              {lastGeminiModels.length > 0 && (
                <span className="text-xs font-medium text-[#52525B]">
                  Daftar model terakhir: {lastGeminiModels.length} model
                </span>
              )}
            </div>

            {geminiFeedback && (
              <p
                className={`rounded-xl border px-3 py-2 text-xs font-medium ${
                  geminiFeedback.type === "ok"
                    ? "border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]"
                    : "border-[#FCA5A5] bg-[#FEF2F2] text-[#991B1B]"
                }`}
              >
                {geminiFeedback.text}
              </p>
            )}
          </section>

          {/* 7. Relay ke Muse Utama */}
          <section className="rounded-2xl border border-[#FDBA74] bg-[#FFF7ED] p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-[#18181B]">
                  7. Relay ke Muse Utama
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-[#3F3F46]">
                  Sambungan manual berbasis kode 8 karakter sekali pakai (berlaku 30 menit), bukan
                  koneksi otomatis yang selalu menyala. Saat aktif, giliran kursi Muse menjadi
                  permintaan pending untuk dijawab agen Muse utamamu di chat utama.
                </p>
              </div>
              <span
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                  relayState.enabled
                    ? "bg-[#C2410C] text-white"
                    : "bg-white text-[#3F3F46] border border-[#D6D0C6]"
                }`}
              >
                {relayState.enabled ? "Relay Aktif" : "Relay Nonaktif"}
              </span>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                disabled={relayBusy}
                onClick={() => handleToggleRelay(!relayState.enabled)}
                className="min-h-[44px] rounded-xl border border-[#D6D0C6] bg-white px-4 py-2 text-sm font-semibold text-[#18181B] hover:bg-[#FAF8F5]"
              >
                {relayState.enabled ? "Nonaktifkan Relay" : "Aktifkan Relay"}
              </button>

              <button
                type="button"
                disabled={relayBusy}
                onClick={handleGenerateRelayCode}
                className="min-h-[44px] rounded-xl bg-[#C2410C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#9A3412]"
              >
                Buat Kode Relay
              </button>

              {relayState.enabled && (
                <button
                  type="button"
                  disabled={relayBusy}
                  onClick={() => handleToggleRelay(false)}
                  className="min-h-[44px] rounded-xl border border-[#FCA5A5] bg-white px-4 py-2 text-sm font-semibold text-[#991B1B] hover:bg-[#FEF2F2]"
                >
                  Matikan Relay
                </button>
              )}
            </div>

            {freshRelayCode && (
              <div className="rounded-xl border border-[#EA580C] bg-white p-4 space-y-2">
                <p className="text-xs font-bold text-[#9A3412]">
                  Kode Relay Baru (hanya ditampilkan satu kali, berlaku 30 menit):
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <code className="rounded-lg bg-[#1C1917] px-3.5 py-2 font-mono text-lg font-bold tracking-widest text-white">
                    {freshRelayCode.code}
                  </code>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(freshRelayCode.code)}
                    className="min-h-[44px] rounded-lg border border-[#D6D0C6] px-3.5 py-2 text-xs font-semibold text-[#18181B] hover:bg-[#F6F4F0]"
                  >
                    Salin Kode
                  </button>
                </div>
                <p className="text-[11px] text-[#52525B]">
                  Endpoint agen utama: <code className="font-mono">GET /api/relay/pending?code={freshRelayCode.code}</code>{" "}
                  dan <code className="font-mono">POST /api/relay/answer</code>.
                </p>
              </div>
            )}

            {relayFeedback && (
              <p className="text-xs font-medium text-[#9A3412]">{relayFeedback}</p>
            )}
          </section>

          {/* 8. Bersihkan Chat */}
          <section className="rounded-2xl border border-[#FCA5A5] bg-[#FEF2F2] p-5 space-y-3">
            <h3 className="text-base font-bold text-[#991B1B]">8. Bersihkan Chat</h3>
            <p className="text-xs text-[#7F1D1D]">
              Menghapus seluruh pesan dan riwayat pipeline. Pengaturan profil, API key, dan daftar
              model tiap kursi tidak ikut terhapus.
            </p>

            {!confirmClear ? (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="min-h-[44px] rounded-xl border border-[#DC2626] bg-white px-4 py-2 text-sm font-semibold text-[#991B1B] hover:bg-[#FEE2E2]"
              >
                Bersihkan Chat
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={clearing}
                  onClick={handleClearChat}
                  className="min-h-[44px] rounded-xl bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#991B1B]"
                >
                  {clearing ? "Membersihkan..." : "Ya, Hapus Semua Pesan"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="min-h-[44px] rounded-xl border border-[#D6D0C6] bg-white px-4 py-2 text-sm font-semibold text-[#18181B]"
                >
                  Batal
                </button>
              </div>
            )}
          </section>
        </form>

        <div className="border-t border-[#E2DDD5] bg-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {saveMessage && (
              <p
                className={`text-xs font-semibold ${
                  saveMessage.type === "ok" ? "text-[#065F46]" : "text-[#991B1B]"
                }`}
              >
                {saveMessage.text}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-xl border border-[#D6D0C6] bg-white px-4 py-2 text-sm font-semibold text-[#18181B] hover:bg-[#F6F4F0]"
            >
              Tutup
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveSettings}
              className="min-h-[44px] rounded-xl bg-[#C2410C] px-5 py-2 text-sm font-semibold text-white hover:bg-[#9A3412] disabled:opacity-60"
            >
              {saving ? "Menyimpan..." : "Simpan Pengaturan"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
