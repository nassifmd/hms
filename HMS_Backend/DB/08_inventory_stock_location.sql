-- 08_inventory_stock_location.sql
-- Add stock_location to inventory_batches to distinguish Store vs Pharmacy stock.
-- All received stock defaults to 'Store'. Users transfer stock from Store → Pharmacy.

-- 1) Add the column (default 'Store' for all existing rows)
ALTER TABLE inventory_batches
    ADD COLUMN IF NOT EXISTS stock_location VARCHAR(20) NOT NULL DEFAULT 'Store';

-- 2) Index for quick filtering by location
CREATE INDEX IF NOT EXISTS idx_inv_batches_stock_location
    ON inventory_batches (stock_location);

-- 3) Transfer log table
CREATE TABLE IF NOT EXISTS inventory_transfers (
    id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id     UUID          NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    item_id         UUID          NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    from_location   VARCHAR(20)   NOT NULL DEFAULT 'Store',
    to_location     VARCHAR(20)   NOT NULL DEFAULT 'Pharmacy',
    quantity        NUMERIC(10,2) NOT NULL,
    notes           TEXT,
    transferred_by  UUID          REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_transfers_facility ON inventory_transfers (facility_id);
CREATE INDEX IF NOT EXISTS idx_inv_transfers_item     ON inventory_transfers (item_id);
