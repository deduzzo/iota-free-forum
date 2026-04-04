import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://iotapolis.io',
  base: '/',
  image: {
    service: { entrypoint: 'astro/assets/services/noop' },
  },
  integrations: [
    react(),
    starlight({
      title: 'IotaPolis',
      description: 'Decentralized community platform on IOTA 2.0',
      defaultLocale: 'en',
      social: {
        github: 'https://github.com/deduzzo/iotapolis',
      },
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Installation', slug: 'docs/getting-started/installation' },
            { label: 'Quick Start', slug: 'docs/getting-started/quick-start' },
            { label: 'Configuration', slug: 'docs/getting-started/configuration' },
          ],
        },
        {
          label: 'Architecture',
          items: [
            { label: 'Overview', slug: 'docs/architecture/overview' },
            { label: 'Smart Contract', slug: 'docs/architecture/smart-contract' },
            { label: 'Backend', slug: 'docs/architecture/backend' },
            { label: 'Frontend', slug: 'docs/architecture/frontend' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Wallet', slug: 'docs/guides/wallet' },
            { label: 'Payments & Tips', slug: 'docs/guides/payments' },
            { label: 'Escrow', slug: 'docs/guides/escrow' },
            { label: 'Marketplace', slug: 'docs/guides/marketplace' },
            { label: 'Social Features', slug: 'docs/guides/social' },
            { label: 'Notifications', slug: 'docs/guides/notifications' },
            { label: 'Encrypted Messaging', slug: 'docs/guides/messaging' },
            { label: 'Governance', slug: 'docs/guides/governance' },
            { label: 'Agent Testers', slug: 'docs/guides/agents' },
            { label: 'Audit Dashboard', slug: 'docs/guides/audit' },
          ],
        },
        {
          label: 'API Reference',
          items: [
            { label: 'REST Endpoints', slug: 'docs/api/endpoints' },
          ],
        },
        {
          label: 'Roadmap',
          items: [
            { label: 'Roadmap', slug: 'docs/roadmap' },
          ],
        },
      ],
      customCss: ['./src/styles/global.css'],
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
