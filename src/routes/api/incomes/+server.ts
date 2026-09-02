import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

// GET /api/incomes?year=2026&month=8
export const GET: RequestHandler = async ({ url }) => {
	const year = Number(url.searchParams.get('year') ?? 2026);
	const month = Number(url.searchParams.get('month') ?? 8);
	const monthKey = `${year}-${String(month).padStart(2, '0')}`;
	const db = getDb();

	const rows = db
		.prepare(
			`SELECT i.id, i.date, i.amount, i.note, s.name AS source, COALESCE(a.name,'—') AS account
			 FROM incomes i
			 JOIN income_sources s ON s.id = i.source_id
			 LEFT JOIN accounts a ON a.id = i.account_id
			 WHERE strftime('%Y-%m', i.date) = ?
			 ORDER BY i.date DESC, i.id DESC`
		)
		.all(monthKey);

	return json(rows);
};

// POST /api/incomes
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { date, source, account, amount, note } = body;

	if (!date || !source || !amount || amount <= 0) {
		return json({ error: 'Data tidak lengkap' }, { status: 400 });
	}

	const db = getDb();
	let srcId = (db.prepare('SELECT id FROM income_sources WHERE name = ?').get(source) as { id: number } | undefined)?.id;
	if (!srcId) {
		const info = db.prepare('INSERT INTO income_sources(name) VALUES (?)').run(source);
		srcId = Number(info.lastInsertRowid);
	}
	const accId = (db.prepare('SELECT id FROM accounts WHERE name = ?').get(account || 'BCA') as { id: number } | undefined)?.id ?? null;

	const info = db
		.prepare(`INSERT INTO incomes(date, source_id, account_id, amount, note) VALUES (?,?,?,?,?)`)
		.run(date, srcId, accId, amount, note || null);

	return json({ id: Number(info.lastInsertRowid) }, { status: 201 });
};
