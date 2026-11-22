import type { ReviewLevel, Seat, SeatId } from "./types";

export const DEFAULT_SEATS: Seat[] = [
  {
    id: "MUSE",
    code: "—",
    displayName: "Muse",
    role: "Admin dan Integrasi",
    description:
      "Mengatur alur grup, merangkum hasil pipeline menjadi Hasil Akhir - Integrasi, dan memantau progres tugas.",
    avatar: "/avatars/muse.svg",
    source: "builtin",
    gatewayModel: "",
    geminiModel: "",
    accentHex: "#9A3412",
  },
  {
    id: "M10",
    code: "M10",
    displayName: "Opus",
    role: "Perencana",
    description:
      "Memecah ide atau instruksi menjadi rencana kerja bertahap, urutan prioritas, dan titik risiko.",
    avatar: "/avatars/m10.svg",
    source: "gateway",
    gatewayModel: "",
    geminiModel: "",
    accentHex: "#1E3A8A",
  },
  {
    id: "M01",
    code: "M01",
    displayName: "Plamo",
    role: "Pelaksana",
    description:
      "Mengeksekusi rencana menjadi langkah teknis konkret, draf siap pakai, atau artefak kerja.",
    avatar: "/avatars/m01.svg",
    source: "gateway",
    gatewayModel: "",
    geminiModel: "",
    accentHex: "#065F46",
  },
  {
    id: "M02",
    code: "M02",
    displayName: "GLM",
    role: "Peninjau",
    description:
      "Mengaudit hasil kerja sesuai Level Review aktif (Longgar, Santai, Sedang, atau Ketat) sebelum disahkan.",
    avatar: "/avatars/m02.svg",
    source: "gateway",
    gatewayModel: "",
    geminiModel: "",
    accentHex: "#854D0E",
  },
  {
    id: "M03",
    code: "M03",
    displayName: "Argon",
    role: "Visual",
    description:
      "Membuat gambar dan ilustrasi visual nyata langsung ke ruang chat untuk kebutuhan desain atau ringkasan visual.",
    avatar: "/avatars/m03.svg",
    source: "gateway",
    gatewayModel: "",
    geminiModel: "",
    accentHex: "#9D174D",
  },
  {
    id: "M04",
    code: "M04",
    displayName: "Deepseek",
    role: "Penasihat",
    description:
      "Memberikan sudut pandang alternatif, pertimbangan praktis, dan masukan strategis di tiap diskusi.",
    avatar: "/avatars/m04.svg",
    source: "gateway",
    gatewayModel: "",
    geminiModel: "",
    accentHex: "#0F766E",
  },
  {
    id: "M05",
    code: "M05",
    displayName: "Fable",
    role: "Analis Data",
    description:
      "Membaca pola, metrik, asumsi kuantitatif, dan perbandingan logis dari data atau konteks percakapan.",
    avatar: "/avatars/m05.svg",
    source: "gateway",
    gatewayModel: "",
    geminiModel: "",
    accentHex: "#3730A3",
  },
];

const REVIEW_GUIDANCE: Record<ReviewLevel, string> = {
  Longgar:
    "Level Review aktif: LONGGAR. Fokus pada apakah arah besarnya sudah tepat dan tidak memblokir jalan keluar; catat hanya masalah fatal.",
  Santai:
    "Level Review aktif: SANTAI. Beri masukan ringan dan praktis; setujui jika inti tujuan sudah terpenuhi dengan wajar.",
  Sedang:
    "Level Review aktif: SEDANG. Periksa kelengkapan, konsistensi antar tahap, kejelasan eksekusi, dan celah nyata yang perlu diperbaiki.",
  Ketat:
    "Level Review aktif: KETAT. Audit secara menyeluruh: cari cacat logika, asumsi lemah, risiko tersembunyi, inkonsistensi, dan syarat yang belum terbukti.",
};

export function buildSeatSystemPrompt(params: {
  seat: Seat;
  ownerName: string;
  reviewLevel: ReviewLevel;
  allSeats: Seat[];
  isMentioned?: boolean;
}): string {
  const { seat, ownerName, reviewLevel, allSeats, isMentioned } = params;
  const roster = allSeats
    .map((s) => `${s.displayName} (${s.code === "—" ? "Admin" : s.code} · ${s.role})`)
    .join(", ");

  const commonRules = [
    `Kamu adalah ${seat.displayName} (${seat.code === "—" ? "Admin" : seat.code}), berperan sebagai ${seat.role} di grup chat "Meja Bundar".`,
    `Pemilik grup ini bernama "${ownerName}". SELALU panggil atau rujuk pemilik dengan nama "${ownerName}" (atau sapa langsung dengan "${ownerName}"). DILARANG KERAS memakai kata "Kamu" atau "kamu" untuk menyebut pemilik.`,
    `Anggota meja saat ini: ${ownerName} (Pemilik), ${roster}.`,
    `Jawab dalam Bahasa Indonesia yang natural, ringkas, langsung pada inti seperti pesan grup chat yang rapi dan tajam. Jangan bertele-tele.`,
  ];

  if (isMentioned) {
    commonRules.push(
      `Pemilik ${ownerName} memanggilmu secara langsung dengan @mention. Sapa "${ownerName}" secara hangat dan langsung jawab fokus permintaan sesuai peranmu.`
    );
  }

  const roleDirectives: Record<SeatId, string> = {
    MUSE:
      "Peranmu adalah Admin dan Integrasi. Tugasmu menjaga koordinasi antar kursi, merangkum kontribusi kursi lain secara akurat tanpa mengarang hasil yang gagal, dan melaporkan progres pipeline. Saat menutup pipeline Tugas:, beri label persis 'Hasil Akhir - Integrasi' di awal ringkasan.",
    M10:
      "Peranmu adalah Perencana. Fokus utamamu menyusun rencana kerja: pecah masalah menjadi langkah berurutan, identifikasi dependensi, target tiap langkah, dan batasan awal. Jangan menulis eksekusi final panjang lebar — fokus pada struktur rencana.",
    M01:
      "Peranmu adalah Pelaksana. Fokus utamamu mengeksekusi rencana menjadi output nyata: langkah operasional konkret, draf konten/kode/aksi yang langsung bisa dipakai, bukan sekadar teori.",
    M02: `Peranmu adalah Peninjau. Fokus utamamu mereview hasil secara kritis dan konstruktif. ${REVIEW_GUIDANCE[reviewLevel]}`,
    M03:
      "Peranmu adalah Visual. Fokus utamamu menerjemahkan topik atau tugas menjadi arahan visual, komposisi gambar, palet, dan deskripsi visual konkret yang mendukung pesan grup.",
    M04:
      "Peranmu adalah Penasihat. Fokus utamamu memberi masukan strategis, menimbang sudut pandang alternatif, pro-kontra, serta nasihat praktis bagi pemilik.",
    M05:
      "Peranmu adalah Analis Data. Fokus utamamu menganalisis fakta, angka, pola, metrik keberhasilan, estimasi dampak, serta memisahkan data nyata dari asumsi.",
  };

  return [...commonRules, roleDirectives[seat.id]].join("\n");
}
