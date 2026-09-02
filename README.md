# 💰 Aplikasi Budgeting — Money Management

PWA manajemen keuangan pribadi yang ringan & mobile-first, dibangun dengan **SvelteKit 5** + **SQLite**. Bisa di-install di HP seperti aplikasi native, jalan offline, dan otomatis ambil **harga realtime** untuk aset crypto, saham, dan emas.

![Stack](https://img.shields.io/badge/SvelteKit-5-ff3e00) ![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003b57) ![PWA](https://img.shields.io/badge/PWA-ready-5A0FC8) ![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ Fitur

| Fitur | Deskripsi |
|---|---|
| 🏠 **Dashboard** | KPI bulanan, tren 12 bulan, komposisi pengeluaran, budget vs realisasi, pembagian aset |
| 📋 **Budget** | Salin budget bulan lalu, template, stepper +/−, masking rupiah, kalkulasi realtime (alokasi vs pemasukan), kategori tabungan diurutkan di atas |
| ➕ **Tambah Transaksi** | Catat pengeluaran & pemasukan langsung dari HP |
| 🏦 **Aset** | Kelola aset (tanah, deposito, saham, crypto, dll) + **target 1 Miliar** dengan progress bar |
| 📈 **Harga Realtime** | Saham IDX & crypto otomatis dari market (Yahoo Finance + CoinGecko), emas per gram dari gold-api + kurs USD/IDR (dengan spread premium Antam) |
| 🥇 **Emas** | Kelola koleksi emas (berat, qty, harga beli, keperluan), nilai & profit/loss realtime |
| 🎯 **Target Haji** | Gabungkan emas ber-tag Haji + tabungan haji, simulasi "kalau nabung X/bulan, lunas tahun ke berapa" |
| 📌 **Piutang** | CRUD piutang, catat pembayaran parsial, filter status |
| 🧾 **Riwayat** | Semua transaksi per bulan, filter pengeluaran/pemasukan |
| 📲 **PWA** | Installable, service worker, manifest — bisa dipasang di home screen HP |

---

## 🚀 Cara Menjalankan

### Prasyarat
- **Node.js 20+**
- **npm**

### Setup

```bash
# 1. Clone
git clone https://github.com/tarikhagustia/aplikasi-budgeting.git
cd aplikasi-budgeting

# 2. Install dependensi
npm install

# 3. Inisialisasi database (opsional — otomatis dibuat saat pertama kali server jalan)
npm run db:init

# 4. Jalankan development server
npm run dev
```

Buka **http://localhost:5173** (default Vite) — database kosong akan otomatis dibuat dengan master data dasar (akun BCA/BSI/CASH, kategori umum, tipe aset).

### Mode produksi

```bash
npm run build
node build/index.js   # atau PORT=3000 node build/index.js
```

### Konfigurasi

| Variabel | Deskripsi | Default |
|---|---|---|
| `APP_PIN` | PIN untuk membuka aplikasi | `123456` |
| `MONEY_DB_PATH` | Lokasi file database SQLite | `./money_management.db` |

Salin `.env.example` ke `.env` untuk konfigurasi:

```bash
cp .env.example .env
```

---

## 🔒 Keamanan (PIN)

Aplikasi dilindungi **PIN** — setiap kali dibuka (session baru), akan diminta PIN sebelum konten ditampilkan.

- **PIN disimpan di `.env`** (variabel `APP_PIN`), **tidak pernah** disimpan di database atau dikirim ke browser — verifikasi dilakukan di server
- **Default PIN: `123456`** — WAJIB diganti sebelum dipakai untuk data sungguhan!
- Setelah benar, unlock berlaku untuk **satu session** (tab/halaman) — tutup aplikasi & buka lagi akan diminta PIN ulang
- Ada tombol **🔒** di pojok kanan atas untuk mengunci aplikasi secara manual
- Brute-force diperlambat: percobaan gagal diberi jeda respons lebih lama

### Cara mengganti PIN

```bash
# 1. Edit file .env (buat dulu dari .env.example kalau belum ada)
APP_PIN=987654

# 2. Restart server
npm run dev
```

> ⚠️ **Catatan penting:** PIN ini adalah *lock screen* — melindungi dari orang yang membuka HP/app. Ini **bukan enkripsi data**: file database (SQLite) tetap bisa dibaca langsung oleh siapa pun yang punya akses ke file-nya. Untuk proteksi penuh, gunakan enkripsi disk (FileVault di macOS / BitLocker di Windows) dan jangan pernah membagikan file `money_management.db`.

---

## 🤖 Integrasi AI (MCP Server)

Aplikasi ini punya **MCP server** (`mcp-server.mjs`) — jadi AI agent (Claude Desktop, Cursor, Claude Code, Hermes Agent, dll) bisa langsung bertanya & menganalisis data keuangan lewat protokol [Model Context Protocol](https://modelcontextprotocol.io).

### Jalankan

```bash
npm run mcp
```

Server berjalan di **stdio** — siap dihubungkan ke AI agent apa pun.

### Tools yang tersedia

| Tool | Deskripsi |
|---|---|
| `get_summary` | Ringkasan income/expense/tabungan/saldo/aset per bulan |
| `get_expenses` | Daftar transaksi pengeluaran (filter kategori, limit) |
| `get_budget` | Budget vs realisasi per kategori (kategori tabungan di-exclude) |
| `get_assets` | Portofolio aset + profit/loss (**harga realtime** saham/crypto/emas) |
| `get_gold` | Koleksi emas + nilai realtime per gram (spread Antam) |
| `get_receivables` | Daftar piutang (filter status) |
| `get_haji_target` | Progress target haji + simulasi nabung (ETA lunas) |
| `list_months` | Bulan-bulan yang punya data |
| `get_meta` | Master data: kategori, akun, sumber income, tipe aset |

### Contoh koneksi

**Claude Desktop** — tambah ke `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "money-management": {
      "command": "node",
      "args": ["/absolute/path/ke/aplikasi-budgeting/mcp-server.mjs"]
    }
  }
}
```

**Cursor / IDE lain** — tambah MCP server dengan command:
```
node /absolute/path/ke/aplikasi-budgeting/mcp-server.mjs
```

**Hermes Agent:**
```bash
hermes mcp add money-management -- node /absolute/path/ke/aplikasi-budgeting/mcp-server.mjs
```

Database dibaca **read-only** — AI hanya bisa membaca, tidak bisa mengubah data. Konfigurasi path DB via env `MONEY_DB_PATH`.

---

## 🗄️ Database

Aplikasi menggunakan **SQLite** via `better-sqlite3`. **Database tidak ikut di-commit** (lihat `.gitignore`) — setiap orang yang clone memulai dengan **database kosong** berisi master data dasar, lalu mengisi datanya sendiri lewat aplikasi.

Skema ada di [`schema.sql`](./schema.sql) — 14 tabel + 3 view yang meniru struktur spreadsheet "Ultimate Money Management V4":

- **Master:** `accounts`, `income_sources`, `category_groups`, `categories`, `asset_types`, `settings`
- **Transaksi:** `incomes`, `expenses`, `budgets`
- **Investasi:** `assets`, `stock_holdings`, `stock_watchlist`, `gold_holdings`
- **Piutang:** `receivables`
- **View:** `v_monthly_report`, `v_assets_summary`, `v_receivables_summary`

### Logika penting

- **Sisa saldo** = income − expense − alokasi tabungan (kategori `is_saving`) — uang yang ditabung tidak dihitung sebagai sisa yang bisa dipakai
- **Kategori tabungan** (Emergency Funds, Pensiun, Haji, dll) di-exclude dari chart budget vs realisasi, ditampilkan terpisah dengan badge hijau
- **Harga realtime** dihitung on-the-fly (tidak menimpa nilai manual di DB) — kalau API gagal, fallback otomatis ke nilai manual

---

## 📡 Sumber Harga Realtime

| Aset | Sumber | Cache |
|---|---|---|
| Saham IDX (BBCA.JK, AMRT.JK, …) | Yahoo Finance | 60 detik |
| Crypto IDR (BTCIDR, ETHIDR, …) | CoinGecko | 60 detik |
| Emas per gram | gold-api.com (XAU/USD) × Yahoo (USD/IDR) + spread Antam | 60 detik |

> ⚠️ Harga realtime adalah estimasi pasar — bukan harga resmi/beli-jual dari broker atau butik Antam. Selalu cek harga aktual sebelum transaksi.

---

## 🛠️ Teknologi

- **SvelteKit 5** (runes mode) — framework web full-stack yang ringan
- **better-sqlite3** — akses SQLite sinkron & cepat
- **vite-plugin-pwa** — service worker, manifest, installable
- **adapter-node** — deploy ke server Node.js (VPS, Railway, Render, dll)
- CSS custom (tanpa framework UI) — desain cozy: krem hangat, aksen terracotta, mobile-first

---

## 📄 Lisensi

MIT — silakan dipakai, dimodifikasi, dan disebarkan.
