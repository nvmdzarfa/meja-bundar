import { NextResponse } from "next/server";
import { handleProgressQuery } from "@/lib/chat-engine";
import { readDb, toPublicSettings } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    const message = await handleProgressQuery();
    const db = await readDb();
    return NextResponse.json({
      ok: true,
      message,
      state: {
        messages: db.messages,
        typing: db.typing,
        latestPipeline: db.pipelineRuns.at(-1) ?? null,
        seats: db.seats,
        settings: toPublicSettings(db.settings),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal menanyakan progres." },
      { status: 500 }
    );
  }
}
