<script lang="ts">
	const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

	let periods: { year: number; month: number }[] = $state([]);
	let selYear: number = $state(2026);
	let selMonth: number = $state(9);
	let items: { category: string; amount: number; is_saving: number }[] = $state([]);
	let loading = $state(true);
	let saving = $state(false);
	let msg = $state('');
	let msgOk = $state(false);
	let sourceNote = $state('');

	// referensi pemasukan (data asli aja, tanpa fallback)
	let incomeRef: number | null = $state(null);
	let incomeNote = $state('');
	// nilai yang dipakai untuk kalkulasi: income asli bulan itu (0 kalau belum ada)
	let incomeEffective: number | null = $derived(incomeRef ?? null);

	function fmt(v: number): string {
		return 'Rp ' + Math.round(v || 0).toLocaleString('id-ID');
	}

	// masking input rupiah: "1500000" -> "1.500.000"
	function fmtInput(v: number | undefined): string {
		if (v == null || isNaN(v)) return '';
		return Math.round(v).toLocaleString('id-ID');
	}

	// sort sekali: tabungan di atas, sisanya urut jumlah desc
	function sortItems(arr: any[]): any[] {
		return [...arr].sort((a, b) => {
			if ((a.is_saving ? 1 : 0) !== (b.is_saving ? 1 : 0)) return (b.is_saving ? 1 : 0) - (a.is_saving ? 1 : 0);
			return (b.amount || 0) - (a.amount || 0);
		});
	}

	// step tombol +/−: 100rb untuk nilai kecil, 1jt untuk nilai besar
	function stepFor(v: number | undefined): number {
		const n = v || 0;
		if (n >= 10_000_000) return 1_000_000;
		if (n >= 1_000_000) return 500_000;
		return 100_000;
	}

	// total alokasi semua baris (pengeluaran + tabungan)
	let totalAlokasi = $derived(items.reduce((a, i) => a + (i.amount || 0), 0));
	// total alokasi pengeluaran vs tabungan — pakai flag is_saving dari item
	let totalExpenseAlloc = $derived(
		items.filter((i) => !i.is_saving).reduce((a, i) => a + (i.amount || 0), 0)
	);
	let totalSavingAlloc = $derived(
		items.filter((i) => i.is_saving).reduce((a, i) => a + (i.amount || 0), 0)
	);
	// sisa vs pemasukan (pakai income asli atau rata-rata)
	let sisaAlokasi = $derived((incomeEffective ?? 0) - totalAlokasi);

	// display sementara saat mengetik (biar masking gak lompat)
	let displayMap = $state<Record<string, string>>({});

	function getDisplay(item: any): string {
		if (item._key && displayMap[item._key] !== undefined) return displayMap[item._key];
		return fmtInput(item.amount);
	}

	function onAmountInput(item: any, e: Event) {
		const el = e.target as HTMLInputElement;
		const raw = el.value;
		// parse dari teks (abaikan titik & non-digit)
		const digits = raw.replace(/\D/g, '');
		item.amount = digits ? Number(digits) : 0;
		// simpan display terformat; jangan set el.value manual biar kursor stabil
		if (item._key) displayMap[item._key] = fmtInput(item.amount);
	}

	function onAmountBlur(item: any) {
		if (item._key) delete displayMap[item._key];
	}

	function stepAmount(item: any, dir: number) {
		const step = stepFor(item.amount);
		item.amount = Math.max(0, (item.amount || 0) + dir * step);
		if (item._key) delete displayMap[item._key];
	}

	async function loadIncomeRef(y: number, m: number) {
		try {
			const s = await (await fetch(`/api/summary?year=${y}&month=${m}`)).json();
			incomeRef = s.income;
			incomeNote = s.income > 0
				? `Pemasukan ${MONTHS[m - 1]} ${y}`
				: `Belum ada pemasukan tercatat untuk ${MONTHS[m - 1]} ${y}`;
		} catch (e) {
			incomeRef = null;
			incomeNote = 'Gagal memuat pemasukan';
		}
	}

	async function loadPeriods() {
		try {
			const res = await (await fetch('/api/budgets/months')).json();
			periods = res.periods;
			selYear = res.default.year;
			selMonth = res.default.month;
		} catch (e) { /* default */ }
	}

	async function loadBudget(y: number, m: number) {
		loading = true;
		msg = '';
		sourceNote = '';
		try {
			const rows = await (await fetch(`/api/budgets?year=${y}&month=${m}`)).json();
			items = sortItems(rows.map((r: any) => ({
				category: r.category,
				amount: r.budget,
				is_saving: r.is_saving ? 1 : 0,
				_key: `${y}-${m}-${r.category}`,
				is_new: 0
			})));
			displayMap = {};
		} catch (e) {
			msg = 'Gagal memuat budget';
			msgOk = false;
		}
		loading = false;
	}

	async function init() {
		await loadPeriods();
		await Promise.all([loadBudget(selYear, selMonth), loadIncomeRef(selYear, selMonth)]);
	}

	init();

	async function copyPrevMonth() {
		const py = selMonth > 1 ? selYear : selYear - 1;
		const pm = selMonth > 1 ? selMonth - 1 : 12;
		try {
			const rows = await (await fetch(`/api/budgets?year=${py}&month=${pm}`)).json();
			if (rows.length > 0) {
				items = sortItems(rows.map((r: any) => ({
					category: r.category,
					amount: r.budget,
					is_saving: r.is_saving ? 1 : 0,
					_key: `${py}-${pm}-${r.category}`,
					is_new: 0
				})));
				displayMap = {};
				sourceNote = `Disalin dari ${MONTHS[pm - 1]} ${py}`;
			} else {
				msg = `Tidak ada budget ${MONTHS[pm - 1]} ${py}`;
				msgOk = false;
			}
		} catch (e) {
			msg = 'Gagal menyalin';
			msgOk = false;
		}
	}

	async function copyTemplate() {
		if (!periods.length) return;
		let best = periods[0];
		let bestCount = 0;
		for (const p of periods) {
			try {
				const rows = await (await fetch(`/api/budgets?year=${p.year}&month=${p.month}`)).json();
				if (rows.length > bestCount) {
					bestCount = rows.length;
					best = p;
				}
			} catch (e) { /* skip */ }
		}
		const rows = await (await fetch(`/api/budgets?year=${best.year}&month=${best.month}`)).json();
		items = sortItems(rows.map((r: any) => ({
			category: r.category,
			amount: r.budget,
			is_saving: r.is_saving ? 1 : 0,
			_key: `${best.year}-${best.month}-${r.category}`,
			is_new: 0
		})));
		displayMap = {};
		sourceNote = `Template dari ${MONTHS[best.month - 1]} ${best.year}`;
	}

	function addRow() {
		items = [...items, { category: '', amount: 0, is_saving: 0, _key: `new-${Date.now()}`, is_new: 1 }];
		// fokus langsung ke input nama kategori baru setelah render
		requestAnimationFrame(() => {
			document.querySelector<HTMLInputElement>('input[placeholder="Nama kategori baru"]')?.focus();
		});
	}

	async function save() {
		saving = true;
		msg = '';
		try {
			const clean = items
				.filter((i) => i.category.trim())
				.map(({ category, amount, is_saving }) => ({ category: category.trim(), amount: amount || 0, is_saving: is_saving ? 1 : 0 }));
			const res = await fetch('/api/budgets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ year: selYear, month: selMonth, items: clean })
			});
			if (!res.ok) throw new Error('Gagal simpan');
			msg = `✅ Budget ${MONTHS[selMonth - 1]} ${selYear} tersimpan`;
			msgOk = true;
			sourceNote = '';
			// refresh daftar periode TAPI jaga pilihan periode tetap (jangan reset ke default)
			const keepYear = selYear;
			const keepMonth = selMonth;
			await loadPeriods();
			selYear = keepYear;
			selMonth = keepMonth;
		} catch (e) {
			msg = 'Gagal menyimpan budget';
			msgOk = false;
		}
		saving = false;
	}
</script>

<div class="hero">
	<h1>📋 Budget</h1>
	<p>Atur alokasi pengeluaran & tabungan bulanan.</p>
</div>

<div class="form-card">
	<div class="field">
		<label>Periode</label>
		<div style="display:flex;gap:8px">
			<select style="flex:1" bind:value={selYear} onchange={() => { loadBudget(selYear, selMonth); loadIncomeRef(selYear, selMonth); }}>
				{#each Array.from(new Set([...periods.map(p => p.year), selYear])).sort() as y (y)}
					<option value={y}>{y}</option>
				{/each}
			</select>
			<select style="flex:1" bind:value={selMonth} onchange={() => { loadBudget(selYear, selMonth); loadIncomeRef(selYear, selMonth); }}>
				{#each MONTHS as m, i (m)}
					<option value={i + 1} selected={i + 1 === selMonth}>{m}</option>
				{/each}
			</select>
		</div>
	</div>

	<div class="btn-row">
		<button class="btn secondary" onclick={copyPrevMonth}>📋 Salin Bulan Lalu</button>
		<button class="btn secondary" onclick={copyTemplate}>⭐ Muat Template</button>
	</div>
	{#if sourceNote}
		<p style="font-size:0.78rem;color:var(--teal);margin-top:8px">📥 {sourceNote}</p>
	{/if}
</div>

{#if msg}
	<div style="margin:0 16px 12px;padding:12px 14px;border-radius:12px;font-size:0.85rem;
		background:{msgOk ? 'rgba(107,158,110,0.12)' : 'rgba(201,111,93,0.12)'};
		color:{msgOk ? 'var(--green)' : 'var(--red)'}">{msg}</div>
{/if}

<!-- 💰 Referensi pemasukan + kalkulasi realtime -->
<div class="form-card" style="background:#fffdf9">
	<div style="display:flex;justify-content:space-between;align-items:center">
		<span style="font-size:0.85rem;font-weight:600">💰 Pemasukan</span>
		<b style="font-size:1.05rem;color:{incomeRef && incomeRef > 0 ? 'var(--green)' : 'var(--muted)'}">
			{incomeEffective !== null ? fmt(incomeEffective) : '—'}
		</b>
	</div>
	{#if incomeNote}
		<div style="font-size:0.72rem;color:var(--muted);margin-top:2px">{incomeNote}</div>
	{/if}

	<div style="border-top:1px dashed #e2d9cc;margin:10px 0"></div>

	<div style="display:flex;justify-content:space-between;font-size:0.8rem;padding:2px 0">
		<span style="color:var(--muted)">Alokasi pengeluaran</span>
		<b>{fmt(totalExpenseAlloc)}</b>
	</div>
	<div style="display:flex;justify-content:space-between;font-size:0.8rem;padding:2px 0">
		<span style="color:var(--muted)">Alokasi tabungan</span>
		<b style="color:var(--green)">{fmt(totalSavingAlloc)}</b>
	</div>
	<div style="display:flex;justify-content:space-between;font-size:0.8rem;padding:2px 0;font-weight:700">
		<span>Total alokasi</span>
		<b>{fmt(totalAlokasi)}</b>
	</div>
	<div style="border-top:1px dashed #e2d9cc;margin:8px 0"></div>

	{#if incomeEffective !== null}
		<div style="display:flex;justify-content:space-between;align-items:center;font-size:0.9rem">
			<span style="font-weight:600">Sisa setelah alokasi</span>
			<b style="color:{sisaAlokasi >= 0 ? 'var(--green)' : 'var(--red)'}">
				{sisaAlokasi >= 0 ? '+' : '−'}{fmt(Math.abs(sisaAlokasi))}
			</b>
		</div>
		{#if sisaAlokasi < 0}
			<div style="margin-top:8px;padding:10px 12px;border-radius:10px;font-size:0.78rem;
				background:rgba(201,111,93,0.12);color:var(--red)">
				⚠️ Alokasi melebihi pemasukan {fmt(Math.abs(sisaAlokasi))}. Kurangi beberapa pos agar seimbang.
			</div>
		{:else if totalAlokasi > 0}
			<div style="margin-top:8px;padding:10px 12px;border-radius:10px;font-size:0.78rem;
				background:rgba(107,158,110,0.10);color:var(--green)">
				✅ Aman — sisa {fmt(sisaAlokasi)} bisa dialokasikan lagi atau disimpan.
			</div>
		{/if}
	{/if}
</div>

<div class="form-card">
	<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
		<b style="font-size:0.95rem">✏️ Edit Budget</b>
		<span class="pill" style="background:#f3ede3">{fmt(totalAlokasi)}</span>
	</div>

	{#if loading}
		<div class="empty">Memuat…</div>
	{:else if items.length === 0}
		<div class="empty" style="padding:14px 0">
			Belum ada budget untuk periode ini.<br />
			<span style="font-size:0.78rem">Klik <b>📋 Salin Bulan Lalu</b> atau <b>➕ Tambah Kategori</b> di bawah.</span>
		</div>
	{:else}
		{#each items as item, idx (item._key || item.category + idx)}
			<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #f3ede3">
				<div style="flex:1.3;min-width:0">
					{#if !item.is_new}
						<!-- kategori existing: tampilkan SEKALI aja, tanpa label dobel -->
						<div style="font-size:0.9rem;font-weight:600;color:var(--text);
							overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
							{item.category}
							{#if item.is_saving}
								<span style="font-size:0.62rem;background:rgba(107,158,110,0.14);color:var(--green);
									border-radius:999px;padding:2px 7px;margin-left:4px;font-weight:600">tabungan</span>
							{/if}
						</div>
					{:else}
						<input bind:value={item.category} placeholder="Nama kategori baru"
							style="font-size:0.85rem;padding:9px 10px" />
					{/if}
				</div>
				{#if item.is_new}
					<!-- pilihan tipe untuk kategori baru -->
					<div style="flex:0.9">
						<select bind:value={item.is_saving}
							style="font-size:0.78rem;padding:9px 26px 9px 10px">
							<option value={0}>Pengeluaran</option>
							<option value={1}>Tabungan</option>
						</select>
					</div>
				{/if}
				<div style="flex:1.2;display:flex;align-items:center;gap:5px">
					<button type="button" onclick={() => stepAmount(item, -1)}
						aria-label="Kurangi"
						style="flex-shrink:0;width:32px;height:38px;border-radius:9px;border:1px solid #e2d9cc;
							background:#faf6f0;color:var(--text);font-size:1.05rem;font-weight:700;cursor:pointer;
							display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent">−</button>
					<div style="flex:1">
						<input type="text" inputmode="numeric" placeholder="0"
							value={getDisplay(item)}
							oninput={(e) => onAmountInput(item, e)}
							onblur={() => onAmountBlur(item)}
							style="text-align:right;font-weight:600;font-size:0.9rem;padding:9px 10px" />
					</div>
					<button type="button" onclick={() => stepAmount(item, 1)}
						aria-label="Tambah"
						style="flex-shrink:0;width:32px;height:38px;border-radius:9px;border:1px solid #e2d9cc;
							background:#faf6f0;color:var(--text);font-size:1.05rem;font-weight:700;cursor:pointer;
							display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent">+</button>
				</div>
				<button onclick={() => items = items.filter((i) => i !== item)}
					style="background:none;border:none;font-size:1rem;color:var(--red);cursor:pointer;padding:6px">✕</button>
			</div>
		{/each}
	{/if}

	<button class="btn secondary mt-8" onclick={addRow}>➕ Tambah Kategori</button>
	<button class="btn mt-8" onclick={save} disabled={saving}>
		{saving ? 'Menyimpan…' : `💾 Simpan Budget ${MONTHS[selMonth - 1]} ${selYear}`}
	</button>
</div>
