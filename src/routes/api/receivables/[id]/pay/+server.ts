import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

// POST /api/receivables/[id]/pay — catat pembayaran / pelunasan
export const POST: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	const body = await request.json();
	const { amount } = body as { amount?: number };

	if (!amount || amount <= 0) {
		return json({ error: 'Jumlah pembayaran wajib diisi' }, { status: 400 });
	}

	const db = getDb();
	const row = db.prepare('SELECT * FROM receivables WHERE id = ?').get(id) as
		| { amount: number; paid_amount: number; remaining: number }
		| undefined;

	if (!row) return json({ error: 'Piutang tidak ditemukan' }, { status: 404 });

	const newPaid = Math.min(row.paid_amount + amount, row.amount);
	const newRemaining = row.amount - newPaid;
	const status = newRemaining <= 0 ? 'Lunas' : 'Belum Lunas';
	const today = new Date().toISOString().slice(0, 10);

	db.prepare(
		`UPDATE receivables SET paid_amount = ?, remaining = ?, status = ?, paid_date = ? WHERE id = ?`
	).run(newPaid, newRemaining, status, status === 'Lunas' ? today : row.paid_date ?? null, id);

	return json({ ok: true, remaining: newRemaining, status });
};

// DELETE /api/receivables/[id]
export const DELETE: RequestHandler = async ({ params }) => {
	const db = getDb();
	db.prepare('DELETE FROM receivables WHERE id = ?').run(Number(params.id));
	return json({ ok: true });
};
