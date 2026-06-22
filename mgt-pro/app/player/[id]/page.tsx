"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type PlayerProfile = {
  name: string;
  country: string | null;
  external_id: string;
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

function flagEmoji(code: string | null): string {
  if (!code || code.length !== 2) return "🌐";
  return Array.from(code.toUpperCase())
    .map((c) => String.fromCodePoint(c.charCodeAt(0) + 127397))
    .join("");
}

function winRatePct(wins: number, battles: number) {
  if (!battles) return "—";
  return `${Math.round((wins / battles) * 100)}%`;
}

const BADGES = [
  { min: 100, icon: "fa-crown",             label: "Legendary Run", cls: "badge-legendary" },
  { min: 70,  icon: "fa-bolt",              label: "Unstoppable",   cls: "badge-bolt"      },
  { min: 35,  icon: "fa-fire-flame-curved", label: "On Fire",       cls: "badge-fire"      },
  { min: 20,  icon: "fa-fire",              label: "Hot Streak",    cls: "badge-hot"       },
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

function Sparkline({ trend }: { trend: { rank: number; points: number }[] }) {
  if (!trend || trend.length < 2) return null;
  const max = Math.max(...trend.map((t) => t.points));
  const min = Math.min(...trend.map((t) => t.points));
  const range = Math.max(1, max - min);
  return (
    <div className="sparkline" style={{ height: "40px" }}>
      {trend.map((t, i) => {
        const h = 15 + ((t.points - min) / range) * 85;
        const prev = trend[i - 1];
        const cls = !prev ? "same" : t.points > prev.points ? "up" : t.points < prev.points ? "down" : "same";
        return <span key={i} className={`spark-bar ${cls}`} style={{ height: `${h}%`, width: "10px" }} />;
      })}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: "purple" | "gold" | "cyan" }) {
  return (
    <div className="profile-stat-card">
      <div className={`profile-stat-val${accent ? ` ${accent}` : ""}`}>{value}</div>
      <div className="profile-stat-lbl">{label}</div>
    </div>
  );
}

export default function PlayerPage() {
  const params = useParams();
  const id = params?.id as string;

  const [player, setPlayer] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/player/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.player) {
          // rank_history → trend format
          const trend = (data.player.rank_history ?? []).map((h: any) => ({
            rank: h.rank,
            points: h.points,
          }));
          setPlayer({ ...data.player, trend });
        } else {
          setNotFound(true);
        }
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [id]);

  const animatedPoints = useCountUp(player?.points ?? 0);

  if (loading) {
    return (
      <main className="shell fade-in">
        <div className="profile-hero">
          <Link href="/" className="profile-back">
            <i className="fa-solid fa-arrow-left" /> Back to Rankings
          </Link>
          <div className="empty-state">
            <i className="fa-solid fa-spinner fa-spin" />
            Loading profile…
          </div>
        </div>
      </main>
    );
  }

  if (notFound || !player) {
    return (
      <main className="shell fade-in">
        <div className="profile-hero">
          <Link href="/" className="profile-back">
            <i className="fa-solid fa-arrow-left" /> Back to Rankings
          </Link>
          <div className="empty-state">
            <i className="fa-solid fa-user-slash" />
            Player not found.<br />
            <span style={{ fontSize: "0.8rem" }}>They may not be ranked this season.</span>
          </div>
        </div>
      </main>
    );
  }

  const badge = bestBadge(player.best_streak);

  return (
    <main className="shell fade-in">
      <div className="profile-hero">
        <Link href="/" className="profile-back">
          <i className="fa-solid fa-arrow-left" /> Back to Rankings
        </Link>

        <div className="profile-identity">
          <div className="profile-avatar">
            {flagEmoji(player.country)}
          </div>
          <div className="profile-text">
            <div className="profile-name">{player.name}</div>
            <div className="profile-sub">
              {player.country && (
                <span style={{ textTransform: "uppercase" }}>{player.country}</span>
              )}
              {player.rank && (
                <span style={{ color: "var(--purple)" }}>Rank #{player.rank}</span>
              )}
              {badge && (
                <span className={`achievement-badge ${badge.cls}`}>
                  <i className={`fa-solid ${badge.icon}`} /> {badge.label}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="section-head">
        <div className="section-title">Season Statistics</div>
      </div>
      <div className="profile-stats-grid" style={{ marginBottom: "1rem" }}>
        <StatCard label="Points"    value={animatedPoints.toLocaleString()} accent="purple" />
        <StatCard label="Win Rate"  value={winRatePct(player.wins, player.battles)} accent="cyan" />
        <StatCard label="Battles"   value={player.battles.toLocaleString()} />
        <StatCard label="Wins"      value={player.wins.toLocaleString()} />
        <StatCard label="Streak"    value={player.streak > 0 ? `🔥 ${player.streak}` : "—"} accent="gold" />
        <StatCard label="Best Ever" value={player.best_streak > 0 ? player.best_streak : "—"} />
      </div>

      {/* Performance insights */}
      <div className="panel-card" style={{ marginBottom: "0.75rem" }}>
        <div className="panel-card-title">Performance Insights</div>
        <div style={{ padding: "1rem 1.1rem", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          {player.percentile !== null && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Season Percentile</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--cyan)" }}>
                  Top {(100 - player.percentile) < 0.1 ? "0.1" : (100 - player.percentile).toFixed(1)}%
                </span>
              </div>
              <div className="mini-bar">
                <div className="mini-bar-fill" style={{ width: `${player.percentile}%` }} />
              </div>
            </div>
          )}

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Win Rate</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--purple)" }}>
                {player.win_rate}%
              </span>
            </div>
            <div className="mini-bar">
              <div className="mini-bar-fill" style={{ width: `${player.win_rate}%`, background: "linear-gradient(90deg, var(--purple), var(--cyan))" }} />
            </div>
          </div>

          {player.points_behind_leader > 0 && player.rank !== 1 && (
            <div style={{
              background: "var(--glass)",
              border: "1px solid var(--glass-border)",
              borderRadius: "var(--radius-sm)",
              padding: "0.65rem 0.85rem",
              fontFamily: "var(--font-mono)",
              fontSize: "0.78rem",
              color: "var(--text-secondary)",
            }}>
              <i className="fa-solid fa-chart-line" style={{ marginRight: "0.5rem", color: "var(--rose)" }} />
              {player.points_behind_leader.toLocaleString()} points behind #1
            </div>
          )}

          {player.rank === 1 && (
            <div style={{
              background: "var(--gold-dim)",
              border: "1px solid rgba(245,158,11,0.25)",
              borderRadius: "var(--radius-sm)",
              padding: "0.65rem 0.85rem",
              fontFamily: "var(--font-mono)",
              fontSize: "0.78rem",
              color: "var(--gold)",
            }}>
              👑 Currently leading the season
            </div>
          )}
        </div>
      </div>

      {/* Points trend */}
      {player.trend && player.trend.length > 1 && (
        <div className="panel-card" style={{ marginBottom: "0.75rem" }}>
          <div className="panel-card-title">Points Trend</div>
          <div style={{ padding: "1rem 1.1rem" }}>
            <Sparkline trend={player.trend} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem" }}>
              {player.trend.map((t, i) => (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--text-primary)" }}>
                    {t.points.toLocaleString()}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "var(--text-muted)" }}>
                    #{t.rank}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Previous names */}
      {player.previous_names.length > 0 && (
        <div className="panel-card" style={{ marginBottom: "0.75rem" }}>
          <div className="panel-card-title">Name History</div>
          <div style={{ padding: "0.75rem 1.1rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {player.previous_names.map((name, i) => (
              <div key={i} style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.82rem",
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}>
                <i className="fa-solid fa-clock-rotate-left" style={{ color: "var(--text-muted)", fontSize: "0.7rem" }} />
                {name}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ height: "2rem" }} />
    </main>
  );
}
