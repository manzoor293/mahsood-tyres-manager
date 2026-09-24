-- Money is stored in minor currency units; quantities are whole tyres.
CREATE TABLE brands (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  phone TEXT,
  address TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  phone TEXT,
  address TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  sku TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(sku)) > 0),
  brand_id INTEGER REFERENCES brands(id) ON DELETE RESTRICT,
  category_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
  model TEXT NOT NULL CHECK (length(trim(model)) > 0),
  size TEXT NOT NULL CHECK (length(trim(size)) > 0),
  pattern TEXT,
  tyre_type TEXT,
  default_selling_price INTEGER NOT NULL DEFAULT 0 CHECK (default_selling_price >= 0),
  minimum_stock INTEGER NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE TABLE purchases (
  id INTEGER PRIMARY KEY,
  invoice_number TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(invoice_number)) > 0),
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  supplier_invoice_number TEXT,
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
  discount INTEGER NOT NULL DEFAULT 0 CHECK (discount BETWEEN 0 AND subtotal),
  total INTEGER NOT NULL CHECK (total = subtotal - discount),
  purchased_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (id, supplier_id)
) STRICT;
CREATE TABLE purchase_items (
  id INTEGER PRIMARY KEY,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost INTEGER NOT NULL CHECK (unit_cost >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (id, product_id)
) STRICT;
CREATE TABLE sales (
  id INTEGER PRIMARY KEY,
  invoice_number TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(invoice_number)) > 0),
  customer_id INTEGER REFERENCES customers(id) ON DELETE RESTRICT,
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
  discount INTEGER NOT NULL DEFAULT 0 CHECK (discount BETWEEN 0 AND subtotal),
  total INTEGER NOT NULL CHECK (total = subtotal - discount),
  sold_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (id, customer_id)
) STRICT;
CREATE TABLE sale_items (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  unit_cost INTEGER NOT NULL CHECK (unit_cost >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (id, product_id)
) STRICT;
CREATE TABLE inventory (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL UNIQUE REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE TABLE stock_movements (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'PURCHASE', 'SALE', 'SALE_RETURN', 'PURCHASE_RETURN',
    'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'OPENING_STOCK'
  )),
  quantity_change INTEGER NOT NULL CHECK (
    (movement_type IN ('PURCHASE', 'SALE_RETURN', 'ADJUSTMENT_IN', 'OPENING_STOCK') AND quantity_change > 0)
    OR (movement_type IN ('SALE', 'PURCHASE_RETURN', 'ADJUSTMENT_OUT') AND quantity_change < 0)
  ),
  purchase_item_id INTEGER,
  sale_item_id INTEGER,
  unit_cost INTEGER NOT NULL CHECK (unit_cost >= 0),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (purchase_item_id, product_id) REFERENCES purchase_items(id, product_id) ON DELETE RESTRICT,
  FOREIGN KEY (sale_item_id, product_id) REFERENCES sale_items(id, product_id) ON DELETE RESTRICT,
  CHECK (
    (movement_type IN ('PURCHASE', 'PURCHASE_RETURN') AND purchase_item_id IS NOT NULL AND sale_item_id IS NULL)
    OR (movement_type IN ('SALE', 'SALE_RETURN') AND sale_item_id IS NOT NULL AND purchase_item_id IS NULL)
    OR (movement_type IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'OPENING_STOCK') AND purchase_item_id IS NULL AND sale_item_id IS NULL)
  )
) STRICT;
CREATE TABLE supplier_payments (
  id INTEGER PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  purchase_id INTEGER,
  amount INTEGER NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (length(trim(payment_method)) > 0),
  reference TEXT,
  notes TEXT,
  paid_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (purchase_id, supplier_id) REFERENCES purchases(id, supplier_id) ON DELETE RESTRICT
) STRICT;
CREATE TABLE customer_payments (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE RESTRICT,
  sale_id INTEGER REFERENCES sales(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (length(trim(payment_method)) > 0),
  reference TEXT,
  notes TEXT,
  paid_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (customer_id IS NOT NULL OR sale_id IS NOT NULL),
  FOREIGN KEY (sale_id, customer_id) REFERENCES sales(id, customer_id) ON DELETE RESTRICT
) STRICT;
CREATE TABLE expense_categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY,
  expense_category_id INTEGER NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL CHECK (length(trim(description)) > 0),
  payment_method TEXT NOT NULL CHECK (length(trim(payment_method)) > 0),
  spent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE TABLE settings (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL UNIQUE CHECK (length(trim(key)) > 0),
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_products_brand ON products(brand_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_size ON products(size);
CREATE INDEX idx_products_model ON products(model COLLATE NOCASE);
CREATE INDEX idx_suppliers_name ON suppliers(name COLLATE NOCASE);
CREATE INDEX idx_customers_name ON customers(name COLLATE NOCASE);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_suppliers_phone ON suppliers(phone);
CREATE INDEX idx_purchases_supplier_date ON purchases(supplier_id, purchased_at);
CREATE INDEX idx_purchases_date ON purchases(purchased_at);
CREATE INDEX idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX idx_purchase_items_product ON purchase_items(product_id);
CREATE INDEX idx_sales_customer_date ON sales(customer_id, sold_at);
CREATE INDEX idx_sales_date ON sales(sold_at);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);
CREATE INDEX idx_stock_movements_product_date ON stock_movements(product_id, created_at);
CREATE INDEX idx_stock_movements_purchase_item ON stock_movements(purchase_item_id, product_id);
CREATE INDEX idx_stock_movements_sale_item ON stock_movements(sale_item_id, product_id);
CREATE INDEX idx_supplier_payments_supplier_date ON supplier_payments(supplier_id, paid_at);
CREATE INDEX idx_supplier_payments_purchase ON supplier_payments(purchase_id, supplier_id);
CREATE INDEX idx_customer_payments_customer_date ON customer_payments(customer_id, paid_at);
CREATE INDEX idx_customer_payments_sale ON customer_payments(sale_id, customer_id);
CREATE INDEX idx_expenses_category ON expenses(expense_category_id);
CREATE INDEX idx_expenses_date ON expenses(spent_at);

-- Inventory is a projection of the append-only movement ledger.
CREATE TRIGGER products_create_inventory AFTER INSERT ON products BEGIN
  INSERT INTO inventory(product_id) VALUES (NEW.id);
END;
CREATE TRIGGER movements_apply_inventory AFTER INSERT ON stock_movements BEGIN
  UPDATE inventory SET quantity = quantity + NEW.quantity_change,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE product_id = NEW.product_id;
  SELECT CASE WHEN changes() != 1 THEN RAISE(ABORT, 'Missing inventory row') END;
END;
CREATE TRIGGER movements_no_update BEFORE UPDATE ON stock_movements BEGIN
  SELECT RAISE(ABORT, 'Stock movements are append-only');
END;
CREATE TRIGGER movements_no_delete BEFORE DELETE ON stock_movements BEGIN
  SELECT RAISE(ABORT, 'Stock movements are append-only');
END;
CREATE TRIGGER inventory_matches_ledger BEFORE UPDATE ON inventory BEGIN
  SELECT CASE WHEN NEW.product_id != OLD.product_id OR NEW.quantity !=
    COALESCE((SELECT SUM(quantity_change) FROM stock_movements WHERE product_id = NEW.product_id), 0)
    THEN RAISE(ABORT, 'Inventory must match the stock movement ledger') END;
END;
CREATE TRIGGER inventory_starts_empty BEFORE INSERT ON inventory WHEN NEW.quantity != 0 BEGIN
  SELECT RAISE(ABORT, 'Use an opening stock movement');
END;
CREATE TRIGGER inventory_no_delete BEFORE DELETE ON inventory BEGIN
  SELECT RAISE(ABORT, 'Inventory rows cannot be deleted; deactivate the product');
END;
-- NULL customer is permitted only for payments against an anonymous sale.
CREATE TRIGGER customer_payments_validate_insert BEFORE INSERT ON customer_payments
WHEN NEW.sale_id IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM sales WHERE id = NEW.sale_id AND customer_id IS NEW.customer_id)
    THEN RAISE(ABORT, 'Payment customer must match sale customer') END;
END;
CREATE TRIGGER customer_payments_validate_update BEFORE UPDATE ON customer_payments
WHEN NEW.sale_id IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM sales WHERE id = NEW.sale_id AND customer_id IS NEW.customer_id)
    THEN RAISE(ABORT, 'Payment customer must match sale customer') END;
END;
