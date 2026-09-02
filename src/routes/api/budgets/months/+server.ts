import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

// GET /api/budgets/months — daftar periode yang sudah punya budget + default bulan kosong
export const GET: RequestHandler = async () => {
	const db = getDb();
	const rows = db
		.prepare(`SELECT DISTINCT year, month FROM budgets ORDER BY year, month`)
		.all() as { year: number; month: number }[];

	const now = new Date();
	let defYear = now.getFullYear();
	let defMonth = now.getMonth() + 1;
	const filled = new Set(rows.map((r) => `${r.year}-${r.month}`));
	for (let i = 0; i < 36; i++) {
		if (!filled.has(`${defYear}-${defMonth}`)) break;
		defMonth++;
		if (defMonth > 12) { defMonth = 1; defYear++; }
	}

	return json({ periods: rows, default: { year: defYear, month: defMonth } });
};
