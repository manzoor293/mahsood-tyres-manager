-- Immutable business documents; inventory remains owned by the movement trigger.
CREATE TABLE sale_returns (
  id INTEGER PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  returned_at TEXT NOT NULL,
  notes TEXT,
  total INTEGER NOT NULL CHECK(total>=0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE TABLE purchase_returns (
  id INTEGER PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
  returned_at TEXT NOT NULL,
  notes TEXT,
  total INTEGER NOT NULL CHECK(total>=0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE TABLE sale_return_items (
  id INTEGER PRIMARY KEY,
  return_id INTEGER NOT NULL REFERENCES sale_returns(id) ON DELETE RESTRICT,
  sale_item_id INTEGER NOT NULL REFERENCES sale_items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK(quantity>0),
  unit_price INTEGER NOT NULL CHECK(unit_price>=0),
  unit_cost INTEGER NOT NULL CHECK(unit_cost>=0),
  gross_value INTEGER NOT NULL CHECK(gross_value>=0),
  return_value INTEGER NOT NULL CHECK(return_value BETWEEN 0 AND gross_value),
  movement_id INTEGER NOT NULL UNIQUE REFERENCES stock_movements(id) ON DELETE RESTRICT,
  UNIQUE(return_id,sale_item_id)
) STRICT;
CREATE TABLE purchase_return_items (
  id INTEGER PRIMARY KEY,
  return_id INTEGER NOT NULL REFERENCES purchase_returns(id) ON DELETE RESTRICT,
  purchase_item_id INTEGER NOT NULL REFERENCES purchase_items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK(quantity>0),
  unit_price INTEGER NOT NULL CHECK(unit_price>=0),
  unit_cost INTEGER NOT NULL CHECK(unit_cost>=0),
  gross_value INTEGER NOT NULL CHECK(gross_value>=0),
  return_value INTEGER NOT NULL CHECK(return_value BETWEEN 0 AND gross_value),
  movement_id INTEGER NOT NULL UNIQUE REFERENCES stock_movements(id) ON DELETE RESTRICT,
  UNIQUE(return_id,purchase_item_id)
) STRICT;
CREATE INDEX idx_sale_returns_invoice ON sale_returns(sale_id,returned_at);
CREATE INDEX idx_purchase_returns_invoice ON purchase_returns(purchase_id,returned_at);
CREATE INDEX idx_sale_return_items_original ON sale_return_items(sale_item_id);
CREATE INDEX idx_purchase_return_items_original ON purchase_return_items(purchase_item_id);
CREATE TRIGGER sale_returns_no_update BEFORE UPDATE ON sale_returns BEGIN SELECT RAISE(ABORT,'Returns are immutable'); END;
CREATE TRIGGER sale_returns_no_delete BEFORE DELETE ON sale_returns BEGIN SELECT RAISE(ABORT,'Returns are immutable'); END;
CREATE TRIGGER purchase_returns_no_update BEFORE UPDATE ON purchase_returns BEGIN SELECT RAISE(ABORT,'Returns are immutable'); END;
CREATE TRIGGER purchase_returns_no_delete BEFORE DELETE ON purchase_returns BEGIN SELECT RAISE(ABORT,'Returns are immutable'); END;
CREATE TRIGGER sale_return_items_no_update BEFORE UPDATE ON sale_return_items BEGIN SELECT RAISE(ABORT,'Returns are immutable'); END;
CREATE TRIGGER sale_return_items_no_delete BEFORE DELETE ON sale_return_items BEGIN SELECT RAISE(ABORT,'Returns are immutable'); END;
CREATE TRIGGER purchase_return_items_no_update BEFORE UPDATE ON purchase_return_items BEGIN SELECT RAISE(ABORT,'Returns are immutable'); END;
CREATE TRIGGER purchase_return_items_no_delete BEFORE DELETE ON purchase_return_items BEGIN SELECT RAISE(ABORT,'Returns are immutable'); END;

CREATE TRIGGER sale_return_items_validate BEFORE INSERT ON sale_return_items BEGIN
 SELECT CASE WHEN NOT EXISTS (
 SELECT 1 FROM sale_items i JOIN sale_returns r ON r.sale_id=i.sale_id
 JOIN stock_movements m ON m.id=NEW.movement_id
 WHERE i.id=NEW.sale_item_id AND r.id=NEW.return_id
 AND NEW.unit_price=i.unit_price AND NEW.unit_cost=i.unit_cost AND NEW.gross_value=NEW.quantity*i.unit_price
 AND m.sale_item_id=i.id AND m.product_id=i.product_id AND m.movement_type='SALE_RETURN'
 AND m.quantity_change=1*NEW.quantity AND m.unit_cost=i.unit_cost
 AND NEW.quantity+COALESCE((SELECT SUM(quantity) FROM sale_return_items WHERE sale_item_id=i.id),0)<=i.quantity
 ) THEN RAISE(ABORT,'Invalid return item or movement') END;
END;

CREATE TRIGGER purchase_return_items_validate BEFORE INSERT ON purchase_return_items BEGIN
 SELECT CASE WHEN NOT EXISTS (
 SELECT 1 FROM purchase_items i JOIN purchase_returns r ON r.purchase_id=i.purchase_id
 JOIN stock_movements m ON m.id=NEW.movement_id
 WHERE i.id=NEW.purchase_item_id AND r.id=NEW.return_id
 AND NEW.unit_price=i.unit_cost AND NEW.unit_cost=i.unit_cost AND NEW.gross_value=NEW.quantity*i.unit_cost
 AND m.purchase_item_id=i.id AND m.product_id=i.product_id AND m.movement_type='PURCHASE_RETURN'
 AND m.quantity_change=-1*NEW.quantity AND m.unit_cost=i.unit_cost
 AND NEW.quantity+COALESCE((SELECT SUM(quantity) FROM purchase_return_items WHERE purchase_item_id=i.id),0)<=i.quantity
 ) THEN RAISE(ABORT,'Invalid return item or movement') END;
END;
