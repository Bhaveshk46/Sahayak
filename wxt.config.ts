import { defineConfig } from 'wxt';
import { loadEnv } from 'vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Sahayak - AI Form Browser Agent',
    description: 'Privacy-preserving autonomous form browser agent for scholarships, citizen portals, and job applications.',
    version: '1.0.0',
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
    permissions: [
      'storage',
      'sidePanel',
      'activeTab',
      'scripting'
    ],
    // Host permission rationale: Sahayak is a generalized autonomous form browser agent
    // that users activate on statutory portals, government services, and employment applications.
    // It requires access across web origins to observe form fields, detect iframes, and inject
    // quick-attach widgets strictly on-demand.
    host_permissions: [
      '<all_urls>',
      'https://api.sarvam.ai/*'
    ],
    commands: {
      _execute_action: {
        suggested_key: {
          default: 'Ctrl+Shift+F',
          mac: 'Command+Shift+F'
        },
        description: 'Open Sahayak Side Panel'
      }
    },
    action: {
      default_title: 'Open Sahayak Side Panel (Ctrl+Shift+F)',
      default_icon: {
        16: 'icon-16.png',
        32: 'icon-32.png',
        48: 'icon-48.png',
        128: 'icon-128.png',
      },
    },
    side_panel: {
      default_path: 'sidepanel.html'
    },
    web_accessible_resources: [
      {
        resources: ['*'],
        matches: ['<all_urls>']
      }
    ]
  },
  vite: (env) => {
    const loaded = loadEnv(env?.mode || 'development', process.cwd(), '');
    const geminiKey = loaded.GEMINI_API_KEY || loaded.VITE_GEMINI_API_KEY || '';
    const sarvamKey = loaded.SARVAM_API_KEY || loaded.VITE_SARVAM_API_KEY || '';
    return {
      define: {
        'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(geminiKey),
        'import.meta.env.VITE_SARVAM_API_KEY': JSON.stringify(sarvamKey),
      },
      build: {
        sourcemap: false
      }
    };
  }
});
