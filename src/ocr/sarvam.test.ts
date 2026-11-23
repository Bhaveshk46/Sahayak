import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createExtractionJob,
  pollJobStatus,
  fetchJobResults,
  buildSchemaForDocumentType,
  createParseFallbackJob,
  SarvamExtractionResponseSchema,
  SARVAM_BASE_URL,
} from './sarvam';
import { validateExtractorOutput } from '../types/profile';

describe('M4 Sarvam Document AI Client & Validation Tests', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('builds valid JSON schema tailored for document types', () => {
    const aadhaarSchema = buildSchemaForDocumentType('aadhaar') as any;
    expect(aadhaarSchema.type).toBe('object');
    expect(aadhaarSchema.properties.aadhaarNumber).toBeDefined();
    expect(aadhaarSchema.properties.fullName).toBeDefined();

    const panSchema = buildSchemaForDocumentType('pan') as any;
    expect(panSchema.properties.panNumber).toBeDefined();
    expect(panSchema.properties.fatherName).toBeDefined();

    const bankSchema = buildSchemaForDocumentType('bank_passbook') as any;
    expect(bankSchema.properties.bankAccount).toBeDefined();
    expect(bankSchema.properties.ifsc).toBeDefined();
  });

  it('submits extract job with multipart file and schema', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        job_id: 'job_test_12345',
        status: 'pending',
      }),
    });

    const file = new Blob(['sample pdf content'], { type: 'application/pdf' });
    const { jobId } = await createExtractionJob(file, 'aadhaar', 'dummy_api_key_123');

    expect(jobId).toBe('job_test_12345');
    expect(global.fetch).toHaveBeenCalledWith(
      `${SARVAM_BASE_URL}/job/extract`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'api-subscription-key': 'dummy_api_key_123' },
      })
    );
  });

  it('polls job status until completion', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ job_id: 'job_123', status: 'processing' }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          job_id: 'job_123',
          status: 'completed',
          results_url: 'https://api.sarvam.ai/results/job_123',
        }),
      };
    });

    const status = await pollJobStatus('job_123', 'dummy_key', 10, 50);
    expect(status.status).toBe('completed');
    expect(callCount).toBe(2);
  });

  it('rejects with timeout error when poll exceeds limit', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ job_id: 'job_slow', status: 'processing' }),
    });

    await expect(pollJobStatus('job_slow', 'dummy_key', 0.2, 50)).rejects.toThrow(/timed out/i);
  });

  it('handles job failure state properly', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        job_id: 'job_failed',
        status: 'failed',
        error: 'Unsupported image resolution or corrupted file',
      }),
    });

    await expect(pollJobStatus('job_failed', 'dummy_key', 5, 50)).rejects.toThrow(
      /Unsupported image resolution/i
    );
  });

  it('validates malformed Sarvam response through zod schema', () => {
    const validPayload = {
      job_id: 'valid_id',
      status: 'completed',
    };
    expect(() => SarvamExtractionResponseSchema.parse(validPayload)).not.toThrow();

    const invalidStatusPayload = {
      job_id: 'bad_id',
      status: 'unknown_status_code',
    };
    expect(() => SarvamExtractionResponseSchema.parse(invalidStatusPayload)).toThrow();

    const missingIdPayload = {
      status: 'pending',
    };
    expect(() => SarvamExtractionResponseSchema.parse(missingIdPayload)).toThrow();
  });

  it('validates and unwraps extractor results through validateExtractorOutput zod helper', () => {
    // Nested structure like Sarvam API
    const nestedSarvamOutput = {
      extracted_data: {
        fullName: 'Aditi Ramesh Sharma',
        aadhaarNumber: '987654321012',
        dob: '2002-05-14',
        pincode: '411001',
      },
    };
    const parsed = validateExtractorOutput(nestedSarvamOutput);
    expect(parsed.fullName).toBe('Aditi Ramesh Sharma');
    expect(parsed.aadhaarNumber).toBe('987654321012');
    expect(parsed.pincode).toBe('411001');

    // Flat structure
    const flatOutput = {
      panNumber: 'ABCDE1234F',
      fatherName: 'Ramesh Sharma',
    };
    const parsedFlat = validateExtractorOutput(flatOutput);
    expect(parsedFlat.panNumber).toBe('ABCDE1234F');
    expect(parsedFlat.fatherName).toBe('Ramesh Sharma');
  });

  it('submits parse fallback job to /job/parse', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        job_id: 'parse_job_999',
      }),
    });

    const file = new Blob(['sample doc binary'], { type: 'application/pdf' });
    const jobId = await createParseFallbackJob(file, 'dummy_key', 'hi-IN');
    expect(jobId).toBe('parse_job_999');
    expect(global.fetch).toHaveBeenCalledWith(
      `${SARVAM_BASE_URL}/job/parse`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'api-subscription-key': 'dummy_key' },
      })
    );
  });

  it('fetches job results via GET request', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        extracted_data: { fullName: 'Aditi Sharma' },
      }),
    });

    const results = await fetchJobResults('job_result_test', 'test_key');
    expect(results).toBeDefined();
    expect(global.fetch).toHaveBeenCalledWith(
      `${SARVAM_BASE_URL}/job/job_result_test/results?format=json`,
      expect.objectContaining({
        headers: { 'api-subscription-key': 'test_key' },
      })
    );
  });
});
