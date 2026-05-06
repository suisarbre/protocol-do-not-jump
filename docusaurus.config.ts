import type {Config} from '@docusaurus/types';
import type {Options as PresetOptions} from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Lore Wiki',
  tagline: 'A collaborative canon desk for shared-universe fiction.',
  url: process.env.SITE_URL ?? 'https://example.github.io',
  baseUrl: process.env.BASE_URL ?? '/',
  organizationName: process.env.GITHUB_REPO_OWNER ?? 'suisarbre',
  projectName: process.env.GITHUB_REPO_NAME ?? 'protocol-do-not-jump',
  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },
  trailingSlash: false,
  customFields: {
    apiBaseUrl: process.env.LOREWIKI_API_BASE_URL ?? '',
    repositoryUrl:
      process.env.PUBLIC_REPOSITORY_URL ??
      'https://github.com/suisarbre/protocol-do-not-jump',
  },
  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl:
            process.env.PUBLIC_REPOSITORY_URL ??
            'https://github.com/suisarbre/protocol-do-not-jump/tree/main',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies PresetOptions,
    ],
  ],
  themeConfig: {
    navbar: {
      title: 'Lore Wiki',
      items: [
        {to: '/', label: 'Contribute', position: 'left'},
        {type: 'docSidebar', sidebarId: 'loreSidebar', label: 'Canon', position: 'left'},
        {
          href:
            process.env.PUBLIC_REPOSITORY_URL ??
            'https://github.com/suisarbre/protocol-do-not-jump',
          label: 'Repository',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'light',
      links: [
        {
          title: 'Project',
          items: [
            {label: 'Contribute', to: '/'},
            {label: 'Canon', to: '/docs/canon/prime-canon'},
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} Lore Wiki contributors.`,
    },
    colorMode: {
      defaultMode: 'light',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
  },
};

export default config;
