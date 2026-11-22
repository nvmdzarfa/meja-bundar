import type { PipelineRun } from "../types";

export function formatPipelineProgressReport(
  ownerName: string,
  latestRun: PipelineRun | undefined
): string {
  if (!latestRun) {
    return `${ownerName}, belum ada pipeline Tugas: yang pernah dijalankan di sesi chat ini. Kirim pesan diawali "Tugas:" untuk memulai alur 6 tahap.`;
  }

  const statusText: Record<string, string> = {
    completed: "Selesai",
    running: "Sedang berjalan",
    failed: "Gagal",
    pending: "Belum dimulai",
  };

  const lines = latestRun.stages.map((s) => {
    const suffix = s.error ? ` (error: ${s.error.slice(0, 120)})` : "";
    return `${s.stage}. ${s.seatName} (${s.role}) — ${statusText[s.status] ?? s.status}${suffix}`;
  });

  return [
    `Laporan progres untuk ${ownerName} atas tugas: "${latestRun.prompt}" (Level Review: ${latestRun.reviewLevel})`,
    "",
    ...lines,
  ].join("\n");
}

export function formatPipelineIntegrationSummary(params: {
  ownerName: string;
  userPrompt: string;
  pipelineResults: Array<{
    stage: number;
    seatName: string;
    role: string;
    status: "completed" | "failed";
    output: string | null;
    error: string | null;
  }>;
}): string {
  const { ownerName, userPrompt, pipelineResults } = params;
  const completed = pipelineResults.filter((r) => r.status === "completed");
  const failed = pipelineResults.filter((r) => r.status === "failed");

  const summaryLines = pipelineResults.map((r) => {
    if (r.status === "failed") {
      return `- Tahap ${r.stage} (${r.seatName} · ${r.role}): GAGAL — ${r.error ?? "error tidak diketahui"}`;
    }
    const snippet = (r.output ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
    return `- Tahap ${r.stage} (${r.seatName} · ${r.role}): ${snippet || "Selesai"}`;
  });

  const footerNote =
    failed.length > 0
      ? `Catatan integrasi untuk ${ownerName}: ${completed.length}/5 tahap awal selesai dan ${failed.length} tahap gagal (detail error asli tetap ditampilkan pada masing-masing kursi).`
      : `Semua ${completed.length} tahap sebelum integrasi selesai dengan lengkap untuk ${ownerName}.`;

  return [
    "Hasil Akhir - Integrasi",
    "",
    `Ringkasan tugas "${userPrompt}":`,
    ...summaryLines,
    "",
    footerNote,
  ].join("\n");
}

