"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

type Player = {
  rank: number;
  name: string;
  points: number;
  battles: number;
  wins: number;
  streak: number;
  country?: string;
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
  external_id?: string;
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

type Tab = "rankings" | "streaks" | "hof" | "countries" | "search" | "prizes" | "stats";

// ── Helpers ───────────────────────────────────────────────────────────────────

function flagEmoji(code: string | null): string {
  if (!code || code.length !== 2) return "🌐";
  return Array.from(code.toUpperCase())
    .map((c) => String.fromCodePoint(c.charCodeAt(0) + 127397))
    .join("");
}

function winRate(wins: number, battles: number) {
  if (!battles) return "—";
  return `${Math.round((wins / battles) * 100)}%`;
}

const BADGES = [
  { min: 100, icon: "fa-crown",              label: "Legendary Run", cls: "badge-legendary" },
  { min: 70,  icon: "fa-bolt",               label: "Unstoppable",   cls: "badge-bolt"      },
  { min: 35,  icon: "fa-fire-flame-curved",  label: "On Fire",       cls: "badge-fire"      },
  { min: 20,  icon: "fa-fire",               label: "Hot Streak",    cls: "badge-hot"       },
];

function bestBadge(n: number) {
  return BADGES.find((b) => n >= b.min) ?? null;
}

function useCountUp(target: number, ms = 800) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - t, 4);
      setV(Math.round(target * e));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function useCountdown(endsAt: string | null, durationDays: number | null, startsAt: string | null) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    let deadline: Date | null = null;
    if (endsAt) deadline = new Date(endsAt);
    else if (startsAt && durationDays) {
      deadline = new Date(new Date(startsAt).getTime() + durationDays * 86400000);
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

// ── Animated Counter ──────────────────────────────────────────────────────────
function Counter({ value, className }: { value: number; className?: string }) {
  const v = useCountUp(value);
  return <span className={className}>{v.toLocaleString()}</span>;
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ trend }: { trend: { rank: number; points: number }[] }) {
  if (!trend || trend.length < 2) return null;
  const max = Math.max(...trend.map((t) => t.points));
  const min = Math.min(...trend.map((t) => t.points));
  const range = Math.max(1, max - min);
  return (
    <div className="sparkline">
      {trend.map((t, i) => {
        const h = 15 + ((t.points - min) / range) * 85;
        const prev = trend[i - 1];
        const cls = !prev ? "same" : t.points > prev.points ? "up" : t.points < prev.points ? "down" : "same";
        return <span key={i} className={`spark-bar ${cls}`} style={{ height: `${h}%` }} />;
      })}
    </div>
  );
}

// ── Podium Card ───────────────────────────────────────────────────────────────
function PodiumCard({ player, delta }: { player: Player; delta?: number }) {
  const pts = useCountUp(player.points);
  const icons = ["🥇", "🥈", "🥉"];
  const rankCls = ["rank-1", "rank-2", "rank-3"][player.rank - 1] ?? "rank-1";
  return (
    <div className={`podium-card ${rankCls}`}>
      <div className="podium-crown">{icons[player.rank - 1] ?? "🏅"}</div>
      <div className="podium-position">#{player.rank}</div>
      {player.country && (
        <div style={{ fontSize: "1.1rem", marginBottom: "0.3rem" }}>{flagEmoji(player.country)}</div>
      )}
      <div className="podium-name">{player.name}</div>
      <div className="podium-pts">{pts.toLocaleString()}</div>
      <div className="podium-meta">
        <span>{winRate(player.wins, player.battles)}</span>
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

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="skeleton-row">
          <span className="skel" style={{ width: "2rem" }} />
          <span className="skel" style={{ width: "55%" }} />
          <span className="skel" style={{ width: "4rem" }} />
        </div>
      ))}
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Page() {
  const [tab, setTab]         = useState<Tab>("rankings");
  const [rankings, setRankings] = useState<Player[]>([]);
  const [streaks, setStreaks] = useState<StreakEntry[]>([]);
  const [hof, setHof]         = useState<HofEntry[]>([]);
  const [changes, setChanges] = useState<RankChange[]>([]);
  const [countries, setCountries] = useState<CountryEntry[]>([]);
  const [season, setSeason]   = useState<SeasonInfo | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [loading, setLoading] = useState(true);

  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [username, setUsername] = useState("");
  const [draft, setDraft]       = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [query, setQuery]       = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchSeason, setSearchSeason] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const countdown = useCountdown(
    season?.ends_at ?? null,
    season?.duration_days ?? null,
    season?.starts_at ?? null
  );

  // ── Load data ──────────────────────────────────────────────────────────────

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

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    const id = setInterval(loadAll, 30_000);
    return () => clearInterval(id);
  }, [loadAll]);

  useEffect(() => {
    if (!lastSync) return;
    const id = setInterval(() => {
      setSecondsAgo(Math.round((Date.now() - lastSync.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [lastSync]);

  // ── Search ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (query.length < 2) { setSearchResults([]); setSearchSeason(null); return; }
    setSearching(true);
    searchTimeout.current = setTimeout(async () => {
      const res = await fetch(`/api/player-search?q=${encodeURIComponent(query)}`).then((x) => x.json());
      setSearchResults(res.players ?? []);
      setSearchSeason(res.season ?? null);
      setSearching(false);
    }, 350);
  }, [query]);

  // ── Chat ───────────────────────────────────────────────────────────────────

  const loadChat = useCallback(async () => {
    const res = await fetch("/api/chat").then((x) => x.json()).catch(() => ({ messages: [] }));
    setMessages(res.messages ?? []);
  }, []);

  useEffect(() => {
    if (chatOpen) loadChat();
  }, [chatOpen, loadChat]);

  useEffect(() => {
    if (chatOpen) {
      const id = setInterval(loadChat, 8000);
      return () => clearInterval(id);
    }
  }, [chatOpen, loadChat]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!username.trim() || !draft.trim()) return;
    await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim(), message: draft.trim() }),
    });
    setDraft("");
    loadChat();
  };

  // ── Derived data ───────────────────────────────────────────────────────────

  const top3 = rankings.slice(0, 3);
  const rest  = rankings.slice(3);
  const changeMap = new Map(changes.map((c) => [c.name, c.delta]));

  const totalPoints   = rankings.reduce((s, p) => s + p.points, 0);
  const avgWinRate    = rankings.length
    ? Math.round(rankings.reduce((s, p) => s + (p.battles > 0 ? (p.wins / p.battles) * 100 : 0), 0) / rankings.length)
    : 0;
  const topCountry    = countries[0];
  const maxCountryPts = countries[0]?.points ?? 1;

  // ── Tab icons ──────────────────────────────────────────────────────────────

  const TAB_CONFIG: { id: Tab; label: string; icon: string }[] = [
    { id: "rankings",  label: "Rankings",    icon: "fa-ranking-star"    },
    { id: "streaks",   label: "Streaks",     icon: "fa-fire"            },
    { id: "hof",       label: "Hall of Fame", icon: "fa-crown"          },
    { id: "countries", label: "Countries",   icon: "fa-earth-americas"  },
    { id: "search",    label: "Players",     icon: "fa-magnifying-glass" },
    { id: "prizes",    label: "Prizes",      icon: "fa-gem"             },
    { id: "stats",     label: "Stats",       icon: "fa-chart-bar"       },
  ];

  return (
    <main className="shell fade-in">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="site-header">
        <div className="logo-mark">
          <div className="logo-icon">
            <i className="fa-solid fa-chess-queen" />
          </div>
          <div>
            <div className="logo-name">MT3 <span>Arena</span></div>
          </div>
          {season && <div className="logo-season">{season.label}</div>}
        </div>

        <div className="header-controls">
          {countdown && (
            <div className="countdown-pill">
              <i className="fa-solid fa-hourglass-half" />
              {countdown}
            </div>
          )}
          <div className="live-indicator">
            <span className="pulse-dot" />
            <span className="font-mono" style={{ fontFamily: "var(--font-mono)" }}>
              {lastSync ? `${secondsAgo}s ago` : "—"}
            </span>
          </div>
          <button className="icon-btn" onClick={loadAll} title="Refresh" aria-label="Refresh data">
            <i className="fa-solid fa-arrows-rotate" />
          </button>
        </div>
      </header>

      {/* ── Hero Stats ─────────────────────────────────────────────────────── */}
      <section className="hero">
        <div className="hero-glow" />
        <div className="hero-stats-row">
          <div className="hero-stat-card accent-purple">
            <div className="hero-stat-label">Active Players</div>
            <div className="hero-stat-value purple">
              <Counter value={rankings.length} />
            </div>
            <div className="hero-stat-sub">This season</div>
          </div>

          <div className="hero-stat-card accent-cyan">
            <div className="hero-stat-label">Total Points</div>
            <div className="hero-stat-value cyan" style={{ fontSize: "1.4rem" }}>
              <Counter value={totalPoints} />
            </div>
            <div className="hero-stat-sub">Combined score</div>
          </div>

          <div className="hero-stat-card accent-gold">
            <div className="hero-stat-label">Avg Win Rate</div>
            <div className="hero-stat-value gold">
              <Counter value={avgWinRate} />
              <span style={{ fontSize: "0.9rem" }}>%</span>
            </div>
            <div className="hero-stat-sub">Across top 100</div>
          </div>
        </div>
      </section>

      {/* ── Activity Feed ──────────────────────────────────────────────────── */}
      {changes.length > 0 && (
        <div className="activity-strip">
          {changes.slice(0, 12).map((c, i) => (
            <div key={i} className={`activity-chip ${c.delta > 0 ? "up" : "down"}`}>
              {c.delta > 0
                ? <><i className="fa-solid fa-caret-up" /> ↑{Math.abs(c.delta)}</>
                : <><i className="fa-solid fa-caret-down" /> ↓{Math.abs(c.delta)}</>
              }
              <span className="chip-name">{c.name}</span>
              <span style={{ color: "var(--text-muted)" }}>#{c.rank}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Nav ────────────────────────────────────────────────────────────── */}
      <nav className="nav-tabs">
        {TAB_CONFIG.map(({ id, label, icon }) => (
          <button
            key={id}
            className={`nav-tab ${tab === id ? "active" : ""}`}
            onClick={() => setTab(id)}
          >
            <i className={`fa-solid ${icon}`} />
            {label}
          </button>
        ))}
      </nav>

      {/* ── RANKINGS ───────────────────────────────────────────────────────── */}
      {tab === "rankings" && (
        <div className="fade-in">
          {/* Podium */}
          {top3.length === 3 && (
            <>
              <div className="section-head">
                <div className="section-title">Top Competitors</div>
              </div>
              <div className="podium-row" style={{ marginBottom: "1rem" }}>
                <PodiumCard player={top3[1]} delta={changeMap.get(top3[1].name)} />
                <PodiumCard player={top3[0]} delta={changeMap.get(top3[0].name)} />
                <PodiumCard player={top3[2]} delta={changeMap.get(top3[2].name)} />
              </div>
            </>
          )}

          <div className="section-head">
            <div className="section-title">Full Rankings</div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--text-muted)" }}>
              Top {rankings.length}
            </span>
          </div>
          <div className="rankings-panel">
            {loading ? (
              <SkeletonRows />
            ) : rest.length === 0 && top3.length === 0 ? (
              <div className="empty-state">
                <i className="fa-solid fa-satellite-dish" />
                Waiting for first sync…
              </div>
            ) : (
              rest.map((p, i) => {
                const delta = changeMap.get(p.name);
                return (
                  <div
                    className="rank-row"
                    key={p.rank}
                    style={{ animationDelay: `${Math.min(i, 20) * 20}ms` }}
                  >
                    <span className="rank-num">{p.rank}</span>
                    <div className="rank-player">
                      {p.country && <span className="rank-flag">{flagEmoji(p.country)}</span>}
                      <span className="rank-name">{p.name}</span>
                      {p.streak > 0 && (
                        <span className="streak-badge">🔥{p.streak}</span>
                      )}
                    </div>
                    <div className="rank-right">
                      <span className="rank-winrate">{winRate(p.wins, p.battles)}</span>
                      <span className="rank-points">{p.points.toLocaleString()}</span>
                      {delta !== undefined && (
                        <span className={`delta-pill ${delta > 0 ? "up" : "down"}`}>
                          {delta > 0 ? `↑${delta}` : `↓${Math.abs(delta)}`}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── STREAKS ────────────────────────────────────────────────────────── */}
      {tab === "streaks" && (
        <div className="fade-in">
          <div className="section-head">
            <div className="section-title">Active Win Streaks</div>
          </div>
          {streaks.length === 0 ? (
            <div className="empty-state">
              <i className="fa-solid fa-fire-flame-simple" />
              No active streaks right now
            </div>
          ) : (
            <div className="streaks-grid">
              {streaks.map((s, i) => (
                <div
                  key={i}
                  className="streak-card fade-in"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="streak-rank-badge">#{i + 1}</div>
                  <div className="streak-name">{s.name}</div>
                  <div className="streak-flames">
                    <span className="streak-num">{s.streak}</span>
                    <span className="streak-label">win streak</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── HALL OF FAME ───────────────────────────────────────────────────── */}
      {tab === "hof" && (
        <div className="fade-in">
          <div className="section-head">
            <div className="section-title">Hall of Fame</div>
          </div>
          {hof.length === 0 ? (
            <div className="empty-state">
              <i className="fa-solid fa-crown" />
              Hall of Fame fills in when seasons close
            </div>
          ) : (
            <div className="hof-grid">
              {hof.map((h, i) => (
                <div
                  key={i}
                  className="hof-card fade-in"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <div className="hof-season-tag">{h.season}</div>
                  <div className="hof-player-name">{h.name}</div>
                  <div className="hof-stats">
                    <div className="hof-points">{h.points.toLocaleString()}</div>
                    <div className="hof-wins">{h.wins} wins</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── COUNTRIES ──────────────────────────────────────────────────────── */}
      {tab === "countries" && (
        <div className="fade-in">
          <div className="section-head">
            <div className="section-title">Country Rankings</div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--text-muted)" }}>
              {countries.length} nations
            </span>
          </div>
          {countries.length === 0 ? (
            <div className="empty-state">
              <i className="fa-solid fa-earth-americas" />
              Country data fills in after first sync
            </div>
          ) : (
            <div className="countries-grid">
              {countries.map((c, i) => {
                const posCls = i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "";
                return (
                  <div
                    key={c.country}
                    className="country-card"
                    style={{ animationDelay: `${i * 25}ms` }}
                  >
                    <span className={`country-pos ${posCls}`}>#{i + 1}</span>
                    <span className="country-flag">{flagEmoji(c.country)}</span>
                    <div className="country-info">
                      <div className="country-code">{c.country.toUpperCase()}</div>
                      <div className="country-top-player">{c.top_name}</div>
                    </div>
                    <div className="country-right">
                      <div className="country-points">{c.points.toLocaleString()}</div>
                      <div className="country-players">{c.players} players</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── SEARCH ─────────────────────────────────────────────────────────── */}
      {tab === "search" && (
        <div className="fade-in">
          <div className="search-wrapper">
            <div className="search-bar">
              <i className="fa-solid fa-magnifying-glass search-icon" />
              <input
                className="search-input"
                type="text"
                placeholder="Search player name…"
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
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--text-muted)" }}>
                {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} · {searchSeason}
              </div>
            )}

            {searching && (
              <div className="empty-state" style={{ padding: "1.5rem" }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: "1.2rem" }} />
                Searching…
              </div>
            )}

            {!searching && query.length >= 2 && searchResults.length === 0 && (
              <div className="empty-state">
                <i className="fa-solid fa-user-slash" />
                No players found for "{query}"
              </div>
            )}

            {!searching && searchResults.map((p, i) => {
              const badge = bestBadge(p.best_streak);
              return (
                <div
                  key={i}
                  className="search-result-card"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="result-header">
                    <span className="result-flag">{flagEmoji(p.country)}</span>
                    <span className="result-name">{p.name}</span>
                    {badge && (
                      <span className={`achievement-badge ${badge.cls}`}>
                        <i className={`fa-solid ${badge.icon}`} /> {badge.label}
                      </span>
                    )}
                    {p.rank ? (
                      <span className="result-rank">#{p.rank}</span>
                    ) : (
                      <span className="result-rank" style={{ background: "var(--glass)", color: "var(--text-muted)" }}>
                        Unranked
                      </span>
                    )}
                    {p.external_id && (
                      <Link
                        href={`/player/${p.external_id}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          fontSize: "0.72rem",
                          fontFamily: "var(--font-mono)",
                          color: "var(--purple)",
                          marginLeft: "auto",
                        }}
                      >
                        Profile <i className="fa-solid fa-arrow-right" />
                      </Link>
                    )}
                  </div>

                  <div className="result-stats-grid">
                    <div className="result-stat">
                      <div className="result-stat-value highlight">{p.points.toLocaleString()}</div>
                      <div className="result-stat-label">Points</div>
                    </div>
                    <div className="result-stat">
                      <div className="result-stat-value">{p.win_rate}%</div>
                      <div className="result-stat-label">Win Rate</div>
                    </div>
                    <div className="result-stat">
                      <div className="result-stat-value">{p.battles.toLocaleString()}</div>
                      <div className="result-stat-label">Battles</div>
                    </div>
                    <div className="result-stat">
                      <div className="result-stat-value">{p.wins.toLocaleString()}</div>
                      <div className="result-stat-label">Wins</div>
                    </div>
                    <div className="result-stat">
                      <div className="result-stat-value">{p.streak > 0 ? `🔥 ${p.streak}` : "—"}</div>
                      <div className="result-stat-label">Streak</div>
                    </div>
                    <div className="result-stat">
                      <div className="result-stat-value">{p.best_streak > 0 ? p.best_streak : "—"}</div>
                      <div className="result-stat-label">Best</div>
                    </div>
                  </div>

                  <div className="result-footer">
                    {p.percentile !== null && (
                      <span className="meta-tag percentile">
                        Top {(100 - p.percentile) < 0.1 ? "0.1" : (100 - p.percentile).toFixed(1)}%
                      </span>
                    )}
                    {p.rank !== 1 && p.points_behind_leader > 0 && (
                      <span className="meta-tag behind">
                        {p.points_behind_leader.toLocaleString()} pts behind #1
                      </span>
                    )}
                    {p.rank === 1 && (
                      <span className="meta-tag leader">👑 Season leader</span>
                    )}
                    <Sparkline trend={p.trend} />
                  </div>

                  {p.previous_names.length > 0 && (
                    <div className="prev-names">
                      Formerly: {p.previous_names.join(", ")}
                    </div>
                  )}
                </div>
              );
            })}

            {!searching && query.length < 2 && (
              <div className="empty-state" style={{ paddingTop: "2rem" }}>
                <i className="fa-solid fa-user-magnifying-glass" />
                Type at least 2 characters to search
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PRIZES ─────────────────────────────────────────────────────────── */}
      {tab === "prizes" && (
        <div className="fade-in">
          <div className="section-head">
            <div className="section-title">
              {season ? `${season.label} Rewards` : "Season Rewards"}
            </div>
          </div>
          {!season?.rewards || season.rewards.length === 0 ? (
            <div className="empty-state">
              <i className="fa-solid fa-gem" />
              Prize data loads after first sync
            </div>
          ) : (
            <div className="prizes-grid">
              {season.rewards.map((r: any, i: number) => (
                <div
                  key={i}
                  className="prize-card fade-in"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <div>
                    {r.rank <= 3 ? (
                      <div className="prize-rank-display">
                        {["🥇","🥈","🥉"][r.rank - 1]}
                      </div>
                    ) : (
                      <div className="prize-rank-num">#{r.rank}</div>
                    )}
                  </div>
                  <div className="prize-tags">
                    {r.avatar && r.avatar.length > 0 && (
                      <span className="prize-tag avatar">
                        <i className="fa-solid fa-image" /> {r.avatar[0]}
                      </span>
                    )}
                    {r.rank_frame && (
                      <span className="prize-tag frame">
                        <i className="fa-solid fa-square-dashed" /> Frame
                      </span>
                    )}
                    {r.diamond > 0 && (
                      <span className="prize-tag gem">
                        <i className="fa-solid fa-gem" /> {r.diamond}
                      </span>
                    )}
                    {r.vip_pass_day > 0 && (
                      <span className="prize-tag vip">
                        <i className="fa-solid fa-star" /> {r.vip_pass_day}d VIP
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── STATS DASHBOARD ────────────────────────────────────────────────── */}
      {tab === "stats" && (
        <div className="fade-in">
          <div className="section-head">
            <div className="section-title">Season Analytics</div>
          </div>

          <div className="dashboard-intro">
            <div className="insight-card" style={{ borderColor: "rgba(168,85,247,0.25)" }}>
              <div className="insight-title">Active Players</div>
              <div className="insight-value" style={{ color: "var(--purple)" }}>
                <Counter value={rankings.length} />
              </div>
              <div className="insight-desc">Ranked this season</div>
              <div className="mini-bar">
                <div className="mini-bar-fill" style={{ width: "100%" }} />
              </div>
            </div>

            <div className="insight-card" style={{ borderColor: "rgba(34,211,238,0.25)" }}>
              <div className="insight-title">Avg Win Rate</div>
              <div className="insight-value" style={{ color: "var(--cyan)" }}>
                <Counter value={avgWinRate} />%
              </div>
              <div className="insight-desc">Top 100 average</div>
              <div className="mini-bar">
                <div className="mini-bar-fill" style={{ width: `${avgWinRate}%` }} />
              </div>
            </div>

            <div className="insight-card" style={{ borderColor: "rgba(245,158,11,0.25)" }}>
              <div className="insight-title">Combined Points</div>
              <div className="insight-value" style={{ color: "var(--gold)", fontSize: "1.4rem" }}>
                <Counter value={totalPoints} />
              </div>
              <div className="insight-desc">Total season score</div>
              <div className="mini-bar">
                <div className="mini-bar-fill" style={{ width: "85%", background: "linear-gradient(90deg, var(--gold), var(--rose))" }} />
              </div>
            </div>

            <div className="insight-card">
              <div className="insight-title">Nations Competing</div>
              <div className="insight-value">{countries.length}</div>
              <div className="insight-desc">Countries in top 100</div>
              <div className="mini-bar">
                <div className="mini-bar-fill" style={{ width: `${Math.min(100, countries.length * 4)}%`, background: "linear-gradient(90deg, var(--rose), var(--purple))" }} />
              </div>
            </div>
          </div>

          {/* Top Countries breakdown */}
          {countries.length > 0 && (
            <div className="insight-card" style={{ marginBottom: "0.75rem" }}>
              <div className="insight-title">Country Performance</div>
              <div className="top-countries-list">
                {countries.slice(0, 8).map((c, i) => {
                  const pct = Math.round((c.points / maxCountryPts) * 100);
                  return (
                    <div key={c.country}>
                      <div className="tc-row">
                        <span className="tc-flag">{flagEmoji(c.country)}</span>
                        <span className="tc-code">{c.country.toUpperCase()}</span>
                        <span className="tc-pts">{c.points.toLocaleString()} pts</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--text-muted)", minWidth: "3rem", textAlign: "right" }}>
                          {c.players} players
                        </span>
                      </div>
                      <div className="tc-bar">
                        <div className="tc-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top Streaks */}
          {streaks.length > 0 && (
            <div className="insight-card">
              <div className="insight-title">Top Active Streaks</div>
              <div className="top-countries-list">
                {streaks.map((s, i) => {
                  const pct = Math.round((s.streak / (streaks[0]?.streak ?? 1)) * 100);
                  return (
                    <div key={i}>
                      <div className="tc-row">
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--text-muted)", minWidth: "1.5rem" }}>
                          #{i + 1}
                        </span>
                        <span className="tc-code" style={{ textTransform: "none" }}>{s.name}</span>
                        <span className="tc-pts">🔥 {s.streak}</span>
                      </div>
                      <div className="tc-bar">
                        <div className="tc-bar-fill" style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--gold), var(--rose))" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Chat ───────────────────────────────────────────────────────────── */}
      <button
        className="chat-fab"
        onClick={() => setChatOpen((o) => !o)}
        aria-label="Toggle chat"
      >
        <i className={`fa-solid ${chatOpen ? "fa-xmark" : "fa-comments"}`} />
      </button>

      {chatOpen && (
        <div className="chat-drawer">
          <div className="chat-header">
            <span className="pulse-dot" style={{ width: "6px", height: "6px" }} />
            Global Chat
          </div>
          <div className="chat-messages">
            {messages.length === 0 && (
              <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", fontFamily: "var(--font-mono)", textAlign: "center", padding: "1rem 0" }}>
                Be the first to say hi
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className="chat-msg">
                <span className="who">{m.username}: </span>
                {m.message}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="chat-form">
            <input
              className="chat-name-input"
              placeholder="Name"
              value={username}
              maxLength={24}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              className="chat-msg-input"
              placeholder="Message…"
              value={draft}
              maxLength={200}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />
            <button
              className="chat-send-btn"
              onClick={sendMessage}
              aria-label="Send"
            >
              <i className="fa-solid fa-paper-plane" />
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
