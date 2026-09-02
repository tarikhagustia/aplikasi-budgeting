// Realtime price fetcher: CoinGecko (crypto) + Yahoo Finance (saham IDX)
// Cache per-simbol 60 detik — hanya fetch simbol yang belum di-cache.

interface CacheEntry {
	ts: number;
	price: number | null;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 60_000; // 60 detik

async function fetchJson(url: string, timeoutMs = 8000): Promise<any> {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetch(url, {
			signal: ctrl.signal,
			headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return await res.json();
	} finally {
		clearTimeout(t);
	}
}

// Harga BTC dalam IDR via CoinGecko
async function fetchCryptoIdr(coinId: string): Promise<number | null> {
	try {
		const data = await fetchJson(
			`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=idr`
		);
		return data?.[coinId]?.idr ?? null;
	} catch {
		return null;
	}
}

// Harga saham IDX via Yahoo Finance (BBCA.JK, AMRT.JK, dst)
async function fetchStockIdr(symbol: string): Promise<number | null> {
	try {
		const data = await fetchJson(
			`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.JK?interval=1d&range=1d`
		);
		const result = data?.chart?.result?.[0];
		if (!result) return null;
		const meta = result.meta;
		const close = meta?.regularMarketPrice ?? meta?.chartPreviousClose;
		return close ? Number(close) : null;
	} catch {
		return null;
	}
}

// Mapping simbol -> sumber harga
// - berakhiran IDR (BTCIDR, ETHIDR, SOLIDR) = crypto → CoinGecko (bitcoin, ethereum, solana)
// - selain itu = saham IDX → Yahoo Finance (SYMBOL.JK)
const CRYPTO_MAP: Record<string, string> = {
	BTCIDR: 'bitcoin',
	ETHIDR: 'ethereum',
	SOLIDR: 'solana',
	BNBIDR: 'binancecoin',
	XRPIDR: 'ripple',
	DOGEIDR: 'dogecoin',
	ADAIDR: 'cardano',
	AVAXIDR: 'avalanche-2',
	TONIDR: 'the-open-network'
};

export async function getRealtimePrice(symbol: string): Promise<number | null> {
	const cached = cache.get(symbol);
	if (cached && Date.now() - cached.ts < CACHE_TTL) {
		return cached.price;
	}

	let price: number | null = null;
	const upper = symbol.toUpperCase();

	if (CRYPTO_MAP[upper]) {
		price = await fetchCryptoIdr(CRYPTO_MAP[upper]);
	} else {
		price = await fetchStockIdr(upper);
	}

	cache.set(upper, { ts: Date.now(), price });
	return price;
}

export async function getRealtimePrices(symbols: string[]): Promise<Record<string, number>> {
	const uniq = [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))];
	const results = await Promise.all(uniq.map(async (s) => [s, await getRealtimePrice(s)] as const));

	const out: Record<string, number> = {};
	for (const [s, p] of results) {
		if (p != null) out[s] = p;
	}
	return out;
}

// ── Harga emas (per gram, IDR) ──
// Sumber: gold-api.com (XAU/USD per troy ounce) × kurs USD/IDR (Yahoo)
// + spread premium harga Antam vs harga dunia (~5.3%)
let goldCache: { ts: number; price: number } | null = null;

// Spread premium Antam: harga butik Antam lebih tinggi dari harga emas dunia.
// Diukur 2026-08-30: Antam Rp 2.670.000 vs dunia Rp 2.535.425 → 1.0531
// Sesuaikan angka ini kalau selisihnya berubah signifikan.
const ANTM_SPREAD = 1.0531;

async function fetchXauUsd(): Promise<number | null> {
	try {
		const data = await fetchJson('https://api.gold-api.com/price/XAU');
		return data?.price ? Number(data.price) : null;
	} catch {
		return null;
	}
}

async function fetchUsdIdr(): Promise<number | null> {
	try {
		const data = await fetchJson(
			'https://query1.finance.yahoo.com/v8/finance/chart/USDIDR%3DX?interval=1d&range=1d'
		);
		return data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
	} catch {
		return null;
	}
}

// Harga emas per gram dalam IDR (troy ounce = 31.1034768 gram)
export async function getGoldPricePerGramIdr(): Promise<number | null> {
	if (goldCache && Date.now() - goldCache.ts < CACHE_TTL) {
		return goldCache.price;
	}

	const [xauUsd, usdIdr] = await Promise.all([fetchXauUsd(), fetchUsdIdr()]);
	if (!xauUsd || !usdIdr) return null;

	// harga dunia per gram + spread premium Antam
	const perGram = ((xauUsd / 31.1034768) * usdIdr) * ANTM_SPREAD;
	goldCache = { ts: Date.now(), price: perGram };
	return perGram;
}
