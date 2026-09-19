-- =============================================================================
-- GENESARET · Phase 6A
-- Official catalog, published versions and public submissions.
--
-- Principles
--   * The public reads the published catalog and can send proposals, with no
--     account. A proposal never changes the catalog by itself.
--   * Publishing is a database operation for an authorized reviewer
--     (approve_submission): song, version and submission change together, in
--     one transaction, or not at all.
--   * Nothing relies on the frontend: Row Level Security is on for every table,
--     writes are revoked from the public roles, and the only doors are the
--     functions below, each checking what it needs.
--   * Contributor emails are never readable by the public roles.
-- =============================================================================

-- Random bytes and SHA-256 (enabled by default on Supabase, in `extensions`).
create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- A JSON array of strings as text[]; anything else becomes an empty array.
create or replace function public.jsonb_text_array(p_value jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_value) = 'array' then array(select jsonb_array_elements_text(p_value))
    else '{}'::text[]
  end;
$$;

-- "Sencillamente Dios" -> "sencillamente-dios": the id format of the catalog.
-- The same rule as suggestSongId() in src/catalog/songId.ts.
create or replace function public.slugify_song_id(p_title text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      trim(both '-' from left(
        trim(both '-' from regexp_replace(
          translate(lower(coalesce(p_title, '')), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'),
          '[^a-z0-9]+', '-', 'g'
        )),
        60
      )),
      ''
    ),
    'cancion'
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- songs: the official catalog, one row per published song
-- -----------------------------------------------------------------------------
-- Metadata in columns (searchable, constrained); the music in `content`, the
-- bracket notation the app's parser, transposer and renderer already read.
-- Sections are not split into rows: they are derived from `content` by the
-- parser, and storing them twice would create two sources of truth.

create table public.songs (
  -- Text ids: the 97 bundled songs keep theirs exactly ("huracan-hakuna").
  id text primary key
    check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 80),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  artist text check (char_length(artist) <= 120),
  original_key text check (char_length(original_key) between 1 and 8),
  recommended_capo smallint check (recommended_capo between 0 and 11),
  time_signature text check (time_signature ~ '^[0-9]{1,2}/(2|4|8|16)$'),
  tempo smallint check (tempo between 30 and 300),
  rhythm_pattern text check (char_length(rhythm_pattern) <= 120),
  categories text[] not null default '{}',
  -- Null means "not classified yet"; an empty array is not the same thing.
  liturgical_seasons text[],
  tags text[] not null default '{}',
  content text not null check (char_length(content) between 1 and 20000),
  chords_used text[] not null default '{}',
  difficulty text check (difficulty in ('Fácil', 'Intermedio', 'Avanzado')),
  year text check (year ~ '^[0-9]{4}$'),
  youtube_id text check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  -- Songs are hidden, never deleted: versions and local lists point at them.
  status text not null default 'published' check (status in ('published', 'hidden')),
  current_version integer not null default 1 check (current_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index songs_status_title_idx on public.songs (status, title);

create trigger songs_set_updated_at
  before update on public.songs
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- song_submissions: proposals from the public (new songs and corrections)
-- -----------------------------------------------------------------------------

create table public.song_submissions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('create', 'update')),
  target_song_id text references public.songs (id) on update restrict on delete set null,
  -- Exactly what was sent (a SongDraft, see src/catalog/songDraft.ts).
  proposed_song jsonb not null check (jsonb_typeof(proposed_song) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'changes_requested', 'rejected', 'approved')),
  -- Personal data: optional, minimal, never readable by the public roles.
  contributor_name text check (char_length(contributor_name) <= 80),
  contributor_email text check (char_length(contributor_email) <= 254),
  -- Public, random, unique: checks the status and nothing else.
  tracking_code text not null unique
    check (tracking_code ~ '^GS-[23456789ABCDEFGHJKMNPQRSTWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTWXYZ]{4}$'),
  -- A future "edit my submission" secret. Only its SHA-256 is stored; the
  -- token itself is returned once, to the sender, and never again.
  edit_token_hash text not null check (edit_token_hash ~ '^[0-9a-f]{64}$'),
  -- Written for the contributor; shown with the tracking code once reviewed.
  review_note text check (char_length(review_note) <= 2000),
  reviewed_by uuid,
  -- What an approval produced, for the record.
  published_song_id text references public.songs (id) on update restrict on delete set null,
  published_version integer,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint song_submissions_create_has_no_target check (type = 'update' or target_song_id is null)
);

create index song_submissions_status_idx on public.song_submissions (status, submitted_at);

create trigger song_submissions_set_updated_at
  before update on public.song_submissions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- song_versions: an immutable snapshot of every publication
-- -----------------------------------------------------------------------------

create table public.song_versions (
  id uuid primary key default gen_random_uuid(),
  song_id text not null references public.songs (id) on update restrict on delete restrict,
  version integer not null check (version >= 1),
  -- The whole published row as it was: enough to rebuild that version alone.
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  -- Restrict, not "set null": a version never changes. To remove someone's
  -- personal data, their submission's email is cleared, the row is kept.
  submission_id uuid references public.song_submissions (id) on delete restrict,
  published_by uuid,
  published_at timestamptz not null default now(),
  unique (song_id, version)
);

-- A version is history: it is written once and never changed or removed.
create or replace function public.forbid_song_version_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Las versiones publicadas no se modifican ni se eliminan.';
end;
$$;

create trigger song_versions_immutable
  before update or delete on public.song_versions
  for each row execute function public.forbid_song_version_changes();

-- -----------------------------------------------------------------------------
-- editorial_roles: who may review (assigned by the project owner, in SQL)
-- -----------------------------------------------------------------------------

create table public.editorial_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'reviewer')),
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- submission_rate_events: the first line against abuse of public submissions
-- -----------------------------------------------------------------------------
-- Only a SHA-256 of the sender's IP and a time; rows older than a day are
-- deleted on every submission. Nobody outside the database can read it.

create table public.submission_rate_events (
  id bigint generated always as identity primary key,
  source_hash text not null,
  created_at timestamptz not null default now()
);

create index submission_rate_events_source_idx on public.submission_rate_events (source_hash, created_at);
create index submission_rate_events_created_idx on public.submission_rate_events (created_at);

-- -----------------------------------------------------------------------------
-- Row Level Security and privileges
-- -----------------------------------------------------------------------------

alter table public.songs enable row level security;
alter table public.song_versions enable row level security;
alter table public.song_submissions enable row level security;
alter table public.editorial_roles enable row level security;
alter table public.submission_rate_events enable row level security;

-- Defense in depth: even if a policy were added by mistake, the public roles
-- hold no write privilege on any of these tables. Writes happen only inside
-- the security definer functions below.
revoke insert, update, delete, truncate, references, trigger
  on public.songs, public.song_versions, public.song_submissions,
     public.editorial_roles, public.submission_rate_events
  from anon, authenticated;

-- Reading is granted explicitly (newer projects don't grant it by default);
-- the policies below then decide which rows.
grant select on public.songs to anon, authenticated;
grant select on public.song_versions, public.song_submissions, public.editorial_roles to authenticated;

-- Submissions, roles and rate events are not readable by anon at all.
revoke select on public.song_submissions, public.editorial_roles, public.submission_rate_events from anon;
revoke select on public.submission_rate_events from authenticated;
revoke select on public.song_versions from anon;

-- Is the current user a reviewer? Used by policies and functions.
create or replace function public.has_editorial_role(p_roles text[] default array['admin', 'reviewer'])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.editorial_roles r
    where r.user_id = (select auth.uid()) and r.role = any (p_roles)
  );
$$;

-- songs: everyone reads what is published; reviewers also see hidden songs.
create policy songs_public_read on public.songs
  for select to anon, authenticated
  using (status = 'published');

create policy songs_reviewer_read on public.songs
  for select to authenticated
  using ((select public.has_editorial_role()));

-- song_versions: reviewers only, for now (no public screen needs them yet).
create policy song_versions_reviewer_read on public.song_versions
  for select to authenticated
  using ((select public.has_editorial_role()));

-- song_submissions: reviewers only. The public goes through
-- get_submission_status(), which returns safe fields for one code.
create policy song_submissions_reviewer_read on public.song_submissions
  for select to authenticated
  using ((select public.has_editorial_role()));

-- editorial_roles: a signed-in user can see their own role (to show the
-- admin screens), nobody else's. No write policy: roles are assigned in SQL.
create policy editorial_roles_read_own on public.editorial_roles
  for select to authenticated
  using (user_id = (select auth.uid()));

-- submission_rate_events: no policy at all.

-- -----------------------------------------------------------------------------
-- Tracking codes
-- -----------------------------------------------------------------------------

create or replace function public.generate_tracking_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTWXYZ';
  v_size constant integer := 29;
  -- 232 = 29 * 8: bytes at or above it are dropped so no character is favoured.
  v_limit constant integer := 232;
  v_chars text := '';
  v_byte integer;
begin
  while char_length(v_chars) < 8 loop
    v_byte := get_byte(extensions.gen_random_bytes(1), 0);
    if v_byte < v_limit then
      v_chars := v_chars || substr(v_alphabet, (v_byte % v_size) + 1, 1);
    end if;
  end loop;
  return 'GS-' || substr(v_chars, 1, 4) || '-' || substr(v_chars, 5, 4);
end;
$$;

-- -----------------------------------------------------------------------------
-- Public function: send a submission
-- -----------------------------------------------------------------------------
-- The only way to create a submission. It validates the proposal, applies a
-- first rate limit, generates the tracking code and the edit token, and
-- returns them once. The place to add CAPTCHA (Turnstile) verification and
-- spam checks later is this function, or an Edge Function in front of it.

create or replace function public.submit_song_submission(p_payload jsonb)
returns table (tracking_code text, edit_token text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_type text;
  v_target text;
  v_song jsonb;
  v_title text;
  v_content text;
  v_name text;
  v_email text;
  v_source text;
  v_source_hash text;
  v_code text;
  v_token text;
  v_attempt integer := 0;
begin
  -- Shape and size.
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 65536
     or p_payload -> 'schemaVersion' is distinct from '1'::jsonb then
    raise exception 'GENESARET:invalid:payload';
  end if;

  v_type := p_payload ->> 'type';
  v_target := nullif(p_payload ->> 'targetSongId', '');
  v_song := p_payload -> 'song';

  if v_type is null or v_type not in ('create', 'update') then
    raise exception 'GENESARET:invalid:type';
  end if;
  if v_type = 'create' and v_target is not null then
    raise exception 'GENESARET:invalid:target';
  end if;
  if v_type = 'update' and (v_target is null or not exists (
    select 1 from public.songs s where s.id = v_target and s.status = 'published'
  )) then
    raise exception 'GENESARET:invalid:target';
  end if;

  if v_song is null or jsonb_typeof(v_song) <> 'object' or v_song -> 'schemaVersion' is distinct from '1'::jsonb then
    raise exception 'GENESARET:invalid:song';
  end if;
  v_title := btrim(coalesce(v_song ->> 'title', ''));
  v_content := coalesce(v_song ->> 'content', '');
  if char_length(v_title) not between 1 and 120 or char_length(btrim(v_content)) = 0 or char_length(v_content) > 20000 then
    raise exception 'GENESARET:invalid:song';
  end if;

  v_name := nullif(btrim(coalesce(p_payload -> 'contributor' ->> 'name', '')), '');
  v_email := lower(nullif(btrim(coalesce(p_payload -> 'contributor' ->> 'email', '')), ''));
  if char_length(v_name) > 80 then
    raise exception 'GENESARET:invalid:contributor';
  end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$') then
    raise exception 'GENESARET:invalid:contributor';
  end if;

  -- First rate limit: 5 per source in 10 minutes, 200 in total per hour.
  -- The source is the client IP as the API gateway reports it, hashed.
  v_source := btrim(split_part(
    coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', 'unknown'), ',', 1
  ));
  v_source_hash := encode(extensions.digest(v_source, 'sha256'), 'hex');
  delete from public.submission_rate_events e where e.created_at < now() - interval '1 day';
  if (select count(*) from public.submission_rate_events e
      where e.source_hash = v_source_hash and e.created_at > now() - interval '10 minutes') >= 5
     or (select count(*) from public.submission_rate_events e
         where e.created_at > now() - interval '1 hour') >= 200 then
    raise exception 'GENESARET:rate_limited';
  end if;
  insert into public.submission_rate_events (source_hash) values (v_source_hash);

  -- Codes are random; a collision is astronomically rare, but never trusted.
  loop
    v_code := public.generate_tracking_code();
    exit when not exists (select 1 from public.song_submissions s where s.tracking_code = v_code);
    v_attempt := v_attempt + 1;
    if v_attempt >= 5 then
      raise exception 'GENESARET:unavailable';
    end if;
  end loop;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.song_submissions
    (type, target_song_id, proposed_song, contributor_name, contributor_email, tracking_code, edit_token_hash)
  values
    (v_type, v_target, v_song, v_name, v_email, v_code, encode(extensions.digest(v_token, 'sha256'), 'hex'));

  return query select v_code, v_token;
end;
$$;

-- -----------------------------------------------------------------------------
-- Public function: check a submission's status
-- -----------------------------------------------------------------------------
-- Safe fields only, for one exact code. Never the email, the name, the
-- proposal's content, internal ids or the edit token hash.

create or replace function public.get_submission_status(p_tracking_code text)
returns table (
  tracking_code text,
  type text,
  title text,
  status text,
  review_note text,
  submitted_at timestamptz,
  reviewed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.tracking_code,
    s.type,
    s.proposed_song ->> 'title',
    s.status,
    case when s.status = 'pending' then null else s.review_note end,
    s.submitted_at,
    s.reviewed_at
  from public.song_submissions s
  where s.tracking_code = upper(btrim(p_tracking_code))
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- Review functions (reviewers only; the admin panel of phase 6C calls them)
-- -----------------------------------------------------------------------------

-- Publishes a submission, atomically: validate, create or update the song,
-- write its new version, mark the submission approved. Any failure (a
-- constraint, a missing song, a concurrent review) rolls everything back.
create or replace function public.approve_submission(
  p_submission_id uuid,
  p_song_id text default null,
  p_review_note text default null
)
returns table (song_id text, version integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_submission public.song_submissions%rowtype;
  v_song jsonb;
  v_id text;
  v_version integer;
  v_suffix integer := 1;
begin
  if not public.has_editorial_role() then
    raise exception 'GENESARET:forbidden' using errcode = '42501';
  end if;
  if char_length(p_review_note) > 2000 then
    raise exception 'GENESARET:invalid:review_note';
  end if;

  -- The row is locked: two reviewers can't publish the same proposal twice.
  select * into v_submission from public.song_submissions s where s.id = p_submission_id for update;
  if not found then
    raise exception 'GENESARET:not_found';
  end if;
  if v_submission.status not in ('pending', 'changes_requested') then
    raise exception 'GENESARET:not_reviewable';
  end if;
  v_song := v_submission.proposed_song;

  if v_submission.type = 'update' then
    v_id := v_submission.target_song_id;
    if v_id is null then
      raise exception 'GENESARET:invalid:target';
    end if;
    update public.songs s set
      title = btrim(v_song ->> 'title'),
      artist = nullif(btrim(coalesce(v_song ->> 'artist', '')), ''),
      original_key = nullif(v_song ->> 'originalKey', ''),
      recommended_capo = (v_song ->> 'recommendedCapo')::smallint,
      time_signature = nullif(v_song ->> 'timeSignature', ''),
      tempo = (v_song ->> 'tempo')::smallint,
      rhythm_pattern = nullif(v_song ->> 'rhythmPattern', ''),
      categories = public.jsonb_text_array(v_song -> 'categories'),
      liturgical_seasons = case when jsonb_typeof(v_song -> 'liturgicalSeasons') = 'array'
                                then public.jsonb_text_array(v_song -> 'liturgicalSeasons') end,
      tags = public.jsonb_text_array(v_song -> 'tags'),
      content = v_song ->> 'content',
      chords_used = public.jsonb_text_array(v_song -> 'chordsUsed'),
      difficulty = nullif(v_song ->> 'difficulty', ''),
      year = nullif(v_song ->> 'year', ''),
      youtube_id = nullif(v_song ->> 'youtubeId', ''),
      current_version = s.current_version + 1
    where s.id = v_id
    returning s.current_version into v_version;
    if v_version is null then
      raise exception 'GENESARET:invalid:target';
    end if;
  else
    v_id := coalesce(nullif(btrim(p_song_id), ''), public.slugify_song_id(v_song ->> 'title'));
    if v_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_id) > 80 then
      raise exception 'GENESARET:invalid:song_id';
    end if;
    if exists (select 1 from public.songs s where s.id = v_id) then
      -- A chosen id must be free; a proposed one gets a number ("cancion-2").
      if p_song_id is not null then
        raise exception 'GENESARET:song_id_taken';
      end if;
      loop
        v_suffix := v_suffix + 1;
        exit when not exists (select 1 from public.songs s where s.id = v_id || '-' || v_suffix);
      end loop;
      v_id := v_id || '-' || v_suffix;
    end if;
    insert into public.songs (
      id, title, artist, original_key, recommended_capo, time_signature, tempo, rhythm_pattern,
      categories, liturgical_seasons, tags, content, chords_used, difficulty, year, youtube_id,
      status, current_version
    ) values (
      v_id,
      btrim(v_song ->> 'title'),
      nullif(btrim(coalesce(v_song ->> 'artist', '')), ''),
      nullif(v_song ->> 'originalKey', ''),
      (v_song ->> 'recommendedCapo')::smallint,
      nullif(v_song ->> 'timeSignature', ''),
      (v_song ->> 'tempo')::smallint,
      nullif(v_song ->> 'rhythmPattern', ''),
      public.jsonb_text_array(v_song -> 'categories'),
      case when jsonb_typeof(v_song -> 'liturgicalSeasons') = 'array'
           then public.jsonb_text_array(v_song -> 'liturgicalSeasons') end,
      public.jsonb_text_array(v_song -> 'tags'),
      v_song ->> 'content',
      public.jsonb_text_array(v_song -> 'chordsUsed'),
      nullif(v_song ->> 'difficulty', ''),
      nullif(v_song ->> 'year', ''),
      nullif(v_song ->> 'youtubeId', ''),
      'published',
      1
    );
    v_version := 1;
  end if;

  insert into public.song_versions (song_id, version, snapshot, submission_id, published_by)
  select s.id, v_version, to_jsonb(s), v_submission.id, (select auth.uid())
  from public.songs s where s.id = v_id;

  update public.song_submissions s set
    status = 'approved',
    review_note = coalesce(nullif(btrim(p_review_note), ''), s.review_note),
    reviewed_by = (select auth.uid()),
    reviewed_at = now(),
    published_song_id = v_id,
    published_version = v_version
  where s.id = v_submission.id;

  return query select v_id, v_version;
end;
$$;

-- Sends a proposal back to its author with a note (the tracking code shows it).
create or replace function public.request_submission_changes(p_submission_id uuid, p_review_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.has_editorial_role() then
    raise exception 'GENESARET:forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_review_note, ''))) not between 1 and 2000 then
    raise exception 'GENESARET:invalid:review_note';
  end if;
  update public.song_submissions s set
    status = 'changes_requested',
    review_note = btrim(p_review_note),
    reviewed_by = (select auth.uid()),
    reviewed_at = now()
  where s.id = p_submission_id and s.status = 'pending';
  if not found then
    raise exception 'GENESARET:not_reviewable';
  end if;
end;
$$;

create or replace function public.reject_submission(p_submission_id uuid, p_review_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.has_editorial_role() then
    raise exception 'GENESARET:forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_review_note, ''))) not between 1 and 2000 then
    raise exception 'GENESARET:invalid:review_note';
  end if;
  update public.song_submissions s set
    status = 'rejected',
    review_note = btrim(p_review_note),
    reviewed_by = (select auth.uid()),
    reviewed_at = now()
  where s.id = p_submission_id and s.status in ('pending', 'changes_requested');
  if not found then
    raise exception 'GENESARET:not_reviewable';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Who may call what
-- -----------------------------------------------------------------------------
-- Supabase grants EXECUTE on new functions to anon and authenticated by
-- default: everything is revoked first, then granted one by one.

revoke execute on function
  public.jsonb_text_array(jsonb),
  public.slugify_song_id(text),
  public.set_updated_at(),
  public.forbid_song_version_changes(),
  public.generate_tracking_code(),
  public.has_editorial_role(text[]),
  public.submit_song_submission(jsonb),
  public.get_submission_status(text),
  public.approve_submission(uuid, text, text),
  public.request_submission_changes(uuid, text),
  public.reject_submission(uuid, text)
from public, anon, authenticated;

-- The public: send a proposal, check one by its code.
grant execute on function public.submit_song_submission(jsonb) to anon, authenticated;
grant execute on function public.get_submission_status(text) to anon, authenticated;

-- Signed-in users: the functions check the editorial role themselves.
grant execute on function public.has_editorial_role(text[]) to authenticated;
grant execute on function public.approve_submission(uuid, text, text) to authenticated;
grant execute on function public.request_submission_changes(uuid, text) to authenticated;
grant execute on function public.reject_submission(uuid, text) to authenticated;
