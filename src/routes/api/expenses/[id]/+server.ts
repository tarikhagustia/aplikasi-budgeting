import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

// PATCH /api/expenses/:id — edit transaksi pengeluaran
export const PATCH: RequestHandler = async ({ params, request }) => {
	const db = getDb();
	const id = Number(params.id);
	const existing = db.prepare('SELECT id FROM expenses WHERE id = ?').get(id);
	if (!existing) return json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });

	const body = await request.json();
	const { date, description, category, account, amount, is_verified } = body;

	const sets: string[] = [];
	const vals: any[] = [];

	if (date !== undefined) { sets.push('date=?'); vals.push(date); }
	if (description !== undefined) { sets.push('description=?'); vals.push(description); }
	if (amount !== undefined) {
		if (!(amount > 0)) return json({ error: 'Jumlah harus lebih dari 0' }, { status: 400 });
		sets.push('amount=?'); vals.push(amount);
	}
	if (category !== undefined) {
		let catId = (db.prepare('SELECT id FROM categories WHERE name = ?').get(category) as { id: number } | undefined)?.id;
		if (!catId) {
			const info = db.prepare('INSERT INTO categories(name, group_id, is_saving) VALUES (?,2,0)').run(category);
			catId = Number(info.lastInsertRowid);
		}
		sets.push('category_id=?'); vals.push(catId);
	}
	if (account !== undefined) {
		const accId = (db.prepare('SELECT id FROM accounts WHERE name = ?').get(account) as { id: number } | undefined)?.id ?? null;
		sets.push('account_id=?'); vals.push(accId);
	}
	if (is_verified !== undefined) { sets.push('is_verified=?'); vals.push(is_verified ? 1 : 0); }

	if (!sets.length) return json({ error: 'Tidak ada field yang diubah' }, { status: 400 });

	vals.push(id);
	db.prepare(`UPDATE expenses SET ${sets.join(', ')} WHERE id=?`).run(...vals);

	const updated = db.prepare(
		`SELECT e.id, e.date, e.description, e.amount, e.is_verified,
		        c.name AS category, COALESCE(a.name,'—') AS account
		 FROM expenses e
		 JOIN categories c ON c.id = e.category_id
		 LEFT JOIN accounts a ON a.id = e.account_id
		 WHERE e.id = ?`
	).get(id);

	return json({ ok: true, item: updated });
};

// DELETE /api/expenses/:id
export const DELETE: RequestHandler = async ({ params }) => {
	const db = getDb();
	db.prepare('DELETE FROM expenses WHERE id = ?').run(Number(params.id));
	return json({ ok: true });
};
