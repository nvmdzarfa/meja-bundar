import React from "react";
import { LandingView } from "@/components/LandingView";
import { readDb, toPublicSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const db = await readDb();
  return (
    <LandingView
      initialSettings={toPublicSettings(db.settings)}
      initialSeats={db.seats}
    />
  );
}
