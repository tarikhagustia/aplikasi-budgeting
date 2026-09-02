<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	let { children } = $props();

	let installPrompt: any = $state(null);
	let showInstall = $state(false);

	onMount(() => {
		window.addEventListener('beforeinstallprompt', (e) => {
			e.preventDefault();
			installPrompt = e;
			showInstall = true;
		});
	});

	async function install() {
		if (!installPrompt) return;
		installPrompt.prompt();
		await installPrompt.userChoice;
		installPrompt = null;
		showInstall = false;
	}

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
</script>

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
