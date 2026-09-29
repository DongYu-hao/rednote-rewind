import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  publicDir: 'src/assets',
  manifestVersion: 3,
  imports: false,
  // Keep the installed directory stable when entering development mode.
  outDirTemplate: '{{browser}}-mv{{manifestVersion}}',
  webExt: { disabled: true },
  dev: { server: { host: '127.0.0.1', port: 3000, strictPort: true } },
  manifest: ({ browser }) => ({
    name: 'rednote rewind',
    description: '在小红书原网页上切换 1985、1995、2000、2005、2010、2015 与当前样式。',
    permissions: ['storage', 'activeTab'],
    web_accessible_resources: [{ resources: ['fonts/*.woff2', 'logos/eras/*.png'], matches: ['https://www.xiaohongshu.com/*'] }],
    action: {
      default_title: 'rednote rewind',
    },
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+Y' },
        description: '打开网页年代设置',
      },
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'rednote-rewind@extensions.local',
              data_collection_permissions: {
                required: ['none'],
              },
            },
          },
        }
      : {}),
  }),
});
