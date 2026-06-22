"use client";

import { useEffect, useState, useCallback, useRef } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Player = {
  rank: number;
  name: string;
  points: number;
  battles: number;
  wins: number;
  streak: number;
};

type StreakEntry = { name: string; streak: number };
type HofEntry   = { season: string; name: string; points: number; wins: number };
type ChatMsg    = { username: string; message: string; created_at: string };

type RankChange = { name: string; rank: number; delta: number };
type CountryEntry = { country: string; points: number; players: number; top_name: string };

type SeasonInfo = {
  number: number;
  label: string;
  duration_days: number | null;
  ends_at: string | null;
  starts_at: string | null;
  rewards: any[] | null;
};

type SearchResult = {
  name: string;
  country: string | null;
  rank: number | null;
  points: number;
  battles: number;
  wins: number;
  streak: number;
  best_streak: number;
  win_rate: number;
  points_behind_leader: number;
  percentile: number | null;
  trend: { rank: number; points: number }[];
  previous_names: string[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const POLL_MS = 30_000;

const FLAG: Record<string, string> = {};
// Build a simple country → emoji flag map (A=🇦, etc.)
function flagEmoji(code: string | null): string {
  if (!code || code.length !== 2) return "🌐";
  const offset = 127397;
  return Array.from(code.toUpperCase())
    .map((c) => String.fromCodePoint(c.charCodeAt(0) + offset))
    .join("");
}

function winRate(wins: number, battles: number) {
  if (!battles) return "—";
  return `${Math.round((wins / battles) * 100)}%`;
}

// Achievement thresholds mirror the `achievements` table in supabase/schema.sql.
// Computed client-side from best_streak so no extra sync step is needed.
const BADGES = [
  { min: 100, icon: "fa-crown", label: "Legendary Run", className: "badge-legend" },
  { min: 70,  icon: "fa-bolt", label: "Unstoppable", className: "badge-bolt" },
  { min: 35,  icon: "fa-fire-flame-curved", label: "On Fire", className: "badge-fire" },
  { min: 20,  icon: "fa-fire", label: "Hot Streak", className: "badge-hot" },
];

function bestBadge(bestStreak: number) {
  return BADGES.find((b) => bestStreak >= b.min) ?? null;
}

// Lightweight count-up animation for headline numbers (podium points).
function useCountUp(target: number, durationMs = 700) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

function useCountdown(endsAt: string | null, durationDays: number | null, startsAt: string | null) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    // Compute deadline: endsAt if known, otherwise starts_at + duration_days
    let deadline: Date | null = null;
    if (endsAt) {
      deadline = new Date(endsAt);
    } else if (startsAt && durationDays) {
      const start = new Date(startsAt);
      deadline = new Date(start.getTime() + durationDays * 86400 * 1000);
    }
    if (!deadline) return;

    const tick = () => {
      const diff = deadline!.getTime() - Date.now();
      if (diff <= 0) { setLabel("Ended"); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLabel(d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt, durationDays, startsAt]);

  return label;
}

// ── Main component ─────────────────────────────────────────────────────────────

type Tab = "rankings" | "streaks" | "hof" | "search" | "prizes" | "countries";

export default function Page() {
  const [tab, setTab]           = useState<Tab>("rankings");
  const [rankings, setRankings] = useState<Player[]>([]);
  const [streaks, setStreaks]   = useState<StreakEntry[]>([]);
  const [hof, setHof]           = useState<HofEntry[]>([]);
  const [changes, setChanges]   = useState<RankChange[]>([]);
  const [countries, setCountries] = useState<CountryEntry[]>([]);
  const [season, setSeason]     = useState<SeasonInfo | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [loading, setLoading]   = useState(true);
  const [theme, setTheme] = useState<"gold" | "violet">("gold");

  useEffect(() => {
    const saved = window.localStorage.getItem("rp-theme");
    if (saved === "violet" || saved === "gold") setTheme(saved);
  }, []);

  useEffect(() => {
    if (theme === "violet") {
      document.documentElement.setAttribute("data-theme", "violet");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    window.localStorage.setItem("rp-theme", theme);
  }, [theme]);

  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [username, setUsername] = useState("");
  const [draft, setDraft]       = useState("");

  // Search
  const [query, setQuery]         = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchSeason, setSearchSeason] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const countdown = useCountdown(
    season?.ends_at ?? null,
    season?.duration_days ?? null,
    season?.starts_at ?? null
  );

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    const [r, s, h, c, sn, ct] = await Promise.all([
      fetch("/api/rankings").then((x) => x.json()),
      fetch("/api/streaks").then((x) => x.json()),
      fetch("/api/hof").then((x) => x.json()),
      fetch("/api/rank-changes").then((x) => x.json()),
      fetch("/api/season").then((x) => x.json()),
      fetch("/api/countries").then((x) => x.json()),
    ]);
    setRankings(r.rankings ?? []);
    setStreaks(s.streaks ?? []);
    setHof(h.hof ?? []);
    setChanges(c.changes ?? []);
    setSeason(sn.season ?? null);
    setCountries(ct.countries ?? []);
    setLastSync(new Date());
    setLoading(false);
  }, []);

  const loadChat = useCallback(async () => {
    const res = await fetch("/api/chat").then((r) => r.json());
    setMessages(res.messages ?? []);
  }, []);

  useEffect(() => {
    loadAll();
    loadChat();
    const dataInterval = setInterval(loadAll, POLL_MS);
    const chatInterval = setInterval(loadChat, 10_000);
    return () => { clearInterval(dataInterval); clearInterval(chatInterval); };
  }, [loadAll, loadChat]);

  useEffect(() => {
    if (!lastSync) return;
    const tick = setInterval(
      () => setSecondsAgo(Math.round((Date.now() - lastSync.getTime()) / 1000)),
      1000
    );
    return () => clearInterval(tick);
  }, [lastSync]);

  // ── Search with debounce ────────────────────────────────────────────────────

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (query.length < 2) { setSearchResults([]); return; }

    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/player-search?q=${encodeURIComponent(query)}`).then((x) => x.json());
        setSearchResults(res.players ?? []);
        setSearchSeason(res.season ?? null);
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [query]);

  // ── Chat send ───────────────────────────────────────────────────────────────

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !draft.trim()) return;
    await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, message: draft }),
    });
    setDraft("");
    loadChat();
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const top3 = rankings.slice(0, 3);
  const rest  = rankings.slice(3);

  // Build rank-change lookup map: name → delta
  const changeMap = new Map<string, number>();
  for (const c of changes) changeMap.set(c.name, c.delta);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <main className="shell page-enter">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="header">
        <div className="logo">
          <i className="fa-solid fa-trophy accent" />
          Ranking<span className="accent">Pro</span>
          {season && (
            <span className="season-badge">{season.label}</span>
          )}
        </div>
        <div className="header-right">
          {countdown && (
            <div className="countdown-badge">
              <i className="fa-solid fa-clock" />
              {countdown}
            </div>
          )}
          <div className="live-badge">
            <span className="live-dot" />
            {lastSync ? `${secondsAgo}s ago` : "—"}
          </div>
          <button
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === "gold" ? "violet" : "gold"))}
            aria-label="Toggle accent theme"
            title="Swap accent theme"
          >
            <i className="fa-solid fa-palette" />
          </button>
        </div>
      </header>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <nav className="tabs">
        {(["rankings", "streaks", "hof", "countries", "search", "prizes"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`tab ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "rankings"  && "Rankings"}
            {t === "streaks"   && "Streaks"}
            {t === "hof"       && "Hall of Fame"}
            {t === "countries" && "Countries"}
            {t === "search"    && "Find Player"}
            {t === "prizes"    && "Prizes"}
          </button>
        ))}
      </nav>

      {/* ── Rankings tab ───────────────────────────────────────────────────── */}
      {tab === "rankings" && (
        <>
          {/* Rank change strip */}
          {changes.length > 0 && (
            <div className="change-strip">
              {changes.slice(0, 8).map((c, i) => (
                <div key={i} className={`change-chip ${c.delta > 0 ? "up" : "down"}`}>
                  {c.delta > 0 ? "↑" : "↓"}{Math.abs(c.delta)} {c.name}
                </div>
              ))}
            </div>
          )}

          {top3.length > 0 && (
            <div className="podium">
              {top3[1] && <PodiumCard player={top3[1]} delta={changeMap.get(top3[1].name)} />}
              {top3[0] && <PodiumCard player={top3[0]} first delta={changeMap.get(top3[0].name)} />}
              {top3[2] && <PodiumCard player={top3[2]} delta={changeMap.get(top3[2].name)} />}
            </div>
          )}

          <div className="panel">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
            ) : rest.length === 0 ? (
              <div className="empty">No data yet — once your sync job runs, rankings show up here.</div>
            ) : (
              rest.map((p, i) => {
                const delta = changeMap.get(p.name);
                return (
                  <div className="row fade-row" style={{ animationDelay: `${Math.min(i, 20) * 25}ms` }} key={p.rank}>
                    <span className="row-rank">#{p.rank}</span>
                    <span className="row-name">{p.name}</span>
                    <span className="row-stats">
                      <span className="points">{p.points.toLocaleString()}</span>
                      <span>{winRate(p.wins, p.battles)}</span>
                      {p.streak > 0 && <span className="streak-inline">🔥{p.streak}</span>}
                      {delta !== undefined && (
                        <span className={delta > 0 ? "delta-up" : "delta-down"}>
                          {delta > 0 ? `↑${delta}` : `↓${Math.abs(delta)}`}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* ── Streaks tab ────────────────────────────────────────────────────── */}
      {tab === "streaks" && (
        <div className="streak-strip" style={{ flexWrap: "wrap" }}>
          {streaks.length === 0 ? (
            <div className="empty">No active streaks right now.</div>
          ) : (
            streaks.map((s, i) => (
              <div className="streak-card" key={i}>
                <i className="fa-solid fa-fire streak-flame" />
                <div>
                  <div className="streak-name">{s.name}</div>
                  <div className="streak-count">{s.streak} win streak</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Hall of Fame tab ───────────────────────────────────────────────── */}
      {tab === "hof" && (
        <div className="panel">
          {hof.length === 0 ? (
            <div className="empty">Hall of Fame fills in once a season has closed.</div>
          ) : (
            hof.map((h, i) => (
              <div className="hof-row" key={i}>
                <span className="hof-season">{h.season}</span>
                <span className="row-name">{h.name}</span>
                <span className="row-stats">
                  <span className="points">{h.points.toLocaleString()}</span>
                  <span>{h.wins}W</span>
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Countries tab ──────────────────────────────────────────────────── */}
      {tab === "countries" && (
        <div className="panel">
          {countries.length === 0 ? (
            <div className="empty">Country data fills in after the first sync.</div>
          ) : (
            countries.map((c, i) => (
              <div className="row country-row fade-row" style={{ animationDelay: `${i * 30}ms` }} key={c.country}>
                <span className="row-rank">#{i + 1}</span>
                <span className="row-name">
                  <span className="player-flag">{flagEmoji(c.country)}</span>{" "}
                  {c.country.toUpperCase()}
                  <span className="country-top">top: {c.top_name}</span>
                </span>
                <span className="row-stats">
                  <span className="points">{c.points.toLocaleString()}</span>
                  <span>{c.players} players</span>
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Find Player tab ────────────────────────────────────────────────── */}
      {tab === "search" && (
        <div className="search-panel">
          <div className="search-bar-wrap">
            <i className="fa-solid fa-magnifying-glass search-icon" />
            <input
              className="search-input"
              type="text"
              placeholder="Type a player name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {query && (
              <button className="search-clear" onClick={() => setQuery("")}>
                <i className="fa-solid fa-xmark" />
              </button>
            )}
          </div>

          {searchSeason && searchResults.length > 0 && (
            <p className="search-season-label">{searchSeason} results</p>
          )}

          {searching && <div className="empty">Searching…</div>}

          {!searching && query.length >= 2 && searchResults.length === 0 && (
            <div className="empty">No players found matching "{query}".</div>
          )}

          {!searching && searchResults.map((p, i) => {
            const badge = bestBadge(p.best_streak);
            return (
            <div className="player-card fade-row" style={{ animationDelay: `${i * 40}ms` }} key={i}>
              <div className="player-card-header">
                <span className="player-flag">{flagEmoji(p.country)}</span>
                <span className="player-name">{p.name}</span>
                {badge && (
                  <span className={`achievement-badge ${badge.className}`} title={badge.label}>
                    <i className={`fa-solid ${badge.icon}`} /> {badge.label}
                  </span>
                )}
                {p.rank ? (
                  <span className="player-rank-badge">#{p.rank}</span>
                ) : (
                  <span className="player-rank-badge unranked">Unranked</span>
                )}
              </div>
              <div className="player-card-stats">
                <Stat label="Points"     value={p.points.toLocaleString()} accent />
                <Stat label="Win Rate"   value={`${p.win_rate}%`} />
                <Stat label="Wins"       value={p.wins.toLocaleString()} />
                <Stat label="Battles"    value={p.battles.toLocaleString()} />
                <Stat label="Streak"     value={p.streak > 0 ? `🔥 ${p.streak}` : "—"} />
                <Stat label="Best Streak" value={p.best_streak > 0 ? `${p.best_streak}` : "—"} />
              </div>
              <Sparkline trend={p.trend} />
              <div className="profile-meta-row">
                {p.percentile !== null && (
                  <span className="profile-tag percentile">Top {100 - p.percentile < 0.1 ? "0.1" : (100 - p.percentile).toFixed(1)}%</span>
                )}
                {p.rank !== 1 && p.points_behind_leader > 0 && (
                  <span className="profile-tag leader-gap">
                    {p.points_behind_leader.toLocaleString()} pts behind #1
                  </span>
                )}
                {p.rank === 1 && <span className="profile-tag leader-gap">👑 Season leader</span>}
              </div>
              {p.previous_names.length > 0 && (
                <div className="previous-names">
                  Formerly known as: <span>{p.previous_names.join(", ")}</span>
                </div>
              )}
            </div>
          );})}

          {!searching && query.length < 2 && (
            <div className="empty" style={{ paddingTop: "3rem" }}>
              Search by name to see any player's rank, win rate, and streak history.
            </div>
          )}
        </div>
      )}

      {/* ── Prizes tab ─────────────────────────────────────────────────────── */}
      {tab === "prizes" && (
        <div>
          {!season?.rewards || season.rewards.length === 0 ? (
            <div className="empty">Prize info loads after the first sync.</div>
          ) : (
            <>
              <p className="prizes-intro">
                {season.label} rewards — top finishers earn exclusive avatars, diamonds, and rank frames.
              </p>
              <div className="panel">
                {season.rewards.map((r: any, i: number) => (
                  <div className="prize-row" key={i}>
                    <span className="prize-rank">
                      {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : `#${r.rank}`}
                    </span>
                    <div className="prize-details">
                      {r.avatar && r.avatar.length > 0 && (
                        <span className="prize-tag avatar-tag">
                          <i className="fa-solid fa-image" /> {r.avatar[0]}
                        </span>
                      )}
                      {r.rank_frame && (
                        <span className="prize-tag frame-tag">
                          <i className="fa-solid fa-frame" /> Frame
                        </span>
                      )}
                      {r.diamond > 0 && (
                        <span className="prize-tag diamond-tag">
                          <i className="fa-solid fa-gem" /> {r.diamond}
                        </span>
                      )}
                      {r.vip_pass_day > 0 && (
                        <span className="prize-tag vip-tag">
                          <i className="fa-solid fa-star" /> {r.vip_pass_day}d VIP
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Chat ───────────────────────────────────────────────────────────── */}
      <button className="chat-toggle" onClick={() => setChatOpen((o) => !o)} aria-label="Toggle chat">
        <i className="fa-solid fa-comments" />
      </button>

      {chatOpen && (
        <div className="chat-panel">
          <div className="chat-messages">
            {messages.length === 0 && <div className="empty">Be the first to say hi.</div>}
            {messages.map((m, i) => (
              <div key={i}>
                <span className="who">{m.username}: </span>
                {m.message}
              </div>
            ))}
          </div>
          <form className="chat-form" onSubmit={sendMessage}>
            <input
              className="name"
              placeholder="Name"
              value={username}
              maxLength={24}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              className="message"
              placeholder="Message…"
              value={draft}
              maxLength={200}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" aria-label="Send">
              <i className="fa-solid fa-paper-plane" />
            </button>
          </form>
        </div>
      )}
    </main>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PodiumCard({ player, first, delta }: { player: Player; first?: boolean; delta?: number }) {
  const animatedPoints = useCountUp(player.points);
  return (
    <div className={`podium-card fade-row ${first ? "first" : ""}`}>
      <div className="podium-rank">#{player.rank}</div>
      <div className="podium-name">{player.name}</div>
      <div className="podium-points">{animatedPoints.toLocaleString()} pts</div>
      <div className="podium-meta">
        <span>{winRate(player.wins, player.battles)} WR</span>
        {player.streak > 0 && <span>🔥{player.streak}</span>}
        {delta !== undefined && (
          <span className={delta > 0 ? "delta-up" : "delta-down"}>
            {delta > 0 ? `↑${delta}` : `↓${Math.abs(delta)}`}
          </span>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="stat-block">
      <div className={`stat-value ${accent ? "accent-stat" : ""}`}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="row skeleton-row">
      <span className="skeleton-pill" style={{ width: "2rem" }} />
      <span className="skeleton-pill" style={{ width: "40%" }} />
      <span className="skeleton-pill" style={{ width: "5rem" }} />
    </div>
  );
}

// Tiny bar-chart trend of recent points snapshots (oldest → newest).
function Sparkline({ trend }: { trend: { rank: number; points: number }[] }) {
  if (!trend || trend.length < 2) return null;
  const max = Math.max(...trend.map((t) => t.points));
  const min = Math.min(...trend.map((t) => t.points));
  const range = Math.max(1, max - min);
  return (
    <div className="trend-sparkline" title="Points trend across recent syncs">
      {trend.map((t, i) => {
        const heightPct = 15 + ((t.points - min) / range) * 85;
        const prev = trend[i - 1];
        const cls = !prev ? "" : t.points > prev.points ? "improved" : t.points < prev.points ? "dropped" : "";
        return (
          <span
            key={i}
            className={`trend-bar ${cls}`}
            style={{ height: `${heightPct}%` }}
          />
        );
      })}
    </div>
  );
}
