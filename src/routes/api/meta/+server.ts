import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

// GET /api/meta — daftar kategori, sumber income, akun, dan bulan yang tersedia
export const GET: RequestHandler = async () => {
	const db = getDb();
	const categories = db
		.prepare(`SELECT c.id, c.name, c.group_id, g.name AS grp, c.is_saving
		          FROM categories c LEFT JOIN category_groups g ON g.id = c.group_id
		          ORDER BY c.name`)
		.all();
	const sources = db.prepare(`SELECT id, name FROM income_sources ORDER BY id`).all();
	const accounts = db.prepare(`SELECT id, name FROM accounts WHERE is_active = 1 ORDER BY id`).all();
	const months = db
		.prepare(`SELECT DISTINCT strftime('%Y', date) AS year, strftime('%m', date) AS month
		          FROM expenses UNION SELECT DISTINCT strftime('%Y', date), strftime('%m', date) FROM incomes
		          ORDER BY year DESC, month DESC`)
		.all() as { year: string; month: string }[];
	// default: bulan terakhir yang punya transaksi expense riil (bukan cuma income)
	const lastExp = db
		.prepare(`SELECT strftime('%Y', date) AS year, strftime('%m', date) AS month
		          FROM expenses ORDER BY date DESC LIMIT 1`)
		.get() as { year: string; month: string } | undefined;

	return json({ categories, sources, accounts, months, defaultMonth: lastExp });
};
