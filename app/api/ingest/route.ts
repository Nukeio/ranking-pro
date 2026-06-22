import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

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
  const players = body?.players;

  if (!Array.isArray(players) || players.length === 0) {
    return NextResponse.json({ error: "Expected a non-empty players[] array" }, { status: 400 });
  }

  const { data: season } = await supabase
    .from("seasons")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();

  if (!season) {
    return NextResponse.json({ error: "No current season set in the seasons table" }, { status: 500 });
  }

  let updated = 0;

  for (const p of players) {
    if (!p.external_id || !p.name) continue;

    // Check for a name change before upserting, so we can log it to name_history.
    const { data: priorPlayer } = await supabase
      .from("players")
      .select("id, display_name")
      .eq("external_id", String(p.external_id))
      .maybeSingle();

    const playerPayload: Record<string, unknown> = {
      external_id: String(p.external_id),
      display_name: p.name,
    };
    if (p.country) playerPayload.country = p.country;

    const { data: player, error: playerErr } = await supabase
      .from("players")
      .upsert(playerPayload, { onConflict: "external_id" })
      .select("id, display_name")
      .single();

    if (playerErr || !player) continue;

    if (priorPlayer && priorPlayer.display_name && priorPlayer.display_name !== p.name) {
      await supabase.from("name_history").insert({
        player_id: player.id,
        old_name: priorPlayer.display_name,
      });
    }

    const { data: existing } = await supabase
      .from("season_stats")
      .select("best_streak, rank")
      .eq("player_id", player.id)
      .eq("season_id", season.id)
      .maybeSingle();

    const prevBest = existing?.best_streak ?? 0;
    const newStreak = p.current_streak ?? 0;
    const bestStreak = Math.max(prevBest, newStreak);

    await supabase.from("season_stats").upsert(
      {
        player_id: player.id,
        season_id: season.id,
        points: p.points ?? 0,
        battles: p.battles ?? 0,
        wins: p.wins ?? 0,
        current_streak: newStreak,
        best_streak: bestStreak,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "player_id,season_id" }
    );

    updated++;
  }

  try { await supabase.rpc("update_ranks", { p_season_id: season.id }); } catch (_) {}

  const { data: freshStats } = await supabase
    .from("season_stats")
    .select("player_id, rank, points")
    .eq("season_id", season.id)
    .not("rank", "is", null);

  if (freshStats && freshStats.length > 0) {
    const historyRows = freshStats.map((s: any) => ({
      player_id: s.player_id,
      season_id: season.id,
      rank: s.rank,
      points: s.points,
      recorded_at: new Date().toISOString(),
    }));
    for (let i = 0; i < historyRows.length; i += 50) {
      await supabase.from("rank_history").insert(historyRows.slice(i, i + 50));
    }
    try { await supabase.rpc("prune_rank_history", { p_season_id: season.id }); } catch (_) {}
  }

  return NextResponse.json({ ok: true, updated });
}
