import React from "react";
import { ChatWorkspace } from "@/components/ChatWorkspace";
import { expireTimedOutRelayRequests } from "@/lib/relay";
import { readDb, toPublicSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  await expireTimedOutRelayRequests();
  const db = await readDb();

  return (
    <ChatWorkspace
      initialSettings={toPublicSettings(db.settings)}
      initialSeats={db.seats}
      initialMessages={db.messages}
      initialTyping={db.typing}
      initialPipeline={db.pipelineRuns.at(-1) ?? null}
    />
  );
}
