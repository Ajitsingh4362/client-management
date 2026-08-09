-- Updates the `employees.role` column to support the new role set:
--   admin, lead_generation, tele_caller
-- (replaces the old 'staff' role)
--
-- Run this once in Supabase Dashboard -> SQL Editor.

-- 1. Move any existing 'staff' employees to 'tele_caller' by default.
--    (Change this manually afterwards per-employee if some of them should
--    actually be 'lead_generation' instead.)
update employees set role = 'tele_caller' where role = 'staff';

-- 2. Drop the old check constraint on role, if one exists.
alter table employees drop constraint if exists employees_role_check;

-- 3. Add the new check constraint with the updated allowed roles.
alter table employees
  add constraint employees_role_check
  check (role in ('admin', 'lead_generation', 'tele_caller'));
