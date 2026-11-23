import { DocumentType } from '../types/profile';

export interface ExpiryCheckResult {
  isExpired: boolean;
  docType: DocumentType;
  docName: string;
  detectedDate?: string;
  ageYears: number;
  validityLimitYears: number;
  reason: string;
}

export interface ExpiryConfig {
  incomeCertValidityYears: number; // default: 1 year
  casteCertValidityYears?: number; // default: Infinity (lifetime) unless NCL
}

export const DEFAULT_EXPIRY_CONFIG: ExpiryConfig = {
  incomeCertValidityYears: 1,
  casteCertValidityYears: 99,
};

/**
 * Extracts a year or date string from document names or text metadata.
 * Examples:
 *   "Income_Certificate_2021.pdf" -> 2021
 *   "Tehsildar_Cert_15-08-2022.pdf" -> 2022
 *   "Cert_FY_2020-21.pdf" -> 2020
 */
export function extractDateFromDocumentMetadata(docName: string, addedAt?: number): { year: number; dateString?: string } {
  // 1. Look for full dates in name (DD-MM-YYYY or YYYY-MM-DD)
  const fullDateMatch = docName.match(/(\d{2})[-/.](\d{2})[-/.](\d{4})/);
  if (fullDateMatch) {
    const yr = parseInt(fullDateMatch[3], 10);
    return { year: yr, dateString: `${fullDateMatch[1]}-${fullDateMatch[2]}-${fullDateMatch[3]}` };
  }

  // 2. Look for 4-digit years (2000 to 2099)
  const yearMatch = docName.match(/\b(20[0-2]\d)\b/);
  if (yearMatch) {
    const yr = parseInt(yearMatch[1], 10);
    return { year: yr, dateString: `${yr}` };
  }

  // 3. Fallback to addedAt timestamp
  if (addedAt && addedAt > 0) {
    const dt = new Date(addedAt);
    return { year: dt.getFullYear(), dateString: dt.toISOString().split('T')[0] };
  }

  const currentYear = new Date().getFullYear();
  return { year: currentYear, dateString: `${currentYear}` };
}

/**
 * Checks whether a document has exceeded statutory validity (e.g., stale income certificate).
 */
export function checkDocumentExpiry(
  doc: { name: string; type: DocumentType; addedAt?: number },
  config: ExpiryConfig = DEFAULT_EXPIRY_CONFIG,
  referenceDate: Date = new Date()
): ExpiryCheckResult {
  const currentYear = referenceDate.getFullYear();
  const { year: detectedYear, dateString } = extractDateFromDocumentMetadata(doc.name, doc.addedAt);
  const ageYears = Math.max(0, currentYear - detectedYear);

  if (doc.type === 'income_certificate') {
    const limit = config.incomeCertValidityYears ?? 1;
    const isExpired = ageYears > limit;

    return {
      isExpired,
      docType: doc.type,
      docName: doc.name,
      detectedDate: dateString,
      ageYears,
      validityLimitYears: limit,
      reason: isExpired
        ? `Income certificate is from ${detectedYear} (${ageYears} year(s) old). Government portals require certificates from the current financial year (valid for ${limit} year).`
        : `Income certificate is valid (from ${detectedYear}, within ${limit} year limit).`,
    };
  }

  return {
    isExpired: false,
    docType: doc.type,
    docName: doc.name,
    detectedDate: dateString,
    ageYears,
    validityLimitYears: 99,
    reason: 'Document has indefinite or lifetime statutory validity.',
  };
}
