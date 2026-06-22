import { NextResponse } from "next/server";
import { getPublicClient } from "@/lib/supabase";

// GET /api/player-search?q=PlayerName
// Searches our Supabase DB for players matching the query, plus their current
// season stats, rank/points trend, name history, and percentile standing.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();

  if (q.length < 2) {
    return NextResponse.json({ players: [] });
  }

  const supabase = getPublicClient();
  if (!supabase) {
    return NextResponse.json({ players: [], source: "mock" });
  }

  // Get current season
  const { data: season } = await supabase
    .from("seasons")
    .select("id, number, label")
    .eq("is_current", true)
    .maybeSingle();

  if (!season) {
    return NextResponse.json({ players: [] });
  }

  // Search players by name (case-insensitive)
  const { data, error } = await supabase
    .from("players")
    .select(`
      id,
      display_name,
      country,
      external_id,
      season_stats!inner (
        rank,
        points,
        battles,
        wins,
        current_streak,
        best_streak,
        season_id
      )
    `)
    .ilike("display_name", `%${q}%`)
    .eq("season_stats.season_id", season.id)
    .order("display_name")
    .limit(10);

  if (error || !data || data.length === 0) {
    return NextResponse.json({ players: [], error: error?.message });
  }

  const playerIds = data.map((p: any) => p.id);

  // Leader points + total ranked players this season, for "behind leader" / percentile.
  const { data: seasonAgg } = await supabase
    .from("season_stats")
    .select("points")
    .eq("season_id", season.id)
    .order("points", { ascending: false })
    .limit(1)
    .maybeSingle();
  const leaderPoints = seasonAgg?.points ?? 0;

  const { count: totalPlayers } = await supabase
    .from("season_stats")
    .select("id", { count: "exact", head: true })
    .eq("season_id", season.id);

  // Rank/points trend: last few snapshots per player (table is pruned to ~3 per player).
  const { data: history } = await supabase
    .from("rank_history")
    .select("player_id, rank, points, recorded_at")
    .in("player_id", playerIds)
    .eq("season_id", season.id)
    .order("recorded_at", { ascending: true });

  const trendByPlayer = new Map<string, { rank: number; points: number }[]>();
  for (const row of (history ?? []) as any[]) {
    const arr = trendByPlayer.get(row.player_id) ?? [];
    arr.push({ rank: row.rank, points: row.points });
    trendByPlayer.set(row.player_id, arr);
  }

  // Name history: previous display names per player.
  const { data: names } = await supabase
    .from("name_history")
    .select("player_id, old_name, changed_at")
    .in("player_id", playerIds)
    .order("changed_at", { ascending: false });

  const namesByPlayer = new Map<string, string[]>();
  for (const row of (names ?? []) as any[]) {
    const arr = namesByPlayer.get(row.player_id) ?? [];
    arr.push(row.old_name);
    namesByPlayer.set(row.player_id, arr);
  }

  const players = data.map((p: any) => {
    const stats = Array.isArray(p.season_stats) ? p.season_stats[0] : p.season_stats;
    const rank = stats?.rank ?? null;
    const points = stats?.points ?? 0;
    const trend = trendByPlayer.get(p.id) ?? [];
    const percentile = rank && totalPlayers
      ? Math.round((1 - (rank - 1) / totalPlayers) * 1000) / 10
      : null;

    return {
      name: p.display_name,
      country: p.country,
      external_id: p.external_id,
      rank,
      points,
      battles: stats?.battles ?? 0,
      wins: stats?.wins ?? 0,
      streak: stats?.current_streak ?? 0,
      best_streak: stats?.best_streak ?? 0,
      win_rate: stats?.battles > 0
        ? Math.round((stats.wins / stats.battles) * 100)
        : 0,
      points_behind_leader: rank === 1 ? 0 : Math.max(0, leaderPoints - points),
      percentile,
      trend, // chronological [{rank, points}, ...], oldest first
      previous_names: namesByPlayer.get(p.id) ?? [],
    };
  });

  return NextResponse.json({ players, season: season.label });
}
