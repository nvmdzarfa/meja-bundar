"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import type { PublicSettings, Seat } from "@/lib/types";
import { CheckCircleIcon } from "./Icons";

interface LandingViewProps {
  initialSettings: PublicSettings;
  initialSeats: Seat[];
}

const SEAT_CARD_THEMES: Record<
  string,
  { surface: string; border: string; badgeBg: string; badgeText: string }
> = {
  MUSE: {
    surface: "bg-[#FFF7ED]",
    border: "border-[#FDBA74]",
    badgeBg: "bg-[#9A3412]",
    badgeText: "text-white",
  },
  M10: {
    surface: "bg-[#EFF6FF]",
    border: "border-[#BFDBFE]",
    badgeBg: "bg-[#1E3A8A]",
    badgeText: "text-white",
  },
  M01: {
    surface: "bg-[#ECFDF5]",
    border: "border-[#A7F3D0]",
    badgeBg: "bg-[#065F46]",
    badgeText: "text-white",
  },
  M02: {
    surface: "bg-[#FEFCE8]",
    border: "border-[#FDE047]",
    badgeBg: "bg-[#854D0E]",
    badgeText: "text-white",
  },
  M03: {
    surface: "bg-[#FDF2F8]",
    border: "border-[#FBCFE8]",
    badgeBg: "bg-[#9D174D]",
    badgeText: "text-white",
  },
  M04: {
    surface: "bg-[#F0FDFA]",
    border: "border-[#99F6E4]",
    badgeBg: "bg-[#0F766E]",
    badgeText: "text-white",
  },
  M05: {
    surface: "bg-[#EEF2FF]",
    border: "border-[#C7D2FE]",
    badgeBg: "bg-[#3730A3]",
    badgeText: "text-white",
  },
};

export function LandingView({ initialSettings, initialSeats }: LandingViewProps) {
  const [settings, setSettings] = useState<PublicSettings>(initialSettings);
  const [seats, setSeats] = useState<Seat[]>(initialSeats);
  const [previewPaused, setPreviewPaused] = useState(false);
  const [previewStep, setPreviewStep] = useState(4);

  useEffect(() => {
    let active = true;
    fetch("/api/settings", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { settings?: PublicSettings; seats?: Seat[] } | null) => {
        if (!active || !data) return;
        if (data.settings) setSettings(data.settings);
        if (data.seats) setSeats(data.seats);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (previewPaused) return;
    const timer = window.setInterval(() => {
      setPreviewStep((prev) => (prev >= 5 ? 1 : prev + 1));
    }, 3200);
    return () => window.clearInterval(timer);
  }, [previewPaused]);

  const seatById = Object.fromEntries(seats.map((s) => [s.id, s])) as Record<string, Seat>;
  const muse = seatById.MUSE ?? seats[0];
  const m10 = seatById.M10 ?? seats[1];
  const m01 = seatById.M01 ?? seats[2];
  const m02 = seatById.M02 ?? seats[3];
  const m03 = seatById.M03 ?? seats[4];
  const m04 = seatById.M04 ?? seats[5];
  const m05 = seatById.M05 ?? seats[6];

  const previewMessages = [
    {
      step: 1,
      sender: "Pemilik",
      role: "Ketua Meja",
      isOwner: true,
      text: "Tugas: Siapkan peluncuran menu kopi dingin minggu ini.",
      source: null,
    },
    {
      step: 2,
      sender: m10?.displayName ?? "Opus",
      role: m10?.role ?? "Perencana",
      isOwner: false,
      text: "Rencana 3 hari: hari 1 uji resep & harga, hari 2 materi visual, hari 3 promo pembuka.",
      source: "via Link API (gateway) · model rencana",
    },
    {
      step: 3,
      sender: m01?.displayName ?? "Plamo",
      role: m01?.role ?? "Pelaksana",
      isOwner: false,
      text: "Draf pesan pengumuman & daftar tugas harian siap dipakai tim kedai.",
      source: "via Gemini (login Google) · gemini-3.8-flash",
    },
    {
      step: 4,
      sender: m03?.displayName ?? "Argon",
      role: m03?.role ?? "Visual",
      isOwner: false,
      text: "Poster promo kopi dingin dibuat dan dikirim ke ruang chat.",
      source: "via Link API (gateway) · model visual",
    },
    {
      step: 5,
      sender: muse?.displayName ?? "Muse",
      role: muse?.role ?? "Admin dan Integrasi",
      isOwner: false,
      text: "Hasil Akhir - Integrasi: rencana, eksekusi, visual, dan review selesai.",
      source: "via Gemini (login Google) · model integrasi",
    },
  ];

  const visiblePreview = previewMessages.slice(0, previewStep);
  const nextTypingSeat =
    previewStep === 1
      ? m10?.displayName ?? "Opus"
      : previewStep === 2
        ? m01?.displayName ?? "Plamo"
        : previewStep === 3
          ? m03?.displayName ?? "Argon"
          : previewStep === 4
            ? muse?.displayName ?? "Muse"
            : null;

  const pipelineSteps = [
    {
      num: "01",
      seat: m10?.displayName ?? "Opus",
      role: m10?.role ?? "Perencana",
      detail: "Memecah instruksi Tugas: menjadi urutan langkah, dependensi, dan target nyata.",
    },
    {
      num: "02",
      seat: m01?.displayName ?? "Plamo",
      role: m01?.role ?? "Pelaksana",
      detail: "Mengeksekusi rencana sebelumnya menjadi draf kerja atau langkah operasional.",
    },
    {
      num: "03",
      seat: m04?.displayName ?? "Deepseek",
      role: m04?.role ?? "Penasihat",
      detail: "Meninjau risiko praktis dan memberi masukan alternatif sebelum visual dibuat.",
    },
    {
      num: "04",
      seat: m03?.displayName ?? "Argon",
      role: m03?.role ?? "Visual",
      detail: "Membuat gambar nyata dan mengirimkannya langsung sebagai lampiran gambar di chat.",
    },
    {
      num: "05",
      seat: m02?.displayName ?? "GLM",
      role: m02?.role ?? "Peninjau",
      detail: `Mengaudit seluruh hasil tahap 1 sampai 4 sesuai Level Review aktif (${settings.reviewLevel}).`,
    },
    {
      num: "06",
      seat: muse?.displayName ?? "Muse",
      role: muse?.role ?? "Admin dan Integrasi",
      detail: "Menyusun ringkasan penutup berlabel persis Hasil Akhir - Integrasi.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#F6F4F0] text-[#18181B]">
      <a
        href="#konten-utama"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-[#1C1917] focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white"
      >
        Langsung ke konten utama
      </a>

      <header className="sticky top-0 z-30 border-b border-[#E2DDD5] bg-[#F6F4F0]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 min-h-[44px]">
            <img
              src="/icon.svg"
              alt="Logo Meja Bundar"
              width={36}
              height={36}
              className="h-9 w-9 rounded-xl shrink-0"
            />
            <span className="text-lg font-bold tracking-tight text-[#18181B]">
              Meja Bundar
            </span>
          </Link>

          <nav
            aria-label="Navigasi beranda"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-[#3F3F46]"
          >
            <a href="#kursi" className="inline-flex min-h-[44px] items-center hover:text-[#18181B] py-2">
              Kursi
            </a>
            <a href="#cara-kerja" className="inline-flex min-h-[44px] items-center hover:text-[#18181B] py-2">
              Cara Kerja
            </a>
            <a href="#sumber-model" className="inline-flex min-h-[44px] items-center hover:text-[#18181B] py-2">
              Sumber Model
            </a>
          </nav>

          <Link
            href="/chat"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#C2410C] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#9A3412] active:scale-[0.99]"
          >
            Masuk ke Grup Chat
          </Link>
        </div>
      </header>

      <main id="konten-utama">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pt-8 pb-12 sm:px-6 lg:pt-12 lg:pb-16">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-6 space-y-6">
              <h1 className="text-3xl font-extrabold tracking-tight text-[#18181B] sm:text-5xl sm:leading-[1.12]">
                Tujuh AI. Satu meja. Kendali penuh di tanganmu.
              </h1>

              <p className="max-w-xl text-base leading-relaxed text-[#3F3F46] sm:text-lg">
                Meja Bundar menyatukan tujuh kursi AI dengan peran berbeda ke dalam satu grup
                chat yang terasa seperti WhatsApp. Ajak semua berdiskusi, panggil satu kursi
                dengan @mention, jalankan pipeline tugas enam tahap, atau minta gambar
                langsung dari ruang obrolan.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/chat"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-[#C2410C] px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[#9A3412] active:scale-[0.99]"
                >
                  Masuk ke Grup Chat
                </Link>
                <a
                  href="#sumber-model"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-[#D6D0C6] bg-white px-5 py-3 text-base font-semibold text-[#18181B] transition hover:border-[#A8A29E] hover:bg-[#FAF8F5]"
                >
                  Lihat Sumber Model
                </a>
              </div>

              {/* Group avatar + 8/8 presence bar */}
              <div className="rounded-2xl border border-[#E2DDD5] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#EFEAE2]">
                  <div className="flex items-center gap-3">
                    <img
                      src={settings.groupAvatar}
                      alt="Foto grup Meja Bundar"
                      width={44}
                      height={44}
                      fetchPriority="high"
                      className="h-11 w-11 rounded-xl object-cover border border-[#E2DDD5]"
                    />
                    <div>
                      <p className="text-sm font-bold text-[#18181B]">Grup Meja Bundar</p>
                      <p className="text-xs font-medium text-[#52525B]">
                        Pemilik Meja · Admin {muse?.displayName ?? "Muse"}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#ECFDF5] px-2.5 py-1 text-xs font-semibold text-[#065F46] border border-[#A7F3D0]">
                    <span className="h-2 w-2 rounded-full bg-[#059669]" aria-hidden="true" />
                    Hadir 8/8
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 rounded-lg bg-[#FFF3E8] px-2 py-1 border border-[#F3D5BD]">
                    <img
                      src={settings.ownerAvatar}
                      alt="Avatar Pemilik"
                      width={24}
                      height={24}
                      className="h-6 w-6 rounded-md object-cover"
                    />
                    <span className="text-xs font-semibold text-[#18181B]">Pemilik</span>
                  </div>
                  {seats.map((seat) => (
                    <div
                      key={seat.id}
                      className="flex items-center gap-1.5 rounded-lg bg-[#F6F4F0] px-2 py-1 border border-[#E2DDD5]"
                    >
                      <img
                        src={seat.avatar}
                        alt={`Avatar ${seat.displayName}`}
                        width={24}
                        height={24}
                        className="h-6 w-6 rounded-md object-cover"
                      />
                      <span className="text-xs font-medium text-[#27272A]">
                        {seat.displayName}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Live WhatsApp-style preview */}
            <div className="lg:col-span-6">
              <div className="overflow-hidden rounded-2xl border border-[#D6D0C6] bg-[#EFEAE2] shadow-sm">
                <div className="flex items-center justify-between gap-2 bg-[#1C1917] px-4 py-3 text-white">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={settings.groupAvatar}
                      alt=""
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-lg object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#FAF8F5]">Meja Bundar</p>
                      <p className="truncate text-xs text-[#D6D3D1]">
                        Pratinjau Alur Tugas · Hadir 8/8
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewPaused((p) => !p)}
                    className="min-h-[44px] rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
                  >
                    {previewPaused ? "Lanjut" : "Jeda"}
                  </button>
                </div>

                <div className="space-y-3 p-4 min-h-[360px]">
                  {visiblePreview.map((item) => (
                    <div
                      key={item.step}
                      className={`flex ${item.isOwner ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 border ${
                          item.isOwner
                            ? "bg-[#FFF3E8] border-[#F3D5BD] text-[#18181B]"
                            : "bg-white border-[#E2DDD5] text-[#18181B]"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#52525B]">
                          <span className="text-[#18181B]">{item.sender}</span>
                          <span>·</span>
                          <span>{item.role}</span>
                        </div>
                        <p className="mt-1 text-sm leading-snug">{item.text}</p>
                        {item.source && (
                          <p className="mt-1.5 text-[11px] font-medium text-[#52525B]">
                            {item.source}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}

                  {nextTypingSeat && (
                    <div className="flex justify-start">
                      <div className="inline-flex items-center gap-2 rounded-2xl border border-[#E2DDD5] bg-white px-3.5 py-2 text-xs font-medium text-[#52525B]">
                        <span>{nextTypingSeat} sedang mengetik</span>
                        <span className="inline-flex items-center gap-1" aria-hidden="true">
                          <span className="typing-dot-1 h-1.5 w-1.5 rounded-full bg-[#EA580C]" />
                          <span className="typing-dot-2 h-1.5 w-1.5 rounded-full bg-[#EA580C]" />
                          <span className="typing-dot-3 h-1.5 w-1.5 rounded-full bg-[#EA580C]" />
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E2DDD5] bg-[#FAF8F5] px-4 py-2 text-xs text-[#52525B]">
                  <span>Tahap pratinjau {previewStep}/5</span>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-label={`Lihat tahap pratinjau ${n}`}
                        onClick={() => {
                          setPreviewPaused(true);
                          setPreviewStep(n);
                        }}
                        className={`min-h-[44px] min-w-[36px] sm:min-w-[44px] rounded-lg px-2.5 text-xs font-semibold transition ${
                          previewStep === n
                            ? "bg-[#C2410C] text-white"
                            : "bg-[#EFEAE2] text-[#3F3F46] hover:bg-[#E2DDD5]"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Architecture stats strip */}
        <section aria-label="Ringkasan struktur" className="border-y border-[#E2DDD5] bg-white">
          <div className="mx-auto grid max-w-6xl grid-cols-1 divide-y divide-[#E2DDD5] sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
            <div className="px-6 py-5">
              <p className="font-mono text-2xl font-bold text-[#18181B]">7 Kursi AI</p>
              <p className="mt-1 text-sm text-[#52525B]">
                Satu admin integrasi plus enam peran spesialis dalam satu grup.
              </p>
            </div>
            <div className="px-6 py-5">
              <p className="font-mono text-2xl font-bold text-[#18181B]">6 Langkah Pipeline</p>
              <p className="mt-1 text-sm text-[#52525B]">
                Urutan kerja Tugas: dari Perencana sampai Hasil Akhir - Integrasi.
              </p>
            </div>
            <div className="px-6 py-5">
              <p className="font-mono text-2xl font-bold text-[#18181B]">3 Sumber Model</p>
              <p className="mt-1 text-sm text-[#52525B]">
                Muse bawaan, Gemini via Google AI Studio, dan Link API gateway.
              </p>
            </div>
          </div>
        </section>

        {/* Seats Introduction */}
        <section id="kursi" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight text-[#18181B] sm:text-3xl">
              Susunan delapan kursi di meja
            </h2>
            <p className="mt-2 text-base text-[#52525B]">
              Kode kursi dan peran bersifat tetap agar pembagian kerja konsisten. Nama tampil
              setiap kursi bisa kamu sesuaikan kapan saja di panel pengaturan.
            </p>
          </div>

          {/* Owner + 8th Seat Spotlight */}
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="flex items-center gap-4 rounded-2xl border border-[#F3D5BD] bg-[#FFF3E8] p-5">
              <img
                src={settings.ownerAvatar}
                alt="Foto Pemilik Meja"
                width={56}
                height={56}
                className="h-14 w-14 rounded-2xl object-cover shrink-0 border border-[#E2DDD5]"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-[#1C1917] px-2 py-0.5 font-mono text-xs font-semibold text-white">
                    PEMILIK
                  </span>
                  <span className="text-xs font-semibold text-[#065F46]">Online</span>
                </div>
                <h3 className="mt-1.5 truncate text-lg font-bold text-[#18181B]">
                  Ketua Meja (Kamu)
                </h3>
                <p className="mt-0.5 text-sm text-[#3F3F46]">
                  Pemegang kendali grup, pengarah tugas, dan penentu sumber model tiap kursi.
                </p>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-2xl border border-[#1C1917] bg-[#1C1917] p-5 text-white">
              <div>
                <h3 className="text-lg font-bold text-[#FAF8F5]">
                  Kursi ke-8 adalah Pemilik
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[#D6D3D1]">
                  Tujuh kursi AI bekerja bergiliran atau berurutan, sementara keputusan akhir,
                  kredensial API, dan arah diskusi tetap berada di tanganmu. Nama panggilan
                  pemilik bisa disesuaikan kapan saja di Pengaturan.
                </p>
              </div>
              <div className="mt-4">
                <Link
                  href="/chat"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#FB923C] px-4 py-2 text-sm font-bold text-[#18181B] transition hover:bg-[#FDBA74]"
                >
                  Pimpin Meja Sekarang
                </Link>
              </div>
            </div>
          </div>

          {/* 7 AI Seat Cards */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {seats.map((seat) => {
              const theme = SEAT_CARD_THEMES[seat.id] ?? SEAT_CARD_THEMES.M10;
              return (
                <article
                  key={seat.id}
                  className={`rounded-2xl border ${theme.border} ${theme.surface} p-5 flex flex-col justify-between`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={seat.avatar}
                          alt={`Avatar ${seat.displayName}`}
                          width={48}
                          height={48}
                          className="h-12 w-12 rounded-xl object-cover shrink-0 border border-black/10"
                        />
                        <div className="min-w-0">
                          <h3 className="truncate text-lg font-bold text-[#18181B]">
                            {seat.displayName}
                          </h3>
                          <span
                            className={`mt-1 inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${theme.badgeBg} ${theme.badgeText}`}
                          >
                            {seat.role}
                          </span>
                        </div>
                      </div>
                      <span className="rounded-md border border-black/15 bg-white px-2 py-1 font-mono text-xs font-semibold text-[#18181B]">
                        {seat.code}
                      </span>
                    </div>

                    <p className="mt-4 text-sm leading-relaxed text-[#27272A]">
                      {seat.description}
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between pt-3 border-t border-black/10 text-xs font-medium text-[#3F3F46]">
                    <span className="inline-flex items-center gap-1.5 text-[#065F46] font-semibold">
                      <span className="h-2 w-2 rounded-full bg-[#059669]" aria-hidden="true" />
                      Online
                    </span>
                    <span>
                      {seat.id === "MUSE" && settings.relay.enabled
                        ? "Jalur: Relay Muse utama"
                        : seat.source === "gemini"
                          ? `Sumber: Gemini${seat.geminiModel ? ` (${seat.geminiModel})` : ""}`
                          : seat.source === "gateway"
                            ? `Sumber: Gateway${seat.gatewayModel ? ` (${seat.gatewayModel})` : ""}`
                            : "Jalur: Koordinator bawaan"}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* How It Works: 6-step pipeline + 4 modes */}
        <section
          id="cara-kerja"
          className="border-y border-[#E2DDD5] bg-white py-14"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid gap-12 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <h2 className="text-2xl font-bold tracking-tight text-[#18181B] sm:text-3xl">
                  Cara kerjanya: pipeline 6 tahap
                </h2>
                <p className="mt-2 text-base text-[#52525B]">
                  Awali pesan dengan <code className="rounded bg-[#EFEAE2] px-1.5 py-0.5 font-mono text-sm">Tugas:</code> untuk menjalankan enam tahap berurutan. Setiap tahap membawa hasil tahap sebelumnya dan tidak mengarang hasil bila ada tahap yang gagal.
                </p>

                <ol className="mt-8 relative space-y-5 border-l-2 border-[#E2DDD5] pl-6">
                  {pipelineSteps.map((step) => (
                    <li key={step.num} className="relative">
                      <span
                        className="absolute -left-[37px] top-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-[#1C1917] font-mono text-xs font-bold text-white ring-4 ring-white"
                        aria-hidden="true"
                      >
                        {step.num}
                      </span>
                      <div className="rounded-xl border border-[#E2DDD5] bg-[#FAF8F5] p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-[#C2410C]">
                            Tahap {step.num}
                          </span>
                          <span className="text-sm font-bold text-[#18181B]">
                            {step.seat}
                          </span>
                          <span className="rounded bg-[#EFEAE2] px-2 py-0.5 text-xs font-medium text-[#3F3F46]">
                            {step.role}
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm text-[#3F3F46]">{step.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="lg:col-span-5 space-y-4">
                <h3 className="text-xl font-bold text-[#18181B]">
                  Empat mode kontrol di ruang chat
                </h3>
                <p className="text-sm text-[#52525B]">
                  Selain pipeline penuh, kamu bisa memilih cara berinteraksi sesuai kebutuhan.
                </p>

                <div className="space-y-3 pt-2">
                  <div className="rounded-xl border border-[#E2DDD5] bg-[#F6F4F0] p-4">
                    <p className="font-mono text-xs font-semibold text-[#9D174D]">Gambar:</p>
                    <h4 className="mt-1 text-base font-bold text-[#18181B]">
                      Buat gambar langsung di chat
                    </h4>
                    <p className="mt-1 text-sm text-[#3F3F46]">
                      Pesan berawalan <code className="font-mono">Gambar:</code> memanggil kursi Visual ({m03?.displayName ?? "Argon"}) untuk menghasilkan file gambar sungguhan yang langsung tampil di gelembung chat.
                    </p>
                  </div>

                  <div className="rounded-xl border border-[#E2DDD5] bg-[#F6F4F0] p-4">
                    <p className="font-mono text-xs font-semibold text-[#1E3A8A]">@mention</p>
                    <h4 className="mt-1 text-base font-bold text-[#18181B]">
                      Panggil satu kursi tertentu
                    </h4>
                    <p className="mt-1 text-sm text-[#3F3F46]">
                      Tulis <code className="font-mono">@{m10?.displayName ?? "Opus"}</code> atau <code className="font-mono">@M10</code> agar hanya kursi tersebut yang menjawab sesuai perannya.
                    </p>
                  </div>

                  <div className="rounded-xl border border-[#E2DDD5] bg-[#F6F4F0] p-4">
                    <p className="font-mono text-xs font-semibold text-[#065F46]">Diskusi Bergilir</p>
                    <h4 className="mt-1 text-base font-bold text-[#18181B]">
                      Semua kursi aktif atau Muse saja
                    </h4>
                    <p className="mt-1 text-sm text-[#3F3F46]">
                      Saat aktif, semua kursi yang sudah tersambung ke model AI membalas bergiliran. Saat nonaktif, hanya {muse?.displayName ?? "Muse"} yang merespons pesan biasa.
                    </p>
                  </div>

                  <div className="rounded-xl border border-[#E2DDD5] bg-[#F6F4F0] p-4">
                    <p className="font-mono text-xs font-semibold text-[#9A3412]">Tanya Progres</p>
                    <h4 className="mt-1 text-base font-bold text-[#18181B]">
                      Cek status tiap tahap tugas
                    </h4>
                    <p className="mt-1 text-sm text-[#3F3F46]">
                      Satu ketukan chip Tanya Progres meminta {muse?.displayName ?? "Muse"} melaporkan tahap mana yang selesai, sedang berjalan, gagal, atau belum dimulai.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Model Sources */}
        <section id="sumber-model" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight text-[#18181B] sm:text-3xl">
              Modelnya dari mana?
            </h2>
            <p className="mt-2 text-base text-[#52525B]">
              Tidak ada API key yang ditanam di kode dan tidak ada balasan template palsu yang
              menyamar sebagai AI. Setiap kursi hanya menjawab lewat model asli yang kamu pasang.
            </p>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            <div className="rounded-2xl border border-[#E2DDD5] bg-white p-6">
              <p className="font-mono text-xs font-semibold uppercase tracking-wide text-[#9A3412]">
                Jalur 1 · Khusus Muse
              </p>
              <h3 className="mt-2 text-xl font-bold text-[#18181B]">Koordinator & Integrasi</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#3F3F46]">
                Kursi {muse?.displayName ?? "Muse"} melacak progres dan menyusun rekap pipeline
                secara faktual, atau dapat dihubungkan ke Gemini, Link API Gateway, maupun Relay
                untuk ikut menjawab diskusi dengan AI sungguhan.
              </p>
            </div>

            <div className="rounded-2xl border border-[#E2DDD5] bg-white p-6">
              <p className="font-mono text-xs font-semibold uppercase tracking-wide text-[#1E3A8A]">
                Jalur 2 · Login Google
              </p>
              <h3 className="mt-2 text-xl font-bold text-[#18181B]">
                Gemini via Google AI Studio
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#3F3F46]">
                Gemini API tidak menyediakan login OAuth langsung di dalam web app. Pemilik login
                dengan akun Google di Google AI Studio, membuat API key sendiri, lalu menempelkannya
                sekali di Pengaturan untuk mengambil daftar model asli.
              </p>
            </div>

            <div className="rounded-2xl border border-[#E2DDD5] bg-white p-6">
              <p className="font-mono text-xs font-semibold uppercase tracking-wide text-[#065F46]">
                Jalur 3 · Gateway Sendiri
              </p>
              <h3 className="mt-2 text-xl font-bold text-[#18181B]">
                Link API (OpenAI-Compatible)
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#3F3F46]">
                Isi Base URL dan API key gateway milikmu di Pengaturan. Tombol Tes Koneksi mengambil
                daftar model asli dari <code className="font-mono">/models</code> dan memanggil{" "}
                <code className="font-mono">/v1/chat/completions</code> langsung dari sisi server.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-[#FDBA74] bg-[#FFF7ED] p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-3xl">
                <div className="flex items-center gap-2 text-sm font-bold text-[#9A3412]">
                  <CheckCircleIcon className="w-4 h-4 shrink-0" />
                  <span>Jalur Tambahan Khusus Muse: Relay ke Muse Utama</span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-[#3F3F46]">
                  Jika ingin kursi {muse?.displayName ?? "Muse"} dijawab oleh agen Muse utamamu di
                  luar aplikasi, aktifkan Relay di Pengaturan dan buat kode 8 karakter sekali pakai
                  (berlaku 30 menit). Ini sambungan manual berbasis kode, bukan koneksi otomatis yang
                  selalu menyala.
                </p>
              </div>
              <Link
                href="/chat"
                className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-[#EA580C] bg-white px-4 py-2 text-sm font-semibold text-[#9A3412] hover:bg-[#FFEDD5]"
              >
                Atur di Ruang Chat
              </Link>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="rounded-3xl bg-[#1C1917] px-6 py-10 text-white sm:px-10 sm:py-12 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <h2 className="text-2xl font-bold tracking-tight text-[#FAF8F5] sm:text-3xl">
                Siap memimpin meja bersama tujuh kursi AI?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#D6D3D1] sm:text-base">
                Masuk ke ruang chat, pasang API key Gemini atau gateway milikmu di Pengaturan, dan
                mulai diskusimu.
              </p>
            </div>
            <Link
              href="/chat"
              className="inline-flex min-h-[48px] shrink-0 items-center justify-center rounded-xl bg-[#FB923C] px-6 py-3 text-base font-bold text-[#18181B] transition hover:bg-[#FDBA74]"
            >
              Masuk ke Grup Chat
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E2DDD5] bg-[#F6F4F0] py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 text-xs text-[#52525B] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>Meja Bundar · Grup Chat Multi-AI</p>
          <p>Semua API key disimpan di server dalam keadaan ter-mask dan tidak pernah dikirim ke browser.</p>
        </div>
      </footer>
    </div>
  );
}
