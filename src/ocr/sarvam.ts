import { z } from 'zod';
import { DocumentType } from '../types/profile';

/**
 * Sarvam Document AI Client
 * Endpoints:
 *   POST https://api.sarvam.ai/doc-ai/v1/job/extract  (Field extraction with JSON schema)
 *   POST https://api.sarvam.ai/doc-ai/v1/job/parse    (Full document OCR parse fallback)
 *   GET  https://api.sarvam.ai/doc-ai/v1/job/:job_id/status
 *   GET  https://api.sarvam.ai/doc-ai/v1/job/:job_id/results
 * Header: api-subscription-key
 */

export const SARVAM_BASE_URL = 'https://api.sarvam.ai/doc-ai/v1';

export const SarvamExtractionResponseSchema = z.object({
  job_id: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'partially_completed', 'failed', 'rejected']),
  results_url: z.string().optional(),
  results: z.record(z.unknown()).optional(),
  error: z.string().optional(),
});

export type SarvamJobStatus = z.infer<typeof SarvamExtractionResponseSchema>;

/**
 * Build tailored JSON schema for Sarvam extract based on document type
 */
export function buildSchemaForDocumentType(docType: DocumentType): Record<string, unknown> {
  const baseProperties: Record<string, { type: string; description: string }> = {};

  if (docType === 'aadhaar') {
    baseProperties.fullName = { type: 'string', description: 'Full legal name of the resident' };
    baseProperties.dob = { type: 'string', description: 'Date of birth in YYYY-MM-DD or DD/MM/YYYY format' };
    baseProperties.gender = { type: 'string', description: 'Gender of the person (Male/Female/Other)' };
    baseProperties.aadhaarNumber = { type: 'string', description: '12-digit Aadhaar UID number' };
    baseProperties.address = { type: 'string', description: 'Complete residential address' };
    baseProperties.pincode = { type: 'string', description: '6-digit postal pincode' };
  } else if (docType === 'pan') {
    baseProperties.fullName = { type: 'string', description: 'Name of the cardholder' };
    baseProperties.fatherName = { type: 'string', description: "Father's name" };
    baseProperties.dob = { type: 'string', description: 'Date of birth' };
    baseProperties.panNumber = { type: 'string', description: '10-character alphanumeric Permanent Account Number' };
  } else if (docType === 'bank_passbook') {
    baseProperties.fullName = { type: 'string', description: 'Account holder or beneficiary name' };
    baseProperties.bankAccount = { type: 'string', description: 'Bank account number' };
    baseProperties.ifsc = { type: 'string', description: '11-character bank IFSC code' };
  } else if (docType === 'marksheet') {
    baseProperties.fullName = { type: 'string', description: 'Candidate or student name' };
    baseProperties.institution = { type: 'string', description: 'College, university, or board name' };
    baseProperties.course = { type: 'string', description: 'Degree or examination name' };
    baseProperties.marksPercent = { type: 'string', description: 'Overall percentage or CGPA achieved' };
  } else if (docType === 'income_certificate') {
    baseProperties.fullName = { type: 'string', description: 'Certificate holder name' };
    baseProperties.annualIncome = { type: 'string', description: 'Total annual gross family income in INR' };
  } else if (docType === 'caste_certificate') {
    baseProperties.fullName = { type: 'string', description: 'Name of the candidate' };
    baseProperties.category = { type: 'string', description: 'Social category or caste (e.g. OBC, SC, ST, EWS)' };
  } else {
    baseProperties.fullName = { type: 'string', description: 'Full legal name' };
    baseProperties.dob = { type: 'string', description: 'Date of birth' };
    baseProperties.mobile = { type: 'string', description: 'Mobile phone number' };
    baseProperties.email = { type: 'string', description: 'Email address' };
  }

  return {
    type: 'object',
    properties: baseProperties,
  };
}

export async function createExtractionJob(
  file: Blob | File,
  docType: DocumentType,
  apiKey: string,
  language: string = 'en-IN'
): Promise<{ jobId: string }> {
  // Check limit (200 MB)
  const maxBytes = 200 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error('File exceeds Sarvam Document AI limit of 200 MB.');
  }

  const formData = new FormData();
  formData.append('file', file, (file as File).name || 'document.pdf');
  formData.append('schema', JSON.stringify(buildSchemaForDocumentType(docType)));
  formData.append('language', language);

  const response = await fetch(`${SARVAM_BASE_URL}/job/extract`, {
    method: 'POST',
    headers: {
      'api-subscription-key': apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Sarvam API subscription key is invalid or unauthorized.');
    }
    if (response.status === 429) {
      throw new Error('Sarvam API rate limit exceeded. Please retry in a few moments.');
    }
    const errText = await response.text();
    throw new Error(`Sarvam extract job submission failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  if (!data.job_id) {
    throw new Error('No job_id returned by Sarvam extract endpoint.');
  }

  return { jobId: data.job_id };
}

export async function pollJobStatus(
  jobId: string,
  apiKey: string,
  maxWaitSec: number = 60,
  pollIntervalMs: number = 2000
): Promise<SarvamJobStatus> {
  const startTime = Date.now();

  while ((Date.now() - startTime) / 1000 < maxWaitSec) {
    const response = await fetch(`${SARVAM_BASE_URL}/job/${encodeURIComponent(jobId)}/status`, {
      method: 'GET',
      headers: {
        'api-subscription-key': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to check job status: HTTP ${response.status}`);
    }

    const data = await response.json();
    const parsed = SarvamExtractionResponseSchema.parse(data);

    if (parsed.status === 'completed' || parsed.status === 'partially_completed') {
      return parsed;
    }

    if (parsed.status === 'failed' || parsed.status === 'rejected') {
      throw new Error(`Sarvam extraction job ${parsed.status}: ${parsed.error || 'Unknown error'}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Sarvam extraction job timed out after ${maxWaitSec} seconds.`);
}

export async function fetchJobResults(
  jobId: string,
  apiKey: string
): Promise<Record<string, unknown>> {
  const response = await fetch(`${SARVAM_BASE_URL}/job/${encodeURIComponent(jobId)}/results?format=json`, {
    method: 'GET',
    headers: {
      'api-subscription-key': apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Sarvam extraction results: HTTP ${response.status}`);
  }

  const data = await response.json();
  return data;
}

export async function createParseFallbackJob(
  file: Blob | File,
  apiKey: string,
  language: string = 'en-IN'
): Promise<string> {
  const formData = new FormData();
  formData.append('file', file, (file as File).name || 'document.pdf');
  formData.append('language', language);
  formData.append('output_format', 'md');

  const response = await fetch(`${SARVAM_BASE_URL}/job/parse`, {
    method: 'POST',
    headers: {
      'api-subscription-key': apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Sarvam parse fallback failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.job_id;
}
