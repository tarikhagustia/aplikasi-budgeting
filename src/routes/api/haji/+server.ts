import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

// GET /api/haji — target haji: emas ber-tag Haji + tabungan haji (asset) vs target
export const GET: RequestHandler = async () => {
	const db = getDb();

	// target dari settings (default 100 jt — biaya haji reguler saat ini)
	const targetRow = db.prepare(`SELECT value FROM settings WHERE key = 'target_haji'`).get() as
		| { value: string }
		| undefined;
	const target = Number(targetRow?.value || 100_000_000);

	// emas dengan keperluan Haji (nilai sekarang = current_price)
	const gold = db
		.prepare(
			`SELECT COALESCE(SUM(weight_grams * quantity),0) AS grams,
			        COALESCE(SUM(total_buy_cost),0) AS buy_cost,
			        COALESCE(SUM(current_price),0) AS current_value,
			        COUNT(*) AS count
			 FROM gold_holdings WHERE purpose = 'Haji'`
		)
		.get() as { grams: number; buy_cost: number; current_value: number; count: number };

	// tabungan haji dari tabel assets (nama mengandung "haji", tipe Tabungan Umum)
	const saving = db
		.prepare(
			`SELECT COALESCE(SUM(current_value),0) AS value
			 FROM assets WHERE lower(name) LIKE '%haji%' OR lower(note) LIKE '%haji%'`
		)
		.get() as { value: number };

	const collected = gold.current_value + saving.value;
	const remaining = Math.max(0, target - collected);
	const pct = target > 0 ? Math.min(100, (collected / target) * 100) : 0;

	return json({
		target,
		gold_grams: gold.grams,
		gold_count: gold.count,
		gold_value: gold.current_value,
		gold_buy_cost: gold.buy_cost,
		saving_value: saving.value,
		collected,
		remaining,
		pct
	});
};

// POST /api/haji — set target haji
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const target = Number(body.target);

	if (!target || target <= 0) {
		return json({ error: 'Target wajib diisi & lebih dari 0' }, { status: 400 });
	}

	const db = getDb();
	const exists = db.prepare(`SELECT 1 FROM settings WHERE key = 'target_haji'`).get();
	if (exists) {
		db.prepare(`UPDATE settings SET value = ? WHERE key = 'target_haji'`).run(String(target));
	} else {
		db.prepare(`INSERT INTO settings(key, value) VALUES ('target_haji', ?)`).run(String(target));
	}

	return json({ ok: true, target });
};
