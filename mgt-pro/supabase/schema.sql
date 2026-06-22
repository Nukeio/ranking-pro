-- Run this in the Supabase SQL editor (Project -> SQL Editor -> New query)
-- after creating your project.

-- ── Core tables ───────────────────────────────────────────────────────────────

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  external_id text unique not null,     -- facebook_id from the MT3 API
  display_name text not null,
  country text,                         -- 2-letter country code, e.g. "bo", "de"
  created_at timestamptz default now()
);

create table if not exists name_history (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  old_name text not null,
  changed_at timestamptz default now()
);

create table if not exists seasons (
  id serial primary key,
  number int unique not null,
  label text,                            -- e.g. "Season 205"
  duration_days int,                     -- from fetchSeason: duration field
  starts_at timestamptz,
  ends_at timestamptz,
  is_current boolean default false,
  -- Prize info stored as JSON (from season_rewards[])
  rewards jsonb
);

-- One row per player per season.
create table if not exists season_stats (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  season_id int references seasons(id) on delete cascade,
  rank int,
  points int default 0,
  battles int default 0,
  wins int default 0,
  current_streak int default 0,
  best_streak int default 0,
  updated_at timestamptz default now(),
  unique (player_id, season_id)
);

create index if not exists idx_season_stats_season_points
  on season_stats (season_id, points desc);

create index if not exists idx_season_stats_streak
  on season_stats (season_id, current_streak desc);

-- Rank history: one row per player per sync, used for ↑↓ rank change arrows
create table if not exists rank_history (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  season_id int references seasons(id) on delete cascade,
  rank int not null,
  points int not null,
  recorded_at timestamptz default now()
);

create index if not exists idx_rank_history_player_season
  on rank_history (player_id, season_id, recorded_at desc);

create table if not exists achievements (
  id serial primary key,
  code text unique not null,
  label text not null,
  description text,
  icon text
);

create table if not exists player_achievements (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  achievement_id int references achievements(id) on delete cascade,
  season_id int references seasons(id),
  earned_at timestamptz default now(),
  unique (player_id, achievement_id, season_id)
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  message text not null,
  created_at timestamptz default now()
);

create index if not exists idx_chat_created_at on chat_messages (created_at desc);

-- ── Functions ─────────────────────────────────────────────────────────────────

-- Recompute ranks by points desc after each sync
create or replace function update_ranks(p_season_id int)
returns void language plpgsql as $$
begin
  update season_stats ss
  set rank = sub.new_rank
  from (
    select id,
           row_number() over (order by points desc) as new_rank
    from season_stats
    where season_id = p_season_id
  ) sub
  where ss.id = sub.id
    and ss.season_id = p_season_id;
end;
$$;

-- ── Seed data ─────────────────────────────────────────────────────────────────

insert into seasons (number, label, is_current, duration_days)
values (205, 'Season 205', true, 14)
on conflict (number) do nothing;

insert into achievements (code, label, icon) values
  ('streak_20',  'Hot Streak',     'fa-fire'),
  ('streak_35',  'On Fire',        'fa-fire-flame-curved'),
  ('streak_70',  'Unstoppable',    'fa-bolt'),
  ('streak_100', 'Legendary Run',  'fa-crown')
on conflict (code) do nothing;

-- Keep only the last 3 rank snapshots per player per season (prevents table bloat)
create or replace function prune_rank_history(p_season_id int)
returns void language plpgsql as $$
begin
  delete from rank_history
  where id in (
    select id from (
      select id,
             row_number() over (partition by player_id order by recorded_at desc) as rn
      from rank_history
      where season_id = p_season_id
    ) ranked
    where rn > 3
  );
end;
$$;
