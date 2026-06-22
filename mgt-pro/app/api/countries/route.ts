import { NextResponse } from "next/server";
import { getPublicClient } from "@/lib/supabase";
import { mockRankings } from "@/lib/mockData";

// GET /api/countries
// Aggregates the current season's players by country: total points,
// player count, and the season's best player for that country.
export async function GET() {
  const supabase = getPublicClient();

  if (!supabase) {
    // Mock fallback so the tab still renders something locally.
    return NextResponse.json({
      countries: [
        { country: "us", players: 4, points: 64200, top_name: "VelvetEcho" },
        { country: "br", players: 2, points: 28100, top_name: "Kairo_X" },
      ],
      source: "mock",
    });
  }

  const { data: season } = await supabase
    .from("seasons")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();

  if (!season) {
    return NextResponse.json({ countries: [] });
  }

  const { data, error } = await supabase
    .from("season_stats")
    .select("points, players(display_name, country)")
    .eq("season_id", season.id)
    .order("points", { ascending: false });

  if (error || !data) {
    return NextResponse.json({ countries: [], error: error?.message });
  }

  const byCountry = new Map<
    string,
    { points: number; players: number; top_name: string; top_points: number }
  >();

  for (const row of data as any[]) {
    const code = (row.players?.country || "").toLowerCase();
    if (!code) continue;
    const entry = byCountry.get(code) ?? {
      points: 0,
      players: 0,
      top_name: row.players?.display_name ?? "Unknown",
      top_points: row.points ?? 0,
    };
    entry.points += row.points ?? 0;
    entry.players += 1;
    if ((row.points ?? 0) > entry.top_points) {
      entry.top_points = row.points;
      entry.top_name = row.players?.display_name ?? entry.top_name;
    }
    byCountry.set(code, entry);
  }

  const countries = Array.from(byCountry.entries())
    .map(([country, v]) => ({
      country,
      points: v.points,
      players: v.players,
      top_name: v.top_name,
    }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 25);

  return NextResponse.json({ countries, source: "supabase" });
}
