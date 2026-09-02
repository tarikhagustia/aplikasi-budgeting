import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { getRealtimePrices } from '$lib/server/prices';
import type { RequestHandler } from './$types';

// GET /api/summary?year=2026&month=8 — ringkasan bulanan + data dashboard
export const GET: RequestHandler = async ({ url }) => {
	const year = Number(url.searchParams.get('year') ?? 2026);
	const month = Number(url.searchParams.get('month') ?? 8);
	const db = getDb();

	const monthKey = `${year}-${String(month).padStart(2, '0')}`;

	// income bulan ini
	const income = db
		.prepare(
			`SELECT COALESCE(SUM(amount),0) AS total FROM incomes
			 WHERE strftime('%Y-%m', date) = ?`
		)
		.get(monthKey) as { total: number };

	// expense bulan ini
	const expense = db
		.prepare(
			`SELECT COALESCE(SUM(amount),0) AS total FROM expenses
			 WHERE strftime('%Y-%m', date) = ?`
		)
		.get(monthKey) as { total: number };

	// total alokasi tabungan bulan ini (kategori is_saving = 1)
	const savings = db
		.prepare(
			`SELECT COALESCE(SUM(b.amount),0) AS total
			 FROM budgets b JOIN categories c ON c.id = b.category_id
			 WHERE b.year = ? AND b.month = ? AND c.is_saving = 1`
		)
		.get(year, month) as { total: number };

	// ── Total aset (konsisten dengan halaman Aset) ──
	// 1) nilai manual dari tabel assets
	const assets = db
		.prepare(`SELECT COALESCE(SUM(current_value),0) AS total FROM assets`)
		.get() as { total: number };

	// 2) penyesuaian harga realtime saham/crypto (live vs manual)
	const holdings = db
		.prepare(
			`SELECT h.asset_id, h.symbol, h.shares, h.price AS manual_price, a.current_value AS manual_value
			 FROM stock_holdings h JOIN assets a ON a.id = h.asset_id`
		)
		.all() as { asset_id: number; symbol: string; shares: number; manual_price: number; manual_value: number }[];
	const realtime = await getRealtimePrices(holdings.map((h) => h.symbol));

	let totalAssets = assets.total;
	for (const h of holdings) {
		const live = realtime[h.symbol];
		if (live) {
			const liveValue = Math.round(live * h.shares);
			totalAssets += liveValue - h.manual_value;
		}
	}

	// 3) tambahkan emas dari gold_holdings (kalau belum ada aset bertipe Tabungan Emas)
	const hasGoldAsset = (db.prepare(
		`SELECT 1 FROM assets a JOIN asset_types at ON at.id = a.asset_type_id
		 WHERE at.name = 'Tabungan Emas' LIMIT 1`
	).get()) !== undefined;
	if (!hasGoldAsset) {
		const gold = db
			.prepare(`SELECT COALESCE(SUM(current_price),0) AS total FROM gold_holdings`)
			.get() as { total: number };
		totalAssets += gold.total;
	}

	// expenses per kategori (bulan ini) — untuk donut & bar chart
	const byCategory = db
		.prepare(
			`SELECT c.name AS category, COALESCE(SUM(e.amount),0) AS amount
			 FROM expenses e JOIN categories c ON c.id = e.category_id
			 WHERE strftime('%Y-%m', e.date) = ?
			 GROUP BY c.name ORDER BY amount DESC`
		)
		.all(monthKey) as { category: string; amount: number }[];

	// budget vs realisasi (bulan ini) — HANYA kategori non-saving (Needs/Wants)
	const budgetReal = db
		.prepare(
			`SELECT c.name AS category, c.is_saving,
			        COALESCE(SUM(DISTINCT b.amount),0) AS budget,
			        COALESCE((SELECT SUM(e2.amount) FROM expenses e2
			                  WHERE e2.category_id = b.category_id
			                    AND strftime('%Y-%m', e2.date) = ?),0) AS realisasi
			 FROM budgets b JOIN categories c ON c.id = b.category_id
			 WHERE b.year = ? AND b.month = ? AND c.is_saving = 0
			 GROUP BY b.category_id, c.name, c.is_saving
			 ORDER BY budget DESC`
		)
		.all(monthKey, year, month) as { category: string; is_saving: number; budget: number; realisasi: number }[];

	// trend 12 bulan
	const trend = db
		.prepare(
			`SELECT strftime('%Y-%m', date) AS month,
			        SUM(CASE WHEN type='inc' THEN amount END) AS income,
			        SUM(CASE WHEN type='exp' THEN amount END) AS expense
			 FROM (
			   SELECT date, amount, 'inc' AS type FROM incomes
			   UNION ALL
			   SELECT date, amount, 'exp' AS type FROM expenses
			 )
			 WHERE date >= date('now', '-11 months')
			 GROUP BY month ORDER BY month`
		)
		.all() as { month: string; income: number | null; expense: number | null }[];

	// piutang terbuka — agregat per nama biar ringkas & tidak keliatan duplikat
	const receivables = db
		.prepare(
			`SELECT name,
			        COUNT(*) AS count,
			        SUM(amount) AS amount,
			        SUM(paid_amount) AS paid_amount,
			        SUM(remaining) AS remaining,
			        MAX(status) AS status,
			        MAX(likely_paid) AS likely_paid
			 FROM receivables WHERE status = 'Belum Lunas'
			 GROUP BY name ORDER BY remaining DESC`
		)
		.all() as { name: string; count: number; amount: number; paid_amount: number; remaining: number; status: string; likely_paid: number }[];

	// emas
	const gold = db
		.prepare(
			`SELECT COALESCE(SUM(weight_grams),0) AS grams,
			        COALESCE(SUM(total_buy_cost),0) AS buy_cost,
			        COALESCE(SUM(current_price),0) AS current_value
			 FROM gold_holdings`
		)
		.get() as { grams: number; buy_cost: number; current_value: number };

	// transaksi terbesar bulan ini
	const topExpenses = db
		.prepare(
			`SELECT e.description, e.amount, c.name AS category
			 FROM expenses e JOIN categories c ON c.id = e.category_id
			 WHERE strftime('%Y-%m', e.date) = ?
			 ORDER BY e.amount DESC LIMIT 5`
		)
		.all(monthKey) as { description: string; amount: number; category: string }[];

	// likuiditas
	const liquidity = db
		.prepare(
			`SELECT a.liquidity, COALESCE(SUM(a.current_value),0) AS total
			 FROM assets a GROUP BY a.liquidity`
		)
		.all() as { liquidity: string; total: number }[];

	return json({
		income: income.total,
		expense: expense.total,
		savings: savings.total,
		// sisa saldo = income − expense − alokasi tabungan
		balance: income.total - expense.total - savings.total,
		totalAssets,
		byCategory,
		budgetReal,
		trend,
		receivables,
		gold,
		topExpenses,
		liquidity,
		monthKey
	});
};
