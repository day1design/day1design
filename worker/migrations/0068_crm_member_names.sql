ALTER TABLE CrmUsers ADD COLUMN name TEXT NOT NULL DEFAULT '';

UPDATE CrmUsers SET name = '대표' WHERE role = 'owner' AND name = '';
