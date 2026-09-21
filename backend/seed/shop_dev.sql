-- DEV ONLY. The ten mock.js products with PLACEHOLDER stock (5), weight
-- (100 g) and GST (0). Production waits for the real catalogue: stock that is
-- not on a shelf is a sale that cannot ship.
--
-- Idempotent: categories on name, products on legacy_id. Paste into the dev
-- SQL editor, or run through the MCP after checking get_project_url is dev.
-- The two sold-out mocks (sh6, sh9) seed with stock 0.
-- "Named by <consultant>" is gone: those are invented people (HANDOFF §8).
-- The mock's recommended products became `featured`.

insert into public.shop_categories (name, sort) values
  ('Gemstones', 1), ('Maalas', 2), ('Rudraksha', 3), ('Remedies', 4)
on conflict (name) do update set sort = excluded.sort;

insert into public.shop_subcategories (category_id, name, sort)
select c.id, s.name, s.sort
  from (values
    ('Gemstones', 'Blue Sapphire', 1), ('Gemstones', 'Yellow Sapphire', 2),
    ('Gemstones', 'Emerald', 3), ('Gemstones', 'Ruby', 4), ('Gemstones', 'Pearl', 5),
    ('Maalas', 'Sphatik', 1), ('Maalas', 'Tulsi', 2), ('Maalas', 'Sandalwood', 3),
    ('Maalas', 'Lotus seed', 4),
    ('Rudraksha', '1 Mukhi', 1), ('Rudraksha', '5 Mukhi', 2), ('Rudraksha', '7 Mukhi', 3),
    ('Rudraksha', 'Gauri Shankar', 4),
    ('Remedies', 'Yantras', 1), ('Remedies', 'Ritual kits', 2), ('Remedies', 'Oils', 3),
    ('Remedies', 'Camphor & loban', 4)
  ) s(cat, name, sort)
  join public.shop_categories c on c.name = s.cat
on conflict (category_id, name) do update set sort = excluded.sort;

insert into public.products (legacy_id, category_id, subcategory_id, name, subtitle,
                             price_paise, mrp_paise, stock, weight_grams, featured)
select p.legacy_id, c.id, sc.id, p.name, p.subtitle,
       p.price * 100, p.mrp * 100, p.stock, 100, p.featured
  from (values
    ('sh1',  'Gemstones', 'Blue Sapphire',   'Natural Blue Sapphire',  '3.2 ct · Certified Neelam',    18500, 24000, 5, true),
    ('sh2',  'Gemstones', 'Yellow Sapphire', 'Yellow Sapphire Ring',   '5.1 ct · Panchdhatu setting',  26400, null,  5, false),
    ('sh3',  'Rudraksha', '5 Mukhi',         'Rudraksha 5 Mukhi Mala', '108 beads · Nepali origin',     2400,  3200, 5, true),
    ('sh4',  'Maalas',    'Sphatik',         'Sphatik Crystal Maala',  '108 beads · Hand-knotted',      1650, null,  5, false),
    ('sh5',  'Maalas',    'Tulsi',           'Tulsi Maala',            '108 beads · Vrindavan wood',     890,  1200, 5, true),
    ('sh6',  'Rudraksha', '1 Mukhi',         '1 Mukhi Rudraksha',      'Lab certified · Java',          7200, null,  0, false),
    ('sh7',  'Remedies',  'Ritual kits',     'Shani Shanti Kit',       'Oil, cloth & mantra card',      1150,  1500, 5, true),
    ('sh8',  'Remedies',  'Yantras',         'Copper Yantra — Shree',  '3×3 in · Energised',            2100, null,  5, false),
    ('sh9',  'Gemstones', 'Emerald',         'Emerald (Panna)',        '2.8 ct · Zambian',             15900, 19500, 0, true),
    ('sh10', 'Remedies',  'Camphor & loban', 'Camphor & Loban Set',    'Weekly cleansing ritual',        640, null,  5, false)
  ) p(legacy_id, cat, sub, name, subtitle, price, mrp, stock, featured)
  join public.shop_categories c on c.name = p.cat
  left join public.shop_subcategories sc on sc.category_id = c.id and sc.name = p.sub
on conflict (legacy_id) do update set
  category_id = excluded.category_id, subcategory_id = excluded.subcategory_id,
  name = excluded.name, subtitle = excluded.subtitle,
  price_paise = excluded.price_paise, mrp_paise = excluded.mrp_paise,
  featured = excluded.featured;
-- Stock and weight are NOT updated on conflict: re-running the seed must not
-- refill a shelf that real test orders have drawn down.
