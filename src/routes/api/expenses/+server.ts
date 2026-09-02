import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

// GET /api/expenses?year=2026&month=8 — daftar transaksi bulan ini
export const GET: RequestHandler = async ({ url }) => {
	const year = Number(url.searchParams.get('year') ?? 2026);
	const month = Number(url.searchParams.get('month') ?? 8);
	const monthKey = `${year}-${String(month).padStart(2, '0')}`;
	const db = getDb();

	const rows = db
		.prepare(
			`SELECT e.id, e.date, e.description, e.amount, e.is_verified,
			        c.name AS category, COALESCE(a.name,'—') AS account
			 FROM expenses e
			 JOIN categories c ON c.id = e.category_id
			 LEFT JOIN accounts a ON a.id = e.account_id
			 WHERE strftime('%Y-%m', e.date) = ?
			 ORDER BY e.date DESC, e.id DESC`
		)
		.all(monthKey);

	return json(rows);
};

// POST /api/expenses — tambah transaksi baru
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { date, description, category, account, amount, is_verified } = body;

	if (!date || !description || !category || !amount || amount <= 0) {
		return json({ error: 'Data tidak lengkap' }, { status: 400 });
	}

	const db = getDb();
	// cari atau buat kategori
	let catId = (db.prepare('SELECT id FROM categories WHERE name = ?').get(category) as { id: number } | undefined)?.id;
	if (!catId) {
		const info = db.prepare('INSERT INTO categories(name, group_id, is_saving) VALUES (?,2,0)').run(category);
		catId = Number(info.lastInsertRowid);
	}
	// akun
	const accId = (db.prepare('SELECT id FROM accounts WHERE name = ?').get(account || 'BCA') as { id: number } | undefined)?.id ?? null;

	const info = db
		.prepare(
			`INSERT INTO expenses(date, description, category_id, account_id, amount, is_verified)
			 VALUES (?,?,?,?,?,?)`
		)
		.run(date, description, catId, accId, amount, is_verified ? 1 : 0);

	return json({ id: Number(info.lastInsertRowid) }, { status: 201 });
};
