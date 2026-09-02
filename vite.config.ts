import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-node';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		}),
		SvelteKitPWA({
			registerType: 'prompt',
			includeAssets: ['favicon.svg'],
			manifest: {
				name: 'Money Management',
				short_name: 'Money',
				description: 'Keuangan pribadi — satu pandangan.',
				theme_color: '#2f2a24',
				background_color: '#faf6f0',
				display: 'standalone',
				orientation: 'portrait',
				start_url: '/',
				scope: '/',
				icons: [
					{
						src: '/pwa-192x192.png',
						sizes: '192x192',
						type: 'image/png'
					},
					{
						src: '/pwa-512x512.png',
						sizes: '512x512',
						type: 'image/png'
					},
					{
						src: '/pwa-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
				navigateFallback: '/'
			},
			devOptions: {
				enabled: false
			}
		})
	]
});
