-- The owner's media types: print splits into newspaper and magazine; newsletter and social are added (TV stays, shown as TV / Shows).
alter table outlets drop constraint if exists outlets_channel_check;
update outlets set channel = 'newspaper' where channel = 'print';
alter table outlets add constraint outlets_channel_check
  check (channel in ('digital', 'newspaper', 'magazine', 'newsletter', 'radio', 'tv', 'podcast', 'social'));
-- saved searches that filtered on print now filter on both newspapers and magazines
update saved_searches set filter = jsonb_set(filter, '{channels}', (
    select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
    from jsonb_array_elements_text(filter->'channels') as e(v),
         unnest(case when e.v = 'print' then array['newspaper', 'magazine'] else array[e.v] end) as x))
  where filter ? 'channels' and filter->'channels' ? 'print';
