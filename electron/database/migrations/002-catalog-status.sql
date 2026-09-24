ALTER TABLE brands ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1));
ALTER TABLE brands ADD COLUMN updated_at TEXT;
UPDATE brands SET updated_at = created_at;
ALTER TABLE categories ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1));
ALTER TABLE categories ADD COLUMN updated_at TEXT;
UPDATE categories SET updated_at = created_at;
CREATE INDEX idx_brands_active_name ON brands(active, name);
CREATE INDEX idx_categories_active_name ON categories(active, name);
CREATE INDEX idx_products_active_sku ON products(active, sku);
