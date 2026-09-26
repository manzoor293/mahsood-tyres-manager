ALTER TABLE expense_categories ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1));
ALTER TABLE expense_categories ADD COLUMN updated_at TEXT;
UPDATE expense_categories SET updated_at = created_at;
CREATE INDEX idx_expense_categories_active_name ON expense_categories(active, name);
