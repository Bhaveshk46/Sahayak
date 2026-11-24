import Fuse from 'fuse.js';
import { DocumentType } from '../types/profile';
import { DOCUMENT_SLOT_SYNONYMS, normalizeLabel } from '../decide/heuristicMatcher';

export interface DocumentMetadata {
  id: string;
  name: string;
  type: DocumentType;
  tags?: string[];
  sizeBytes?: number;
}

export interface RankedDocument {
  doc: DocumentMetadata;
  score: number; // Higher is better (0.0 to 1.0)
  isTopRecommendation: boolean;
  typeMatchesSlot: boolean;
}

export interface DocumentMismatchResult {
  mismatch: boolean;
  expectedType?: DocumentType;
  confidence: number;
  warningMessage?: string;
}

/**
 * Infers the intended DocumentType from an upload slot's label and hint.
 */
export function inferExpectedDocumentType(slotLabel: string, slotHint: string = ''): { type: DocumentType; confidence: number } {
  const norm = normalizeLabel(`${slotLabel} ${slotHint}`);

  for (const [docType, synonyms] of Object.entries(DOCUMENT_SLOT_SYNONYMS) as [DocumentType, string[]][]) {
    if (docType === 'other') continue;
    for (const syn of synonyms) {
      if (norm.includes(syn)) {
        return { type: docType, confidence: 0.95 };
      }
    }
  }

  return { type: 'other', confidence: 0.2 };
}

export function formatDocumentTypeName(docType: DocumentType): string {
  const map: Record<DocumentType, string> = {
    aadhaar: 'Aadhaar Card',
    pan: 'PAN Card',
    income_certificate: 'Income Certificate',
    caste_certificate: 'Caste Certificate',
    marksheet: 'Marksheet',
    passport_photo: 'Passport Photo',
    signature: 'Signature',
    bank_passbook: 'Bank Passbook',
    other: 'Document',
  };
  return map[docType] || docType.replace(/_/g, ' ');
}

/**
 * Checks whether a chosen document type conflicts with the slot's intended document type.
 * Triggers Requirement 5 wrong-document warning.
 */
export function checkDocumentTypeMismatch(
  chosenType: DocumentType,
  slotLabel: string,
  slotHint: string = ''
): DocumentMismatchResult {
  const { type: expectedType, confidence } = inferExpectedDocumentType(slotLabel, slotHint);

  // If slot has a clear specific expectation (confidence >= 0.7) and types differ
  if (expectedType !== 'other' && chosenType !== 'other' && expectedType !== chosenType && confidence >= 0.7) {
    const formattedExpected = formatDocumentTypeName(expectedType);
    const formattedChosen = formatDocumentTypeName(chosenType);
    return {
      mismatch: true,
      expectedType,
      confidence,
      warningMessage: `⚠️ Document Type Mismatch: Selected file is a "${formattedChosen}", but this slot requests a "${formattedExpected}". Attach anyway?`,
    };
  }

  return { mismatch: false, expectedType, confidence };
}

/**
 * Ranks stored documents for a given slot.
 * Uses slot's label to prioritize expected document types even before typing (Requirement 2).
 * Further filters and ranks as user types into the search box using Fuse.js.
 */
export function rankDocumentsForSlot(
  documents: DocumentMetadata[],
  slotLabel: string,
  slotHint: string = '',
  query: string = ''
): RankedDocument[] {
  if (!documents || documents.length === 0) {
    return [];
  }

  const { type: expectedType, confidence: expectedConfidence } = inferExpectedDocumentType(slotLabel, slotHint);
  const cleanQuery = query.trim().toLowerCase();

  // If user entered a search query, run Fuse.js over name, type, and tags
  if (cleanQuery) {
    const fuse = new Fuse(documents, {
      keys: [
        { name: 'name', weight: 0.4 },
        { name: 'type', weight: 0.3 },
        { name: 'tags', weight: 0.4 },
      ],
      includeScore: true,
      threshold: 0.55,
      ignoreLocation: true,
    });

    const searchResults = fuse.search(cleanQuery);
    const scoreMap = new Map<string, number>();

    for (const res of searchResults) {
      // Fuse score: 0 is best match, 1 is worst match
      scoreMap.set(res.item.id, 1 - (res.score || 0));
    }

    const scoredDocs: RankedDocument[] = documents.map((doc) => {
      const typeMatches = expectedType !== 'other' && doc.type === expectedType;
      let baseScore = scoreMap.get(doc.id) || 0;

      // Direct exact match on custom tags or filename gives instant high priority
      const hasDirectTagMatch = doc.tags?.some((t) => {
        const normT = t.trim().toLowerCase();
        return normT === cleanQuery || normT.includes(cleanQuery) || cleanQuery.includes(normT);
      });
      const hasDirectNameMatch = doc.name.toLowerCase().includes(cleanQuery);

      if (hasDirectTagMatch) {
        baseScore = Math.max(baseScore, 0.95);
      } else if (hasDirectNameMatch) {
        baseScore = Math.max(baseScore, 0.85);
      }

      // Boost document if its type matches slot
      if (typeMatches) {
        baseScore += 0.3;
      }

      return {
        doc,
        score: Math.min(1.0, Math.max(0.0, baseScore)),
        isTopRecommendation: false,
        typeMatchesSlot: typeMatches,
      };
    });

    scoredDocs.sort((a, b) => b.score - a.score);

    if (scoredDocs.length > 0 && scoredDocs[0].score > 0.3) {
      scoredDocs[0].isTopRecommendation = true;
    }

    return scoredDocs;
  }

  // No search query: Rank by slot label affinity (expectedType first!)
  const ranked: RankedDocument[] = documents.map((doc) => {
    const typeMatches = expectedType !== 'other' && doc.type === expectedType;
    let score = 0.5;

    if (typeMatches) {
      score = 0.95;
    } else if (doc.type === 'other') {
      score = 0.4;
    } else {
      score = 0.3;
    }

    return {
      doc,
      score,
      isTopRecommendation: false,
      typeMatchesSlot: typeMatches,
    };
  });

  ranked.sort((a, b) => b.score - a.score);

  if (ranked.length > 0 && ranked[0].typeMatchesSlot && expectedConfidence >= 0.7) {
    ranked[0].isTopRecommendation = true;
  }

  return ranked;
}
