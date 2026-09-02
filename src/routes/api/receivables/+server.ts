import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

// GET /api/receivables — semua piutang, lunas & belum
export const GET: RequestHandler = async ({ url }) => {
	const status = url.searchParams.get('status') ?? ''; // '' | Belum Lunas | Lunas
	const db = getDb();

	let rows;
	if (status) {
		rows = db
			.prepare('SELECT * FROM receivables WHERE status = ? ORDER BY date DESC, id DESC')
			.all(status);
	} else {
		rows = db.prepare('SELECT * FROM receivables ORDER BY date DESC, id DESC').all();
	}

	// ringkasan
	const sum = db
		.prepare(
			`SELECT COALESCE(SUM(amount),0) AS total_amount,
			        COALESCE(SUM(paid_amount),0) AS total_paid,
			        COALESCE(SUM(remaining),0) AS total_remaining,
			        COALESCE(SUM(CASE WHEN likely_paid=1 AND status='Belum Lunas' THEN remaining ELSE 0 END),0) AS likely_collectible
			 FROM receivables`
		)
		.get();

	return json({ items: rows, summary: sum });
};

// POST /api/receivables — tambah piutang baru
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { date, name, amount, description, likely_paid } = body;

	if (!date || !name || !amount || amount <= 0) {
		return json({ error: 'Tanggal, nama, dan jumlah wajib diisi' }, { status: 400 });
	}

	const db = getDb();
	const info = db
		.prepare(
			`INSERT INTO receivables(date, name, amount, paid_amount, remaining, description, status, likely_paid)
			 VALUES (?,?,?,0,?,?, 'Belum Lunas', ?)`
		)
		.run(date, name, amount, amount, description || null, likely_paid ? 1 : 0);

	return json({ id: Number(info.lastInsertRowid) }, { status: 201 });
};
