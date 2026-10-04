-- Legacy commercial quantities/prices retain their original tyre basis.
ALTER TABLE products ADD COLUMN price_units_per_unit INTEGER NOT NULL DEFAULT 1 CHECK(price_units_per_unit IN (1,2));
ALTER TABLE purchase_items ADD COLUMN units_per_transaction_unit INTEGER NOT NULL DEFAULT 1 CHECK(units_per_transaction_unit IN (1,2));
ALTER TABLE sale_items ADD COLUMN units_per_transaction_unit INTEGER NOT NULL DEFAULT 1 CHECK(units_per_transaction_unit IN (1,2));

DROP TRIGGER sale_return_items_validate;
DROP TRIGGER purchase_return_items_validate;
CREATE TRIGGER sale_return_items_validate BEFORE INSERT ON sale_return_items BEGIN
 SELECT CASE WHEN NOT EXISTS (
 SELECT 1 FROM sale_items i JOIN sale_returns r ON r.sale_id=i.sale_id
 JOIN stock_movements m ON m.id=NEW.movement_id
 WHERE i.id=NEW.sale_item_id AND r.id=NEW.return_id
 AND NEW.unit_price=i.unit_price AND NEW.unit_cost=i.unit_cost AND NEW.gross_value=NEW.quantity*i.unit_price
 AND m.sale_item_id=i.id AND m.product_id=i.product_id AND m.movement_type='SALE_RETURN'
 AND m.quantity_change=NEW.quantity*i.units_per_transaction_unit AND m.unit_cost=i.unit_cost
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
 AND m.quantity_change=-NEW.quantity*i.units_per_transaction_unit AND m.unit_cost=i.unit_cost
 AND NEW.quantity+COALESCE((SELECT SUM(quantity) FROM purchase_return_items WHERE purchase_item_id=i.id),0)<=i.quantity
 ) THEN RAISE(ABORT,'Invalid return item or movement') END;
END;

-- Once saved, transaction units cannot be changed independently of their history.
CREATE TRIGGER purchase_item_unit_immutable BEFORE UPDATE OF units_per_transaction_unit ON purchase_items
WHEN NEW.units_per_transaction_unit != OLD.units_per_transaction_unit BEGIN
 SELECT RAISE(ABORT,'Transaction unit is immutable');
END;
CREATE TRIGGER sale_item_unit_immutable BEFORE UPDATE OF units_per_transaction_unit ON sale_items
WHEN NEW.units_per_transaction_unit != OLD.units_per_transaction_unit BEGIN
 SELECT RAISE(ABORT,'Transaction unit is immutable');
END;
