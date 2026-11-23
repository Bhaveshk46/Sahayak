import { describe, it, expect } from 'vitest';
import { matchFieldHeuristically } from '../src/decide/heuristicMatcher';
import { runDecisionEngine } from '../src/decide/decisionEngine';
import { FormField } from '../src/types';
import { ProfileRecord } from '../src/types/profile';

describe('Manual Detail Saving & Guardian Occupation Resolution', () => {
  const guardianField: FormField = {
    id: 'guardian_occupation',
    name: 'guardian_occupation',
    type: 'text',
    label: 'Guardian Occupation',
    required: true,
  };

  it('heuristically matches guardian_occupation field to guardianOccupation profile key', () => {
    const result = matchFieldHeuristically(guardianField);
    expect(result.profileKey).toBe('guardianOccupation');
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('uses manualValues directly to make missing fields immediately ready to fill', async () => {
    const res = await runDecisionEngine({
      fields: [guardianField],
      urlOrOrigin: 'http://localhost:5173',
      profileRecords: [],
      manualValues: {
        guardian_occupation: 'Government Service',
      },
    });

    expect(res.items).toHaveLength(1);
    const item = res.items[0];
    expect(item.status).toBe('ready');
    expect(item.targetValue).toBe('Government Service');
    expect(item.confidence).toBe(1.0);
    expect(item.isManualOverride).toBe(true);
  });

  it('matches profile record saved under exact field name as direct match fallback', async () => {
    const customRecord: ProfileRecord = {
      key: 'guardian_occupation',
      value: 'Agriculture',
      confidence: 1.0,
      source: 'manual',
      verifiedByUser: true,
      updatedAt: Date.now(),
    };

    const res = await runDecisionEngine({
      fields: [guardianField],
      urlOrOrigin: 'http://localhost:5173',
      profileRecords: [customRecord],
    });

    expect(res.items).toHaveLength(1);
    const item = res.items[0];
    expect(item.status).toBe('ready');
    expect(item.targetValue).toBe('Agriculture');
  });
});
