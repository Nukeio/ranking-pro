import { NextResponse } from "next/server";
import { getPublicClient } from "@/lib/supabase";
import { mockHof } from "@/lib/mockData";

export async function GET() {
  const supabase = getPublicClient();
  if (!supabase) {
    return NextResponse.json({ hof: mockHof, source: "mock" });
  }

  const { data, error } = await supabase
    .from("season_stats")
    .select("points, wins, players(display_name), seasons(label)")
    .order("points", { ascending: false })
    .limit(20);

  if (error || !data || data.length === 0) {
    return NextResponse.json({ hof: mockHof, source: "mock" });
  }

  const hof = data.map((row: any) => ({
    season: row.seasons?.label ?? "—",
    name: row.players?.display_name ?? "Unknown",
    points: row.points,
    wins: row.wins,
  }));

  return NextResponse.json({ hof, source: "supabase" });
}
