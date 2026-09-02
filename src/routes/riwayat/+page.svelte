<script lang="ts">
	let rows: any[] = $state([]);
	let loading = $state(true);
	let error = $state('');
	let year: number = $state(2026);
	let month: number = $state(8);
	let selected = $state(
		typeof localStorage !== 'undefined' ? (localStorage.getItem('mm_riwayat_month') ?? '') : ''
	);
	let monthsList: { key: string; label: string }[] = $state([]);
	let tab: 'expense' | 'income' = $state(
		typeof localStorage !== 'undefined' ? ((localStorage.getItem('mm_riwayat_tab') as 'expense' | 'income') || 'expense') : 'expense'
	);

	const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

	function fmt(v: number): string {
		return 'Rp ' + Math.round(v || 0).toLocaleString('id-ID');
	}

	function fmtDate(d: string): string {
		const dt = new Date(d + 'T00:00:00');
		return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
	}

	async function load() {
		loading = true;
		error = '';
		try {
			const res = await fetch(`/api/${tab === 'expense' ? 'expenses' : 'incomes'}?year=${year}&month=${month}`);
			if (!res.ok) throw new Error('Gagal load');
			rows = await res.json();
		} catch (e: any) {
			error = e.message || 'Terjadi kesalahan';
		}
		loading = false;
	}

	async function del(id: number) {
		if (!confirm('Hapus transaksi ini?')) return;
		try {
			await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
			rows = rows.filter((r) => r.id !== id);
		} catch (e) { /* */ }
	}

	async function init() {
		try {
			const meta = await (await fetch('/api/meta')).json();
			if (meta.months && meta.months.length > 0) {
				monthsList = meta.months.map((m: any) => ({
					key: `${m.year}-${m.month}`,
					label: `${MONTHS[Number(m.month) - 1]} ${m.year}`
				}));
				const def = meta.defaultMonth || meta.months[0];
				const defKey = `${def.year}-${String(def.month).padStart(2, '0')}`;
				if (!selected || !monthsList.some((m) => m.key === selected)) {
					selected = defKey;
					localStorage?.setItem('mm_riwayat_month', selected);
				}
				year = Number(selected.slice(0, 4));
				month = Number(selected.slice(5, 7));
			}
		} catch (e) { /* */ }
		await load();
	}

	init();

	function changeMonth() {
		year = Number(selected.slice(0, 4));
		month = Number(selected.slice(5, 7));
		localStorage?.setItem('mm_riwayat_month', selected);
		load();
	}

	function changeTab(t: 'expense' | 'income') {
		tab = t;
		localStorage?.setItem('mm_riwayat_tab', t);
		load();
	}
</script>

<div class="hero">
	<h1>🧾 Riwayat</h1>
	<p>Semua transaksi tercatat.</p>
</div>

<div class="page-pad" style="display:flex;gap:8px;margin-bottom:12px">
	<select style="flex:1" bind:value={selected} onchange={changeMonth}>
		{#each monthsList as m (m.key)}
			<option value={m.key} selected={m.key === selected}>{m.label}</option>
		{/each}
	</select>
</div>

<div class="btn-row page-pad" style="margin-bottom:12px">
	<button class="btn" class:secondary={tab !== 'expense'} onclick={() => changeTab('expense')}>🛒 Pengeluaran</button>
	<button class="btn" class:secondary={tab !== 'income'} onclick={() => changeTab('income')}>💼 Pemasukan</button>
</div>

{#if loading}
	<div class="empty" style="padding:40px 16px">Memuat…</div>
{:else if error}
	<div class="empty" style="padding:40px 16px">{error}</div>
{:else if rows.length === 0}
	<div class="empty" style="padding:40px 16px">Tidak ada transaksi bulan ini</div>
{:else}
	<div class="form-card" style="padding:8px 16px">
		{#each rows as r (r.id)}
			<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #f3ede3">
				<div style="flex:1;min-width:0">
					<div style="font-size:0.88rem;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
						{r.description || r.source || r.note || '—'}
					</div>
					<div style="font-size:0.72rem;color:var(--muted)">
						{fmtDate(r.date)} · {tab === 'expense' ? r.category : r.source} · {r.account}
					</div>
				</div>
				<div style="text-align:right;flex-shrink:0">
					<div style="font-weight:600;font-size:0.88rem;color:{tab === 'expense' ? 'var(--red)' : 'var(--green)'}">
						{tab === 'expense' ? '−' : '+'}{fmt(r.amount)}
					</div>
				</div>
				{#if tab === 'expense'}
					<button onclick={() => del(r.id)} style="background:none;border:none;color:var(--muted);font-size:0.9rem;cursor:pointer;flex-shrink:0">🗑</button>
				{/if}
			</div>
		{/each}
	</div>
{/if}
