-- Residential Tax Appeal schema. Idempotent: safe to re-run (npm run db:migrate).
create extension if not exists pg_trgm;

-- Assessor - Assessed Values (uzyt-m557). One row per PIN per year.
create table if not exists assessed_values (
  pin            text    not null,
  year           integer not null,
  class          text,
  township_code  text,
  township_name  text,
  nbhd           text,
  mailed_bldg    numeric, mailed_land    numeric, mailed_tot    numeric,
  certified_bldg numeric, certified_land numeric, certified_tot numeric,
  board_bldg     numeric, board_land     numeric, board_tot     numeric,
  primary key (pin, year)
);
create index if not exists assessed_values_group_idx
  on assessed_values (year, township_code, nbhd, class);

-- Assessor - Parcel Addresses (3723-97qp). Property (situs) address only; owner/mailing data is NOT stored.
create table if not exists parcel_addresses (
  pin     text    not null,
  year    integer not null,
  address text,
  city    text,
  state   text,
  zip     text,
  primary key (pin, year)
);
create index if not exists parcel_addresses_address_trgm
  on parcel_addresses using gin (upper(address) gin_trgm_ops);

-- Assessor - Residential Single and Multi-Family Improvement Characteristics (x54s-btds). One row per card.
create table if not exists characteristics (
  pin                    text    not null,
  year                   integer not null,
  card                   integer not null,
  class                  text,
  township_code          text,
  pin_is_multicard       boolean,
  pin_is_multiland       boolean,
  tieback_proration_rate numeric,
  card_proration_rate    numeric,
  year_built             integer,
  bldg_sf                integer,
  land_sf                integer,
  ext_wall               text,
  type_resd              text,
  use                    text,
  apts                   text,
  primary key (pin, year, card)
);
-- Added for similarity ranking (the Assessor's guidelines weigh basement and garage). Safe on existing databases.
alter table characteristics add column if not exists bsmt      text;
alter table characteristics add column if not exists bsmt_fin  text;
alter table characteristics add column if not exists gar1_att  text;
alter table characteristics add column if not exists gar1_size text;

-- Assessor - Parcel Universe (nj4t-kc8j): coordinates, used for the "proximity" factor.
create table if not exists parcels (
  pin  text    not null,
  year integer not null,
  lat  double precision,
  lon  double precision,
  primary key (pin, year)
);

-- Board of Review Appeal Decision History (7pny-nedm). Appellant/attorney personal data is deliberately not stored.
create table if not exists bor_appeals (
  id                      bigserial primary key,
  pin                     text    not null,
  tax_year                integer not null,
  township_code           text,
  appeal_seq              integer,
  appeal_type             text,
  appeal_type_description text,
  assessor_total_value    numeric,
  bor_total_value         numeric,
  result                  text,
  change_reason           text,
  no_change_reason        text
);
create index if not exists bor_appeals_pin_idx on bor_appeals (pin, tax_year);

-- Scraped from the assessor's calendar page (see src/lib/calendar.ts). One row per township per calendar year.
create table if not exists appeal_calendar (
  year             integer not null,
  region           text    not null,
  township         text    not null,
  notice_date      date,
  last_file_date   date,
  a_roll_certified date,
  a_roll_published date,
  bor_start        date,
  bor_end          date,
  pass             integer,
  status_text      text,
  fetched_at       timestamptz not null default now(),
  primary key (year, township)
);

-- Board of Review schedule (src/lib/bor.ts). The Board publishes its own dates, which are authoritative for BOR appeals
-- and cover townships the Assessor's calendar page doesn't show BOR dates for yet.
create table if not exists bor_schedule (
  year              integer not null,
  township          text    not null,
  grp               integer not null,
  open_date         date    not null,
  close_date        date    not null,
  evidence_deadline date,
  re_review_open    date,
  re_review_close   date,
  hearing_dates     text,
  fetched_at        timestamptz not null default now(),
  primary key (year, township)
);

create table if not exists load_log (
  dataset    text primary key,
  loaded_at  timestamptz not null default now(),
  row_count  bigint
);
