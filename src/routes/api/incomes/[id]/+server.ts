import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

// PATCH /api/incomes/:id — edit transaksi pemasukan
export const PATCH: RequestHandler = async ({ params, request }) => {
	const db = getDb();
	const id = Number(params.id);
	const existing = db.prepare('SELECT id FROM incomes WHERE id = ?').get(id);
	if (!existing) return json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });

	const body = await request.json();
	const { date, source, account, amount, note } = body;

	const sets: string[] = [];
	const vals: any[] = [];

	if (date !== undefined) { sets.push('date=?'); vals.push(date); }
	if (amount !== undefined) {
		if (!(amount > 0)) return json({ error: 'Jumlah harus lebih dari 0' }, { status: 400 });
		sets.push('amount=?'); vals.push(amount);
	}
	if (source !== undefined) {
		let srcId = (db.prepare('SELECT id FROM income_sources WHERE name = ?').get(source) as { id: number } | undefined)?.id;
		if (!srcId) {
			const info = db.prepare('INSERT INTO income_sources(name) VALUES (?)').run(source);
			srcId = Number(info.lastInsertRowid);
		}
		sets.push('source_id=?'); vals.push(srcId);
	}
	if (account !== undefined) {
		const accId = (db.prepare('SELECT id FROM accounts WHERE name = ?').get(account) as { id: number } | undefined)?.id ?? null;
		sets.push('account_id=?'); vals.push(accId);
	}
	if (note !== undefined) { sets.push('note=?'); vals.push(note || null); }

	if (!sets.length) return json({ error: 'Tidak ada field yang diubah' }, { status: 400 });

	vals.push(id);
	db.prepare(`UPDATE incomes SET ${sets.join(', ')} WHERE id=?`).run(...vals);

	const updated = db.prepare(
		`SELECT i.id, i.date, i.amount, i.note, s.name AS source, COALESCE(a.name,'—') AS account
		 FROM incomes i
		 JOIN income_sources s ON s.id = i.source_id
		 LEFT JOIN accounts a ON a.id = i.account_id
		 WHERE i.id = ?`
	).get(id);

	return json({ ok: true, item: updated });
};

// DELETE /api/incomes/:id
export const DELETE: RequestHandler = async ({ params }) => {
	const db = getDb();
	db.prepare('DELETE FROM incomes WHERE id = ?').run(Number(params.id));
	return json({ ok: true });
};
