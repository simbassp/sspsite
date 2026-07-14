-- Порядок карточек каталога (БПЛА / противодействие) для ручной сортировки в админке.
alter table public.catalog_items
  add column if not exists sort_order integer not null default 0;

-- Начальная нумерация: по дате создания (старые сверху).
with ranked as (
  select
    id,
    row_number() over (partition by kind order by created_at asc) - 1 as rn
  from public.catalog_items
)
update public.catalog_items c
set sort_order = ranked.rn
from ranked
where c.id = ranked.id
  and c.sort_order = 0;

create index if not exists idx_catalog_items_kind_sort_order
  on public.catalog_items(kind, sort_order asc, created_at asc);
