-- Official event image and price range, stored only when a source provides them
-- (e.g. Ticketmaster's own event images and priceRanges). Never inferred.
alter table radar.events
  add column if not exists image_url text,
  add column if not exists price_min numeric,
  add column if not exists price_max numeric,
  add column if not exists price_currency text;
