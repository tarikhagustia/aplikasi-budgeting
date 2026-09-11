import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

// Path database: default di dalam project, bisa dioverride via env MONEY_DB_PATH
const DB_PATH = process.env.MONEY_DB_PATH || path.resolve(process.cwd(), 'money_management.db');
const SCHEMA_PATH = path.resolve(process.cwd(), 'schema.sql');

let db: Database.Database | null = null;

function initDbIfNeeded() {
	// kalau DB belum ada (fresh clone / pertama kali jalan), buat dari schema.sql
	if (!fs.existsSync(DB_PATH)) {
		console.log(`[db] Database tidak ditemukan di ${DB_PATH} — membuat dari schema.sql...`);
		const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
		const fresh = new Database(DB_PATH);
		fresh.exec(schema);
		fresh.close();
		console.log('[db] Database kosong berhasil dibuat (schema + seed master data).');
	}
}

export function getDb(): Database.Database {
	if (!db) {
		initDbIfNeeded();
		db = new Database(DB_PATH);
		db.pragma('journal_mode = WAL');
		db.pragma('synchronous = NORMAL');
		db.pragma('busy_timeout = 5000'); // tunggu s.d. 5 detik kalau DB dikunci proses lain (web + mcp akses bersamaan)
		db.pragma('foreign_keys = ON');
	}
	return db;
}

export function fmtRp(v: number): string {
	return 'Rp ' + v.toLocaleString('id-ID', { maximumFractionDigits: 0 });
}
