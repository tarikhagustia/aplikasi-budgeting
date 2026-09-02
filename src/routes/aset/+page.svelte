<script lang="ts">
	let items: any[] = $state([]);
	let assetTypes: any[] = $state([]);
	let summary = $state({ total_invested: 0, total_current: 0, total_profit: 0, total_liquid: 0 });
	let target = $state(0);
	let liveCount = $state(0);
	let loading = $state(true);
	let msg = $state('');
	let msgOk = $state(false);
	let showAdd = $state(false);
	let editId: number | null = $state(null);

	// form tambah
	let newName = $state('');
	let newType = $state<number | undefined>(undefined);
	let newInvested = $state<number | undefined>(undefined);
	let newCurrent = $state<number | undefined>(undefined);
	let newLiquidity = $state('Liquid');
	let newNote = $state('');
	let newSymbol = $state('');
	let newShares = $state<number | undefined>(undefined);

	// form edit
	let editName = $state('');
	let editType = $state<number | undefined>(undefined);
	let editInvested = $state<number | undefined>(undefined);
	let editCurrent = $state<number | undefined>(undefined);
	let editLiquidity = $state('Liquid');
	let editNote = $state('');
	let editSymbol = $state('');
	let editShares = $state<number | undefined>(undefined);

	// tipe aset yang support harga realtime (id Saham=5, Crypto=8)
	const MARKET_TYPES = new Set([5, 8]);

	function isMarketType(t: number | undefined): boolean {
		return t != null && MARKET_TYPES.has(Number(t));
	}

	function fmt(v: number): string {
		return 'Rp ' + Math.round(v || 0).toLocaleString('id-ID');
	}

	function fmtShort(v: number): string {
		if (v == null || isNaN(v)) return '0';
		if (Math.abs(v) >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2).replace('.', ',') + ' M';
		if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1).replace('.', ',') + ' jt';
		if (Math.abs(v) >= 1_000) return Math.round(v / 1_000) + ' rb';
		return String(Math.round(v));
	}

	// grouping derived
	let grouped = $derived.by(() => {
		const map = new Map<string, any[]>();
		for (const it of items) {
			if (!map.has(it.asset_type)) map.set(it.asset_type, []);
			map.get(it.asset_type)!.push(it);
		}
		return [...map.entries()];
	});

	// total per tipe untuk donut chart
	const TYPE_COLORS = ['#c07a4a', '#e0966a', '#6b9e6e', '#d4a940', '#8b7fb0', '#5f8f8e', '#b8b0a4', '#c96f5d'];
	let typeTotals = $derived.by(() => {
		const totals: { type: string; value: number }[] = [];
		for (const [type, typeItems] of grouped) {
			totals.push({ type, value: typeItems.reduce((a, i) => a + (i.current_value || 0), 0) });
		}
		totals.sort((a, b) => b.value - a.value);
		return totals;
	});
	let typeTotalSum = $derived(typeTotals.reduce((a, t) => a + t.value, 0));
	let typeGradient = $derived((() => {
		if (!typeTotalSum) return '';
		let acc = 0;
		const parts = typeTotals.map((t, i) => {
			const from = (acc / typeTotalSum) * 360;
			acc += t.value;
			const to = (acc / typeTotalSum) * 360;
			return `${TYPE_COLORS[i % TYPE_COLORS.length]} ${from}deg ${to}deg`;
		});
		return `conic-gradient(${parts.join(', ')})`;
	})());

	async function load() {
		loading = true;
		try {
			const res = await (await fetch('/api/assets')).json();
			items = res.items;
			assetTypes = res.assetTypes;
			summary = res.summary;
			target = res.target;
			liveCount = res.liveCount || 0;
			if (!newType && assetTypes.length) newType = assetTypes[0].id;
		} catch (e) {
			msg = 'Gagal memuat aset';
			msgOk = false;
		}
		loading = false;
	}

	load();
	// auto-refresh harga realtime tiap 60 detik
	setInterval(load, 60_000);

	async function add() {
		if (!newName.trim() || !newType) {
			msg = 'Nama & tipe aset wajib diisi!';
			msgOk = false;
			return;
		}
		// validasi: aset saham/crypto wajib ada simbol
		if (isMarketType(newType) && !newSymbol.trim()) {
			msg = 'Simbol wajib diisi untuk saham/crypto (mis. BBCA, ETHIDR)!';
			msgOk = false;
			return;
		}
		try {
			const res = await fetch('/api/assets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: newName.trim(),
					asset_type_id: newType,
					invested_value: newInvested || 0,
					current_value: newCurrent ?? newInvested ?? 0,
					liquidity: newLiquidity,
					note: newNote.trim() || null,
					symbol: isMarketType(newType) ? newSymbol.trim() : undefined,
					shares: isMarketType(newType) ? newShares || 0 : undefined
				})
			});
			if (!res.ok) throw new Error();
			msg = `✅ Aset ${newName.trim()} ditambahkan`;
			msgOk = true;
			newName = '';
			newInvested = undefined;
			newCurrent = undefined;
			newLiquidity = 'Liquid';
			newNote = '';
			newSymbol = '';
			newShares = undefined;
			showAdd = false;
			await load();
		} catch (e) {
			msg = 'Gagal menambah aset';
			msgOk = false;
		}
	}

	function startEdit(r: any) {
		editId = r.id;
		editName = r.name;
		editType = r.asset_type_id;
		editInvested = r.invested_value;
		editCurrent = r.manual_value ?? r.current_value;
		editLiquidity = r.liquidity;
		editNote = r.note || '';
		editSymbol = r.symbol || '';
		editShares = r.shares || undefined;
	}

	async function saveEdit(id: number) {
		if (!editName.trim() || !editType) {
			msg = 'Nama & tipe aset wajib diisi!';
			msgOk = false;
			return;
		}
		try {
			const res = await fetch(`/api/assets/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: editName.trim(),
					asset_type_id: editType,
					invested_value: editInvested || 0,
					current_value: editCurrent || 0,
					liquidity: editLiquidity,
					note: editNote,
					symbol: isMarketType(editType) ? (editSymbol.trim() || undefined) : undefined,
					shares: isMarketType(editType) ? (editShares || undefined) : undefined
				})
			});
			if (!res.ok) throw new Error();
			msg = '✅ Aset diperbarui';
			msgOk = true;
			editId = null;
			await load();
		} catch (e) {
			msg = 'Gagal memperbarui aset';
			msgOk = false;
		}
	}

	async function remove(id: number, name: string) {
		if (!confirm(`Hapus aset ${name}?`)) return;
		try {
			await fetch(`/api/assets/${id}`, { method: 'DELETE' });
			await load();
		} catch (e) { /* */ }
	}
</script>

<div class="hero">
	<h1>🏦 Aset</h1>
	<p>Semua kekayaan dalam satu pandangan.</p>
</div>

{#if msg}
	<div style="margin:0 16px 12px;padding:12px 14px;border-radius:12px;font-size:0.85rem;
		background:{msgOk ? 'rgba(107,158,110,0.12)' : 'rgba(201,111,93,0.12)'};
		color:{msgOk ? 'var(--green)' : 'var(--red)'}">{msg}</div>
{/if}

<!-- Target progress -->
{#if target > 0}
	<div class="form-card" style="background:#fffdf9">
		<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
			<span style="font-size:0.82rem;font-weight:600">🎯 Target Aset</span>
			<b style="font-size:0.85rem">{fmtShort(summary.total_current)} / {fmtShort(target)}</b>
		</div>
		<div class="bud-bar" style="height:10px">
			<div class="bud-fill" style="width:{Math.min(100, (summary.total_current / target) * 100)}%;
				background:{summary.total_current >= target ? 'var(--green)' : 'var(--gold)'}"></div>
		</div>
		<div style="font-size:0.72rem;color:var(--muted);margin-top:5px">
			{summary.total_current >= target
				? '🎉 Target tercapai!'
				: `Kurang ${fmt(target - summary.total_current)} lagi (${((summary.total_current / target) * 100).toFixed(1)}%)`}
		</div>
	</div>
{/if}

<div class="kpi-grid" style="margin-bottom:12px">
	<div class="kpi-card">
		<div class="label">💰 Nilai Aset</div>
		<div class="value">{fmt(summary.total_current)}</div>
		<div class="sub">investasi {fmt(summary.total_invested)}</div>
	</div>
	<div class="kpi-card">
		<div class="label">📈 Profit/Loss</div>
		<div class="value" style="color:{summary.total_profit >= 0 ? 'var(--green)' : 'var(--red)'}">
			{summary.total_profit >= 0 ? '+' : '−'}{fmt(Math.abs(summary.total_profit))}
		</div>
		<div class="sub">🟢 liquid {fmt(summary.total_liquid)}</div>
	</div>
</div>

{#if liveCount > 0}
	<div style="margin:0 16px 12px;padding:8px 12px;border-radius:10px;font-size:0.72rem;
		background:rgba(107,158,110,0.08);color:var(--green);display:flex;gap:6px;align-items:center">
		<span style="width:7px;height:7px;border-radius:50%;background:var(--green);display:inline-block;flex-shrink:0"></span>
		{liveCount} aset (crypto & saham) menggunakan harga <b>realtime market</b> — diperbarui otomatis tiap ~60 detik
	</div>
{/if}

<div class="section">
	<div class="section-title">🥧 Pembagian Aset</div>
	<div class="section-sub">Komposisi total kekayaan per tipe</div>
</div>
<div class="chart-card">
	{#if typeTotals.length}
		<div class="donut-wrap">
			<div class="donut" style="background:{typeGradient}">
				<div class="donut-center">
					<b>{fmtShort(typeTotalSum)}</b>
					total
				</div>
			</div>
			<div class="donut-legend">
				{#each typeTotals as t, i (t.type)}
					<div class="legend-row">
						<span class="legend-dot" style="background:{TYPE_COLORS[i % TYPE_COLORS.length]}"></span>
						<span class="lbl">{t.type}</span>
						<span class="amt">{fmtShort(t.value)}</span>
						<span class="pct">{((t.value / (typeTotalSum || 1)) * 100).toFixed(0)}%</span>
					</div>
				{/each}
			</div>
		</div>
	{:else}
		<div class="empty">Belum ada data aset</div>
	{/if}
</div>

<div class="page-pad" style="display:flex;justify-content:flex-end;margin-bottom:12px">
	<button onclick={() => showAdd = !showAdd}
		style="background:{showAdd ? '#f3ede3' : 'var(--accent)'};border:none;
			border-radius:10px;padding:9px 14px;font-size:0.85rem;font-weight:600;cursor:pointer;
			color:{showAdd ? 'var(--text)' : '#fff'}">
		{showAdd ? 'Batal' : '➕ Tambah Aset'}
	</button>
</div>

{#if showAdd}
	<div class="form-card">
		<b style="display:block;margin-bottom:10px;font-size:0.95rem">➕ Aset Baru</b>
		<div class="field">
			<label>Nama Aset</label>
			<input bind:value={newName} placeholder="mis. Tanah Matrial" />
		</div>
		<div class="field">
			<label>Tipe Aset</label>
			<select bind:value={newType}>
				{#each assetTypes as t (t.id)}
					<option value={t.id}>{t.name}</option>
				{/each}
			</select>
		</div>
		<div style="display:flex;gap:8px">
			<div class="field" style="flex:1">
				<label>Nilai Investasi</label>
				<input type="number" bind:value={newInvested} placeholder="0" step="100000" inputmode="numeric" />
			</div>
			<div class="field" style="flex:1">
				<label>Nilai Sekarang</label>
				<input type="number" bind:value={newCurrent} placeholder="0" step="100000" inputmode="numeric" />
			</div>
		</div>
		<div class="field">
			<label>Likuiditas</label>
			<select bind:value={newLiquidity}>
				<option value="Liquid">Liquid</option>
				<option value="Non-Liquid">Non-Liquid</option>
			</select>
		</div>
		{#if isMarketType(newType)}
			<div style="display:flex;gap:8px">
				<div class="field" style="flex:1">
					<label>Simbol 📡</label>
					<input bind:value={newSymbol} placeholder="mis. BBCA / ETHIDR" style="text-transform:uppercase" />
				</div>
				<div class="field" style="flex:1">
					<label>Jumlah Lembar</label>
					<input type="number" bind:value={newShares} placeholder="mis. 1000" min="0" step="1" inputmode="numeric" />
				</div>
			</div>
			<div style="font-size:0.7rem;color:var(--muted);margin:-4px 0 8px">
				📡 Harga diambil otomatis dari market (realtime). Nilai aset = harga × jumlah lembar.
			</div>
		{/if}
		<div class="field">
			<label>Catatan (opsional)</label>
			<input bind:value={newNote} placeholder="Catatan" />
		</div>
		<button class="btn" onclick={add}>💾 Simpan Aset</button>
	</div>
{/if}

{#if loading}
	<div class="empty" style="padding:40px 16px">Memuat…</div>
{:else if items.length === 0}
	<div class="empty" style="padding:40px 16px">
		<div style="font-size:2rem;margin-bottom:8px">🏦</div>
		Belum ada aset tercatat
	</div>
{:else}
	{#each grouped as [typeName, typeItems] (typeName)}
		<div class="section">
			<div class="section-title">{typeName}</div>
			<div class="section-sub">{typeItems.length} item</div>
		</div>
		<div class="form-card" style="padding:6px 16px">
			{#each typeItems as r (r.id)}
				<div style="padding:12px 0;border-bottom:1px solid #f3ede3">
					{#if editId === r.id}
						<b style="display:block;margin-bottom:10px;font-size:0.9rem">✏️ Edit Aset</b>
						<div class="field">
							<label>Nama Aset</label>
							<input bind:value={editName} />
						</div>
						<div class="field">
							<label>Tipe Aset</label>
							<select bind:value={editType}>
								{#each assetTypes as t (t.id)}
									<option value={t.id}>{t.name}</option>
								{/each}
							</select>
						</div>
						<div style="display:flex;gap:8px">
							<div class="field" style="flex:1">
								<label>Nilai Investasi</label>
								<input type="number" bind:value={editInvested} step="100000" inputmode="numeric" />
							</div>
							<div class="field" style="flex:1">
								<label>Nilai Sekarang</label>
								<input type="number" bind:value={editCurrent} step="100000" inputmode="numeric" />
							</div>
						</div>
						<div class="field">
							<label>Likuiditas</label>
							<select bind:value={editLiquidity}>
								<option value="Liquid">Liquid</option>
								<option value="Non-Liquid">Non-Liquid</option>
							</select>
						</div>
						{#if isMarketType(editType)}
							<div style="display:flex;gap:8px">
								<div class="field" style="flex:1">
									<label>Simbol 📡</label>
									<input bind:value={editSymbol} placeholder="mis. BBCA / ETHIDR" style="text-transform:uppercase" />
								</div>
								<div class="field" style="flex:1">
									<label>Jumlah Lembar</label>
									<input type="number" bind:value={editShares} min="0" step="1" inputmode="numeric" />
								</div>
							</div>
							<div style="font-size:0.7rem;color:var(--muted);margin:-4px 0 8px">
								📡 Harga diambil otomatis dari market. Nilai aset = harga × jumlah lembar.
							</div>
						{/if}
						<div class="field">
							<label>Catatan</label>
							<input bind:value={editNote} />
						</div>
						<div class="btn-row">
							<button class="btn" onclick={() => saveEdit(r.id)}>💾 Simpan</button>
							<button class="btn secondary" onclick={() => editId = null}>Batal</button>
						</div>
					{:else}
					<div style="display:flex;align-items:center;gap:10px">
						<div style="flex:1;min-width:0">
							<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
								<b style="font-size:0.92rem">{r.name}</b>
								{#if r.live}
									<span class="pill" style="font-size:0.6rem;padding:2px 8px;
										background:rgba(107,158,110,0.14);color:var(--green);font-weight:700">
										● LIVE
									</span>
								{/if}
								<span class="pill" style="font-size:0.62rem;padding:2px 8px;
									background:{r.liquidity === 'Liquid' ? 'rgba(107,158,110,0.14)' : 'rgba(139,133,124,0.14)'};
									color:{r.liquidity === 'Liquid' ? 'var(--green)' : 'var(--muted)'}">
									{r.liquidity}
								</span>
							</div>
							{#if r.symbol}
								<div style="font-size:0.72rem;color:var(--muted);margin-top:2px">
									{r.symbol}
									{#if r.live && r.live_price}
										· <b style="color:var(--text)">{fmt(r.live_price)}</b>/unit
										<span style="color:var(--green)">· realtime</span>
									{:else}
										· harga manual
									{/if}
								</div>
							{/if}
							{#if r.note}
								<div style="font-size:0.75rem;color:var(--muted);margin-top:2px">{r.note}</div>
							{/if}
						</div>
						<div style="text-align:right;flex-shrink:0">
							<div style="font-weight:700;font-size:0.9rem">{fmt(r.current_value)}</div>
							<div style="font-size:0.7rem;color:var(--muted)">invest {fmt(r.invested_value)}</div>
							{#if r.current_value !== r.invested_value}
								<div style="font-size:0.78rem;font-weight:600;color:{r.current_value >= r.invested_value ? 'var(--green)' : 'var(--red)'}">
									{r.current_value >= r.invested_value ? '▲' : '▼'} {fmt(Math.abs(r.current_value - r.invested_value))}
								</div>
							{/if}
						</div>
					</div>
					<div style="margin-top:8px;display:flex;gap:6px;align-items:center">
						{#if r.gold}
							<a href="/emas" style="font-size:0.8rem;color:var(--teal);text-decoration:none;font-weight:600">🥇 Kelola di halaman Emas →</a>
						{:else}
							<button onclick={() => startEdit(r)}
								style="background:none;border:none;color:var(--teal);font-size:0.85rem;cursor:pointer;padding:0 4px">✏️ Edit</button>
							<button onclick={() => remove(r.id, r.name)}
								style="background:none;border:none;color:var(--muted);font-size:0.9rem;cursor:pointer;padding:0 4px">🗑</button>
						{/if}
					</div>
					{/if}
				</div>
			{/each}
		</div>
	{/each}
{/if}
