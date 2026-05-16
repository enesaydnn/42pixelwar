create table if not exists teams (
  id text primary key,
  name text not null,
  campus_slug text not null unique,
  palette jsonb not null,
  created_at timestamptz not null default now()
);

insert into teams (id, name, campus_slug, palette)
values
  ('istanbul', '42 Istanbul', 'istanbul', '["#00d1ff", "#14f1ff", "#0077ff", "#ffffff", "#111827"]'::jsonb),
  ('kocaeli', '42 Kocaeli', 'kocaeli', '["#ff005c", "#ff3b30", "#ff8a00", "#ffffff", "#111827"]'::jsonb)
on conflict (id) do update
set name = excluded.name,
    campus_slug = excluded.campus_slug,
    palette = excluded.palette;

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  intra_id bigint not null unique,
  login text not null unique,
  display_name text not null,
  image_url text,
  team_id text not null references teams(id),
  campus_id bigint,
  campus_name text,
  last_location_host text,
  last_location_checked_at timestamptz,
  is_online_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null check (status in ('draft', 'active', 'completed')),
  canvas_width integer not null default 500,
  canvas_height integer not null default 500,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists pixels (
  season_id uuid not null references seasons(id),
  x integer not null check (x >= 0 and x < 500),
  y integer not null check (y >= 0 and y < 500),
  color text not null,
  team_id text not null references teams(id),
  placed_by uuid not null references players(id),
  placed_at timestamptz not null default now(),
  primary key (season_id, x, y)
);

create table if not exists pixel_events (
  id bigserial primary key,
  season_id uuid not null references seasons(id),
  x integer not null,
  y integer not null,
  old_color text,
  old_team_id text references teams(id),
  new_color text not null,
  new_team_id text not null references teams(id),
  placed_by uuid not null references players(id),
  placed_at timestamptz not null default now()
);

create index if not exists pixel_events_season_placed_at_idx
  on pixel_events (season_id, placed_at desc);

create table if not exists player_stats (
  season_id uuid not null references seasons(id),
  player_id uuid not null references players(id),
  team_id text not null references teams(id),
  pixels_placed integer not null default 0,
  pixels_overwritten integer not null default 0,
  last_pixel_at timestamptz,
  primary key (season_id, player_id)
);

create table if not exists team_stats (
  season_id uuid not null references seasons(id),
  team_id text not null references teams(id),
  controlled_pixels integer not null default 0,
  score integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (season_id, team_id)
);

create table if not exists reward_notes (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  winning_team_id text references teams(id),
  status text not null default 'manual_review',
  note text,
  created_at timestamptz not null default now()
);
