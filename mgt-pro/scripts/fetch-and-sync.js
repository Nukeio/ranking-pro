const SITE_URL = process.env.SITE_URL;
const INGEST_SECRET = process.env.INGEST_SECRET;
const ACCESS_KEY = process.env.GAME_API_AUTH_HEADER;
const VERSION = "13.063.007";

async function main() {
  if (!SITE_URL || !INGEST_SECRET || !ACCESS_KEY) {
    console.error("Missing SITE_URL, INGEST_SECRET, or GAME_API_AUTH_HEADER env vars.");
    process.exit(1);
  }

  console.log("Fetching top rankings from MT3...");

  const body = `accessKey=${ACCESS_KEY}&version=${VERSION}`;

  const res = await fetch("https://ranking.amanotes.net/api/top", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "accesskey": ACCESS_KEY,
      "User-Agent": "MagicTiles3/2606170855 CFNetwork/3860.100.1 Darwin/25.0.0",
      "X-Unity-Version": "2021.3.45f2",
      "Accept": "*/*",
      "Connection": "keep-alive",
    },
    body: body,
  });

  if (!res.ok) {
    console.error(`MT3 API responded with ${res.status}`);
    process.exit(1);
  }

  const raw = await res.json();

  if (!raw.data || !Array.isArray(raw.data)) {
    console.error("Unexpected response shape:", JSON.stringify(raw).slice(0, 200));
    process.exit(1);
  }

  console.log(`Got ${raw.data.length} players from MT3 API`);

  const players = raw.data.map((p, i) => ({
    external_id: p._id ?? p.facebook_id ?? String(i),
    name: p.facebook_name ?? p.name ?? "Unknown",
    points: p.battle_points ?? 0,
    battles: p.total_battle ?? 0,
    wins: p.total_win ?? 0,
    current_streak: 0,
    country: p.country ?? "",
  }));

  console.log(`Sending ${players.length} players to /api/ingest...`);

  const ingestRes = await fetch(`${SITE_URL}/api/ingest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${INGEST_SECRET}`,
    },
    body: JSON.stringify({ players }),
  });

  const result = await ingestRes.json();
  console.log("Ingest result:", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
