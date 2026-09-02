#!/usr/bin/env node
/**
 * Money Management — MCP Server
 * ==============================
 * Ekspos data aplikasi budgeting (SQLite) ke AI agent via Model Context Protocol.
 *
 * Jalankan:
 *   npm run mcp
 *
 * Hubungkan dari:
 *   - Claude Desktop  : tambah "mcpServers.money-management" di claude_desktop_config.json
 *   - Cursor / IDE    : command: node /abs/path/mcp-server.mjs
 *   - Hermes Agent    : hermes mcp add ...
 *
 * Database default: ./money_management.db (override via env MONEY_DB_PATH)
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';

// ── Database ──────────────────────────────────────────────
const DB_PATH = process.env.MONEY_DB_PATH || path.resolve(process.cwd(), 'money_management.db');
const SCHEMA_PATH = path.resolve(process.cwd(), 'schema.sql');

// Auto-init: kalau DB belum ada (container baru/volume kosong), buat dari schema.sql
if (!fs.existsSync(DB_PATH)) {
	if (fs.existsSync(SCHEMA_PATH)) {
		console.error(`[mcp] Database tidak ditemukan: ${DB_PATH} — membuat dari schema.sql...`);
		const fresh = new Database(DB_PATH);
		fresh.exec(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
		fresh.close();
		console.error('[mcp] Database kosong berhasil dibuat.');
	} else {
		console.error(`[mcp] Database tidak ditemukan: ${DB_PATH} dan schema.sql tidak ada.`);
		process.exit(1);
	}
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ── Helpers ───────────────────────────────────────────────
const MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

// resolve kategori by name (case-insensitive) — auto-create kalau belum ada (grup Needs)
function resolveCategory(name) {
	const n = String(name || '').trim();
	if (!n) throw new Error('Kategori wajib diisi');
	const row = db.prepare(`SELECT id FROM categories WHERE lower(name) = lower(?)`).get(n);
	if (row) return row.id;
	const info = db.prepare(`INSERT INTO categories(name, group_id, is_saving) VALUES (?, 1, 0)`).run(n);
	return Number(info.lastInsertRowid);
}

// resolve akun by name — default BCA kalau tidak ditemukan
function resolveAccount(name) {
	const n = String(name || '').trim();
	if (n) {
		const row = db.prepare(`SELECT id FROM accounts WHERE lower(name) = lower(?)`).get(n);
		if (row) return row.id;
	}
	const def = db.prepare(`SELECT id FROM accounts ORDER BY id LIMIT 1`).get();
	return def ? def.id : null;
}

// resolve sumber income by name — auto-create kalau belum ada
function resolveSource(name) {
	const n = String(name || '').trim() || 'Lain-lain';
	const row = db.prepare(`SELECT id FROM income_sources WHERE lower(name) = lower(?)`).get(n);
	if (row) return row.id;
	const info = db.prepare(`INSERT INTO income_sources(name) VALUES (?)`).run(n);
	return Number(info.lastInsertRowid);
}

function monthKey(year, month) {
	return `${year}-${String(month).padStart(2, '0')}`;
}

// harga realtime untuk aset saham/crypto (cache sederhana)
const priceCache = new Map();
const CACHE_TTL = 60_000;

async function fetchJson(url, timeoutMs = 8000) {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetch(url, {
			signal: ctrl.signal,
			headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return await res.json();
	} finally {
		clearTimeout(t);
	}
}

const CRYPTO_MAP = {
	BTCIDR: 'bitcoin', ETHIDR: 'ethereum', SOLIDR: 'solana', BNBIDR: 'binancecoin',
	XRPIDR: 'ripple', DOGEIDR: 'dogecoin', ADAIDR: 'cardano', AVAXIDR: 'avalanche-2'
};

async function getRealtimePrice(symbol) {
	const upper = symbol.toUpperCase();
	const cached = priceCache.get(upper);
	if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.price;
	let price = null;
	try {
		if (CRYPTO_MAP[upper]) {
			const d = await fetchJson(`https://api.coingecko.com/api/v3/simple/price?ids=${CRYPTO_MAP[upper]}&vs_currencies=idr`);
			price = d?.[CRYPTO_MAP[upper]]?.idr ?? null;
		} else {
			const d = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${upper}.JK?interval=1d&range=1d`);
			const meta = d?.chart?.result?.[0]?.meta;
			price = meta?.regularMarketPrice ?? meta?.chartPreviousClose ?? null;
		}
	} catch { price = null; }
	priceCache.set(upper, { ts: Date.now(), price });
	return price;
}

// harga emas per gram IDR (gold-api + kurs Yahoo + spread Antam)
const GOLD_SPREAD = 1.0531;
let goldCache = null;
async function getGoldPerGram() {
	if (goldCache && Date.now() - goldCache.ts < CACHE_TTL) return goldCache.price;
	try {
		const [xau, usd] = await Promise.all([
			fetchJson('https://api.gold-api.com/price/XAU'),
			fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/USDIDR%3DX?interval=1d&range=1d')
		]);
		const xauUsd = xau?.price;
		const usdIdr = usd?.chart?.result?.[0]?.meta?.regularMarketPrice;
		if (!xauUsd || !usdIdr) return null;
		const perGram = ((xauUsd / 31.1034768) * usdIdr) * GOLD_SPREAD;
		goldCache = { ts: Date.now(), price: perGram };
		return perGram;
	} catch {
		return null;
	}
}

function wrap(data) {
	return { content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] };
}

// ── MCP Server ────────────────────────────────────────────
// Buat instance baru per koneksi (dibutuhkan untuk mode HTTP multi-session)
function createServer() {
	const server = new McpServer({
		name: 'money-management',
		version: '1.0.0'
	});

// 1. Ringkasan bulanan
server.registerTool(
	'get_summary',
	{
		title: 'Ringkasan keuangan bulanan',
		description: 'Ringkasan income, expense, tabungan, sisa saldo, dan total aset untuk bulan tertentu.',
		inputSchema: {
			year: z.number().int().describe('Tahun, misal 2026'),
			month: z.number().int().min(1).max(12).describe('Bulan 1-12')
		}
	},
	async ({ year, month }) => {
		const mk = monthKey(year, month);
		const income = db.prepare(`SELECT COALESCE(SUM(amount),0) AS t FROM incomes WHERE strftime('%Y-%m', date)=?`).get(mk);
		const expense = db.prepare(`SELECT COALESCE(SUM(amount),0) AS t FROM expenses WHERE strftime('%Y-%m', date)=?`).get(mk);
		const savings = db.prepare(
			`SELECT COALESCE(SUM(b.amount),0) AS t FROM budgets b JOIN categories c ON c.id=b.category_id
			 WHERE b.year=? AND b.month=? AND c.is_saving=1`).get(year, month);
		const assets = db.prepare(`SELECT COALESCE(SUM(current_value),0) AS t FROM assets`).get();
		const gold = db.prepare(`SELECT COALESCE(SUM(current_price),0) AS t FROM gold_holdings`).get();
		const byCat = db.prepare(
			`SELECT c.name AS category, SUM(e.amount) AS amount FROM expenses e JOIN categories c ON c.id=e.category_id
			 WHERE strftime('%Y-%m', e.date)=? GROUP BY c.name ORDER BY amount DESC`).all(mk);

		return wrap({
			periode: `${MONTHS_ID[month-1]} ${year}`,
			income: income.t,
			expense: expense.t,
			savings_allocation: savings.t,
			balance: income.t - expense.t - savings.t,
			total_assets: assets.t + gold.t,
			expense_by_category: byCat
		});
	}
);

// 2. Daftar pengeluaran
server.registerTool(
	'get_expenses',
	{
		title: 'Daftar transaksi pengeluaran',
		description: 'Daftar transaksi pengeluaran per bulan, opsional filter kategori.',
		inputSchema: {
			year: z.number().int(),
			month: z.number().int().min(1).max(12),
			category: z.string().optional().describe('Filter nama kategori, misal "Shopping"'),
			limit: z.number().int().min(1).max(500).optional().default(100)
		}
	},
	async ({ year, month, category, limit }) => {
		const mk = monthKey(year, month);
		let sql = `SELECT e.date, e.description, e.amount, c.name AS category, e.is_verified
		           FROM expenses e JOIN categories c ON c.id=e.category_id
		           WHERE strftime('%Y-%m', e.date)=?`;
		const params = [mk];
		if (category) { sql += ` AND c.name=?`; params.push(category); }
		sql += ` ORDER BY e.amount DESC LIMIT ?`;
		params.push(limit);
		const rows = db.prepare(sql).all(...params);
		const total = rows.reduce((a, r) => a + r.amount, 0);
		return wrap({ count: rows.length, total, transactions: rows });
	}
);

// 3. Budget vs realisasi
server.registerTool(
	'get_budget',
	{
		title: 'Budget vs realisasi',
		description: 'Perbandingan budget dan realisasi pengeluaran per kategori (kategori tabungan di-exclude).',
		inputSchema: {
			year: z.number().int(),
			month: z.number().int().min(1).max(12)
		}
	},
	async ({ year, month }) => {
		const mk = monthKey(year, month);
		const rows = db.prepare(
			`SELECT c.name AS category, COALESCE(SUM(DISTINCT b.amount),0) AS budget,
			        COALESCE((SELECT SUM(e2.amount) FROM expenses e2
			                  WHERE e2.category_id=b.category_id AND strftime('%Y-%m', e2.date)=?),0) AS realisasi
			 FROM budgets b JOIN categories c ON c.id=b.category_id
			 WHERE b.year=? AND b.month=? AND c.is_saving=0
			 GROUP BY b.category_id, c.name ORDER BY budget DESC`).all(mk, year, month);

		const items = rows.map((r) => ({
			...r,
			usage_pct: r.budget > 0 ? Math.round((r.realisasi / r.budget) * 100) : 0,
			status: r.budget > 0 && r.realisasi > r.budget ? 'JEBOL' : (r.budget > 0 && r.realisasi / r.budget >= 0.8 ? 'mendekati limit' : 'aman')
		}));
		return wrap(items);
	}
);

// 4. Aset (dengan harga realtime)
server.registerTool(
	'get_assets',
	{
		title: 'Portofolio aset',
		description: 'Semua aset + total + profit/loss. Saham & crypto memakai harga realtime market.',
		inputSchema: { live: z.boolean().optional().default(true).describe('Pakai harga realtime (true) atau manual (false)') }
	},
	async ({ live }) => {
		const items = db.prepare(
			`SELECT a.id, a.name, a.invested_value, a.current_value AS manual_value, a.liquidity,
			        at.name AS asset_type
			 FROM assets a JOIN asset_types at ON at.id=a.asset_type_id ORDER BY at.name`).all();

		let realtime = {};
		if (live) {
			const holdings = db.prepare(`SELECT asset_id, symbol, shares FROM stock_holdings`).all();
			const symbols = [...new Set(holdings.map((h) => h.symbol))];
			realtime = await getRealtimePricesBulk(symbols);
			const symOf = new Map(holdings.map((h) => [h.asset_id, h.symbol]));
			const shrOf = new Map(holdings.map((h) => [h.asset_id, h.shares]));
			for (const it of items) {
				const sym = symOf.get(it.id);
				const shr = shrOf.get(it.id);
				if (sym && shr && realtime[sym]) {
					it.current_value = Math.round(realtime[sym] * shr);
					it.live = true;
					it.live_price = realtime[sym];
				} else {
					it.current_value = it.manual_value;
					it.live = false;
				}
			}
		}

		// emas dari gold_holdings
		const gold = db.prepare(`SELECT COALESCE(SUM(weight_grams*quantity),0) AS grams, COALESCE(SUM(current_price),0) AS current, COALESCE(SUM(total_buy_cost),0) AS buy FROM gold_holdings`).get();
		let goldLive = null;
		if (live && gold.grams > 0) {
			const perGram = await getGoldPerGram();
			if (perGram) {
				goldLive = Math.round(gold.grams * perGram);
				items.push({ id: 'gold', name: 'Emas (Koleksi)', asset_type: 'Tabungan Emas', liquidity: 'Liquid', invested_value: gold.buy, manual_value: gold.current, current_value: goldLive, live: true, live_price: perGram, note: `${Math.round(gold.grams)} gr` });
			}
		}
		if (!items.some((i) => i.id === 'gold')) {
			items.push({ id: 'gold', name: 'Emas (Koleksi)', asset_type: 'Tabungan Emas', liquidity: 'Liquid', invested_value: gold.buy, current_value: gold.current, live: false, note: `${Math.round(gold.grams)} gr` });
		}

		const totalInvested = items.reduce((a, i) => a + i.invested_value, 0);
		const totalCurrent = items.reduce((a, i) => a + i.current_value, 0);
		return wrap({
			total_current: totalCurrent,
			total_invested: totalInvested,
			profit_loss: totalCurrent - totalInvested,
			items
		});
	}
);

async function getRealtimePricesBulk(symbols) {
	const out = {};
	for (const s of symbols) {
		const p = await getRealtimePrice(s);
		if (p != null) out[s] = p;
	}
	return out;
}

// 5. Emas
server.registerTool(
	'get_gold',
	{
		title: 'Koleksi emas',
		description: 'Koleksi emas + nilai realtime per gram (spread Antam) kalau tersedia.',
		inputSchema: { live: z.boolean().optional().default(true) }
	},
	async ({ live }) => {
		const items = db.prepare(`SELECT * FROM gold_holdings ORDER BY purchase_date DESC`).all();
		let perGram = null;
		if (live) perGram = await getGoldPerGram();

		let totalBuy = 0, totalCurrent = 0;
		const mapped = items.map((r) => {
			const grams = r.weight_grams * (r.quantity || 1);
			totalBuy += r.total_buy_cost;
			const it = { ...r, grams, live: false };
			if (perGram) {
				it.current_price = Math.round(grams * perGram);
				it.profit = it.current_price - r.total_buy_cost;
				it.live = true;
			}
			totalCurrent += it.current_price || 0;
			return it;
		});

		return wrap({
			live_price_per_gram: perGram ? Math.round(perGram) : null,
			total_grams: mapped.reduce((a, r) => a + r.grams, 0),
			total_buy: totalBuy,
			total_current: totalCurrent,
			total_profit: totalCurrent - totalBuy,
			items: mapped
		});
	}
);

// 6. Piutang
server.registerTool(
	'get_receivables',
	{
		title: 'Daftar piutang',
		description: 'Semua piutang, opsional filter status (Belum Lunas / Lunas).',
		inputSchema: {
			status: z.enum(['Belum Lunas', 'Lunas']).optional()
		}
	},
	async ({ status }) => {
		let rows;
		if (status) {
			rows = db.prepare(`SELECT * FROM receivables WHERE status=? ORDER BY date DESC, id DESC`).all(status);
		} else {
			rows = db.prepare(`SELECT * FROM receivables ORDER BY date DESC, id DESC`).all();
		}
		const sum = db.prepare(
			`SELECT COALESCE(SUM(amount),0) AS total_amount, COALESCE(SUM(remaining),0) AS total_remaining,
			        COALESCE(SUM(CASE WHEN likely_paid=1 AND status='Belum Lunas' THEN remaining ELSE 0 END),0) AS likely_collectible
			 FROM receivables`).get();
		return wrap({ summary: sum, items: rows });
	}
);

// 7. Target haji
server.registerTool(
	'get_haji_target',
	{
		title: 'Target haji',
		description: 'Progress target haji: emas ber-tag Haji + tabungan haji vs target, sisa, dan estimasi.',
		inputSchema: {
			monthly_saving: z.number().positive().optional().describe('Nominal nabung per bulan untuk simulasi')
		}
	},
	async ({ monthly_saving }) => {
		const target = Number(db.prepare(`SELECT value FROM settings WHERE key='target_haji'`).get()?.value || 100_000_000);
		const gold = db.prepare(
			`SELECT COALESCE(SUM(weight_grams*quantity),0) AS grams, COALESCE(SUM(current_price),0) AS current_value
			 FROM gold_holdings WHERE purpose='Haji'`).get();
		const saving = db.prepare(
			`SELECT COALESCE(SUM(current_value),0) AS value FROM assets WHERE lower(name) LIKE '%haji%'`).get();

		const collected = gold.current_value + saving.value;
		const remaining = Math.max(0, target - collected);
		const out = {
			target,
			collected,
			remaining,
			pct: target > 0 ? Math.round((collected / target) * 100) : 0,
			gold_grams: gold.grams,
			gold_value: gold.current_value,
			saving_value: saving.value
		};
		if (monthly_saving && remaining > 0) {
			const months = Math.ceil(remaining / monthly_saving);
			out.eta_months = months;
			out.eta_years = Math.floor(months / 12);
			out.eta_remainder_months = months % 12;
			out.eta_year_target = new Date().getFullYear() + Math.floor(months / 12);
			out.eta_description = `${months} bulan lagi (${Math.floor(months/12)} tahun ${months%12} bulan) — nabung ${monthly_saving.toLocaleString('id-ID')}/bulan`;
		}
		return wrap(out);
	}
);

// 8. Bulan yang punya data
server.registerTool(
	'list_months',
	{
		title: 'Daftar bulan berdata',
		description: 'Semua bulan yang punya transaksi, untuk referensi query.',
		inputSchema: {}
	},
	async () => {
		const rows = db.prepare(
			`SELECT DISTINCT strftime('%Y', date) AS year, strftime('%m', date) AS month FROM expenses
			 UNION SELECT DISTINCT strftime('%Y', date), strftime('%m', date) FROM incomes
			 ORDER BY year DESC, month DESC`).all();
		return wrap(rows.map((r) => ({ key: `${r.year}-${r.month}`, label: `${MONTHS_ID[Number(r.month)-1]} ${r.year}` })));
	}
);

// 9. Info kategori & akun
server.registerTool(
	'get_meta',
	{
		title: 'Master data',
		description: 'Daftar kategori (dengan flag saving), akun, sumber income, dan tipe aset.',
		inputSchema: {}
	},
	async () => {
		const categories = db.prepare(
			`SELECT c.id, c.name, c.is_saving, g.name AS group_name FROM categories c
			 LEFT JOIN category_groups g ON g.id=c.group_id ORDER BY c.is_saving DESC, c.name`).all();
		const accounts = db.prepare(`SELECT id, name FROM accounts`).all();
		const sources = db.prepare(`SELECT id, name FROM income_sources`).all();
		const assetTypes = db.prepare(`SELECT id, name, liquidity FROM asset_types`).all();
		return wrap({ categories, accounts, income_sources: sources, asset_types: assetTypes });
	}
);

// ── WRITE: AI bisa menulis transaksi ──────────────────────

// 10. Tambah pengeluaran
server.registerTool(
	'add_expense',
	{
		title: 'Tambah transaksi pengeluaran',
		description: 'Catat transaksi pengeluaran baru. Kategori diisi nama (auto-buat kalau belum ada). Akun default BCA.',
		inputSchema: {
			date: z.string().describe('Tanggal YYYY-MM-DD, misal 2026-09-05'),
			description: z.string().describe('Deskripsi transaksi, misal "Beli sembako"'),
			category: z.string().describe('Nama kategori, misal "Shopping" / "Makanan"'),
			amount: z.number().positive().describe('Jumlah dalam Rupiah'),
			account: z.string().optional().describe('Nama akun: BCA / BSI / CASH (default BCA)'),
			is_verified: z.boolean().optional().default(false).describe('Sudah diverifikasi')
		}
	},
	async ({ date, description, category, amount, account, is_verified }) => {
		const categoryId = resolveCategory(category);
		const accountId = resolveAccount(account);
		const info = db.prepare(
			`INSERT INTO expenses(date, description, category_id, account_id, amount, is_verified)
			 VALUES (?,?,?,?,?,?)`
		).run(date, description, categoryId, accountId, amount, is_verified ? 1 : 0);
		return wrap({ ok: true, id: Number(info.lastInsertRowid), message: `Pengeluaran "${description}" Rp ${amount.toLocaleString('id-ID')} dicatat` });
	}
);

// 11. Tambah pemasukan
server.registerTool(
	'add_income',
	{
		title: 'Tambah transaksi pemasukan',
		description: 'Catat transaksi pemasukan baru. Sumber auto-buat kalau belum ada. Akun default BCA.',
		inputSchema: {
			date: z.string().describe('Tanggal YYYY-MM-DD'),
			source: z.string().describe('Nama sumber income, misal "Profit Kantor" / "Gaji"'),
			amount: z.number().positive().describe('Jumlah dalam Rupiah'),
			account: z.string().optional().describe('Nama akun: BCA / BSI / CASH (default BCA)'),
			note: z.string().optional().describe('Catatan')
		}
	},
	async ({ date, source, amount, account, note }) => {
		const sourceId = resolveSource(source);
		const accountId = resolveAccount(account);
		const info = db.prepare(
			`INSERT INTO incomes(date, source_id, account_id, amount, note)
			 VALUES (?,?,?,?,?)`
		).run(date, sourceId, accountId, amount, note || null);
		return wrap({ ok: true, id: Number(info.lastInsertRowid), message: `Pemasukan "${source}" Rp ${amount.toLocaleString('id-ID')} dicatat` });
	}
);

// 12. Update pengeluaran
server.registerTool(
	'update_expense',
	{
		title: 'Update transaksi pengeluaran',
		description: 'Ubah field transaksi pengeluaran berdasarkan id. Kirim hanya field yang mau diubah.',
		inputSchema: {
			id: z.number().int().describe('ID transaksi (lihat dari get_expenses)'),
			date: z.string().optional(),
			description: z.string().optional(),
			category: z.string().optional().describe('Nama kategori baru'),
			amount: z.number().positive().optional(),
			account: z.string().optional(),
			is_verified: z.boolean().optional()
		}
	},
	async ({ id, date, description, category, amount, account, is_verified }) => {
		const row = db.prepare(`SELECT id FROM expenses WHERE id=?`).get(id);
		if (!row) return wrap({ ok: false, error: `Transaksi ${id} tidak ditemukan` });

		const sets = [];
		const vals = [];
		if (date !== undefined) { sets.push('date=?'); vals.push(date); }
		if (description !== undefined) { sets.push('description=?'); vals.push(description); }
		if (category !== undefined) { sets.push('category_id=?'); vals.push(resolveCategory(category)); }
		if (amount !== undefined) { sets.push('amount=?'); vals.push(amount); }
		if (account !== undefined) { sets.push('account_id=?'); vals.push(resolveAccount(account)); }
		if (is_verified !== undefined) { sets.push('is_verified=?'); vals.push(is_verified ? 1 : 0); }
		if (!sets.length) return wrap({ ok: false, error: 'Tidak ada field yang diubah' });

		vals.push(id);
		db.prepare(`UPDATE expenses SET ${sets.join(', ')} WHERE id=?`).run(...vals);
		return wrap({ ok: true, message: `Transaksi ${id} diperbarui` });
	}
);

// 13. Hapus pengeluaran
server.registerTool(
	'delete_expense',
	{
		title: 'Hapus transaksi pengeluaran',
		description: 'Hapus transaksi pengeluaran berdasarkan id.',
		inputSchema: {
			id: z.number().int().describe('ID transaksi (lihat dari get_expenses)')
		}
	},
	async ({ id }) => {
		const info = db.prepare(`DELETE FROM expenses WHERE id=?`).run(id);
		if (!info.changes) return wrap({ ok: false, error: `Transaksi ${id} tidak ditemukan` });
		return wrap({ ok: true, message: `Transaksi ${id} dihapus` });
	}
);

// 14. Hapus pemasukan
server.registerTool(
	'delete_income',
	{
		title: 'Hapus transaksi pemasukan',
		description: 'Hapus transaksi pemasukan berdasarkan id.',
		inputSchema: {
			id: z.number().int().describe('ID transaksi')
		}
	},
	async ({ id }) => {
		const info = db.prepare(`DELETE FROM incomes WHERE id=?`).run(id);
		if (!info.changes) return wrap({ ok: false, error: `Transaksi ${id} tidak ditemukan` });
		return wrap({ ok: true, message: `Transaksi ${id} dihapus` });
	}
);

	return server;
}

// ── Jalankan ──────────────────────────────────────────────
const transportMode = process.env.MCP_TRANSPORT || 'stdio';

if (transportMode === 'http') {
	// Mode HTTP (Streamable HTTP) — cocok dijalankan di Docker/container,
	// AI client connect via URL: http://host:3001/mcp
	const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
	const { default: express } = await import('express');

	const app = express();
	app.use(express.json({ limit: '1mb' }));
	const sessions = new Map();

	app.post('/mcp', async (req, res) => {
		const sessionId = req.headers['mcp-session-id'];
		const existing = sessionId ? sessions.get(sessionId) : null;
		if (existing) {
			await existing.handleRequest(req, res, req.body);
			return;
		}
		const transport = new StreamableHTTPServerTransport({
			onsessioninitialized: (sid) => {
				sessions.set(sid, transport);
			}
		});
		const server = createServer();
		await server.connect(transport);
		await transport.handleRequest(req, res, req.body);
	});

	app.get('/mcp', (req, res) => {
		const t = sessions.get(req.headers['mcp-session-id']);
		if (t) t.handleRequest(req, res, null);
		else res.status(400).json({ error: 'Session tidak ditemukan' });
	});

	app.delete('/mcp', (req, res) => {
		const sid = req.headers['mcp-session-id'];
		const t = sessions.get(sid);
		if (t) {
			sessions.delete(sid);
			t.close();
			res.status(200).json({ ok: true });
		} else {
			res.status(404).json({ error: 'Session tidak ditemukan' });
		}
	});

	const mcpPort = Number(process.env.MCP_PORT || 3001);
	app.listen(mcpPort, () => {
		console.error(`[mcp] HTTP server siap di http://localhost:${mcpPort}/mcp (transport: streamable HTTP)`);
	});
} else {
	// Mode stdio (default) — untuk AI agent lokal (Claude Desktop, Cursor, Hermes)
	const server = createServer();
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error('[mcp] Money Management MCP server siap di stdio.');
}
