import { NextResponse } from "next/server";
import { getPublicClient } from "@/lib/supabase";
import { mockRankings } from "@/lib/mockData";

export async function GET() {
  const supabase = getPublicClient();

  if (!supabase) {
    return NextResponse.json({ rankings: mockRankings, source: "mock" });
  }

  const { data: season } = await supabase
    .from("seasons")
    .select("id, number, label")
    .eq("is_current", true)
    .maybeSingle();

  if (!season) {
    return NextResponse.json({ rankings: mockRankings, source: "mock" });
  }

  const { data, error } = await supabase
    .from("season_stats")
    .select("rank, points, battles, wins, current_streak, players(display_name)")
    .eq("season_id", season.id)
    .order("points", { ascending: false })
    .limit(100);

  if (error || !data || data.length === 0) {
    return NextResponse.json({ rankings: mockRankings, source: "mock" });
  }

  const rankings = data.map((row: any, i: number) => ({
    rank: row.rank ?? i + 1,
    name: row.players?.display_name ?? "Unknown",
    points: row.points,
    battles: row.battles,
    wins: row.wins,
    streak: row.current_streak,
  }));

  return NextResponse.json({ rankings, source: "supabase", season: season.label });
}
