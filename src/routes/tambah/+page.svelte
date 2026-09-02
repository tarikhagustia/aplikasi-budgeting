<script lang="ts">
	let mode: 'expense' | 'income' = $state('expense');
	let categories: any[] = $state([]);
	let sources: any[] = $state([]);
	let accounts: any[] = $state([]);
	let loading = $state(true);
	let saving = $state(false);
	let msg = $state('');
	let msgOk = $state(false);

	// form expense
	let expDate = $state(new Date().toISOString().slice(0, 10));
	let expDesc = $state('');
	let expCat = $state('');
	let expAcc = $state('BCA');
	let expAmt: number | undefined = $state(undefined);
	let expVer = $state(false);

	// form income
	let incDate = $state(new Date().toISOString().slice(0, 10));
	let incSource = $state('');
	let incAcc = $state('BCA');
	let incAmt: number | undefined = $state(undefined);
	let incNote = $state('');

	async function init() {
		try {
			const meta = await (await fetch('/api/meta')).json();
			categories = meta.categories;
			sources = meta.sources;
			accounts = meta.accounts;
			expCat = categories[0]?.name || '';
			incSource = sources[0]?.name || '';
			expAcc = accounts[0]?.name || 'BCA';
			incAcc = accounts[0]?.name || 'BCA';
		} catch (e) { /* */ }
		loading = false;
	}

	init();

	function fmtAmt(v: number | undefined): string {
		return v ? 'Rp ' + v.toLocaleString('id-ID') : 'Rp 0';
	}

	async function saveExpense() {
		if (!expDesc.trim() || !expAmt || expAmt <= 0) {
			msg = 'Deskripsi & jumlah wajib diisi!';
			msgOk = false;
			return;
		}
		saving = true;
		msg = '';
		try {
			const res = await fetch('/api/expenses', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					date: expDate, description: expDesc.trim(), category: expCat,
					account: expAcc, amount: expAmt, is_verified: expVer
				})
			});
			if (!res.ok) throw new Error();
			msg = `✅ Tersimpan: ${expDesc} ${fmtAmt(expAmt)}`;
			msgOk = true;
			expDesc = '';
			expAmt = undefined;
		} catch (e) {
			msg = 'Gagal menyimpan';
			msgOk = false;
		}
		saving = false;
	}

	async function saveIncome() {
		if (!incAmt || incAmt <= 0) {
			msg = 'Jumlah wajib diisi!';
			msgOk = false;
			return;
		}
		saving = true;
		msg = '';
		try {
			const res = await fetch('/api/incomes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					date: incDate, source: incSource, account: incAcc,
					amount: incAmt, note: incNote.trim() || null
				})
			});
			if (!res.ok) throw new Error();
			msg = `✅ Pemasukan ${fmtAmt(incAmt)} tersimpan`;
			msgOk = true;
			incAmt = undefined;
			incNote = '';
		} catch (e) {
			msg = 'Gagal menyimpan';
			msgOk = false;
		}
		saving = false;
	}
</script>

<div class="hero">
	<h1>➕ Catat Transaksi</h1>
	<p>Input pengeluaran atau pemasukan baru.</p>
</div>

<div class="btn-row page-pad" style="margin-bottom:12px">
	<button class="btn" class:secondary={mode !== 'expense'} onclick={() => { mode = 'expense'; msg = ''; }}>🛒 Pengeluaran</button>
	<button class="btn" class:secondary={mode !== 'income'} onclick={() => { mode = 'income'; msg = ''; }}>💼 Pemasukan</button>
</div>

{#if msg}
	<div style="margin:0 16px 12px;padding:12px 14px;border-radius:12px;font-size:0.85rem;
		background:{msgOk ? 'rgba(107,158,110,0.12)' : 'rgba(201,111,93,0.12)'};
		color:{msgOk ? 'var(--green)' : 'var(--red)'}">{msg}</div>
{/if}

{#if loading}
	<div class="empty" style="padding:40px 16px">Memuat…</div>
{:else if mode === 'expense'}
	<div class="form-card">
		<div class="field">
			<label>Tanggal</label>
			<input type="date" bind:value={expDate} />
		</div>
		<div class="field">
			<label>Deskripsi</label>
			<input bind:value={expDesc} placeholder="mis. Beli sembako" />
		</div>
		<div class="field">
			<label>Kategori</label>
			<select bind:value={expCat}>
				{#each categories as c (c.id)}
					<option value={c.name}>{c.name}</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label>Dari Akun</label>
			<select bind:value={expAcc}>
				{#each accounts as a (a.id)}
					<option value={a.name}>{a.name}</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label>Jumlah (Rp)</label>
			<input type="number" bind:value={expAmt} placeholder="0" step="1000" />
		</div>
		<div class="field" style="display:flex;align-items:center;gap:8px">
			<input type="checkbox" bind:checked={expVer} style="width:18px;height:18px" />
			<label style="margin:0">Sudah diverifikasi ✓</label>
		</div>
		<button class="btn" onclick={saveExpense} disabled={saving}>
			{saving ? 'Menyimpan…' : '💾 Simpan Pengeluaran'}
		</button>
	</div>
{:else}
	<div class="form-card">
		<div class="field">
			<label>Tanggal</label>
			<input type="date" bind:value={incDate} />
		</div>
		<div class="field">
			<label>Sumber</label>
			<select bind:value={incSource}>
				{#each sources as s (s.id)}
					<option value={s.name}>{s.name}</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label>Masuk ke Akun</label>
			<select bind:value={incAcc}>
				{#each accounts as a (a.id)}
					<option value={a.name}>{a.name}</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label>Jumlah (Rp)</label>
			<input type="number" bind:value={incAmt} placeholder="0" step="10000" />
		</div>
		<div class="field">
			<label>Catatan (opsional)</label>
			<input bind:value={incNote} placeholder="mis. Gaji Agustus" />
		</div>
		<button class="btn" onclick={saveIncome} disabled={saving}>
			{saving ? 'Menyimpan…' : '💾 Simpan Pemasukan'}
		</button>
	</div>
{/if}
