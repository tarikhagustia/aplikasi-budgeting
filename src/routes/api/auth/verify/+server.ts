import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// POST /api/auth/verify — verifikasi PIN (PIN dibaca dari env, tidak pernah dikirim ke client)
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const pin = String(body.pin ?? '').trim();

	const expected = process.env.APP_PIN || '123456';
	const ok = pin === expected;

	// jeda kecil biar brute-force PIN lambat (jangan beri tahu mana yang salah)
	await new Promise((r) => setTimeout(r, ok ? 150 : 600));

	return json({ ok });
};
