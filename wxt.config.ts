import { defineConfig } from 'wxt';
import { loadEnv } from 'vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'FormPilot - AI Form Browser Agent',
    description: 'Autonomous browser agent for completing web forms securely on-device.',
    version: '1.0.0',
    permissions: [
      'storage',
      'sidePanel',
      'activeTab',
      'scripting'
    ],
    // Host permission rationale: FormPilot is a generalized autonomous form browser agent
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
        description: 'Open FormPilot Side Panel'
      }
    },
    action: {
      default_title: 'Open FormPilot Side Panel (Ctrl+Shift+F)'
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
