import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

// GET /api/budgets?year=2026&month=8 — budget + realisasi per kategori
export const GET: RequestHandler = async ({ url }) => {
	const year = Number(url.searchParams.get('year') ?? 2026);
	const month = Number(url.searchParams.get('month') ?? 8);
	const monthKey = `${year}-${String(month).padStart(2, '0')}`;
	const db = getDb();

	const rows = db
		.prepare(
			`SELECT c.name AS category, c.is_saving, b.amount AS budget,
			        COALESCE((SELECT SUM(e2.amount) FROM expenses e2
			                  WHERE e2.category_id = b.category_id
			                    AND strftime('%Y-%m', e2.date) = ?),0) AS realisasi
			 FROM budgets b JOIN categories c ON c.id = b.category_id
			 WHERE b.year = ? AND b.month = ?
			 ORDER BY c.is_saving DESC, b.amount DESC`
		)
		.all(monthKey, year, month);

	return json(rows);
};

// POST /api/budgets — replace seluruh budget untuk periode tertentu
// items: { category, amount, is_saving? }
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { year, month, items } = body as {
		year: number;
		month: number;
		items: { category: string; amount: number; is_saving?: number }[];
	};

	if (!year || !month || !Array.isArray(items)) {
		return json({ error: 'Data tidak lengkap' }, { status: 400 });
	}

	const db = getDb();
	const tx = db.transaction(() => {
		db.prepare('DELETE FROM budgets WHERE year = ? AND month = ?').run(year, month);
		const ins = db.prepare('INSERT INTO budgets(year, month, category_id, amount) VALUES (?,?,?,?)');
		for (const item of items) {
			// kategori tanpa nama dilewati; amount 0 tetap disimpan biar tetap tampil di form
			if (!item.category || !String(item.category).trim()) continue;
			const catName = String(item.category).trim();
			let catId = (db.prepare('SELECT id FROM categories WHERE name = ?').get(catName) as { id: number } | undefined)?.id;
			if (!catId) {
				const isSaving = item.is_saving ? 1 : 0;
				// kategori baru: group 1 = Needs (pengeluaran) / 3 = Savings
				const groupId = isSaving ? 3 : 1;
				const info = db
					.prepare('INSERT INTO categories(name, group_id, is_saving) VALUES (?,?,?)')
					.run(catName, groupId, isSaving);
				catId = Number(info.lastInsertRowid);
			} else if (item.is_saving !== undefined) {
				// update flag saving kalau kategori sudah ada tapi beda tipe
				const cur = db
					.prepare('SELECT is_saving FROM categories WHERE id = ?')
					.get(catId) as { is_saving: number } | undefined;
				const want = item.is_saving ? 1 : 0;
				if (cur && cur.is_saving !== want) {
					db.prepare('UPDATE categories SET is_saving = ?, group_id = ? WHERE id = ?').run(
						want,
						want ? 3 : 1,
						catId
					);
				}
			}
			ins.run(year, month, catId, item.amount || 0);
		}
	});
	tx();

	return json({ ok: true });
};
