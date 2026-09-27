-- Run once against an existing PostgreSQL database before enabling staff access.
CREATE TABLE IF NOT EXISTS merchant_staff (
    id uuid PRIMARY KEY,
    merchant_id uuid NOT NULL REFERENCES merchants(id),
    wallet_address varchar(44) NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_merchant_staff_wallet UNIQUE (merchant_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS ix_merchant_staff_merchant_id ON merchant_staff (merchant_id);
CREATE INDEX IF NOT EXISTS ix_merchant_staff_wallet_address ON merchant_staff (wallet_address);
