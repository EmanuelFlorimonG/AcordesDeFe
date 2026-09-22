-- =============================================================================
-- GENESARET · Proposals to edit a published song (type = 'update')
--
-- An edit is proposed on one exact published version, its base_version. It
-- is published only if that version is still the current one: approving a
-- proposal made on an older version fails with GENESARET:stale and changes
-- nothing, so a newer version is never overwritten. The way out is a rebase:
-- the team asks for changes, the contributor reopens the proposal on the
-- current version and sends it again with the new base_version, checked
-- atomically here.
--
-- Locks are always taken in the same order, the proposal first and then the
-- song, so these functions can't deadlock each other:
--   approve_submission            song_submissions FOR UPDATE, songs FOR UPDATE
--   resubmit_…_verified           song_submissions FOR UPDATE, songs FOR SHARE
--   submit_…_verified             songs FOR SHARE (a new proposal has no row yet)
--
-- Earlier migrations are applied and never edited. Every function below is
-- replaced in full (same behaviour as before, plus what is described) and
-- its privileges are stated again.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- The version a proposal was made on. Null for new songs; required for an
-- edit from now on (older edits without it can't be approved: see below).
-- -----------------------------------------------------------------------------

alter table public.song_submissions
  add column base_version integer check (base_version >= 1),
  add constraint song_submissions_create_has_no_base_version check (type = 'update' or base_version is null);

-- -----------------------------------------------------------------------------
-- song_differs_from_published: does a proposed song change anything of the
-- published row? The same fields approve_submission writes (chords_used is
-- derived from the content). Numbers are compared as text, so a malformed
-- value never raises here. Internal: nobody may call it from the API.
-- -----------------------------------------------------------------------------

create or replace function public.song_differs_from_published(p_song jsonb, p_row public.songs)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not (
    btrim(coalesce(p_song ->> 'title', '')) = p_row.title
    and nullif(btrim(coalesce(p_song ->> 'artist', '')), '') is not distinct from p_row.artist
    and nullif(p_song ->> 'originalKey', '') is not distinct from p_row.original_key
    and (p_song ->> 'recommendedCapo') is not distinct from p_row.recommended_capo::text
    and nullif(p_song ->> 'timeSignature', '') is not distinct from p_row.time_signature
    and (p_song ->> 'tempo') is not distinct from p_row.tempo::text
    and nullif(p_song ->> 'rhythmPattern', '') is not distinct from p_row.rhythm_pattern
    and public.jsonb_text_array(p_song -> 'categories') = p_row.categories
    and (case when jsonb_typeof(p_song -> 'liturgicalSeasons') = 'array'
              then public.jsonb_text_array(p_song -> 'liturgicalSeasons') end) is not distinct from p_row.liturgical_seasons
    and public.jsonb_text_array(p_song -> 'tags') = p_row.tags
    and (p_song ->> 'content') is not distinct from p_row.content
    and nullif(p_song ->> 'difficulty', '') is not distinct from p_row.difficulty
    and nullif(p_song ->> 'year', '') is not distinct from p_row.year
    and nullif(p_song ->> 'youtubeId', '') is not distinct from p_row.youtube_id
  );
$$;

revoke execute on function public.song_differs_from_published(jsonb, public.songs) from public, anon, authenticated;

-- A base version as sent in JSON: a positive integer number, nothing else
-- (no text, no decimals, no zero, no absurd sizes). Null when it isn't one.
create or replace function public.base_version_of(p_value jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_value) = 'number' and (p_value #>> '{}') ~ '^[1-9][0-9]{0,8}$'
      then (p_value #>> '{}')::integer
  end;
$$;

revoke execute on function public.base_version_of(jsonb) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- submit_song_submission_verified: as in 20260920120000, plus, for an edit:
--   baseVersion required (positive integer)          else GENESARET:invalid:base_version
--   the song published, locked while checking        else GENESARET:invalid:target
--   baseVersion = current_version                    else GENESARET:stale
--   something actually changes                       else GENESARET:invalid:no_changes
-- A new song must not carry a baseVersion.
-- -----------------------------------------------------------------------------

create or replace function public.submit_song_submission_verified(p_payload jsonb, p_client_ip text)
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
  v_source_hash text;
  v_code text;
  v_token text;
  v_request uuid;
  v_existing_code text;
  v_existing_hash text;
  v_attempt integer := 0;
  v_base integer;
  v_published public.songs%rowtype;
begin
  -- Shape and size.
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 65536
     or p_payload -> 'schemaVersion' is distinct from '1'::jsonb then
    raise exception 'GENESARET:invalid:payload';
  end if;

  -- Retry identity: both or neither, well formed.
  v_token := nullif(p_payload ->> 'editToken', '');
  if v_token is not null and v_token !~ '^[0-9a-f]{64}$' then
    raise exception 'GENESARET:invalid:token';
  end if;
  if nullif(p_payload ->> 'requestId', '') is not null then
    if (p_payload ->> 'requestId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or v_token is null then
      raise exception 'GENESARET:invalid:request';
    end if;
    v_request := (p_payload ->> 'requestId')::uuid;
  end if;

  -- A retry of a proposal already stored: the same sender gets the same answer.
  if v_request is not null then
    select s.tracking_code, s.edit_token_hash into v_existing_code, v_existing_hash
    from public.song_submissions s where s.client_request_id = v_request;
    if found then
      if v_existing_hash = encode(extensions.digest(v_token, 'sha256'), 'hex') then
        return query select v_existing_code, v_token;
        return;
      end if;
      raise exception 'GENESARET:invalid:request';
    end if;
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
  if v_type = 'create' and p_payload ? 'baseVersion' and p_payload -> 'baseVersion' <> 'null'::jsonb then
    raise exception 'GENESARET:invalid:base_version';
  end if;
  if v_type = 'update' and v_target is null then
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

  -- An edit: on the current published version, and changing something.
  if v_type = 'update' then
    v_base := public.base_version_of(p_payload -> 'baseVersion');
    if v_base is null then
      raise exception 'GENESARET:invalid:base_version';
    end if;
    -- Shared lock: an approval of this song waits until this proposal is stored, and vice versa.
    select * into v_published from public.songs s where s.id = v_target for share;
    if not found or v_published.status <> 'published' then
      raise exception 'GENESARET:invalid:target';
    end if;
    if v_base <> v_published.current_version then
      raise exception 'GENESARET:stale';
    end if;
    if not public.song_differs_from_published(v_song, v_published) then
      raise exception 'GENESARET:invalid:no_changes';
    end if;
  end if;

  v_name := nullif(btrim(coalesce(p_payload -> 'contributor' ->> 'name', '')), '');
  v_email := lower(nullif(btrim(coalesce(p_payload -> 'contributor' ->> 'email', '')), ''));
  if char_length(v_name) > 80 then
    raise exception 'GENESARET:invalid:contributor';
  end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$') then
    raise exception 'GENESARET:invalid:contributor';
  end if;

  -- Rate limit (sends only): 5 per source in 10 minutes, 200 in total per hour.
  v_source_hash := encode(extensions.digest(coalesce(nullif(btrim(p_client_ip), ''), 'unknown'), 'sha256'), 'hex');
  delete from public.submission_rate_events e where e.created_at < now() - interval '1 day';
  if (select count(*) from public.submission_rate_events e
      where e.kind = 'submit' and e.source_hash = v_source_hash and e.created_at > now() - interval '10 minutes') >= 5
     or (select count(*) from public.submission_rate_events e
         where e.kind = 'submit' and e.created_at > now() - interval '1 hour') >= 200 then
    raise exception 'GENESARET:rate_limited';
  end if;
  insert into public.submission_rate_events (source_hash, kind) values (v_source_hash, 'submit');

  loop
    v_code := public.generate_tracking_code();
    exit when not exists (select 1 from public.song_submissions s where s.tracking_code = v_code);
    v_attempt := v_attempt + 1;
    if v_attempt >= 5 then
      raise exception 'GENESARET:unavailable';
    end if;
  end loop;
  v_token := coalesce(v_token, encode(extensions.gen_random_bytes(32), 'hex'));

  begin
    insert into public.song_submissions
      (type, target_song_id, proposed_song, contributor_name, contributor_email, tracking_code, edit_token_hash, client_request_id, base_version)
    values
      (v_type, v_target, v_song, v_name, v_email, v_code, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_request, v_base);
  exception when unique_violation then
    -- Two retries of the same proposal arrived at once: the first one stored it.
    select s.tracking_code, s.edit_token_hash into v_existing_code, v_existing_hash
    from public.song_submissions s where s.client_request_id = v_request;
    if found and v_existing_hash = encode(extensions.digest(v_token, 'sha256'), 'hex') then
      return query select v_existing_code, v_token;
      return;
    end if;
    raise exception 'GENESARET:unavailable';
  end;

  return query select v_code, v_token;
end;
$$;

revoke execute on function public.submit_song_submission_verified(jsonb, text) from public, anon, authenticated;
grant execute on function public.submit_song_submission_verified(jsonb, text) to service_role;

-- -----------------------------------------------------------------------------
-- resubmit_song_submission_verified: the signature gains p_base_version, so
-- the 20260921120000 function is dropped and created again (same name, same
-- first four parameters, called by name by the Edge Function). As before,
-- plus, for an edit (the rebase):
--   p_base_version required (positive)               else GENESARET:invalid:base_version
--   the song published, locked after the proposal    else GENESARET:invalid:target
--   p_base_version = current_version                 else GENESARET:stale
--   something actually changes                       else GENESARET:invalid:no_changes
--   base_version := p_base_version
-- A new song must be resent without a base version.
-- -----------------------------------------------------------------------------

drop function public.resubmit_song_submission_verified(text, text, jsonb, text);

create function public.resubmit_song_submission_verified(
  p_tracking_code text,
  p_edit_token text,
  p_song jsonb,
  p_client_ip text,
  p_base_version integer default null
)
returns table (tracking_code text, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_code text := upper(btrim(coalesce(p_tracking_code, '')));
  v_token text := coalesce(p_edit_token, '');
  v_submission public.song_submissions%rowtype;
  v_title text;
  v_content text;
  v_source_hash text;
  v_published public.songs%rowtype;
begin
  if v_code !~ '^GS-[23456789ABCDEFGHJKMNPQRSTWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTWXYZ]{4}$' or v_token !~ '^[0-9a-f]{64}$' then
    raise exception 'GENESARET:invalid:token';
  end if;

  -- The same checks on the song as a new proposal.
  if p_song is null or jsonb_typeof(p_song) <> 'object' or octet_length(p_song::text) > 65536
     or p_song -> 'schemaVersion' is distinct from '1'::jsonb then
    raise exception 'GENESARET:invalid:song';
  end if;
  v_title := btrim(coalesce(p_song ->> 'title', ''));
  v_content := coalesce(p_song ->> 'content', '');
  if char_length(v_title) not between 1 and 120 or char_length(btrim(v_content)) = 0 or char_length(v_content) > 20000 then
    raise exception 'GENESARET:invalid:song';
  end if;

  -- The same send limit as a new proposal: 5 per source in 10 minutes, 200 in total per hour.
  v_source_hash := encode(extensions.digest(coalesce(nullif(btrim(p_client_ip), ''), 'unknown'), 'sha256'), 'hex');
  delete from public.submission_rate_events e where e.created_at < now() - interval '1 day';
  if (select count(*) from public.submission_rate_events e
      where e.kind = 'submit' and e.source_hash = v_source_hash and e.created_at > now() - interval '10 minutes') >= 5
     or (select count(*) from public.submission_rate_events e
         where e.kind = 'submit' and e.created_at > now() - interval '1 hour') >= 200 then
    raise exception 'GENESARET:rate_limited';
  end if;
  insert into public.submission_rate_events (source_hash, kind) values (v_source_hash, 'submit');

  -- Locked: a reviewer deciding at the same moment waits, and then sees the new state.
  select * into v_submission from public.song_submissions s where s.tracking_code = v_code for update;
  -- A wrong token and a missing code answer the same.
  if not found or v_submission.edit_token_hash <> encode(extensions.digest(v_token, 'sha256'), 'hex') then
    raise exception 'GENESARET:invalid:token';
  end if;
  if v_submission.status <> 'changes_requested' then
    raise exception 'GENESARET:not_editable';
  end if;
  if v_submission.resubmission_count >= 20 then
    raise exception 'GENESARET:invalid:too_many_resubmissions';
  end if;

  if v_submission.type = 'update' then
    if p_base_version is null or p_base_version < 1 then
      raise exception 'GENESARET:invalid:base_version';
    end if;
    -- After the proposal, the song: the same order approve_submission locks them in.
    select * into v_published from public.songs s where s.id = v_submission.target_song_id for share;
    if not found or v_published.status <> 'published' then
      raise exception 'GENESARET:invalid:target';
    end if;
    if p_base_version <> v_published.current_version then
      raise exception 'GENESARET:stale';
    end if;
    if not public.song_differs_from_published(p_song, v_published) then
      raise exception 'GENESARET:invalid:no_changes';
    end if;
  elsif p_base_version is not null then
    raise exception 'GENESARET:invalid:base_version';
  end if;

  update public.song_submissions s set
    proposed_song = p_song,
    status = 'pending',
    resubmission_count = s.resubmission_count + 1,
    resubmitted_at = now(),
    -- The rebase: the proposal is now based on the version the contributor saw.
    base_version = case when v_submission.type = 'update' then p_base_version else s.base_version end
  where s.id = v_submission.id;

  return query select v_submission.tracking_code, 'pending'::text;
end;
$$;

revoke execute on function public.resubmit_song_submission_verified(text, text, jsonb, text, integer) from public, anon, authenticated;
grant execute on function public.resubmit_song_submission_verified(text, text, jsonb, text, integer) to service_role;

-- -----------------------------------------------------------------------------
-- approve_submission: as in 20260918120000 (same signature), except that an
-- edit is published only when, inside this transaction and with the song
-- locked FOR UPDATE:
--   the song still exists and is published          else GENESARET:invalid:target
--   base_version = current_version                  else GENESARET:stale
-- An older edit without base_version is stale too: it must be rebased first.
-- New songs are approved exactly as before.
-- -----------------------------------------------------------------------------

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
  v_current public.songs%rowtype;
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
    -- The song is locked too: two edits of it are published one after the other,
    -- and the second finds a newer version than the one it was made on.
    select * into v_current from public.songs s where s.id = v_id for update;
    if not found or v_current.status <> 'published' then
      raise exception 'GENESARET:invalid:target';
    end if;
    if v_submission.base_version is null or v_submission.base_version <> v_current.current_version then
      raise exception 'GENESARET:stale';
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

revoke execute on function public.approve_submission(uuid, text, text) from public, anon;
grant execute on function public.approve_submission(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- get_submission_for_edit: its result gains columns, which CREATE OR REPLACE
-- can't do, so it is dropped and created again with the same name and
-- arguments (the app reads the columns by name). As in 20260921120000, plus:
--   target_song_id, base_version   what an edit is for, and on which version
--   base_snapshot                  that published version as it was (from
--                                  song_versions), so the contributor can see
--                                  their own changes when rebasing. It was a
--                                  published version: nothing private.
-- Still only with the tracking code and the edit token, still rate limited,
-- never the contact data.
-- -----------------------------------------------------------------------------

drop function public.get_submission_for_edit(text, text);

create function public.get_submission_for_edit(p_tracking_code text, p_edit_token text)
returns table (
  tracking_code text,
  type text,
  status text,
  review_note text,
  proposed_song jsonb,
  target_song_id text,
  base_version integer,
  base_snapshot jsonb
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_code text := upper(btrim(coalesce(p_tracking_code, '')));
  v_token text := coalesce(p_edit_token, '');
  v_source_hash text := public.request_source_hash();
begin
  if v_code !~ '^GS-[23456789ABCDEFGHJKMNPQRSTWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTWXYZ]{4}$' or v_token !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  delete from public.submission_rate_events e where e.created_at < now() - interval '1 day';
  if (select count(*) from public.submission_rate_events e
      where e.kind = 'status' and e.source_hash = v_source_hash and e.created_at > now() - interval '10 minutes') >= 30
     or (select count(*) from public.submission_rate_events e
         where e.kind = 'status' and e.created_at > now() - interval '1 hour') >= 3000 then
    raise exception 'GENESARET:rate_limited';
  end if;
  insert into public.submission_rate_events (source_hash, kind) values (v_source_hash, 'status');

  return query
  select s.tracking_code, s.type, s.status,
         case when s.status = 'pending' then null else s.review_note end,
         s.proposed_song,
         s.target_song_id,
         s.base_version,
         (select v.snapshot from public.song_versions v
          where v.song_id = s.target_song_id and v.version = s.base_version)
  from public.song_submissions s
  where s.tracking_code = v_code
    and s.edit_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
  limit 1;
end;
$$;

revoke execute on function public.get_submission_for_edit(text, text) from public;
grant execute on function public.get_submission_for_edit(text, text) to anon, authenticated;
