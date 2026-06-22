import { NextResponse } from "next/server";
import { getPublicClient } from "@/lib/supabase";

// GET /api/player/[id]  → full profile for a single player by external_id
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = getPublicClient();
  if (!supabase) {
    return NextResponse.json({ player: null, error: "No DB" }, { status: 503 });
  }

  const { data: season } = await supabase
    .from("seasons")
    .select("id, number, label")
    .eq("is_current", true)
    .maybeSingle();

  if (!season) {
    return NextResponse.json({ player: null, error: "No active season" }, { status: 404 });
  }

  const { data: playerRow, error } = await supabase
    .from("players")
    .select("id, display_name, country, external_id, created_at, season_stats!inner (rank, points, battles, wins, current_streak, best_streak, season_id)")
    .eq("external_id", params.id)
    .eq("season_stats.season_id", season.id)
    .maybeSingle();

  if (error || !playerRow) {
    return NextResponse.json({ player: null, error: error?.message ?? "Not found" }, { status: 404 });
  }

  const p = playerRow as any;
  const stats = Array.isArray(p.season_stats) ? p.season_stats[0] : p.season_stats;

  const { data: history } = await supabase
    .from("rank_history")
    .select("rank, points, recorded_at")
    .eq("player_id", p.id)
    .eq("season_id", season.id)
    .order("recorded_at", { ascending: true });

  const { data: names } = await supabase
    .from("name_history")
    .select("old_name, changed_at")
    .eq("player_id", p.id)
    .order("changed_at", { ascending: false });

  const { data: leader } = await supabase
    .from("season_stats")
    .select("points")
    .eq("season_id", season.id)
    .order("points", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { count: totalPlayers } = await supabase
    .from("season_stats")
    .select("id", { count: "exact", head: true })
    .eq("season_id", season.id);

  const rank = stats?.rank ?? null;
  const points = stats?.points ?? 0;
  const leaderPts = (leader as any)?.points ?? 0;
  const percentile = rank && totalPlayers
    ? Math.round((1 - (rank - 1) / totalPlayers) * 1000) / 10
    : null;

  return NextResponse.json({
    player: {
      name: p.display_name,
      country: p.country,
      external_id: p.external_id,
      joined_at: p.created_at,
      rank,
      points,
      battles: stats?.battles ?? 0,
      wins: stats?.wins ?? 0,
      streak: stats?.current_streak ?? 0,
      best_streak: stats?.best_streak ?? 0,
      win_rate: stats?.battles > 0 ? Math.round((stats.wins / stats.battles) * 100) : 0,
      points_behind_leader: rank === 1 ? 0 : Math.max(0, leaderPts - points),
      percentile,
      rank_history: (history ?? []).map((r: any) => ({ rank: r.rank, points: r.points, at: r.recorded_at })),
      previous_names: (names ?? []).map((n: any) => n.old_name),
    },
    season: season.label,
  });
}
