import { NextResponse } from "next/server";
import { getPublicClient } from "@/lib/supabase";

// GET /api/rank-changes
// Returns players whose rank changed in the last sync, for the ↑↓ arrows feature.
// We detect this by comparing the stored rank with a snapshot saved during ingest.
export async function GET() {
  const supabase = getPublicClient();
  if (!supabase) {
    return NextResponse.json({ changes: [] });
  }

  const { data: season } = await supabase
    .from("seasons")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();

  if (!season) {
    return NextResponse.json({ changes: [] });
  }

  // Pull rank_history for the last 2 snapshots per player
  const { data, error } = await supabase
    .from("rank_history")
    .select("player_id, rank, recorded_at, players(display_name)")
    .eq("season_id", season.id)
    .order("recorded_at", { ascending: false })
    .limit(200);

  if (error || !data || data.length === 0) {
    return NextResponse.json({ changes: [] });
  }

  // Group by player, take two most recent snapshots, compute delta
  const byPlayer = new Map<string, any[]>();
  for (const row of data) {
    const pid = row.player_id;
    if (!byPlayer.has(pid)) byPlayer.set(pid, []);
    if (byPlayer.get(pid)!.length < 2) byPlayer.get(pid)!.push(row);
  }

  const changes: Array<{ name: string; rank: number; delta: number }> = [];
  for (const [, rows] of byPlayer) {
    if (rows.length < 2) continue;
    const [current, previous] = rows;
    const delta = previous.rank - current.rank; // positive = moved up
    if (delta !== 0) {
      changes.push({
        name: (current as any).players?.display_name ?? "Unknown",
        rank: current.rank,
        delta,
      });
    }
  }

  // Sort by biggest mover
  changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return NextResponse.json({ changes: changes.slice(0, 20) });
}
