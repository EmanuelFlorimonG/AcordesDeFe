-- =============================================================================
-- GENESARET · Editorial decisions apply to the proposal the reviewer read
--
-- baseVersion protects the SONG: an edit is published only on the version it
-- was made on. It says nothing about the PROPOSAL, which its author can send
-- again, with other words, while the panel shows the old one. Approving then
-- published content nobody reviewed.
--
-- Every proposal now carries a revision, raised whenever its author sends it
-- again. The panel reads it with the proposal and gives it back when it
-- decides; if it no longer matches, the decision is refused with
-- GENESARET:submission_changed and nothing is written. The check happens
-- inside the same transaction, right after the row is locked.
--
-- The revision is required: a caller that doesn't say what it read is refused
-- (GENESARET:invalid:revision). So this migration and the panel that sends it
-- are deployed together; between the two, approving, asking for changes and
-- rejecting are refused, and nothing is published by accident.
--
-- Lock order is unchanged (the proposal first, then the song), and so are the
-- privileges: these functions stay with `authenticated` and check the
-- editorial role themselves.
-- =============================================================================

alter table public.song_submissions
  add column revision integer not null default 1 check (revision >= 1);

comment on column public.song_submissions.revision is
  'Raised on every resubmission: what an editorial decision must name to apply.';

-- -----------------------------------------------------------------------------
-- resubmit_song_submission_verified: as in 20260923120000, and the content the
-- reviewer may have been reading becomes another revision.
-- -----------------------------------------------------------------------------

create or replace function public.resubmit_song_submission_verified(
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
    -- What the reviewer read is no longer what is stored: their decision must not apply.
    revision = s.revision + 1,
    -- The rebase: the proposal is now based on the version the contributor saw.
    base_version = case when v_submission.type = 'update' then p_base_version else s.base_version end
  where s.id = v_submission.id;

  return query select v_submission.tracking_code, 'pending'::text;
end;
$$;

revoke execute on function public.resubmit_song_submission_verified(text, text, jsonb, text, integer) from public, anon, authenticated;
grant execute on function public.resubmit_song_submission_verified(text, text, jsonb, text, integer) to service_role;

-- -----------------------------------------------------------------------------
-- approve_submission: as in 20260923120000, plus the revision the reviewer
-- read. Its signature changes, so the old one is dropped first.
-- -----------------------------------------------------------------------------

drop function public.approve_submission(uuid, text, text);

create function public.approve_submission(
  p_submission_id uuid,
  p_song_id text default null,
  p_review_note text default null,
  p_expected_revision integer default null
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
  -- Decided on what the reviewer read, not on whatever is stored now.
  if p_expected_revision is null then
    raise exception 'GENESARET:invalid:revision';
  end if;
  if v_submission.revision <> p_expected_revision then
    raise exception 'GENESARET:submission_changed';
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

revoke execute on function public.approve_submission(uuid, text, text, integer) from public, anon;
grant execute on function public.approve_submission(uuid, text, text, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- request_submission_changes and reject_submission: same as in
-- 20260918120000, with the same check. A note written for a proposal that
-- changed underneath would be answering something else.
-- -----------------------------------------------------------------------------

drop function public.request_submission_changes(uuid, text);

create function public.request_submission_changes(p_submission_id uuid, p_review_note text, p_expected_revision integer default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_submission public.song_submissions%rowtype;
begin
  if not public.has_editorial_role() then
    raise exception 'GENESARET:forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_review_note, ''))) not between 1 and 2000 then
    raise exception 'GENESARET:invalid:review_note';
  end if;
  -- Locked, then checked against what the reviewer read.
  select * into v_submission from public.song_submissions s where s.id = p_submission_id for update;
  if not found then
    raise exception 'GENESARET:not_found';
  end if;
  if p_expected_revision is null then
    raise exception 'GENESARET:invalid:revision';
  end if;
  if v_submission.revision <> p_expected_revision then
    raise exception 'GENESARET:submission_changed';
  end if;
  if v_submission.status <> 'pending' then
    raise exception 'GENESARET:not_reviewable';
  end if;

  update public.song_submissions s set
    status = 'changes_requested',
    review_note = btrim(p_review_note),
    reviewed_by = (select auth.uid()),
    reviewed_at = now()
  where s.id = v_submission.id;
end;
$$;

revoke execute on function public.request_submission_changes(uuid, text, integer) from public, anon;
grant execute on function public.request_submission_changes(uuid, text, integer) to authenticated;

drop function public.reject_submission(uuid, text);

create function public.reject_submission(p_submission_id uuid, p_review_note text, p_expected_revision integer default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_submission public.song_submissions%rowtype;
begin
  if not public.has_editorial_role() then
    raise exception 'GENESARET:forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_review_note, ''))) not between 1 and 2000 then
    raise exception 'GENESARET:invalid:review_note';
  end if;
  -- Locked, then checked against what the reviewer read.
  select * into v_submission from public.song_submissions s where s.id = p_submission_id for update;
  if not found then
    raise exception 'GENESARET:not_found';
  end if;
  if p_expected_revision is null then
    raise exception 'GENESARET:invalid:revision';
  end if;
  if v_submission.revision <> p_expected_revision then
    raise exception 'GENESARET:submission_changed';
  end if;
  if v_submission.status not in ('pending', 'changes_requested') then
    raise exception 'GENESARET:not_reviewable';
  end if;

  update public.song_submissions s set
    status = 'rejected',
    review_note = btrim(p_review_note),
    reviewed_by = (select auth.uid()),
    reviewed_at = now()
  where s.id = v_submission.id;
end;
$$;

revoke execute on function public.reject_submission(uuid, text, integer) from public, anon;
grant execute on function public.reject_submission(uuid, text, integer) to authenticated;
