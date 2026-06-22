import { NextResponse } from "next/server";
import { getPublicClient } from "@/lib/supabase";
import { mockStreaks } from "@/lib/mockData";

export async function GET() {
  const supabase = getPublicClient();
  if (!supabase) {
    return NextResponse.json({ streaks: mockStreaks, source: "mock" });
  }

  const { data: season } = await supabase
    .from("seasons")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();

  if (!season) {
    return NextResponse.json({ streaks: mockStreaks, source: "mock" });
  }

  const { data, error } = await supabase
    .from("season_stats")
    .select("current_streak, players(display_name)")
    .eq("season_id", season.id)
    .gt("current_streak", 0)
    .order("current_streak", { ascending: false })
    .limit(5);

  if (error || !data || data.length === 0) {
    return NextResponse.json({ streaks: mockStreaks, source: "mock" });
  }

  const streaks = data.map((row: any) => ({
    name: row.players?.display_name ?? "Unknown",
    streak: row.current_streak,
  }));

  return NextResponse.json({ streaks, source: "supabase" });
}
