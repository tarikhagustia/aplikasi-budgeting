import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

// PATCH /api/receivables/[id] — edit piutang (nama, tanggal, jumlah, keterangan, potensi bayar)
export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	const body = await request.json();
	const db = getDb();

	const row = db.prepare('SELECT * FROM receivables WHERE id = ?').get(id) as
		| { amount: number; paid_amount: number }
		| undefined;
	if (!row) return json({ error: 'Piutang tidak ditemukan' }, { status: 404 });

	const fields: string[] = [];
	const values: any[] = [];

	if (body.name !== undefined) {
		fields.push('name = ?');
		values.push(String(body.name).trim());
	}
	if (body.date !== undefined) {
		fields.push('date = ?');
		values.push(body.date);
	}
	if (body.description !== undefined) {
		fields.push('description = ?');
		values.push(body.description === '' ? null : body.description);
	}
	if (body.likely_paid !== undefined) {
		fields.push('likely_paid = ?');
		values.push(body.likely_paid ? 1 : 0);
	}
	if (body.amount !== undefined) {
		const newAmount = Number(body.amount);
		if (isNaN(newAmount) || newAmount <= 0) {
			return json({ error: 'Jumlah tidak valid' }, { status: 400 });
		}
		fields.push('amount = ?');
		values.push(newAmount);
		// recalc remaining & status jika jumlah berubah (paid_amount tetap)
		const newPaid = Math.min(row.paid_amount, newAmount);
		const newRemaining = newAmount - newPaid;
		const newStatus = newRemaining <= 0 ? 'Lunas' : 'Belum Lunas';
		fields.push('paid_amount = ?');
		values.push(newPaid);
		fields.push('remaining = ?');
		values.push(newRemaining);
		fields.push('status = ?');
		values.push(newStatus);
	}

	if (!fields.length) {
		return json({ error: 'Tidak ada field yang diubah' }, { status: 400 });
	}

	values.push(id);
	db.prepare(`UPDATE receivables SET ${fields.join(', ')} WHERE id = ?`).run(...values);

	const updated = db.prepare('SELECT * FROM receivables WHERE id = ?').get(id);
	return json({ ok: true, item: updated });
};

// DELETE /api/receivables/[id]
export const DELETE: RequestHandler = async ({ params }) => {
	const db = getDb();
	db.prepare('DELETE FROM receivables WHERE id = ?').run(Number(params.id));
	return json({ ok: true });
};
