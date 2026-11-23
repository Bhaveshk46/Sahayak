export interface NameComparisonResult {
  match: boolean;
  confidence: number;
  isInitialsMatch: boolean;
  reason: string;
}

const HONORIFICS = new Set([
  'MR', 'MRS', 'MS', 'MISS', 'MASTER', 'DR', 'PROF',
  'SHRI', 'SHREE', 'SMT', 'SHRIMATI', 'KUMAR', 'KUMARI',
  'MD', 'MOHD', 'MOHAMMED', 'LATE'
]);

/**
 * Normalizes a full name into cleaned, uppercase tokens without honorifics or punctuation.
 */
export function normalizeNameTokens(name: string): string[] {
  if (!name || typeof name !== 'string') return [];

  // Remove dots, commas, hyphens, slashes, extra whitespace
  const cleaned = name
    .toUpperCase()
    .replace(/[.,\-_/\\()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const rawTokens = cleaned.split(' ').filter(Boolean);

  // Filter out common honorifics
  const tokens = rawTokens.filter((token) => !HONORIFICS.has(token));

  return tokens.length > 0 ? tokens : rawTokens;
}

/**
 * Compares two person names across Indian statutory documents.
 * Normalizes case, removes honorifics, handles token reordering (e.g., surname first),
 * expands initials, and detects typos/mismatches.
 */
export function compareNames(nameA: string, nameB: string): NameComparisonResult {
  if (!nameA || !nameB) {
    return {
      match: false,
      confidence: 0,
      isInitialsMatch: false,
      reason: 'One or both names are missing or empty',
    };
  }

  const tokensA = normalizeNameTokens(nameA);
  const tokensB = normalizeNameTokens(nameB);

  const strA = tokensA.join(' ');
  const strB = tokensB.join(' ');

  // 1. Exact string match after token normalization
  if (strA === strB) {
    return {
      match: true,
      confidence: 1.0,
      isInitialsMatch: false,
      reason: 'Exact match',
    };
  }

  // 2. Token set match (reordered tokens, e.g. "SHARMA ADITI RAMESH" vs "ADITI RAMESH SHARMA")
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  if (tokensA.length === tokensB.length && tokensA.every((t) => setB.has(t))) {
    return {
      match: true,
      confidence: 0.98,
      isInitialsMatch: false,
      reason: 'Name components match with inverted/reordered word order',
    };
  }

  // 3. Initials expansion check (e.g. "A R SHARMA" vs "ADITI RAMESH SHARMA" or "SHARMA A R")
  // Check surname match: usually the last or first word in Indian names
  const lastA = tokensA[tokensA.length - 1];
  const lastB = tokensB[tokensB.length - 1];
  const firstA = tokensA[0];
  const firstB = tokensB[0];
  const surnameMatch = lastA === lastB || firstA === firstB || setB.has(lastA) || setA.has(lastB);

  if (!surnameMatch) {
    return {
      match: false,
      confidence: 0.2,
      isInitialsMatch: false,
      reason: `Surname/family name mismatch: "${nameA}" vs "${nameB}"`,
    };
  }

  // Compare tokens sequentially or by matching initials
  let matchedCount = 0;
  let initialsMatched = 0;
  let hasContradiction = false;
  let contradictionReason = '';

  const shorter = tokensA.length <= tokensB.length ? tokensA : tokensB;
  const longer = tokensA.length <= tokensB.length ? tokensB : tokensA;

  // Track matched indices in longer
  const usedLongerIndices = new Set<number>();

  for (const sToken of shorter) {
    let foundIndex = -1;

    // Check exact full word match first
    for (let i = 0; i < longer.length; i++) {
      if (!usedLongerIndices.has(i) && longer[i] === sToken) {
        foundIndex = i;
        matchedCount++;
        break;
      }
    }

    // If not found and sToken is a single-letter initial (e.g. "A" or "R")
    if (foundIndex === -1 && sToken.length === 1) {
      for (let i = 0; i < longer.length; i++) {
        if (!usedLongerIndices.has(i) && longer[i].startsWith(sToken)) {
          foundIndex = i;
          initialsMatched++;
          break;
        }
      }
    }

    if (foundIndex !== -1) {
      usedLongerIndices.add(foundIndex);
    } else if (sToken.length > 1) {
      // Check Levenshtein / typo on full words (e.g., ADITII vs ADITI)
      let typoFound = false;
      for (let i = 0; i < longer.length; i++) {
        if (!usedLongerIndices.has(i) && levenshteinDistance(sToken, longer[i]) <= 1) {
          usedLongerIndices.add(i);
          matchedCount++;
          typoFound = true;
          break;
        }
      }

      if (!typoFound) {
        hasContradiction = true;
        contradictionReason = `Mismatched component: "${sToken}" in "${nameA}" does not match "${nameB}"`;
      }
    }
  }

  if (hasContradiction) {
    return {
      match: false,
      confidence: 0.35,
      isInitialsMatch: false,
      reason: contradictionReason,
    };
  }

  const totalMatched = matchedCount + initialsMatched;
  if (totalMatched >= Math.min(tokensA.length, tokensB.length)) {
    const isInitials = initialsMatched > 0;
    const confidence = isInitials ? 0.88 : 0.95;
    return {
      match: true,
      confidence,
      isInitialsMatch: isInitials,
      reason: isInitials
        ? `Initials match ("${nameA}" matches "${nameB}")`
        : 'All components match',
    };
  }

  return {
    match: false,
    confidence: 0.4,
    isInitialsMatch: false,
    reason: `Incomplete name match: "${nameA}" vs "${nameB}"`,
  };
}

/**
 * Levenshtein distance for minor typo tolerance.
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

