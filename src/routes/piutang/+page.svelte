<script lang="ts">
	let items: any[] = $state([]);
	let summary = $state({ total_amount: 0, total_paid: 0, total_remaining: 0, likely_collectible: 0 });
	let loading = $state(true);
	let msg = $state('');
	let msgOk = $state(false);
	let showAdd = $state(false);
	let filter: 'all' | 'Belum Lunas' | 'Lunas' = $state(
		(typeof localStorage !== 'undefined' ? localStorage.getItem('mm_piutang_filter') : null) as 'all' | 'Belum Lunas' | 'Lunas' || 'all'
	);
	let payingId: number | null = $state(null);
	let payAmount = $state<number | undefined>(undefined);
	let editId: number | null = $state(null);

	// form edit
	let editName = $state('');
	let editDate = $state('');
	let editAmount = $state<number | undefined>(undefined);
	let editDesc = $state('');
	let editLikely = $state(false);

	// form tambah
	let newDate = $state(new Date().toISOString().slice(0, 10));
	let newName = $state('');
	let newAmount = $state<number | undefined>(undefined);
	let newDesc = $state('');
	let newLikely = $state(false);

	function fmt(v: number): string {
		return 'Rp ' + Math.round(v || 0).toLocaleString('id-ID');
	}

	function fmtDate(d: string | null): string {
		if (!d) return '—';
		const dt = new Date(d + 'T00:00:00');
		return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	function startEdit(r: any) {
		editId = r.id;
		editName = r.name;
		editDate = r.date;
		editAmount = r.amount;
		editDesc = r.description || '';
		editLikely = !!r.likely_paid;
		payingId = null;
	}

	function cancelEdit() {
		editId = null;
	}

	async function saveEdit(id: number) {
		if (!editName.trim()) {
			msg = 'Nama wajib diisi!';
			msgOk = false;
			return;
		}
		try {
			const res = await fetch(`/api/receivables/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: editName.trim(),
					date: editDate,
					amount: editAmount,
					description: editDesc,
					likely_paid: editLikely
				})
			});
			if (!res.ok) throw new Error();
			msg = '✅ Piutang diperbarui';
			msgOk = true;
			editId = null;
			await load();
		} catch (e) {
			msg = 'Gagal memperbarui piutang';
			msgOk = false;
		}
	}

	async function load() {
		loading = true;
		try {
			const q = filter === 'all' ? '' : `?status=${encodeURIComponent(filter)}`;
			const res = await (await fetch(`/api/receivables${q}`)).json();
			items = res.items;
			summary = res.summary;
		} catch (e) {
			msg = 'Gagal memuat piutang';
			msgOk = false;
		}
		loading = false;
	}

	function changeFilter(f: 'all' | 'Belum Lunas' | 'Lunas') {
		filter = f;
		localStorage?.setItem('mm_piutang_filter', f);
		load();
	}

	load();

	async function addPiutang() {
		if (!newName.trim() || !newAmount || newAmount <= 0) {
			msg = 'Nama & jumlah wajib diisi!';
			msgOk = false;
			return;
		}
		try {
			const res = await fetch('/api/receivables', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					date: newDate,
					name: newName.trim(),
					amount: newAmount,
					description: newDesc.trim() || null,
					likely_paid: newLikely
				})
			});
			if (!res.ok) throw new Error();
			msg = `✅ Piutang ${newName.trim()} ditambahkan`;
			msgOk = true;
			newName = '';
			newAmount = undefined;
			newDesc = '';
			newLikely = false;
			showAdd = false;
			await load();
		} catch (e) {
			msg = 'Gagal menambah piutang';
			msgOk = false;
		}
	}

	async function pay(id: number, remaining: number) {
		const amt = payAmount && payAmount > 0 ? payAmount : remaining;
		if (!confirm(`Catat pembayaran ${fmt(amt)}?`)) return;
		try {
			const res = await fetch(`/api/receivables/${id}/pay`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ amount: amt })
			});
			if (!res.ok) throw new Error();
			msg = `✅ Pembayaran ${fmt(amt)} tercatat`;
			msgOk = true;
			payingId = null;
			payAmount = undefined;
			await load();
		} catch (e) {
			msg = 'Gagal mencatat pembayaran';
			msgOk = false;
		}
	}

	async function remove(id: number, name: string) {
		if (!confirm(`Hapus piutang ${name}?`)) return;
		try {
			await fetch(`/api/receivables/${id}`, { method: 'DELETE' });
			await load();
		} catch (e) { /* */ }
	}
</script>

<div class="hero">
	<h1>📌 Piutang</h1>
	<p>Tagihan yang masih harus ditagih.</p>
</div>

{#if msg}
	<div style="margin:0 16px 12px;padding:12px 14px;border-radius:12px;font-size:0.85rem;
		background:{msgOk ? 'rgba(107,158,110,0.12)' : 'rgba(201,111,93,0.12)'};
		color:{msgOk ? 'var(--green)' : 'var(--red)'}">{msg}</div>
{/if}

<!-- Ringkasan -->
<div class="kpi-grid" style="margin-bottom:12px">
	<div class="kpi-card">
		<div class="label">💰 Total Piutang</div>
		<div class="value">{fmt(summary.total_amount)}</div>
		<div class="sub">sudah dibayar {fmt(summary.total_paid)}</div>
	</div>
	<div class="kpi-card">
		<div class="label">📌 Sisa Tagihan</div>
		<div class="value" style="color:var(--accent)">{fmt(summary.total_remaining)}</div>
		<div class="sub">potensi cair {fmt(summary.likely_collectible)}</div>
	</div>
</div>

<!-- Filter + tombol tambah -->
<div class="page-pad" style="display:flex;gap:8px;margin-bottom:12px;align-items:center">
	<div style="flex:1;display:flex;gap:6px">
		{#each ['all', 'Belum Lunas', 'Lunas'] as f (f)}
			<button class="pill" style="border:none;cursor:pointer;flex:1;padding:8px 0;text-align:center;
				background:{filter === f ? 'var(--accent)' : '#f3ede3'};
				color:{filter === f ? '#fff' : 'var(--text)'}"
				onclick={() => changeFilter(f as any)}>
				{f === 'all' ? 'Semua' : f}
			</button>
		{/each}
	</div>
	<button onclick={() => showAdd = !showAdd}
		style="flex-shrink:0;background:{showAdd ? '#f3ede3' : 'var(--accent)'};border:none;
			border-radius:10px;padding:9px 14px;font-size:0.85rem;font-weight:600;cursor:pointer;
			color:{showAdd ? 'var(--text)' : '#fff'}">
		{showAdd ? 'Batal' : '➕ Tambah'}
	</button>
</div>

{#if showAdd}
	<div class="form-card">
		<b style="display:block;margin-bottom:10px;font-size:0.95rem">➕ Piutang Baru</b>
		<div class="field">
			<label>Tanggal</label>
			<input type="date" bind:value={newDate} />
		</div>
		<div class="field">
			<label>Nama</label>
			<input bind:value={newName} placeholder="mis. Mang Dedi" />
		</div>
		<div class="field">
			<label>Jumlah (Rp)</label>
			<input type="number" bind:value={newAmount} placeholder="0" step="100000" inputmode="numeric" />
		</div>
		<div class="field">
			<label>Keterangan (opsional)</label>
			<input bind:value={newDesc} placeholder="mis. Pinjam buat bayar sekolah" />
		</div>
		<div class="field" style="display:flex;align-items:center;gap:8px">
			<input type="checkbox" bind:checked={newLikely} style="width:18px;height:18px" />
			<label style="margin:0">Potensi besar dibayar kembali</label>
		</div>
		<button class="btn" onclick={addPiutang}>💾 Simpan Piutang</button>
	</div>
{/if}

<!-- Daftar piutang -->
{#if loading}
	<div class="empty" style="padding:40px 16px">Memuat…</div>
{:else if items.length === 0}
	<div class="empty" style="padding:40px 16px">
		<div style="font-size:2rem;margin-bottom:8px">🎉</div>
		Tidak ada piutang di filter ini
	</div>
{:else}
	<div class="form-card" style="padding:6px 16px">
		{#each items as r (r.id)}
			<div style="padding:12px 0;border-bottom:1px solid #f3ede3">
				{#if editId === r.id}
					<!-- ✏️ Form edit -->
					<b style="display:block;margin-bottom:10px;font-size:0.9rem">✏️ Edit Piutang</b>
					<div class="field">
						<label>Nama</label>
						<input bind:value={editName} />
					</div>
					<div class="field">
						<label>Tanggal</label>
						<input type="date" bind:value={editDate} />
					</div>
					<div class="field">
						<label>Jumlah (Rp)</label>
						<input type="number" bind:value={editAmount} placeholder="0" step="100000" inputmode="numeric" />
					</div>
					<div class="field">
						<label>Keterangan</label>
						<input bind:value={editDesc} placeholder="Keterangan" />
					</div>
					<div class="field" style="display:flex;align-items:center;gap:8px">
						<input type="checkbox" bind:checked={editLikely} style="width:18px;height:18px" />
						<label style="margin:0">Potensi besar dibayar kembali</label>
					</div>
					<div class="btn-row">
						<button class="btn" onclick={() => saveEdit(r.id)}>💾 Simpan</button>
						<button class="btn secondary" onclick={cancelEdit}>Batal</button>
					</div>
				{:else}
				<div style="display:flex;align-items:center;gap:10px">
					<div style="flex:1;min-width:0">
						<div style="display:flex;align-items:center;gap:6px">
							<b style="font-size:0.92rem">{r.name}</b>
							<span class="pill" style="font-size:0.62rem;padding:2px 8px;
								background:{r.status === 'Lunas' ? 'rgba(107,158,110,0.14)' : 'rgba(201,111,93,0.12)'};
								color:{r.status === 'Lunas' ? 'var(--green)' : 'var(--red)'}">
								{r.status === 'Lunas' ? 'Lunas ✓' : 'Belum Lunas'}
							</span>
						</div>
						{#if r.description}
							<div style="font-size:0.75rem;color:var(--muted);margin-top:2px">{r.description}</div>
						{/if}
						<div style="font-size:0.72rem;color:var(--muted);margin-top:3px">
							📅 {fmtDate(r.date)}
							{#if r.likely_paid && r.status !== 'Lunas'}
								<span style="color:var(--green)"> · potensi cair ✓</span>
							{/if}
						</div>
					</div>
					<div style="text-align:right;flex-shrink:0">
						<div style="font-weight:700;font-size:0.95rem">{fmt(r.remaining)}</div>
						<div style="font-size:0.7rem;color:var(--muted)">sisa · dari {fmt(r.amount)}</div>
					</div>
				</div>

				{#if r.status !== 'Lunas'}
					<div style="margin-top:8px">
						{#if payingId === r.id}
							<div style="display:flex;gap:6px;align-items:center">
								<input type="number" bind:value={payAmount} placeholder={String(r.remaining)}
									step="50000" inputmode="numeric"
									style="flex:1;padding:8px 10px;font-size:0.85rem;text-align:right" />
								<button class="btn" style="padding:9px 14px;font-size:0.8rem;width:auto"
									onclick={() => pay(r.id, r.remaining)}>Bayar</button>
								<button class="btn secondary" style="padding:9px 12px;font-size:0.8rem;width:auto"
									onclick={() => { payingId = null; payAmount = undefined; }}>✕</button>
							</div>
						{:else}
							<div style="display:flex;gap:6px">
								<button class="btn secondary" style="padding:8px 12px;font-size:0.78rem;width:auto"
									onclick={() => { payingId = r.id; payAmount = r.remaining; }}>💸 Catat Bayar</button>
								<button onclick={() => startEdit(r)}
									style="background:none;border:none;color:var(--teal);font-size:0.95rem;cursor:pointer;padding:0 6px"
									aria-label="Edit">✏️</button>
								<button onclick={() => remove(r.id, r.name)}
									style="background:none;border:none;color:var(--muted);font-size:0.9rem;cursor:pointer;padding:0 6px">🗑</button>
							</div>
						{/if}
					</div>
				{:else}
					<div style="margin-top:8px;display:flex;gap:6px">
						<button onclick={() => startEdit(r)}
							style="background:none;border:none;color:var(--teal);font-size:0.9rem;cursor:pointer;padding:0 4px"
							aria-label="Edit">✏️ Edit</button>
						<button onclick={() => remove(r.id, r.name)}
							style="background:none;border:none;color:var(--muted);font-size:0.9rem;cursor:pointer;padding:0 4px">🗑</button>
					</div>
				{/if}
				{/if}
			</div>
		{/each}
	</div>
{/if}
