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

	// edit inline
	let editId: number | null = $state(null);
	let editDate = $state('');
	let editDesc = $state(''); // description (expense) atau source (income)
	let editCategory = $state(''); // category (expense) atau note (income)
	let editAmount = $state<number | undefined>(undefined);
	let editAccount = $state('BCA');
	let saving = $state(false);
	let msg = $state('');
	let msgOk = $state(false);

	let categories: string[] = $state([]);
	let sources: string[] = $state([]);
	let accounts: string[] = $state(['BCA', 'BSI', 'CASH']);

	const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

	function fmt(v: number): string {
		return 'Rp ' + Math.round(v || 0).toLocaleString('id-ID');
	}

	function fmtDate(d: string): string {
		const dt = new Date(d + 'T00:00:00');
		return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
	}

	// masking rupiah pada input edit
	function fmtInput(v: number | undefined): string {
		if (v == null || isNaN(v)) return '';
		return Math.round(v).toLocaleString('id-ID');
	}
	function onAmountInput(e: Event) {
		const el = e.target as HTMLInputElement;
		const raw = el.value.replace(/[^\d]/g, '');
		editAmount = raw ? Number(raw) : undefined;
		el.value = raw ? Number(raw).toLocaleString('id-ID') : '';
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

	async function loadMeta() {
		try {
			const meta = await (await fetch('/api/meta')).json();
			categories = (meta.categories || []).map((c: any) => c.name);
			sources = (meta.sources || []).map((s: any) => s.name);
			if (meta.accounts?.length) accounts = meta.accounts.map((a: any) => a.name);
		} catch (e) { /* */ }
	}

	async function del(id: number) {
		if (!confirm('Hapus transaksi ini?')) return;
		try {
			await fetch(`/api/${tab === 'expense' ? 'expenses' : 'incomes'}/${id}`, { method: 'DELETE' });
			rows = rows.filter((r) => r.id !== id);
			if (editId === id) editId = null;
		} catch (e) { /* */ }
	}

	function startEdit(r: any) {
		editId = r.id;
		editDate = r.date;
		editAmount = r.amount;
		editAccount = r.account && r.account !== '—' ? r.account : 'BCA';
		if (tab === 'expense') {
			editDesc = r.description;
			editCategory = r.category;
		} else {
			editDesc = r.source;
			editCategory = r.note || '';
		}
		msg = '';
	}

	function cancelEdit() {
		editId = null;
	}

	async function saveEdit() {
		if (!editId) return;
		if (!editAmount || editAmount <= 0) {
			msg = 'Jumlah harus lebih dari 0';
			msgOk = false;
			return;
		}
		saving = true;
		msg = '';
		try {
			const payload =
				tab === 'expense'
					? { date: editDate, description: editDesc, category: editCategory, account: editAccount, amount: editAmount }
					: { date: editDate, source: editDesc, note: editCategory, account: editAccount, amount: editAmount };

			const res = await fetch(`/api/${tab === 'expense' ? 'expenses' : 'incomes'}/${editId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (!res.ok) throw new Error((await res.json()).error || 'Gagal menyimpan');
			const data = await res.json();
			rows = rows.map((r) => (r.id === editId ? data.item : r));
			msg = '✅ Transaksi diperbarui';
			msgOk = true;
			editId = null;
		} catch (e: any) {
			msg = e.message || 'Gagal menyimpan';
			msgOk = false;
		}
		saving = false;
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
			categories = (meta.categories || []).map((c: any) => c.name);
			sources = (meta.sources || []).map((s: any) => s.name);
			if (meta.accounts?.length) accounts = meta.accounts.map((a: any) => a.name);
		} catch (e) { /* */ }
		await load();
	}

	init();

	function changeMonth() {
		year = Number(selected.slice(0, 4));
		month = Number(selected.slice(5, 7));
		localStorage?.setItem('mm_riwayat_month', selected);
		editId = null;
		load();
	}

	function changeTab(t: 'expense' | 'income') {
		tab = t;
		localStorage?.setItem('mm_riwayat_tab', t);
		editId = null;
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

{#if msg}
	<div class="page-pad" style="margin-bottom:12px;padding:10px 14px;border-radius:12px;font-size:0.82rem;
		background:{msgOk ? 'rgba(107,158,110,0.12)' : 'rgba(201,111,93,0.12)'};
		color:{msgOk ? 'var(--green)' : 'var(--red)'}">{msg}</div>
{/if}

{#if loading}
	<div class="empty" style="padding:40px 16px">Memuat…</div>
{:else if error}
	<div class="empty" style="padding:40px 16px">{error}</div>
{:else if rows.length === 0}
	<div class="empty" style="padding:40px 16px">Tidak ada transaksi bulan ini</div>
{:else}
	<div class="form-card" style="padding:8px 16px">
		{#each rows as r (r.id)}
			<div style="padding:9px 0;border-bottom:1px solid #f3ede3">
				{#if editId === r.id}
					<!-- ✏️ Form edit inline -->
					<div style="display:flex;flex-direction:column;gap:8px;padding:6px 0">
						<div style="display:flex;gap:8px">
							<div class="field" style="flex:1;margin:0">
								<label style="font-size:0.7rem">Tanggal</label>
								<input type="date" bind:value={editDate} style="width:100%" />
							</div>
							<div class="field" style="flex:1;margin:0">
								<label style="font-size:0.7rem">Akun</label>
								<select bind:value={editAccount} style="width:100%">
									{#each accounts as a (a)}
										<option value={a}>{a}</option>
									{/each}
								</select>
							</div>
						</div>

						<div class="field" style="margin:0">
							<label style="font-size:0.7rem">{tab === 'expense' ? 'Deskripsi' : 'Sumber'}</label>
							{#if tab === 'expense'}
								<input type="text" bind:value={editDesc} placeholder="Deskripsi transaksi" style="width:100%" />
							{:else}
								<input type="text" bind:value={editDesc} placeholder="Sumber pemasukan" list="riwayat-sources" style="width:100%" />
								<datalist id="riwayat-sources">
									{#each sources as s (s)}<option value={s}></option>{/each}
								</datalist>
							{/if}
						</div>

						<div class="field" style="margin:0">
							<label style="font-size:0.7rem">{tab === 'expense' ? 'Kategori' : 'Catatan'}</label>
							{#if tab === 'expense'}
								<input type="text" bind:value={editCategory} placeholder="Kategori" list="riwayat-categories" style="width:100%" />
								<datalist id="riwayat-categories">
									{#each categories as c (c)}<option value={c}></option>{/each}
								</datalist>
							{:else}
								<input type="text" bind:value={editCategory} placeholder="Catatan (opsional)" style="width:100%" />
							{/if}
						</div>

						<div class="field" style="margin:0">
							<label style="font-size:0.7rem">Jumlah (Rp)</label>
							<input
								type="text"
								inputmode="numeric"
								value={fmtInput(editAmount)}
								oninput={onAmountInput}
								placeholder="0"
								style="width:100%"
							/>
						</div>

						<div style="display:flex;gap:8px;margin-top:2px">
							<button class="btn" style="flex:1;padding:9px;font-size:0.82rem" disabled={saving} onclick={saveEdit}>
								{saving ? 'Menyimpan…' : '💾 Simpan'}
							</button>
							<button class="btn secondary" style="flex:1;padding:9px;font-size:0.82rem" onclick={cancelEdit}>Batal</button>
						</div>
					</div>
				{:else}
					<div style="display:flex;align-items:center;gap:10px">
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
						<div style="display:flex;gap:2px;flex-shrink:0">
							<button onclick={() => startEdit(r)} style="background:none;border:none;color:var(--teal);font-size:0.85rem;cursor:pointer;padding:4px">✏️</button>
							<button onclick={() => del(r.id)} style="background:none;border:none;color:var(--muted);font-size:0.9rem;cursor:pointer;padding:4px">🗑</button>
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
