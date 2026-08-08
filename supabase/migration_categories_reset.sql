-- Run this once in Supabase Dashboard -> SQL Editor -> New Query -> Run.
-- Replaces all existing categories with the new potential-client business
-- types (businesses that typically need a website + admin panel).

-- Clear the category from existing clients first (categories are about to
-- be deleted, and clients.category_id has a foreign key to categories).
update clients set category_id = null;

delete from categories;

insert into categories (name) values
  ('Hospital'),
  ('Gym'),
  ('Restaurants'),
  ('Coaching'),
  ('School');
