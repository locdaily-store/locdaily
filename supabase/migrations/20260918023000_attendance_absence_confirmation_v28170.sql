-- LocDailyMar V28.17.0
-- Attendance Absence Confirmation Deadline + Dynamic Menu
-- Safe incremental migration over V28.5.1 workforce baseline.

begin;

-- 1. Per-store confirmation policy. Default 24 hours after start+grace threshold.
create table if not exists public.workforce_absence_settings (
    store_id uuid primary key references public.stores(id) on delete cascade,
    confirmation_window_minutes integer not null default 1440
        check (confirmation_window_minutes between 30 and 10080),
    updated_by uuid references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1
);

create table if not exists public.attendance_absence_cases (
    id uuid primary key default gen_random_uuid(),
    store_id uuid not null references public.stores(id) on delete restrict,
    user_id uuid not null references auth.users(id) on delete restrict,
    attendance_date date not null,
    threshold_at timestamptz not null,
    confirmation_deadline_at timestamptz not null,
    confirmation_window_minutes integer not null
        check (confirmation_window_minutes between 30 and 10080),
    case_status text not null default 'PENDING_CONFIRMATION'
        check (case_status in (
            'PENDING_CONFIRMATION',
            'EXPLANATION_SUBMITTED',
            'REVIEWED',
            'ABSENT_NO_CONFIRMATION',
            'RESOLVED_ATTENDED',
            'RESOLVED_EXEMPT'
        )),
    explanation_id uuid references public.attendance_explanations(id) on delete set null,
    resolved_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1,
    unique(store_id,user_id,attendance_date),
    check (confirmation_deadline_at >= threshold_at)
);

create index if not exists attendance_absence_cases_store_date_idx
on public.attendance_absence_cases(store_id, attendance_date desc, case_status);

create index if not exists attendance_absence_cases_user_date_idx
on public.attendance_absence_cases(user_id, attendance_date desc, case_status);

create index if not exists attendance_absence_cases_deadline_idx
on public.attendance_absence_cases(case_status, confirmation_deadline_at)
where case_status='PENDING_CONFIRMATION';

-- Reuse canonical touch trigger when available.
drop trigger if exists trg_workforce_absence_settings_touch on public.workforce_absence_settings;
create trigger trg_workforce_absence_settings_touch
before update on public.workforce_absence_settings
for each row execute function public.ldm_touch_row();

drop trigger if exists trg_attendance_absence_cases_touch on public.attendance_absence_cases;
create trigger trg_attendance_absence_cases_touch
before update on public.attendance_absence_cases
for each row execute function public.ldm_touch_row();

alter table public.workforce_absence_settings enable row level security;
alter table public.attendance_absence_cases enable row level security;
revoke all on public.workforce_absence_settings from anon,authenticated;
revoke all on public.attendance_absence_cases from anon,authenticated;

-- Ensure every active store has a default policy.
insert into public.workforce_absence_settings(store_id,confirmation_window_minutes)
select s.id,1440
from public.stores s
where s.deleted_at is null
on conflict(store_id) do nothing;

-- Internal helper. No grant to clients.
create or replace function public.ldm_sync_absence_cases_for_store(
    p_store_id uuid,
    p_user_id uuid default null,
    p_days integer default 62
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
    v_timezone text;
    v_window integer;
    v_today date;
    v_now timestamptz:=now();
    v_inserted integer:=0;
    v_expired integer:=0;
    v_attended integer:=0;
    v_exempt integer:=0;
begin
    select coalesce(nullif(s.timezone,''),'Asia/Makassar')
      into v_timezone
    from public.stores s
    where s.id=p_store_id and s.deleted_at is null;

    if v_timezone is null then
        raise exception 'STORE_NOT_FOUND';
    end if;

    insert into public.workforce_absence_settings(store_id,confirmation_window_minutes)
    values(p_store_id,1440)
    on conflict(store_id) do nothing;

    select was.confirmation_window_minutes
      into v_window
    from public.workforce_absence_settings was
    where was.store_id=p_store_id;

    v_today:=(v_now at time zone v_timezone)::date;

    insert into public.attendance_absence_cases(
        store_id,user_id,attendance_date,threshold_at,confirmation_deadline_at,
        confirmation_window_minutes,case_status,resolved_at
    )
    select
        ws.store_id,
        ws.user_id,
        ws.schedule_date,
        ((ws.schedule_date + ws.planned_start_time) at time zone v_timezone)
            + make_interval(mins=>coalesce(ws.grace_minutes,30)),
        ((ws.schedule_date + ws.planned_start_time) at time zone v_timezone)
            + make_interval(mins=>coalesce(ws.grace_minutes,30)+v_window),
        v_window,
        case
            when v_now >= (((ws.schedule_date + ws.planned_start_time) at time zone v_timezone)
                 + make_interval(mins=>coalesce(ws.grace_minutes,30)+v_window))
            then 'ABSENT_NO_CONFIRMATION'
            else 'PENDING_CONFIRMATION'
        end,
        case
            when v_now >= (((ws.schedule_date + ws.planned_start_time) at time zone v_timezone)
                 + make_interval(mins=>coalesce(ws.grace_minutes,30)+v_window))
            then v_now else null
        end
    from public.employee_work_schedules ws
    join public.profiles p
      on p.id=ws.user_id and p.store_id=ws.store_id
     and p.active=true and p.deleted_at is null
    where ws.store_id=p_store_id
      and (p_user_id is null or ws.user_id=p_user_id)
      and ws.schedule_status='WORK'
      and ws.schedule_date between v_today-greatest(1,least(coalesce(p_days,62),366)) and v_today
      and v_now >= (((ws.schedule_date + ws.planned_start_time) at time zone v_timezone)
          + make_interval(mins=>coalesce(ws.grace_minutes,30)))
      and not exists(
          select 1
          from public.attendance a
          where a.store_id=ws.store_id
            and a.user_id=ws.user_id
            and a.attendance_date=ws.schedule_date
            and a.deleted_at is null
            and a.attendance_type in ('Masuk','Izin','Sakit')
      )
    on conflict(store_id,user_id,attendance_date) do nothing;
    get diagnostics v_inserted=row_count;

    -- If schedule was corrected to OFF/CUTI after a case was created, it is exempt.
    update public.attendance_absence_cases c
       set case_status='RESOLVED_EXEMPT',resolved_at=v_now
      from public.employee_work_schedules ws
     where c.store_id=p_store_id
       and (p_user_id is null or c.user_id=p_user_id)
       and c.case_status in ('PENDING_CONFIRMATION','EXPLANATION_SUBMITTED','ABSENT_NO_CONFIRMATION')
       and ws.store_id=c.store_id and ws.user_id=c.user_id and ws.schedule_date=c.attendance_date
       and ws.schedule_status in ('OFF','ANNUAL_LEAVE');
    get diagnostics v_exempt=row_count;

    -- Late/valid attendance resolves only still-pending cases. Submitted explanations stay auditable.
    update public.attendance_absence_cases c
       set case_status='RESOLVED_ATTENDED',resolved_at=v_now
     where c.store_id=p_store_id
       and (p_user_id is null or c.user_id=p_user_id)
       and c.case_status='PENDING_CONFIRMATION'
       and exists(
          select 1 from public.attendance a
          where a.store_id=c.store_id and a.user_id=c.user_id
            and a.attendance_date=c.attendance_date and a.deleted_at is null
            and a.attendance_type in ('Masuk','Izin','Sakit')
       );
    get diagnostics v_attended=row_count;

    update public.attendance_absence_cases c
       set case_status='ABSENT_NO_CONFIRMATION',resolved_at=v_now
     where c.store_id=p_store_id
       and (p_user_id is null or c.user_id=p_user_id)
       and c.case_status='PENDING_CONFIRMATION'
       and c.confirmation_deadline_at<=v_now;
    get diagnostics v_expired=row_count;

    return jsonb_build_object(
        'ok',true,'inserted',v_inserted,'expired',v_expired,
        'resolved_attended',v_attended,'resolved_exempt',v_exempt
    );
end;
$$;

-- Employee menu state. Owner stays visible on frontend because Owner manages settings/inbox.
create or replace function public.ldm_attendance_menu_state()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
    v_store uuid:=public.ldm_current_store_id();
    v_pending integer:=0;
    v_submitted integer:=0;
    v_deadline timestamptz;
begin
    perform public.ldm_sync_absence_cases_for_store(v_store,auth.uid(),62);

    select count(*) filter(where c.case_status='PENDING_CONFIRMATION'),
           count(*) filter(where c.case_status='EXPLANATION_SUBMITTED'),
           min(c.confirmation_deadline_at) filter(where c.case_status='PENDING_CONFIRMATION')
      into v_pending,v_submitted,v_deadline
    from public.attendance_absence_cases c
    where c.store_id=v_store and c.user_id=auth.uid();

    return jsonb_build_object(
        'show_menu',(v_pending>0 or v_submitted>0),
        'pending_count',v_pending,
        'submitted_count',v_submitted,
        'earliest_deadline_at',v_deadline
    );
end;
$$;

create or replace function public.ldm_attendance_confirmation_candidates_v2(p_days integer default 62)
returns table(
    attendance_date date,
    shift_label text,
    planned_start_time time,
    planned_end_time time,
    threshold_at timestamptz,
    confirmation_deadline_at timestamptz,
    confirmation_window_minutes integer,
    case_status text
)
language plpgsql
security definer
set search_path=''
as $$
declare
    v_store uuid:=public.ldm_current_store_id();
begin
    perform public.ldm_sync_absence_cases_for_store(v_store,auth.uid(),p_days);

    return query
    select c.attendance_date,ws.shift_label,ws.planned_start_time,ws.planned_end_time,
           c.threshold_at,c.confirmation_deadline_at,c.confirmation_window_minutes,c.case_status
    from public.attendance_absence_cases c
    join public.employee_work_schedules ws
      on ws.store_id=c.store_id and ws.user_id=c.user_id and ws.schedule_date=c.attendance_date
    where c.store_id=v_store and c.user_id=auth.uid()
      and c.case_status='PENDING_CONFIRMATION'
      and c.confirmation_deadline_at>now()
    order by c.attendance_date desc;
end;
$$;

create or replace function public.ldm_attendance_my_absence_cases()
returns table(
    id uuid,
    attendance_date date,
    shift_label text,
    planned_start_time time,
    planned_end_time time,
    case_status text,
    confirmation_deadline_at timestamptz,
    reason_category text,
    explanation text,
    explanation_status text,
    submitted_at timestamptz,
    reviewed_at timestamptz,
    review_note text
)
language plpgsql
security definer
set search_path=''
as $$
declare
    v_store uuid:=public.ldm_current_store_id();
begin
    perform public.ldm_sync_absence_cases_for_store(v_store,auth.uid(),366);

    return query
    select c.id,c.attendance_date,ws.shift_label,ws.planned_start_time,ws.planned_end_time,
           c.case_status,c.confirmation_deadline_at,
           ae.reason_category,ae.explanation,ae.status,ae.submitted_at,ae.reviewed_at,ae.review_note
    from public.attendance_absence_cases c
    left join public.employee_work_schedules ws
      on ws.store_id=c.store_id and ws.user_id=c.user_id and ws.schedule_date=c.attendance_date
    left join public.attendance_explanations ae on ae.id=c.explanation_id
    where c.store_id=v_store and c.user_id=auth.uid()
      and c.case_status not in ('RESOLVED_ATTENDED','RESOLVED_EXEMPT')
    order by c.attendance_date desc,c.created_at desc;
end;
$$;

create or replace function public.ldm_attendance_absence_settings(p_store_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
    v_store uuid:=coalesce(p_store_id,public.ldm_current_store_id());
    v_row public.workforce_absence_settings%rowtype;
begin
    if public.ldm_current_role()<>'owner' then raise exception 'OWNER_REQUIRED'; end if;
    if not public.ldm_workforce_can_manage_store(v_store) then raise exception 'STORE_MANAGEMENT_FORBIDDEN'; end if;

    insert into public.workforce_absence_settings(store_id,confirmation_window_minutes)
    values(v_store,1440)
    on conflict(store_id) do nothing;

    select * into v_row from public.workforce_absence_settings where store_id=v_store;
    return jsonb_build_object(
        'store_id',v_row.store_id,
        'confirmation_window_minutes',v_row.confirmation_window_minutes,
        'confirmation_window_hours',round(v_row.confirmation_window_minutes/60.0,1),
        'updated_at',v_row.updated_at
    );
end;
$$;

create or replace function public.ldm_attendance_update_absence_settings(
    p_store_id uuid,
    p_confirmation_window_minutes integer,
    p_apply_to_open boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
    v_store uuid:=coalesce(p_store_id,public.ldm_current_store_id());
    v_minutes integer:=coalesce(p_confirmation_window_minutes,1440);
    v_updated integer:=0;
begin
    if public.ldm_current_role()<>'owner' then raise exception 'OWNER_REQUIRED'; end if;
    if not public.ldm_workforce_can_manage_store(v_store) then raise exception 'STORE_MANAGEMENT_FORBIDDEN'; end if;
    if v_minutes<30 or v_minutes>10080 then
        raise exception 'Batas konfirmasi harus 30 menit sampai 168 jam.';
    end if;

    insert into public.workforce_absence_settings(store_id,confirmation_window_minutes,updated_by)
    values(v_store,v_minutes,auth.uid())
    on conflict(store_id) do update set
        confirmation_window_minutes=excluded.confirmation_window_minutes,
        updated_by=auth.uid();

    if coalesce(p_apply_to_open,false) then
        update public.attendance_absence_cases c
           set confirmation_window_minutes=v_minutes,
               confirmation_deadline_at=c.threshold_at+make_interval(mins=>v_minutes)
         where c.store_id=v_store and c.case_status='PENDING_CONFIRMATION';
        get diagnostics v_updated=row_count;
        perform public.ldm_sync_absence_cases_for_store(v_store,null,366);
    end if;

    return jsonb_build_object(
        'ok',true,'store_id',v_store,'confirmation_window_minutes',v_minutes,
        'applied_to_open',coalesce(p_apply_to_open,false),'open_cases_updated',v_updated
    );
end;
$$;

create or replace function public.ldm_attendance_submit_explanation_v2(
    p_attendance_date date,
    p_reason_category text,
    p_explanation text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
    v_store uuid:=public.ldm_current_store_id();
    v_case public.attendance_absence_cases%rowtype;
    v_reason text:=upper(btrim(coalesce(p_reason_category,'')));
    v_text text:=btrim(coalesce(p_explanation,''));
    v_row public.attendance_explanations%rowtype;
begin
    perform public.ldm_sync_absence_cases_for_store(v_store,auth.uid(),366);

    if v_reason not in (
        'SAKIT_KONDISI','KEPERLUAN_KELUARGA','KENDALA_TRANSPORTASI','KENDALA_SISTEM',
        'LUPA_KELALAIAN','KEADAAN_DARURAT','LAINNYA'
    ) then raise exception 'Jenis ketidakhadiran tidak valid.'; end if;
    if char_length(v_text)<10 or char_length(v_text)>2000 then
        raise exception 'Penjelasan wajib 10-2000 karakter.';
    end if;

    select * into v_case
    from public.attendance_absence_cases c
    where c.store_id=v_store and c.user_id=auth.uid() and c.attendance_date=p_attendance_date
    for update;

    if v_case.id is null then raise exception 'Kasus ketidakhadiran tidak ditemukan.'; end if;
    if v_case.case_status='ABSENT_NO_CONFIRMATION' or v_case.confirmation_deadline_at<=now() then
        update public.attendance_absence_cases
           set case_status='ABSENT_NO_CONFIRMATION',resolved_at=coalesce(resolved_at,now())
         where id=v_case.id;
        raise exception 'Batas waktu konfirmasi sudah berakhir. Status telah ditetapkan Tidak Hadir tanpa konfirmasi.';
    end if;
    if v_case.case_status<>'PENDING_CONFIRMATION' then
        raise exception 'Kasus ini tidak lagi dapat dikonfirmasi.';
    end if;

    insert into public.attendance_explanations(
        store_id,user_id,attendance_date,reason_category,explanation,status,submitted_at
    ) values(v_store,auth.uid(),p_attendance_date,v_reason,v_text,'SUBMITTED',now())
    on conflict(store_id,user_id,attendance_date) do update set
        reason_category=excluded.reason_category,
        explanation=excluded.explanation,
        status='SUBMITTED',submitted_at=now(),
        reviewed_by=null,reviewed_at=null,review_note=null
    returning * into v_row;

    update public.attendance_absence_cases
       set case_status='EXPLANATION_SUBMITTED',explanation_id=v_row.id,resolved_at=null
     where id=v_case.id;

    return jsonb_build_object(
        'ok',true,'id',v_row.id,'case_id',v_case.id,'status','EXPLANATION_SUBMITTED',
        'submitted_at',v_row.submitted_at,'deadline_at',v_case.confirmation_deadline_at
    );
end;
$$;

create or replace function public.ldm_attendance_absence_inbox(p_store_id uuid default null)
returns table(
    case_id uuid,
    store_id uuid,
    store_code text,
    store_name text,
    user_id uuid,
    username text,
    display_name text,
    role text,
    attendance_date date,
    shift_label text,
    planned_start_time time,
    planned_end_time time,
    case_status text,
    confirmation_deadline_at timestamptz,
    reason_category text,
    explanation text,
    explanation_id uuid,
    explanation_status text,
    submitted_at timestamptz,
    reviewed_at timestamptz,
    review_note text
)
language plpgsql
security definer
set search_path=''
as $$
declare
    v_current uuid:=public.ldm_current_store_id();
    v_network uuid;
    r record;
begin
    if public.ldm_current_role()<>'owner' then raise exception 'OWNER_REQUIRED'; end if;

    if public.ldm_is_primary_owner() then
        v_network:=public.ldm_primary_owner_network_id();
        if p_store_id is not null and not public.ldm_workforce_can_manage_store(p_store_id) then
            raise exception 'STORE_MANAGEMENT_FORBIDDEN';
        end if;
        for r in
            select sns.store_id
            from public.store_network_stores sns
            where sns.network_id=v_network and sns.active=true
              and (p_store_id is null or sns.store_id=p_store_id)
        loop
            perform public.ldm_sync_absence_cases_for_store(r.store_id,null,366);
        end loop;
    else
        if p_store_id is not null and p_store_id<>v_current then raise exception 'STORE_MANAGEMENT_FORBIDDEN'; end if;
        perform public.ldm_sync_absence_cases_for_store(v_current,null,366);
    end if;

    return query
    select c.id,c.store_id,s.code,s.name,c.user_id,p.username,p.display_name,p.role,
           c.attendance_date,ws.shift_label,ws.planned_start_time,ws.planned_end_time,
           c.case_status,c.confirmation_deadline_at,
           ae.reason_category,ae.explanation,ae.id,ae.status,ae.submitted_at,ae.reviewed_at,ae.review_note
    from public.attendance_absence_cases c
    join public.stores s on s.id=c.store_id and s.deleted_at is null
    join public.profiles p on p.id=c.user_id
    left join public.employee_work_schedules ws
      on ws.store_id=c.store_id and ws.user_id=c.user_id and ws.schedule_date=c.attendance_date
    left join public.attendance_explanations ae on ae.id=c.explanation_id
    where c.case_status not in ('RESOLVED_ATTENDED','RESOLVED_EXEMPT')
      and (
        (public.ldm_is_primary_owner() and exists(
            select 1 from public.store_network_stores sns
            where sns.network_id=v_network and sns.store_id=c.store_id and sns.active=true
        ) and (p_store_id is null or c.store_id=p_store_id))
        or
        (not public.ldm_is_primary_owner() and c.store_id=v_current)
      )
    order by
      case c.case_status
        when 'PENDING_CONFIRMATION' then 1
        when 'EXPLANATION_SUBMITTED' then 2
        when 'ABSENT_NO_CONFIRMATION' then 3
        when 'REVIEWED' then 4 else 5 end,
      c.attendance_date desc,c.created_at desc;
end;
$$;

create or replace function public.ldm_attendance_review_explanation_v2(
    p_explanation_id uuid,
    p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
    v_row public.attendance_explanations%rowtype;
    v_case public.attendance_absence_cases%rowtype;
begin
    if public.ldm_current_role()<>'owner' then raise exception 'OWNER_REQUIRED'; end if;

    select * into v_row from public.attendance_explanations ae where ae.id=p_explanation_id for update;
    if v_row.id is null then raise exception 'Form alasan tidak ditemukan.'; end if;
    if not public.ldm_workforce_can_manage_store(v_row.store_id) then raise exception 'STORE_MANAGEMENT_FORBIDDEN'; end if;

    update public.attendance_explanations
       set status='REVIEWED',reviewed_by=auth.uid(),reviewed_at=now(),
           review_note=nullif(btrim(coalesce(p_review_note,'')),'')
     where id=p_explanation_id
    returning * into v_row;

    update public.attendance_absence_cases
       set case_status='REVIEWED',resolved_at=now(),explanation_id=v_row.id
     where store_id=v_row.store_id and user_id=v_row.user_id and attendance_date=v_row.attendance_date
    returning * into v_case;

    return jsonb_build_object('ok',true,'id',v_row.id,'case_id',v_case.id,'status','REVIEWED','reviewed_at',v_row.reviewed_at);
end;
$$;

-- Permissions
revoke all on function public.ldm_sync_absence_cases_for_store(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.ldm_attendance_menu_state() from public,anon;
revoke all on function public.ldm_attendance_confirmation_candidates_v2(integer) from public,anon;
revoke all on function public.ldm_attendance_my_absence_cases() from public,anon;
revoke all on function public.ldm_attendance_absence_settings(uuid) from public,anon;
revoke all on function public.ldm_attendance_update_absence_settings(uuid,integer,boolean) from public,anon;
revoke all on function public.ldm_attendance_submit_explanation_v2(date,text,text) from public,anon;
revoke all on function public.ldm_attendance_absence_inbox(uuid) from public,anon;
revoke all on function public.ldm_attendance_review_explanation_v2(uuid,text) from public,anon;

grant execute on function public.ldm_attendance_menu_state() to authenticated;
grant execute on function public.ldm_attendance_confirmation_candidates_v2(integer) to authenticated;
grant execute on function public.ldm_attendance_my_absence_cases() to authenticated;
grant execute on function public.ldm_attendance_absence_settings(uuid) to authenticated;
grant execute on function public.ldm_attendance_update_absence_settings(uuid,integer,boolean) to authenticated;
grant execute on function public.ldm_attendance_submit_explanation_v2(date,text,text) to authenticated;
grant execute on function public.ldm_attendance_absence_inbox(uuid) to authenticated;
grant execute on function public.ldm_attendance_review_explanation_v2(uuid,text) to authenticated;

commit;
