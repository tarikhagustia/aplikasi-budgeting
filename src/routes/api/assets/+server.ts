import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { getRealtimePrices } from '$lib/server/prices';
import type { RequestHandler } from './$types';

// GET /api/assets — semua aset + ringkasan + target (+ harga realtime utk saham/crypto)
export const GET: RequestHandler = async () => {
	const db = getDb();

	const items = db
		.prepare(
			`SELECT a.id, a.name, a.invested_value, a.current_value, a.liquidity, a.note,
			        at.name AS asset_type, at.id AS asset_type_id
			 FROM assets a JOIN asset_types at ON at.id = a.asset_type_id
			 ORDER BY at.name, a.name`
		)
		.all() as any[];

	// holdings (simbol + jumlah) utk saham/crypto
	const holdings = db
		.prepare(
			`SELECT h.asset_id, h.symbol, h.shares, h.price AS manual_price
			 FROM stock_holdings h`
		)
		.all() as { asset_id: number; symbol: string; shares: number; manual_price: number }[];

	// harga realtime (cache 60 detik) — kalau gagal, fallback ke harga manual
	const symbols = holdings.map((h) => h.symbol);
	const realtime = await getRealtimePrices(symbols);
	const symbolOfAsset = new Map(holdings.map((h) => [h.asset_id, h.symbol]));
	const sharesOfAsset = new Map(holdings.map((h) => [h.asset_id, h.shares]));
	let liveCount = 0;

	const itemsMapped = items.map((a: any) => {
		const symbol = symbolOfAsset.get(a.id);
		const shares = sharesOfAsset.get(a.id);
		if (symbol && shares) {
			const live = realtime[symbol];
			if (live) {
				const liveValue = Math.round(live * shares);
				liveCount++;
				return {
					...a,
					symbol,
					shares,
					live: true,
					live_price: live,
					live_value: liveValue,
					// nilai realtime, tapi simpan current_value manual sebagai referensi
					current_value: liveValue,
					manual_value: a.current_value
				};
			}
			return { ...a, symbol, shares, live: false, live_price: null, live_value: null };
		}
		return a;
	}) as any[];

	// ── Emas: ambil dari gold_holdings (sumber kebenaran) ──
	// kalau belum ada aset bertipe Tabungan Emas di tabel assets, tambahkan agregat dari gold_holdings
	const hasGoldAsset = itemsMapped.some((a) => a.asset_type === 'Tabungan Emas');
	let goldAgg: { grams: number; count: number; buy: number; current: number } | null = null;

	if (!hasGoldAsset) {
		const g = db
			.prepare(
				`SELECT COALESCE(SUM(weight_grams * quantity),0) AS grams,
				        COUNT(*) AS count,
				        COALESCE(SUM(total_buy_cost),0) AS buy,
				        COALESCE(SUM(current_price),0) AS current
				 FROM gold_holdings`
			)
			.get() as { grams: number; count: number; buy: number; current: number };
		if (g.count > 0) {
			goldAgg = g;
			itemsMapped.push({
				id: 'gold',
				name: 'Emas (Koleksi)',
				invested_value: g.buy,
				current_value: g.current,
				manual_value: g.current,
				liquidity: 'Liquid',
				note: `${Math.round(g.grams)} gr · ${g.count} koleksi`,
				asset_type: 'Tabungan Emas',
				asset_type_id: 3,
				symbol: null,
				shares: null,
				live: false,
				gold: true,
				live_price: null,
				live_value: null
			});
		}
	}

	// ringkasan — hitung ulang dengan nilai realtime
	const sum = db
		.prepare(
			`SELECT COALESCE(SUM(invested_value),0) AS total_invested,
			        COALESCE(SUM(current_value),0) AS total_current,
			        COALESCE(SUM(current_value),0) - COALESCE(SUM(invested_value),0) AS total_profit,
			        COALESCE(SUM(CASE WHEN liquidity='Liquid' THEN current_value END),0) AS total_liquid
			 FROM assets`
		)
		.get() as { total_invested: number; total_current: number; total_profit: number; total_liquid: number };

	// tambahkan selisih live vs manual ke total
	let liveAdjust = 0;
	for (const a of itemsMapped as any[]) {
		if (a.live && a.live_value != null && a.manual_value != null) {
			liveAdjust += a.live_value - a.manual_value;
		}
	}
	sum.total_current = (sum.total_current || 0) + liveAdjust;
	sum.total_profit = sum.total_current - (sum.total_invested || 0);

	// tambahkan emas dari gold_holdings ke ringkasan (kalau belum ada di assets)
	if (goldAgg && !hasGoldAsset) {
		sum.total_invested = (sum.total_invested || 0) + goldAgg.buy;
		sum.total_current = (sum.total_current || 0) + goldAgg.current;
		sum.total_liquid = (sum.total_liquid || 0) + goldAgg.current;
		sum.total_profit = sum.total_current - sum.total_invested;
	}

	const targetRow = db.prepare(`SELECT value FROM settings WHERE key = 'target_asset_value'`).get() as
		| { value: string }
		| undefined;
	const target = Number(targetRow?.value || 0);

	const assetTypes = db.prepare('SELECT id, name, liquidity FROM asset_types ORDER BY id').all();

	return json({ items: itemsMapped, assetTypes, summary: sum, target, liveCount });
};

// POST /api/assets — tambah aset
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { name, asset_type_id, invested_value, current_value, liquidity, note, symbol, shares } = body;

	if (!name || !asset_type_id) {
		return json({ error: 'Nama dan tipe aset wajib diisi' }, { status: 400 });
	}

	const db = getDb();
	const info = db
		.prepare(
			`INSERT INTO assets(name, asset_type_id, invested_value, current_value, liquidity, note)
			 VALUES (?,?,?,?,?,?)`
		)
		.run(
			name,
			asset_type_id,
			invested_value || 0,
			current_value ?? invested_value ?? 0,
			liquidity || 'Liquid',
			note || null
		);
	const assetId = Number(info.lastInsertRowid);

	// kalau aset saham/crypto — simpan symbol & jumlah lembar utk harga realtime
	if (symbol && shares && shares > 0) {
		const sym = String(symbol).trim().toUpperCase();
		const price = current_value && shares ? Math.round(Number(current_value) / Number(shares)) : 0;
		db.prepare(
			`INSERT INTO stock_holdings(asset_id, symbol, price, shares, value)
			 VALUES (?,?,?,?,?)`
		).run(assetId, sym, price, shares, Math.round(Number(shares) * price));
	}

	return json({ id: assetId }, { status: 201 });
};
