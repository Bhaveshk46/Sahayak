import * as pdfjsLib from 'pdfjs-dist';
import { extractFromTextWithRegex } from './regex';
import { DocumentType } from '../types/profile';

// Configure local bundled pdfjs worker (No CDN; MV3 compliant)
if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.mjs');
  } catch {
    // In test or non-extension environments
  }
}

export interface ExtractedField {
  key: string;
  value: string;
  confidence: number;
  source: 'sarvam' | 'regex' | 'manual' | 'gemini' | 'ocr';
}

/**
 * Extracts raw textual content from a PDF document using bundled pdfjs-dist.
 */
export async function extractTextFromPdf(fileOrBlob: Blob | File): Promise<string> {
  try {
    const arrayBuffer = await fileOrBlob.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      useSystemFonts: true,
      isEvalSupported: false,
    });

    const pdfDoc = await loadingTask.promise;
    let fullText = '';
    const maxPages = Math.min(pdfDoc.numPages, 10);

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .join(' ');
      fullText += pageText + '\n';
    }

    return fullText;
  } catch (err) {
    console.warn('[DocumentExtractor] PDF text extraction error:', err);
    return '';
  }
}

/**
 * Converts a Blob or File to a base64 string.
 */
async function blobToBase64(blob: Blob | File): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Extracts profile fields using Google Gemini Multimodal Vision API (BYOK).
 */
export async function extractWithGeminiVision(
  fileOrBlob: Blob | File,
  apiKey: string,
  model: string = 'gemini-2.5-flash'
): Promise<ExtractedField[]> {
  const results: ExtractedField[] = [];
  if (!apiKey || !apiKey.trim()) return results;

  try {
    const base64Data = await blobToBase64(fileOrBlob);
    const mimeType = fileOrBlob.type || 'image/jpeg';

    const prompt = `You are a high-accuracy document intelligence parser for identity, educational, and statutory documents (Aadhaar Card, PAN Card, Marksheets, Income Certificates, Bank Passbooks, Caste Certificates).
Inspect this document and extract all available information.
Map the extracted information strictly into a JSON object using ONLY these standardized keys:
- fullName: Full legal name of the individual
- dob: Date of birth (strictly formatted as YYYY-MM-DD or DD/MM/YYYY)
- gender: Gender (Male, Female, or Other)
- fatherName: Father's full name
- motherName: Mother's full name
- aadhaarNumber: 12-digit Aadhaar UID number (12 digits, no spaces)
- panNumber: 10-character alphanumeric PAN Card number (e.g. ABCDE1234F)
- address: Complete residential or permanent postal address
- pincode: 6-digit postal PIN code
- mobile: 10-digit mobile phone number
- email: Email address
- annualIncome: Total annual family or individual gross income in INR (numeric string only)
- category: Social caste/category (e.g. General, OBC, SC, ST, EWS)
- bankAccount: Bank account number
- ifsc: 11-character bank IFSC code
- course: Degree or course name
- institution: School, college, or university name
- marksPercent: Overall percentage or CGPA (e.g. 88.5)

Return ONLY valid JSON. If a field is not present or cannot be read with confidence, omit it. Do not invent or hallucinate any numbers or names.`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      }),
    });

    if (!response.ok) {
      console.warn(`[DocumentExtractor] Gemini Vision call failed: HTTP ${response.status}`);
      return results;
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return results;

    const cleaned = rawText.replace(/```json\s*|```\s*$/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) {
        if (v && typeof v === 'string' && v.trim()) {
          results.push({
            key: k,
            value: v.trim(),
            confidence: 0.95,
            source: 'gemini',
          });
        }
      }
    }
  } catch (err) {
    console.warn('[DocumentExtractor] Gemini Vision extraction error:', err);
  }

  return results;
}

/**
 * Extracts text from an image using offline Tesseract OCR.
 */
export async function extractTextWithTesseract(fileOrBlob: Blob | File): Promise<string> {
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');
    const ret = await worker.recognize(fileOrBlob);
    await worker.terminate();
    return ret.data.text || '';
  } catch (err) {
    console.warn('[DocumentExtractor] Tesseract OCR failed:', err);
    return '';
  }
}

/**
 * Main generalized document extraction pipeline:
 * Combines PDF text extraction, BYOK Gemini Vision, offline Tesseract OCR, and statutory RegEx heuristics.
 */
export async function extractDocumentData(
  fileOrBlob: Blob | File,
  fileName: string,
  _docType?: DocumentType
): Promise<ExtractedField[]> {
  const fieldMap = new Map<string, ExtractedField>();

  const addResult = (field: ExtractedField) => {
    const existing = fieldMap.get(field.key);
    if (!existing || field.confidence > existing.confidence) {
      fieldMap.set(field.key, field);
    }
  };

  // 1. Check if user configured Gemini API key for high-accuracy vision
  let geminiKey = '';
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const stored = await chrome.storage.local.get(['geminiApiKey']);
      geminiKey = stored.geminiApiKey || '';
    }
  } catch {
    // Non-chrome context
  }

  const isPdf = fileOrBlob.type === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
  const isImage = fileOrBlob.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp)$/i.test(fileName);
  const isText = fileOrBlob.type.startsWith('text/') || /\.(txt|csv|json)$/i.test(fileName);

  // 2. If Gemini Key is present, attempt Gemini Vision extraction first (super fast and covers all docs)
  if (geminiKey) {
    try {
      const geminiResults = await extractWithGeminiVision(fileOrBlob, geminiKey);
      for (const res of geminiResults) {
        addResult(res);
      }
    } catch (err) {
      console.warn('[DocumentExtractor] Gemini vision attempt failed:', err);
    }
  }

  // 3. Extract textual content locally
  let rawText = '';
  if (isPdf) {
    rawText = await extractTextFromPdf(fileOrBlob);
  } else if (isText) {
    try {
      rawText = await fileOrBlob.text();
    } catch {
      // Ignore
    }
  } else if (isImage && !geminiKey) {
    // Attempt local Tesseract OCR if no AI key configured
    rawText = await extractTextWithTesseract(fileOrBlob);
  }

  // 4. Run statutory RegEx extraction over extracted document text
  if (rawText && rawText.trim().length > 0) {
    const regexResults = extractFromTextWithRegex(rawText);
    for (const r of regexResults) {
      addResult({
        key: r.key,
        value: r.value,
        confidence: r.confidence,
        source: 'regex',
      });
    }
  }

  // 5. Also run RegEx over file name as fallback (e.g. Aadhaar_987654321012.pdf)
  if (fileName) {
    const fileNameResults = extractFromTextWithRegex(fileName);
    for (const r of fileNameResults) {
      // Lower confidence for filename hints so real document content takes precedence
      addResult({
        key: r.key,
        value: r.value,
        confidence: Math.min(r.confidence, 0.75),
        source: 'regex',
      });
    }
  }

  return Array.from(fieldMap.values());
}
