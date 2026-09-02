<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	let { children } = $props();

	let installPrompt: any = $state(null);
	let showInstall = $state(false);

	const navItems = [
		{ href: '/', label: 'Home', ico: '🏠' },
		{ href: '/aset', label: 'Aset', ico: '🏦' },
		{ href: '/budget', label: 'Budget', ico: '📋' },
		{ href: '/target', label: 'Target', ico: '🎯' },
		{ href: '/tambah', label: 'Tambah', ico: '➕' },
		{ href: '/emas', label: 'Emas', ico: '🥇' },
		{ href: '/piutang', label: 'Piutang', ico: '📌' },
		{ href: '/riwayat', label: 'Riwayat', ico: '🧾' }
	];

	// ── PIN lock ──────────────────────────────────────────
	// Konten SELALU dirender (aman untuk SSR/hydration) — layar PIN hanya OVERLAY di atasnya.
	// Saat locked, overlay menutupi layar; setelah unlock, overlay hilang.
	let locked = $state(true);
	let pinInput = $state('');
	let pinError = $state(false);
	let pinBusy = $state(false);
	let lastAttempt = $state(0);
	const PIN_KEY = 'mm_unlocked';

	onMount(() => {
		window.addEventListener('beforeinstallprompt', (e) => {
			e.preventDefault();
			installPrompt = e;
			showInstall = true;
		});

		// cek status unlock dari sessionStorage (session baru = minta PIN lagi)
		try {
			const unlocked = sessionStorage.getItem(PIN_KEY) === '1';
			locked = !unlocked;
		} catch {
			locked = true;
		}
	});

	async function unlock() {
		const pin = pinInput.trim();
		if (!pin) return;
		if (Date.now() - lastAttempt < 1000) return; // anti spam
		lastAttempt = Date.now();
		pinBusy = true;
		pinError = false;
		try {
			const res = await fetch('/api/auth/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pin })
			});
			const data = await res.json();
			if (data.ok) {
				try { sessionStorage.setItem(PIN_KEY, '1'); } catch { /* */ }
				locked = false;
				pinInput = '';
			} else {
				pinError = true;
				pinInput = '';
			}
		} catch {
			pinError = true;
		}
		pinBusy = false;
	}

	function lockNow() {
		try { sessionStorage.removeItem(PIN_KEY); } catch { /* */ }
		locked = true;
		pinInput = '';
	}

	function onPinKey(e: KeyboardEvent) {
		if (e.key === 'Enter') unlock();
	}
</script>

<!-- Konten utama — SELALU dirender (SSR & client), ditutup overlay PIN saat locked -->
<main>
	{@render children()}
</main>

<nav class="bottom-nav">
	{#each navItems as item}
		<a href={item.href} class="nav-item" class:active={page.url.pathname === item.href}>
			<span class="ico">{item.ico}</span>
			{item.label}
		</a>
	{/each}
</nav>

<!-- Layar kunci PIN — overlay full-screen di atas konten -->
{#if locked}
	<div style="position:fixed;inset:0;z-index:999;background:var(--cream);
		display:flex;align-items:center;justify-content:center;padding:24px">
		<div style="width:100%;max-width:320px;text-align:center">
			<div style="font-size:2.6rem;margin-bottom:10px">🌿</div>
			<h1 style="font-size:1.15rem;color:var(--text);margin:0 0 4px">Money Management</h1>
			<p style="font-size:0.8rem;color:var(--muted);margin:0 0 24px">Masukkan PIN untuk membuka</p>

			<div style="background:#fff;border-radius:16px;padding:20px 16px;box-shadow:0 4px 20px rgba(60,50,40,0.08)">
				<input
					type="password"
					inputmode="numeric"
					placeholder="••••••"
					bind:value={pinInput}
					onkeydown={onPinKey}
					maxlength="12"
					style="width:100%;text-align:center;font-size:1.5rem;letter-spacing:0.5em;font-weight:700;
						padding:14px 8px;border:1.5px solid {pinError ? 'var(--red)' : '#e2d9cc'};
						border-radius:12px;background:var(--cream);color:var(--text);outline:none"
					autofocus
				/>

				{#if pinError}
					<div style="color:var(--red);font-size:0.78rem;margin-top:10px">PIN salah, coba lagi</div>
				{/if}

				<button
					onclick={unlock}
					disabled={pinBusy}
					style="width:100%;margin-top:14px;background:var(--dark);color:#f5f0e8;border:none;
						border-radius:12px;padding:13px;font-size:0.95rem;font-weight:700;cursor:pointer">
					{pinBusy ? 'Memeriksa…' : '🔓 Buka'}
				</button>
			</div>

			<p style="font-size:0.68rem;color:var(--muted);margin-top:16px">
				PIN default: 123456 — ubah di file <b>.env</b> (APP_PIN)
			</p>
		</div>
	</div>
{/if}

{#if showInstall}
	<div style="position:fixed;top:10px;left:16px;right:16px;z-index:200;
		background:var(--dark);color:#f5f0e8;border-radius:14px;padding:12px 16px;
		display:flex;align-items:center;gap:10px;box-shadow:0 8px 24px rgba(0,0,0,0.25)">
		<span style="font-size:1.4rem">📲</span>
		<div style="flex:1;font-size:0.82rem">
			<b style="display:block">Install Money Management</b>
			<span style="color:#c9c0b2">Akses cepat dari home screen</span>
		</div>
		<button onclick={install} style="background:var(--accent);border:none;color:#fff;
			border-radius:10px;padding:8px 14px;font-size:0.8rem;font-weight:600">Install</button>
	</div>
{/if}

{#if !locked}
	<button onclick={lockNow} aria-label="Kunci aplikasi"
		title="Kunci aplikasi"
		style="position:fixed;top:12px;right:12px;z-index:150;background:#fff;border:1px solid #e2d9cc;
			border-radius:999px;width:38px;height:38px;font-size:0.95rem;cursor:pointer;
			display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(60,50,40,0.08)">
		🔒
	</button>
{/if}
