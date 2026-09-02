import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

// PATCH /api/assets/[id]
export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	const body = await request.json();
	const db = getDb();

	const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as { id: number } | undefined;
	if (!row) return json({ error: 'Aset tidak ditemukan' }, { status: 404 });

	const fields: string[] = [];
	const values: any[] = [];

	if (body.name !== undefined) { fields.push('name = ?'); values.push(String(body.name).trim()); }
	if (body.asset_type_id !== undefined) { fields.push('asset_type_id = ?'); values.push(Number(body.asset_type_id)); }
	if (body.invested_value !== undefined) { fields.push('invested_value = ?'); values.push(Number(body.invested_value) || 0); }
	if (body.current_value !== undefined) { fields.push('current_value = ?'); values.push(Number(body.current_value) || 0); }
	if (body.liquidity !== undefined) { fields.push('liquidity = ?'); values.push(body.liquidity); }
	if (body.note !== undefined) { fields.push('note = ?'); values.push(body.note === '' ? null : body.note); }

	if (!fields.length) return json({ error: 'Tidak ada field yang diubah' }, { status: 400 });

	values.push(id);
	db.prepare(`UPDATE assets SET ${fields.join(', ')} WHERE id = ?`).run(...values);

	// kalau ada symbol/shares — sinkronkan stock_holdings utk harga realtime
	if (body.symbol !== undefined || body.shares !== undefined) {
		const cur = db.prepare('SELECT symbol, shares FROM stock_holdings WHERE asset_id = ?').get(id) as
			| { symbol: string; shares: number }
			| undefined;
		const symbol = body.symbol !== undefined ? String(body.symbol).trim().toUpperCase() : cur?.symbol;
		const shares = body.shares !== undefined ? Number(body.shares) : cur?.shares;

		if (symbol && shares && shares > 0) {
			const currentValue = body.current_value !== undefined
				? Number(body.current_value)
				: Number((db.prepare('SELECT current_value FROM assets WHERE id = ?').get(id) as any)?.current_value || 0);
			const price = currentValue ? Math.round(currentValue / shares) : 0;
			if (cur) {
				db.prepare('UPDATE stock_holdings SET symbol = ?, shares = ?, price = ?, value = ? WHERE asset_id = ?')
					.run(symbol, shares, price, Math.round(shares * price), id);
			} else {
				db.prepare('INSERT INTO stock_holdings(asset_id, symbol, price, shares, value) VALUES (?,?,?,?,?)')
					.run(id, symbol, price, shares, Math.round(shares * price));
			}
		} else if (cur && (!symbol || !shares || shares <= 0)) {
			// symbol/jumlah dihapus — hapus holding
			db.prepare('DELETE FROM stock_holdings WHERE asset_id = ?').run(id);
		}
	}

	const updated = db.prepare('SELECT * FROM assets WHERE id = ?').get(id);
	return json({ ok: true, item: updated });
};

// DELETE /api/assets/[id]
export const DELETE: RequestHandler = async ({ params }) => {
	const db = getDb();
	db.prepare('DELETE FROM assets WHERE id = ?').run(Number(params.id));
	return json({ ok: true });
};
