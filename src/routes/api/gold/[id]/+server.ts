import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

// PATCH /api/gold/[id] — edit kepemilikan emas
export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	const body = await request.json();
	const db = getDb();

	const row = db.prepare('SELECT * FROM gold_holdings WHERE id = ?').get(id) as
		| { weight_grams: number; quantity: number; buy_price: number }
		| undefined;
	if (!row) return json({ error: 'Data emas tidak ditemukan' }, { status: 404 });

	const weight = body.weight_grams !== undefined ? Number(body.weight_grams) : row.weight_grams;
	const qty = body.quantity !== undefined ? Number(body.quantity) : row.quantity;
	const buyPrice = body.buy_price !== undefined ? Number(body.buy_price) : row.buy_price;

	if (weight <= 0 || buyPrice <= 0) {
		return json({ error: 'Berat dan harga beli tidak valid' }, { status: 400 });
	}
	const totalBuy = weight * qty * buyPrice;

	const fields: string[] = ['weight_grams = ?', 'quantity = ?', 'buy_price = ?', 'total_buy_cost = ?'];
	const values: any[] = [weight, qty, buyPrice, totalBuy];

	if (body.purchase_date !== undefined) { fields.push('purchase_date = ?'); values.push(body.purchase_date); }
	if (body.storage !== undefined) { fields.push('storage = ?'); values.push(body.storage === '' ? null : body.storage); }
	if (body.purchase_place !== undefined) { fields.push('purchase_place = ?'); values.push(body.purchase_place === '' ? null : body.purchase_place); }
	if (body.kind !== undefined) { fields.push('kind = ?'); values.push(body.kind); }
	if (body.purpose !== undefined) { fields.push('purpose = ?'); values.push(body.purpose === '' ? null : body.purpose); }
	if (body.current_price !== undefined) {
		fields.push('current_price = ?');
		const cp = Number(body.current_price);
		values.push(cp > 0 ? cp : null);
		if (cp > 0) {
			fields.push('profit = ?');
			values.push(cp - totalBuy);
		}
	}

	values.push(id);
	db.prepare(`UPDATE gold_holdings SET ${fields.join(', ')} WHERE id = ?`).run(...values);

	const updated = db.prepare('SELECT * FROM gold_holdings WHERE id = ?').get(id);
	return json({ ok: true, item: updated });
};

// DELETE /api/gold/[id]
export const DELETE: RequestHandler = async ({ params }) => {
	const db = getDb();
	db.prepare('DELETE FROM gold_holdings WHERE id = ?').run(Number(params.id));
	return json({ ok: true });
};
