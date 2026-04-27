create index if not exists idx_test_results_user_created_desc on public.test_results(user_id, created_at desc);
create index if not exists idx_catalog_items_kind_created_desc on public.catalog_items(kind, created_at desc);
create index if not exists idx_test_questions_active_order on public.test_questions(is_active, order_index);
