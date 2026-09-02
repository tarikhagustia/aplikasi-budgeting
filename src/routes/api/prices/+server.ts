import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { getRealtimePrices } from '$lib/server/prices';
import type { RequestHandler } from './$types';

// GET /api/prices?symbols=BTCIDR,AMRT,BBCA — harga realtime (cache 60 detik)
// Tanpa param: ambil semua simbol dari stock_holdings
export const GET: RequestHandler = async ({ url }) => {
	const db = getDb();
	let symbols: string[];

	const q = url.searchParams.get('symbols');
	if (q) {
		symbols = q.split(',').map((s) => s.trim()).filter(Boolean);
	} else {
		symbols = (db.prepare('SELECT symbol FROM stock_holdings').all() as { symbol: string }[]).map((r) => r.symbol);
	}

	const prices = await getRealtimePrices(symbols);
	return json({ prices, ts: Date.now() });
};
