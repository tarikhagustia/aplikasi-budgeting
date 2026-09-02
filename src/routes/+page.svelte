<script lang="ts">
	let data: any = $state(null);
	let error: string = $state('');
	let year: number = $state(2026);
	let month: number = $state(8);
	// filter bulan persist — ganti tab tidak reset
	let selected: string = $state(
		typeof localStorage !== 'undefined' ? (localStorage.getItem('mm_home_month') ?? '') : ''
	);
	let monthsList: { key: string; label: string }[] = $state([]);

	const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

	function fmt(v: number): string {
		if (v == null || isNaN(v)) return 'Rp 0';
		return 'Rp ' + Math.round(v).toLocaleString('id-ID');
	}

	function fmtShort(v: number): string {
		if (v == null || isNaN(v)) return '0';
		if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1).replace('.', ',') + ' jt';
		if (Math.abs(v) >= 1_000) return Math.round(v / 1_000) + ' rb';
		return String(Math.round(v));
	}

	async function load() {
		error = '';
		try {
			const res = await fetch(`/api/summary?year=${year}&month=${month}`);
			if (!res.ok) throw new Error('Gagal load data');
			data = await res.json();
		} catch (e: any) {
			error = e.message || 'Terjadi kesalahan';
		}
	}

	async function init() {
		// ambil daftar bulan + bulan terakhir yang punya data dari meta
		try {
			const meta = await (await fetch('/api/meta')).json();
			if (meta.months && meta.months.length > 0) {
				monthsList = meta.months.map((m: any) => ({
					key: `${m.year}-${m.month}`,
					label: `${MONTHS[Number(m.month) - 1]} ${m.year}`
				}));
				// pakai bulan tersimpan kalau masih ada di daftar, else default bulan terakhir
				const def = meta.defaultMonth || meta.months[0];
				const defKey = `${def.year}-${String(def.month).padStart(2, '0')}`;
				if (!selected || !monthsList.some((m) => m.key === selected)) {
					selected = defKey;
					localStorage?.setItem('mm_home_month', selected);
				}
				year = Number(selected.slice(0, 4));
				month = Number(selected.slice(5, 7));
			}
		} catch (e) { /* pakai default */ }
		await load();
	}

	init();

	function changeMonth() {
		year = Number(selected.slice(0, 4));
		month = Number(selected.slice(5, 7));
		localStorage?.setItem('mm_home_month', selected);
		load();
	}

	let donutParts: any[] = $derived(data ? data.byCategory.slice(0, 6) : []);
	let donutTotal: number = $derived(data ? data.byCategory.reduce((a: number, c: any) => a + c.amount, 0) : 0);

	let gradient: string = $derived((() => {
		if (!data) return '';
		const parts = donutParts;
		const total = donutTotal || 1;
		const colors = ['#c07a4a', '#e0966a', '#6b9e6e', '#d4a940', '#8b7fb0', '#5f8f8e', '#b8b0a8'];
		let acc = 0;
		const stops = parts.map((p: any, i: number) => {
			const from = (acc / total) * 360;
			acc += p.amount;
			const to = (acc / total) * 360;
			return `${colors[i % colors.length]} ${from}deg ${to}deg`;
		});
		return `conic-gradient(${stops.join(', ')})`;
	})());

	function budColor(pct: number): string {
		if (pct <= 80) return 'var(--green)';
		if (pct <= 100) return 'var(--gold)';
		return 'var(--red)';
	}
</script>

{#if error}
	<div class="empty" style="padding:40px 16px">
		<div style="font-size:2rem;margin-bottom:8px">😕</div>
		{error}<br /><br />
		<button class="btn secondary" onclick={load} style="max-width:200px;margin:0 auto">Coba lagi</button>
	</div>
{:else if !data}
	<div class="empty" style="padding:60px 16px">Memuat data…</div>
{:else}
	<div class="hero">
		<h1>🌿 Money Management</h1>
		<p>Keuangan pribadi, satu pandangan.</p>
		<span class="date-badge">📅 {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
	</div>

	<div class="page-pad" style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
		<select style="flex:1" bind:value={selected} onchange={changeMonth}>
			{#each monthsList as m (m.key)}
				<option value={m.key} selected={m.key === selected}>{m.label}</option>
			{/each}
		</select>
	</div>

	<div class="kpi-grid">
		<div class="kpi-card">
			<div class="label">💼 Pemasukan</div>
			<div class="value pos">{fmt(data.income)}</div>
			<div class="sub">bulan ini</div>
		</div>
		<div class="kpi-card">
			<div class="label">🛒 Pengeluaran</div>
			<div class="value neg">{fmt(data.expense)}</div>
			<div class="sub">bulan ini</div>
		</div>
		<div class="kpi-card">
			<div class="label">💰 Sisa Saldo</div>
			<div class="value {data.balance >= 0 ? 'pos' : 'neg'}">{fmt(data.balance)}</div>
			<div class="sub">income − expense − tabungan</div>
		</div>
		<div class="kpi-card">
			<div class="label">🏦 Total Aset</div>
			<div class="value">{fmt(data.totalAssets)}</div>
			<div class="sub">portofolio</div>
		</div>
	</div>

	{#if data.savings > 0}
		<div style="margin:10px 16px 0;padding:10px 14px;border-radius:12px;
			background:rgba(107,158,110,0.10);font-size:0.8rem;color:var(--text);
			display:flex;justify-content:space-between;align-items:center">
			<span>🏦 Alokasi tabungan bulan ini</span>
			<b style="color:var(--green)">{fmt(data.savings)}</b>
		</div>
	{/if}

	<div class="section">
		<div class="section-title">📈 Tren 12 Bulan</div>
		<div class="section-sub">Pemasukan vs pengeluaran</div>
	</div>
	<div class="chart-card">
		{#if data.trend && data.trend.length}
			{@const trend12 = data.trend.slice(-12)}
			{@const maxV = Math.max(1, ...trend12.map((t: any) => Math.max(t.income || 0, t.expense || 0)))}
			<div style="display:flex;align-items:flex-end;gap:6px;height:150px;padding:6px 0 0">
				{#each trend12 as t, i (t.month)}
					<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end">
						<div style="display:flex;gap:2px;align-items:flex-end;width:100%;height:100%">
							<div style="flex:1;border-radius:4px 4px 0 0;background:var(--green);
								height:{Math.max(2, ((t.income || 0) / maxV) * 100)}%;min-width:4px"
								title="Pemasukan {fmt(t.income || 0)}"></div>
							<div style="flex:1;border-radius:4px 4px 0 0;background:var(--accent);
								height:{Math.max(2, ((t.expense || 0) / maxV) * 100)}%;min-width:4px"
								title="Pengeluaran {fmt(t.expense || 0)}"></div>
						</div>
						<span style="font-size:0.58rem;color:var(--muted);white-space:nowrap">
							{t.month.slice(5) === '01' ? t.month.slice(2, 4) : ''}{['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][Number(t.month.slice(5)) - 1]}
						</span>
					</div>
				{/each}
			</div>
			<div style="display:flex;justify-content:center;gap:14px;margin-top:10px;font-size:0.7rem;color:var(--muted)">
				<span style="display:flex;align-items:center;gap:5px"><span style="width:9px;height:9px;border-radius:2px;background:var(--green);display:inline-block"></span>Pemasukan</span>
				<span style="display:flex;align-items:center;gap:5px"><span style="width:9px;height:9px;border-radius:2px;background:var(--accent);display:inline-block"></span>Pengeluaran</span>
			</div>
		{:else}
			<div class="empty">Belum ada data tren</div>
		{/if}
	</div>

	<div class="section">
		<div class="section-title">🍩 Pengeluaran per Kategori</div>
		<div class="section-sub">Komposisi {MONTHS[month-1]} {year}</div>
	</div>
	<div class="chart-card">
		{#if donutParts.length}
			<div class="donut-wrap">
				<div class="donut" style="background:{gradient}">
					<div class="donut-center">
						<b>{fmtShort(donutTotal)}</b>
						total
					</div>
				</div>
				<div class="donut-legend">
					{#each donutParts as p, i (p.category)}
						<div class="legend-row">
							<span class="legend-dot" style="background:{['#c07a4a','#e0966a','#6b9e6e','#d4a940','#8b7fb0','#5f8f8e'][i]}"></span>
							<span class="lbl">{p.category}</span>
							<span class="amt">{fmtShort(p.amount)}</span>
							<span class="pct">{((p.amount / (donutTotal || 1)) * 100).toFixed(0)}%</span>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<div class="empty">Belum ada pengeluaran bulan ini 🎉</div>
		{/if}
	</div>

	<div class="section">
		<div class="section-title">📊 Budget vs Realisasi</div>
		<div class="section-sub">Hijau = aman · Kuning = dekat limit · Merah = jebol</div>
	</div>
	<div class="chart-card">
		{#if data.budgetReal && data.budgetReal.length}
			{#each data.budgetReal as b (b.category)}
				{@const pct = b.budget > 0 ? (b.realisasi / b.budget) * 100 : 0}
				<div class="bud-row">
					<div class="bud-head">
						<span class="name">{b.category}</span>
						<span class="val" style="color:{pct > 100 ? 'var(--red)' : 'var(--text)'}">
							{fmtShort(b.realisasi)} / {fmtShort(b.budget)}
						</span>
					</div>
					<div class="bud-bar">
						<div class="bud-fill" style="width:{Math.min(pct, 100)}%;background:{budColor(pct)}"></div>
					</div>
				</div>
			{/each}
		{:else}
			<div class="empty">Belum ada budget bulan ini — atur di menu Budget 📋</div>
		{/if}
	</div>

	<div class="section">
		<div class="section-title">🔥 Transaksi Terbesar</div>
		<div class="section-sub">Pengeluaran bulan ini</div>
	</div>
	<div class="chart-card mini-list">
		{#if data.topExpenses && data.topExpenses.length}
			{#each data.topExpenses as t (t.description + t.amount)}
				<div class="row">
					<span class="desc">{t.description}</span>
					<span class="amt">{fmt(t.amount)}</span>
				</div>
			{/each}
		{:else}
			<div class="empty">Belum ada transaksi</div>
		{/if}
	</div>

	<div class="section">
		<div class="section-title">📌 Piutang Belum Lunas</div>
		<div class="section-sub">Tagihan yang masih harus ditagih</div>
	</div>
	<div class="chart-card mini-list">
		{#if data.receivables && data.receivables.length}
			{#each data.receivables.slice(0, 5) as r (r.name)}
				<div class="row">
					<span class="desc">
						{r.name}
						{#if r.count > 1}
							<span class="pill" style="background:#f3ede3;font-size:0.6rem;padding:1px 6px;margin-left:4px">{r.count} pinjaman</span>
						{/if}
						{#if r.likely_paid}
							<span class="pill" style="background:rgba(107,158,110,0.14);color:var(--green);font-size:0.6rem;padding:1px 6px;margin-left:4px">potensi cair</span>
						{/if}
					</span>
					<span class="amt" style="color:var(--accent)">{fmt(r.remaining)}</span>
				</div>
			{/each}
			<div class="row" style="border-top:1px dashed #e2d9cc;margin-top:6px;padding-top:8px">
				<span class="desc" style="font-weight:600">Total sisa tagihan</span>
				<span class="amt" style="font-weight:700">{fmt(data.receivablesTotal ?? data.receivables.reduce((a: number, r: any) => a + r.remaining, 0))}</span>
			</div>
		{:else}
			<div class="row"><span class="desc">🎉 Semua piutang lunas</span></div>
		{/if}
	</div>

	<div class="section">
		<div class="section-title">🥇 Emas</div>
		<div class="section-sub">Koleksi {Math.round(data.gold?.grams || 0)} gram</div>
	</div>
	<div class="chart-card mini-list">
		{#if data.gold}
			{@const profit = (data.gold.current_value || 0) - (data.gold.buy_cost || 0)}
			<div class="row">
				<span class="desc">💎 Nilai emas</span>
				<span class="amt">{fmt(data.gold.current_value || 0)}</span>
			</div>
			<div class="row">
				<span class="desc">🛒 Total beli</span>
				<span class="amt">{fmt(data.gold.buy_cost || 0)}</span>
			</div>
			<div class="row">
				<span class="desc">📈 Profit/Loss</span>
				<span class="amt" style="color:{profit >= 0 ? 'var(--green)' : 'var(--red)'}">
					{profit >= 0 ? '▲' : '▼'} {fmt(Math.abs(profit))}
				</span>
			</div>
		{:else}
			<div class="row"><span class="desc">Belum ada koleksi emas</span></div>
		{/if}
	</div>

	<div style="text-align:center;color:var(--muted);font-size:0.72rem;padding:18px 16px 8px">
		🌿 Money Management · data tersimpan lokal
	</div>
{/if}
