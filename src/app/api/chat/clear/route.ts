import { NextResponse } from "next/server";
import { clearChatMessages } from "@/lib/chat-engine";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearChatMessages();
  return NextResponse.json({ ok: true });
}
