/**
 * Regression test: voice code must NOT exist in the codebase.
 * If src/voice/ is ever re-added, background.ts or content.ts must NOT import it.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

describe('Voice code removal regression', () => {
  it('src/voice directory must not exist', () => {
    const voiceDir = path.join(ROOT, 'src', 'voice');
    expect(fs.existsSync(voiceDir)).toBe(false);
  });

  it('background.ts must not import from src/voice or src/agent', () => {
    const bg = fs.readFileSync(path.join(ROOT, 'entrypoints', 'background.ts'), 'utf-8');
    expect(bg).not.toMatch(/from\s+['"].*\/voice\//);
    expect(bg).not.toMatch(/from\s+['"].*\/agent\//);
    expect(bg).not.toMatch(/elevenLabsApiKey/);
    expect(bg).not.toMatch(/VERIFY_ELEVENLABS/);
  });

  it('content.ts must not import from src/voice or src/agent', () => {
    const ct = fs.readFileSync(path.join(ROOT, 'entrypoints', 'content.ts'), 'utf-8');
    expect(ct).not.toMatch(/from\s+['"].*\/voice\//);
    expect(ct).not.toMatch(/from\s+['"].*\/agent\//);
  });

  it('ApiConfig type must not contain voiceEnabled or elevenLabsApiKey', () => {
    const types = fs.readFileSync(path.join(ROOT, 'src', 'types', 'index.ts'), 'utf-8');
    expect(types).not.toMatch(/elevenLabsApiKey/);
    expect(types).not.toMatch(/voiceEnabled/);
  });

  it('messages.ts must not contain MIC_PERMISSION or VERIFY_ELEVENLABS', () => {
    const msgs = fs.readFileSync(path.join(ROOT, 'src', 'types', 'messages.ts'), 'utf-8');
    expect(msgs).not.toMatch(/MIC_PERMISSION/);
    expect(msgs).not.toMatch(/VERIFY_ELEVENLABS/);
  });
});
