-- ============================================================
-- Money Management SQLite Schema
-- Mirrors "Ultimate Money Management V4" spreadsheet structure
-- ============================================================
PRAGMA foreign_keys = ON;

-- ── Master: Accounts (BSI, BCA, CASH, dll) ──────────────
CREATE TABLE IF NOT EXISTS accounts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Master: Income sources ───────────────────────────────
CREATE TABLE IF NOT EXISTS income_sources (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Master: Category groups (Needs / Wants / Savings) ────
CREATE TABLE IF NOT EXISTS category_groups (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE   -- Needs, Wants, Savings
);

-- ── Master: Expense/savings categories ───────────────────
CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    group_id    INTEGER REFERENCES category_groups(id),
    is_saving   INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Master: Asset types (Deposito, Saham, Emas, Tanah…) ──
CREATE TABLE IF NOT EXISTS asset_types (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,      -- e.g. Tabungan Emas
    liquidity   TEXT NOT NULL DEFAULT 'Liquid'  -- Liquid / Non-Liquid
);

-- ── Budgets: monthly allocation per category per account ─
CREATE TABLE IF NOT EXISTS budgets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    year        INTEGER NOT NULL,
    month       INTEGER NOT NULL,          -- 1-12
    category_id INTEGER NOT NULL REFERENCES categories(id),
    account_id  INTEGER REFERENCES accounts(id),
    amount      REAL NOT NULL DEFAULT 0,
    UNIQUE (year, month, category_id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(year, month);

-- ── Income transactions ──────────────────────────────────
CREATE TABLE IF NOT EXISTS incomes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT NOT NULL,             -- YYYY-MM-DD
    source_id   INTEGER NOT NULL REFERENCES income_sources(id),
    account_id  INTEGER REFERENCES accounts(id),
    amount      REAL NOT NULL,
    note        TEXT
);
CREATE INDEX IF NOT EXISTS idx_incomes_date ON incomes(date);

-- ── Expense transactions ─────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT NOT NULL,             -- YYYY-MM-DD
    description TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    account_id  INTEGER REFERENCES accounts(id),
    amount      REAL NOT NULL,
    is_verified INTEGER NOT NULL DEFAULT 0,  -- ✓ checklist
    note        TEXT
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);

-- ── Assets (portfolio holdings) ──────────────────────────
CREATE TABLE IF NOT EXISTS assets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,           -- e.g. "Sawah 2 Kotak (Baden)"
    asset_type_id INTEGER NOT NULL REFERENCES asset_types(id),
    invested_value REAL NOT NULL DEFAULT 0,
    current_value REAL NOT NULL DEFAULT 0,
    liquidity     TEXT NOT NULL DEFAULT 'Liquid',
    note          TEXT
);

-- ── Stock holdings inside assets (Saham type) ────────────
CREATE TABLE IF NOT EXISTS stock_holdings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id    INTEGER REFERENCES assets(id) ON DELETE CASCADE,
    symbol      TEXT NOT NULL,             -- e.g. AMRT
    price       REAL NOT NULL,
    shares      REAL NOT NULL,
    value       REAL NOT NULL
);

-- ── Stock watchlist (Saham Tracker sheet) ────────────────
CREATE TABLE IF NOT EXISTS stock_watchlist (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol         TEXT NOT NULL UNIQUE,   -- e.g. IDX:ADRO
    price_to_book  REAL,
    pbv_mean       REAL,
    normal_price   REAL,
    current_price  REAL,
    price_diff     REAL,
    diff_pct       REAL
);

-- ── Receivables (Piutang) ────────────────────────────────
CREATE TABLE IF NOT EXISTS receivables (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    date            TEXT NOT NULL,         -- YYYY-MM-DD
    name            TEXT NOT NULL,
    amount          REAL NOT NULL,
    paid_amount     REAL NOT NULL DEFAULT 0,
    remaining       REAL NOT NULL DEFAULT 0,
    description     TEXT,
    status          TEXT NOT NULL DEFAULT 'Belum Lunas',  -- Belum Lunas / Lunas
    likely_paid     INTEGER NOT NULL DEFAULT 0,           -- Potensi Bayar (Ya/Tidak)
    paid_date       TEXT,
    paid_note       TEXT
);

-- ── Gold holdings (Emas sheet) ───────────────────────────
CREATE TABLE IF NOT EXISTS gold_holdings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_date   TEXT NOT NULL,         -- YYYY-MM-DD
    age_months      INTEGER,
    storage         TEXT,                  -- Brankas Rumah
    purchase_place  TEXT,                  -- Toko mas Sukabumi
    kind            TEXT,                  -- Antam
    purpose         TEXT,                  -- Haji
    weight_grams    REAL NOT NULL,
    quantity        REAL NOT NULL DEFAULT 1,
    buy_price       REAL NOT NULL,         -- price per unit
    total_buy_cost  REAL NOT NULL,
    current_price   REAL,                  -- current value total
    profit          REAL
);

-- ── Settings / targets ───────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);

-- ── Views: monthly summary (mirrors Report sheet) ────────
CREATE VIEW IF NOT EXISTS v_monthly_income AS
SELECT strftime('%Y', date) AS year, CAST(strftime('%m', date) AS INTEGER) AS month,
       SUM(amount) AS total_income
FROM incomes GROUP BY year, month;

CREATE VIEW IF NOT EXISTS v_monthly_expense AS
SELECT strftime('%Y', date) AS year, CAST(strftime('%m', date) AS INTEGER) AS month,
       SUM(amount) AS total_expense
FROM expenses GROUP BY year, month;

CREATE VIEW IF NOT EXISTS v_monthly_budget AS
SELECT year, month, SUM(amount) AS total_budget
FROM budgets GROUP BY year, month;

-- Monthly report: income, savings (budget), expenses
CREATE VIEW IF NOT EXISTS v_monthly_report AS
SELECT
    COALESCE(i.year,  b.year,  e.year)  AS year,
    COALESCE(i.month, b.month, e.month) AS month,
    COALESCE(i.total_income, 0)  AS total_income,
    COALESCE(b.total_budget,  0)  AS total_budget,
    COALESCE(e.total_expense, 0)  AS total_expense,
    COALESCE(i.total_income,0) - COALESCE(e.total_expense,0) AS balance
FROM v_monthly_income i
FULL OUTER JOIN v_monthly_budget b ON i.year=b.year AND i.month=b.month
FULL OUTER JOIN v_monthly_expense e ON COALESCE(i.year,b.year)=e.year AND COALESCE(i.month,b.month)=e.month;

-- Portfolio summary (mirrors Assets sheet)
CREATE VIEW IF NOT EXISTS v_assets_summary AS
SELECT
    at.name AS asset_type,
    at.liquidity,
    COUNT(a.id) AS items,
    COALESCE(SUM(a.invested_value), 0) AS total_invested,
    COALESCE(SUM(a.current_value), 0) AS total_current,
    COALESCE(SUM(a.current_value), 0) - COALESCE(SUM(a.invested_value), 0) AS profit_loss
FROM asset_types at
LEFT JOIN assets a ON a.asset_type_id = at.id
GROUP BY at.id;

-- Receivables summary
CREATE VIEW IF NOT EXISTS v_receivables_summary AS
SELECT
    SUM(amount) AS total_amount,
    SUM(paid_amount) AS total_paid,
    SUM(remaining) AS total_remaining,
    SUM(CASE WHEN likely_paid=1 AND status='Belum Lunas' THEN remaining ELSE 0 END) AS likely_collectible
FROM receivables;

-- ============================================================
-- Seed: master data minimal supaya aplikasi langsung usable
-- ============================================================

INSERT OR IGNORE INTO category_groups (id, name) VALUES
    (1, 'Needs'),
    (2, 'Wants'),
    (3, 'Savings');

INSERT OR IGNORE INTO accounts (name) VALUES ('BCA'), ('BSI'), ('CASH');

INSERT OR IGNORE INTO income_sources (name) VALUES
    ('Profit Kantor'), ('Gaji'), ('Investasi'), ('Lain-lain');

INSERT OR IGNORE INTO asset_types (id, name, liquidity) VALUES
    (1, 'Deposito', 'Liquid'),
    (2, 'Tabungan Umum', 'Liquid'),
    (3, 'Tabungan Emas', 'Liquid'),
    (4, 'Tanah', 'Non-Liquid'),
    (5, 'Saham', 'Liquid'),
    (6, 'Reksa Dana (PU)', 'Liquid'),
    (7, 'Obligasi', 'Liquid'),
    (8, 'Crypto', 'Liquid');

INSERT OR IGNORE INTO categories (name, group_id, is_saving) VALUES
    ('Bulanan Istri', 1, 0), ('Bulanan Mamah', 1, 0), ('Kebutuhan Anak', 1, 0),
    ('Listrik', 1, 0), ('BPJS', 1, 0), ('Bensin', 1, 0),
    ('Kuota / Internet', 1, 0), ('Pajak Kendaraan', 1, 0), ('Sedekah', 1, 0),
    ('Shopping', 2, 0), ('Hobby', 2, 0), ('Travel', 2, 0),
    ('Emergency Funds', 3, 1), ('Pensiun', 3, 1), ('Tabungan Haji', 3, 1),
    ('Tabungan Anak', 3, 1);

INSERT OR IGNORE INTO settings (key, value) VALUES
    ('target_asset_value', '1000000000'),
    ('target_haji', '100000000'),
    ('app_name', 'Money Management'),
    ('currency', 'IDR');
