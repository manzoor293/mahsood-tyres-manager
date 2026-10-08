-- Freight is an acquisition cost, never supplier debt. Legacy values stay zero.
ALTER TABLE purchases ADD COLUMN shipment_cost INTEGER NOT NULL DEFAULT 0 CHECK(shipment_cost BETWEEN 0 AND 9007199254740991);
ALTER TABLE purchases ADD COLUMN transporter_name TEXT;
ALTER TABLE purchases ADD COLUMN shipment_reference TEXT;
ALTER TABLE purchase_items ADD COLUMN allocated_shipment_cost INTEGER NOT NULL DEFAULT 0 CHECK(allocated_shipment_cost BETWEEN 0 AND 9007199254740991);

-- Exact historical freight is a line total, not a rounded unit price.
ALTER TABLE sale_items ADD COLUMN allocated_shipment_cost INTEGER NOT NULL DEFAULT 0 CHECK(allocated_shipment_cost BETWEEN 0 AND 9007199254740991);
ALTER TABLE sale_items ADD COLUMN shipment_purchase_item_id INTEGER REFERENCES purchase_items(id) ON DELETE RESTRICT;
ALTER TABLE sale_items ADD COLUMN shipment_offset INTEGER NOT NULL DEFAULT 0 CHECK(shipment_offset BETWEEN 0 AND 9007199254740991);
CREATE INDEX idx_sale_items_shipment_source ON sale_items(shipment_purchase_item_id);

CREATE TRIGGER purchase_shipment_immutable BEFORE UPDATE OF shipment_cost,transporter_name,shipment_reference ON purchases
BEGIN SELECT RAISE(ABORT,'Shipment history is immutable'); END;
CREATE TRIGGER purchase_item_shipment_immutable BEFORE UPDATE OF allocated_shipment_cost ON purchase_items
BEGIN SELECT RAISE(ABORT,'Shipment allocation is immutable'); END;
CREATE TRIGGER sale_item_shipment_immutable BEFORE UPDATE OF allocated_shipment_cost,shipment_purchase_item_id,shipment_offset ON sale_items
BEGIN SELECT RAISE(ABORT,'Historical shipment cost is immutable'); END;
CREATE TRIGGER purchase_item_freight_basis_immutable BEFORE UPDATE OF quantity,unit_cost ON purchase_items
WHEN OLD.allocated_shipment_cost>0
BEGIN SELECT RAISE(ABORT,'Shipment cost basis is immutable'); END;
CREATE TRIGGER sale_item_freight_quantity_immutable BEFORE UPDATE OF quantity,unit_cost ON sale_items
WHEN OLD.shipment_purchase_item_id IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Historical landed cost basis is immutable'); END;
