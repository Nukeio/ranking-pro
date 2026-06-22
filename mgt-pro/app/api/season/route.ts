import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

// GET /api/season  → returns current season info for the countdown timer
export async function GET() {
  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ season: null });
  }

  const { data } = await supabase
    .from("seasons")
    .select("number, label, duration_days, ends_at, rewards, starts_at")
    .eq("is_current", true)
    .maybeSingle();

  return NextResponse.json({ season: data ?? null });
}

// POST /api/season  → called by sync script, upserts season, auto-rolls over
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.INGEST_SECRET}`;

  if (!process.env.INGEST_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service role not configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const { season_number, label, duration_days, rewards } = body ?? {};

  if (!season_number) {
    return NextResponse.json({ error: "season_number is required" }, { status: 400 });
  }

  const seasonLabel = label ?? `Season ${season_number}`;

  // Check if the current season is different from what the game reports
  const { data: currentSeason } = await supabase
    .from("seasons")
    .select("id, number")
    .eq("is_current", true)
    .maybeSingle();

  if (currentSeason && currentSeason.number !== season_number) {
    // Season rolled over — archive the old one
    console.log(`Season rollover: ${currentSeason.number} → ${season_number}`);
    await supabase
      .from("seasons")
      .update({ is_current: false, ends_at: new Date().toISOString() })
      .eq("id", currentSeason.id);
  }

  // Upsert the new/current season
  const { data: existing } = await supabase
    .from("seasons")
    .select("id")
    .eq("number", season_number)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("seasons")
      .update({
        is_current: true,
        label: seasonLabel,
        ...(duration_days != null && { duration_days }),
        ...(rewards != null && { rewards }),
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("seasons").insert({
      number: season_number,
      label: seasonLabel,
      is_current: true,
      starts_at: new Date().toISOString(),
      ...(duration_days != null && { duration_days }),
      ...(rewards != null && { rewards }),
    });
  }

  return NextResponse.json({ ok: true, season_number, label: seasonLabel });
}
