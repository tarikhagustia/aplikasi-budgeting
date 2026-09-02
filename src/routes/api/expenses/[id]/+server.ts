import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

// DELETE /api/expenses/:id
export const DELETE: RequestHandler = async ({ params }) => {
	const db = getDb();
	db.prepare('DELETE FROM expenses WHERE id = ?').run(Number(params.id));
	return json({ ok: true });
};
