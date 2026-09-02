<script lang="ts">
	let data: any = $state(null);
	let loading = $state(true);
	let msg = $state('');
	let msgOk = $state(false);
	let showEditTarget = $state(false);
	let newTarget = $state<number | undefined>(undefined);
	// simulasi nabung
	let monthly = $state(1_000_000);

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

	async function load() {
		loading = true;
		try {
			const res = await (await fetch('/api/haji')).json();
			data = res;
		} catch (e) {
			msg = 'Gagal memuat target haji';
			msgOk = false;
		}
		loading = false;
	}

	load();

	async function saveTarget() {
		if (!newTarget || newTarget <= 0) {
			msg = 'Target wajib diisi!';
			msgOk = false;
			return;
		}
		try {
			const res = await fetch('/api/haji', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ target: newTarget })
			});
			if (!res.ok) throw new Error();
			msg = '✅ Target haji diperbarui';
			msgOk = true;
			showEditTarget = false;
			await load();
		} catch (e) {
			msg = 'Gagal memperbarui target';
			msgOk = false;
		}
	}

	// simulasi: berapa bulan lagi lunas dengan nominal per bulan
	function monthsToGo(): number | null {
		if (!data) return null;
		const sisa = data.remaining;
		if (sisa <= 0) return 0;
		if (monthly <= 0) return null;
		return Math.ceil(sisa / monthly);
	}

	function etaLabel(): string {
		const m = monthsToGo();
		if (m === null) return '—';
		if (m === 0) return '🎉 Target tercapai!';
		if (m < 12) return `${m} bulan lagi (${new Date().getFullYear()})`;
		const years = Math.floor(m / 12);
		const months = m % 12;
		const year = new Date().getFullYear() + years;
		const tail = months > 0 ? ` ${months} bulan` : '';
		return `±${years} tahun${tail} lagi → ${year}`;
	}
</script>

<div class="hero">
	<h1>🎯 Target Haji</h1>
	<p>Tabungan haji + emas ber-keperluan haji.</p>
</div>

{#if msg}
	<div style="margin:0 16px 12px;padding:12px 14px;border-radius:12px;font-size:0.85rem;
		background:{msgOk ? 'rgba(107,158,110,0.12)' : 'rgba(201,111,93,0.12)'};
		color:{msgOk ? 'var(--green)' : 'var(--red)'}">{msg}</div>
{/if}

{#if loading}
	<div class="empty" style="padding:40px 16px">Memuat…</div>
{:else if data}
	<!-- Progress utama -->
	<div class="form-card" style="background:#fffdf9">
		<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
			<span style="font-size:0.82rem;font-weight:600">🕋 Target Biaya Haji</span>
			<b style="font-size:0.95rem">{fmtShort(data.target)}</b>
		</div>
		<div class="bud-bar" style="height:14px">
			<div class="bud-fill" style="width:{Math.min(data.pct, 100)}%;
				background:{data.pct >= 100 ? 'var(--green)' : 'var(--gold)'}"></div>
		</div>
		<div style="display:flex;justify-content:space-between;font-size:0.72rem;color:var(--muted);margin-top:5px">
			<span>Terkumpul <b style="color:var(--text)">{fmtShort(data.collected)}</b> ({data.pct.toFixed(1)}%)</span>
			<span>Kurang <b style="color:var(--red)">{fmtShort(data.remaining)}</b></span>
		</div>
		<button class="btn secondary" style="margin-top:10px;font-size:0.78rem;padding:8px"
			onclick={() => { showEditTarget = !showEditTarget; newTarget = data.target; }}>
			{showEditTarget ? 'Batal' : '✏️ Ubah Target'}
		</button>
	</div>

	{#if showEditTarget}
		<div class="form-card" style="margin-top:10px">
			<div class="field">
				<label>Target Biaya Haji (Rp)</label>
				<input type="number" bind:value={newTarget} step="5000000" inputmode="numeric"
					placeholder="mis. 100000000" />
			</div>
			<button class="btn" onclick={saveTarget}>💾 Simpan Target</button>
		</div>
	{/if}

	<!-- Komposisi tabungan -->
	<div class="kpi-grid" style="margin:12px 0">
		<div class="kpi-card">
			<div class="label">🥇 Emas Haji</div>
			<div class="value">{fmt(data.gold_value)}</div>
			<div class="sub">{Math.round(data.gold_grams)} gr · {data.gold_count} koleksi</div>
		</div>
		<div class="kpi-card">
			<div class="label">🏦 Tabungan Haji</div>
			<div class="value">{fmt(data.saving_value)}</div>
			<div class="sub">dari aset</div>
		</div>
	</div>

	<!-- Simulasi nabung -->
	<div class="section">
		<div class="section-title">⏳ Simulasi Nabung</div>
		<div class="section-sub">Kalau rutin nabung tiap bulan, kapan lunas?</div>
	</div>
	<div class="form-card" style="background:#fffdf9">
		<div class="field">
			<label>Nabung per bulan (Rp)</label>
			<input type="number" bind:value={monthly} step="500000" inputmode="numeric" placeholder="mis. 1000000" />
		</div>

		{#if data.remaining > 0}
			<div style="padding:14px 16px;border-radius:12px;margin-top:4px;
				background:{monthsToGo() !== null ? 'rgba(107,158,110,0.10)' : 'rgba(139,133,124,0.08)'}">
				<div style="font-size:0.75rem;color:var(--muted)">Estimasi lunas</div>
				<div style="font-size:1.2rem;font-weight:800;color:var(--green);margin-top:2px">
					{etaLabel()}
				</div>
				{#if monthsToGo() !== null && monthsToGo() > 0}
					<div style="font-size:0.72rem;color:var(--muted);margin-top:4px">
						{fmt(monthly)}/bulan × {monthsToGo()} bulan = {fmt(monthly * monthsToGo())} (sisa {fmt(data.remaining)})
					</div>
				{/if}
			</div>
			<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
				{#each [500000, 1000000, 2000000, 5000000] as p (p)}
					<button class="pill" style="flex:1;min-width:70px;border:none;cursor:pointer;padding:8px 0;
						background:{monthly === p ? 'var(--accent)' : '#f3ede3'};
						color:{monthly === p ? '#fff' : 'var(--text)'}"
						onclick={() => monthly = p}>
						{fmtShort(p)}
					</button>
				{/each}
			</div>
		{:else}
			<div style="padding:14px 16px;border-radius:12px;background:rgba(107,158,110,0.12);text-align:center">
				<b style="color:var(--green)">🎉 Target haji tercapai!</b>
			</div>
		{/if}
	</div>

	<div class="section">
		<div class="section-title">💡 Catatan</div>
	</div>
	<div class="chart-card" style="font-size:0.78rem;color:var(--muted);line-height:1.6">
		<ul style="margin:0;padding-left:18px">
			<li>Emas yang dihitung adalah koleksi dengan keperluan <b>Haji</b> (nilai saat ini, bukan harga beli).</li>
			<li>Tabungan haji diambil dari aset yang namanya mengandung "Haji".</li>
			<li>Estimasi lunas tidak memperhitungkan kenaikan biaya haji & fluktuasi emas — anggap nilai tetap.</li>
		</ul>
	</div>
{/if}
