import { NextResponse } from "next/server";
import { handleUserMessage } from "@/lib/chat-engine";
import { readDb, toPublicSettings } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: string; awaitCompletion?: boolean };
    const text = body.text?.trim() ?? "";
    if (!text) {
      return NextResponse.json({ error: "Pesan tidak boleh kosong." }, { status: 400 });
    }

    const shouldAwait = Boolean(body.awaitCompletion) || Boolean(process.env.VERCEL);
    const result = await handleUserMessage(text, {
      awaitCompletion: shouldAwait,
    });
    const db = await readDb();

    return NextResponse.json({
      ok: true,
      ...result,
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
      { error: err instanceof Error ? err.message : "Gagal mengirim pesan." },
      { status: 400 }
    );
  }
}
