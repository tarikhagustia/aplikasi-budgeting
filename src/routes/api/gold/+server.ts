import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { getGoldPricePerGramIdr } from '$lib/server/prices';
import type { RequestHandler } from './$types';

// GET /api/gold — semua kepemilikan emas + ringkasan (+ harga realtime per gram)
export const GET: RequestHandler = async () => {
	const db = getDb();
	const items = db.prepare('SELECT * FROM gold_holdings ORDER BY purchase_date DESC, id DESC').all() as any[];

	// harga emas realtime per gram (IDR) — kalau gagal, pakai nilai manual (null)
	const livePerGram = await getGoldPricePerGramIdr();

	// hitung ulang nilai & profit dengan harga realtime (tanpa menimpa DB)
	let totalGrams = 0;
	let totalBuy = 0;
	let totalCurrent = 0;
	let totalProfit = 0;
	let liveCount = 0;

	const mapped = items.map((r) => {
		const grams = (r.weight_grams || 0) * (r.quantity || 1);
		const buyCost = r.total_buy_cost || 0;
		totalGrams += grams;
		totalBuy += buyCost;

		const item: any = {
			...r,
			grams,
			live: false,
			live_price: null,
			live_value: null,
			live_profit: null
		};

		if (livePerGram) {
			const liveValue = Math.round(grams * livePerGram);
			item.live = true;
			item.live_price = Math.round(livePerGram);
			item.live_value = liveValue;
			item.live_profit = liveValue - buyCost;
			totalCurrent += liveValue;
			totalProfit += liveValue - buyCost;
			liveCount++;
		} else {
			totalCurrent += r.current_price || 0;
			totalProfit += r.profit || 0;
		}

		return item;
	});

	const sum = {
		total_grams: totalGrams,
		total_buy: totalBuy,
		total_current: totalCurrent,
		total_profit: totalProfit,
		live: livePerGram != null,
		live_price_per_gram: livePerGram != null ? Math.round(livePerGram) : null
	};

	return json({ items: mapped, summary: sum });
};

// POST /api/gold — tambah kepemilikan emas
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { purchase_date, storage, purchase_place, kind, purpose, weight_grams, quantity, buy_price } = body;

	if (!purchase_date || !weight_grams || !buy_price) {
		return json({ error: 'Tanggal, berat, dan harga beli wajib diisi' }, { status: 400 });
	}

	const qty = quantity || 1;
	const totalBuy = weight_grams * qty * buy_price;
	const db = getDb();

	const info = db
		.prepare(
			`INSERT INTO gold_holdings(purchase_date, storage, purchase_place, kind, purpose,
			   weight_grams, quantity, buy_price, total_buy_cost, current_price, profit)
			 VALUES (?,?,?,?,?,?,?,?,?,?,?)`
		)
		.run(
			purchase_date,
			storage || null,
			purchase_place || null,
			kind || 'Antam',
			purpose || null,
			weight_grams,
			qty,
			buy_price,
			totalBuy,
			null,
			null
		);

	return json({ id: Number(info.lastInsertRowid) }, { status: 201 });
};
