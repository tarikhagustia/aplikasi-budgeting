<script lang="ts">
	let items: any[] = $state([]);
	let summary = $state({ total_grams: 0, total_buy: 0, total_current: 0, total_profit: 0, live: false, live_price_per_gram: null });
	let loading = $state(true);
	let msg = $state('');
	let msgOk = $state(false);
	let showAdd = $state(false);
	let editId: number | null = $state(null);

	// form tambah
	let newDate = $state(new Date().toISOString().slice(0, 10));
	let newWeight = $state<number | undefined>(undefined);
	let newQty = $state(1);
	let newBuyPrice = $state<number | undefined>(undefined);
	let newPlace = $state('');
	let newPurpose = $state('');

	// form edit
	let editDate = $state('');
	let editWeight = $state<number | undefined>(undefined);
	let editQty = $state(1);
	let editBuyPrice = $state<number | undefined>(undefined);
	let editPlace = $state('');
	let editPurpose = $state('');
	let editCurrent = $state<number | undefined>(undefined);

	function fmt(v: number): string {
		return 'Rp ' + Math.round(v || 0).toLocaleString('id-ID');
	}

	function fmtDate(d: string | null): string {
		if (!d) return '—';
		const dt = new Date(d + 'T00:00:00');
		return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	async function load() {
		loading = true;
		try {
			const res = await (await fetch('/api/gold')).json();
			items = res.items;
			summary = res.summary;
		} catch (e) {
			msg = 'Gagal memuat data emas';
			msgOk = false;
		}
		loading = false;
	}

	load();
	// auto-refresh harga realtime tiap 60 detik
	setInterval(load, 60_000);

	async function add() {
		if (!newWeight || newWeight <= 0 || !newBuyPrice || newBuyPrice <= 0) {
			msg = 'Berat & harga beli wajib diisi!';
			msgOk = false;
			return;
		}
		try {
			const res = await fetch('/api/gold', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					purchase_date: newDate,
					weight_grams: newWeight,
					quantity: newQty,
					buy_price: newBuyPrice,
					purchase_place: newPlace,
					purpose: newPurpose
				})
			});
			if (!res.ok) throw new Error();
			msg = `✅ Emas ${newWeight}gr ditambahkan`;
			msgOk = true;
			newWeight = undefined;
			newBuyPrice = undefined;
			newQty = 1;
			newPlace = '';
			newPurpose = '';
			showAdd = false;
			await load();
		} catch (e) {
			msg = 'Gagal menambah emas';
			msgOk = false;
		}
	}

	function startEdit(r: any) {
		editId = r.id;
		editDate = r.purchase_date;
		editWeight = r.weight_grams;
		editQty = r.quantity;
		editBuyPrice = r.buy_price;
		editPlace = r.purchase_place || '';
		editPurpose = r.purpose || '';
		editCurrent = r.current_price || undefined;
	}

	async function saveEdit(id: number) {
		if (!editWeight || editWeight <= 0 || !editBuyPrice || editBuyPrice <= 0) {
			msg = 'Berat & harga beli wajib diisi!';
			msgOk = false;
			return;
		}
		try {
			const res = await fetch(`/api/gold/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					purchase_date: editDate,
					weight_grams: editWeight,
					quantity: editQty,
					buy_price: editBuyPrice,
					purchase_place: editPlace,
					purpose: editPurpose,
					current_price: editCurrent
				})
			});
			if (!res.ok) throw new Error();
			msg = '✅ Data emas diperbarui';
			msgOk = true;
			editId = null;
			await load();
		} catch (e) {
			msg = 'Gagal memperbarui emas';
			msgOk = false;
		}
	}

	async function remove(id: number, weight: number) {
		if (!confirm(`Hapus emas ${weight}gr ini?`)) return;
		try {
			await fetch(`/api/gold/${id}`, { method: 'DELETE' });
			await load();
		} catch (e) { /* */ }
	}
</script>

<div class="hero">
	<h1>🥇 Emas</h1>
	<p>Koleksi emas & profit/loss-nya.</p>
</div>

{#if msg}
	<div style="margin:0 16px 12px;padding:12px 14px;border-radius:12px;font-size:0.85rem;
		background:{msgOk ? 'rgba(107,158,110,0.12)' : 'rgba(201,111,93,0.12)'};
		color:{msgOk ? 'var(--green)' : 'var(--red)'}">{msg}</div>
{/if}

<div class="kpi-grid" style="margin-bottom:12px">
	<div class="kpi-card">
		<div class="label">🥇 Total Emas</div>
		<div class="value">{Math.round(summary.total_grams)} gr</div>
		<div class="sub">beli {fmt(summary.total_buy)}</div>
	</div>
	<div class="kpi-card">
		<div class="label">📈 Nilai Sekarang</div>
		<div class="value" style="color:{summary.total_profit >= 0 ? 'var(--green)' : 'var(--red)'}">
			{fmt(summary.total_current)}
		</div>
		<div class="sub" style="color:{summary.total_profit >= 0 ? 'var(--green)' : 'var(--red)'}">
			{summary.total_profit >= 0 ? '▲' : '▼'} {fmt(Math.abs(summary.total_profit))}
		</div>
	</div>
</div>

{#if summary.live}
	<div style="margin:0 16px 12px;padding:8px 12px;border-radius:10px;font-size:0.72rem;
		background:rgba(107,158,110,0.08);color:var(--green);display:flex;gap:6px;align-items:center">
		<span style="width:7px;height:7px;border-radius:50%;background:var(--green);display:inline-block;flex-shrink:0"></span>
		Harga emas <b>realtime market</b>: <b>{fmt(summary.live_price_per_gram)}</b>/gram — diperbarui otomatis tiap ~60 detik
	</div>
{:else}
	<div style="margin:0 16px 12px;padding:8px 12px;border-radius:10px;font-size:0.72rem;
		background:rgba(139,133,124,0.08);color:var(--muted)">
		Harga realtime tidak tersedia — menampilkan nilai manual
	</div>
{/if}

<div class="page-pad" style="display:flex;justify-content:flex-end;margin-bottom:12px">
	<button onclick={() => showAdd = !showAdd}
		style="background:{showAdd ? '#f3ede3' : 'var(--accent)'};border:none;
			border-radius:10px;padding:9px 14px;font-size:0.85rem;font-weight:600;cursor:pointer;
			color:{showAdd ? 'var(--text)' : '#fff'}">
		{showAdd ? 'Batal' : '➕ Tambah Emas'}
	</button>
</div>

{#if showAdd}
	<div class="form-card">
		<b style="display:block;margin-bottom:10px;font-size:0.95rem">➕ Emas Baru</b>
		<div class="field">
			<label>Tanggal Beli</label>
			<input type="date" bind:value={newDate} />
		</div>
		<div style="display:flex;gap:8px">
			<div class="field" style="flex:1">
				<label>Berat (gram)</label>
				<input type="number" bind:value={newWeight} placeholder="mis. 10" step="0.1" inputmode="decimal" />
			</div>
			<div class="field" style="flex:1">
				<label>Qty</label>
				<input type="number" bind:value={newQty} min="1" step="1" inputmode="numeric" />
			</div>
		</div>
		<div class="field">
			<label>Harga Beli / gram (Rp)</label>
			<input type="number" bind:value={newBuyPrice} placeholder="mis. 2000000" step="10000" inputmode="numeric" />
		</div>
		<div class="field">
			<label>Lokasi Beli (opsional)</label>
			<input bind:value={newPlace} placeholder="mis. Butik Antam" />
		</div>
		<div class="field">
			<label>Keperluan (opsional)</label>
			<input bind:value={newPurpose} placeholder="mis. Haji" />
		</div>
		<button class="btn" onclick={add}>💾 Simpan Emas</button>
	</div>
{/if}

{#if loading}
	<div class="empty" style="padding:40px 16px">Memuat…</div>
{:else if items.length === 0}
	<div class="empty" style="padding:40px 16px">
		<div style="font-size:2rem;margin-bottom:8px">🥇</div>
		Belum ada koleksi emas
	</div>
{:else}
	<div class="form-card" style="padding:6px 16px">
		{#each items as r (r.id)}
			<div style="padding:12px 0;border-bottom:1px solid #f3ede3">
				{#if editId === r.id}
					<b style="display:block;margin-bottom:10px;font-size:0.9rem">✏️ Edit Emas</b>
					<div class="field">
						<label>Tanggal Beli</label>
						<input type="date" bind:value={editDate} />
					</div>
					<div style="display:flex;gap:8px">
						<div class="field" style="flex:1">
							<label>Berat (gram)</label>
							<input type="number" bind:value={editWeight} step="0.1" inputmode="decimal" />
						</div>
						<div class="field" style="flex:1">
							<label>Qty</label>
							<input type="number" bind:value={editQty} min="1" step="1" inputmode="numeric" />
						</div>
					</div>
					<div class="field">
						<label>Harga Beli / gram (Rp)</label>
						<input type="number" bind:value={editBuyPrice} step="10000" inputmode="numeric" />
					</div>
					<div class="field">
						<label>Lokasi Beli</label>
						<input bind:value={editPlace} />
					</div>
					<div class="field">
						<label>Keperluan</label>
						<input bind:value={editPurpose} />
					</div>
					<div class="field">
						<label>Harga Sekarang / gram (Rp, opsional)</label>
						<input type="number" bind:value={editCurrent} step="10000" inputmode="numeric" placeholder="kosongkan kalau belum tahu" />
					</div>
					<div class="btn-row">
						<button class="btn" onclick={() => saveEdit(r.id)}>💾 Simpan</button>
						<button class="btn secondary" onclick={() => editId = null}>Batal</button>
					</div>
				{:else}
				<div style="display:flex;align-items:center;gap:10px">
					<div style="flex:1;min-width:0">
						<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
							<b style="font-size:0.95rem">{r.weight_grams} gr</b>
							{#if r.quantity > 1}
								<span class="pill" style="font-size:0.62rem;padding:2px 8px">× {r.quantity}</span>
							{/if}
							<span class="pill" style="font-size:0.62rem;padding:2px 8px;background:#f3ede3">{r.kind || 'Antam'}</span>
							{#if r.live}
								<span class="pill" style="font-size:0.6rem;padding:2px 8px;
									background:rgba(107,158,110,0.14);color:var(--green);font-weight:700">● LIVE</span>
							{/if}
						</div>
						{#if r.purpose}
							<div style="font-size:0.75rem;color:var(--muted);margin-top:2px">🎯 {r.purpose}</div>
						{/if}
						<div style="font-size:0.72rem;color:var(--muted);margin-top:3px">
							📅 {fmtDate(r.purchase_date)}
							{#if r.purchase_place}
								<span> · 🏬 {r.purchase_place}</span>
							{/if}
						</div>
					</div>
					<div style="text-align:right;flex-shrink:0">
						{#if r.live}
							<div style="font-weight:700;font-size:0.9rem">{fmt(r.live_value)}</div>
							<div style="font-size:0.7rem;color:var(--green)">realtime · {fmt(r.live_price)}/gr</div>
							<div style="font-size:0.78rem;font-weight:600;color:{r.live_profit >= 0 ? 'var(--green)' : 'var(--red)'}">
								{r.live_profit >= 0 ? '▲' : '▼'} {fmt(Math.abs(r.live_profit))}
							</div>
						{:else}
							<div style="font-weight:700;font-size:0.9rem">{fmt(r.total_buy_cost)}</div>
							<div style="font-size:0.7rem;color:var(--muted)">harga beli</div>
							{#if r.current_price}
								<div style="font-size:0.78rem;font-weight:600;color:{r.profit >= 0 ? 'var(--green)' : 'var(--red)'}">
									{r.profit >= 0 ? '▲' : '▼'} {fmt(Math.abs(r.profit))}
								</div>
							{/if}
						{/if}
					</div>
				</div>
				<div style="margin-top:8px;display:flex;gap:6px">
					<button onclick={() => startEdit(r)}
						style="background:none;border:none;color:var(--teal);font-size:0.85rem;cursor:pointer;padding:0 4px">✏️ Edit</button>
					<button onclick={() => remove(r.id, r.weight_grams)}
						style="background:none;border:none;color:var(--muted);font-size:0.9rem;cursor:pointer;padding:0 4px">🗑</button>
				</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
