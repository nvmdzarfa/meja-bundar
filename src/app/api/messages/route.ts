import { NextResponse } from "next/server";
import { expireTimedOutRelayRequests } from "@/lib/relay";
import { readDb, toPublicSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  await expireTimedOutRelayRequests();
  const db = await readDb();
  return NextResponse.json({
    messages: db.messages,
    typing: db.typing,
    latestPipeline: db.pipelineRuns.at(-1) ?? null,
    seats: db.seats,
    settings: toPublicSettings(db.settings),
  });
}
