import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import { CompressionResult, canvasToBlob, createRenderingCanvas } from './imageCompressor';

// Configure local bundled pdfjs worker (No CDN; MV3 compliant)
if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.mjs');
  } catch {
    // In test or non-extension environments
  }
}

export interface PdfCompressionOptions {
  maxSizeBytes: number;
  onProgress?: (msg: string) => void;
}

/**
 * Compresses a PDF file by rendering pages with pdfjs-dist and rebuilding with pdf-lib.
 * Steps down rendering scale and JPEG quality until the output is within maxSizeBytes.
 */
export async function compressPdf(
  file: File | Blob,
  options: PdfCompressionOptions
): Promise<CompressionResult> {
  const originalSize = file.size;
  const fileName = file instanceof File ? file.name : 'document.pdf';

  if (originalSize <= options.maxSizeBytes) {
    const out = file instanceof File ? file : new File([file], fileName, { type: 'application/pdf' });
    return {
      success: true,
      file: out,
      wasCompressed: false,
      originalSize,
      compressedSize: originalSize,
    };
  }

  options.onProgress?.(`Inspecting PDF pages (${Math.round(originalSize / 1024)} KB)...`);

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
    isEvalSupported: false,
  });

  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;

  // Step-down scale and quality ladder
  const stepPairs = [
    { scale: 1.2, quality: 0.75 },
    { scale: 1.0, quality: 0.65 },
    { scale: 0.85, quality: 0.50 },
    { scale: 0.70, quality: 0.40 },
    { scale: 0.55, quality: 0.30 },
    { scale: 0.40, quality: 0.22 },
  ];

  let bestSize = originalSize;

  for (let idx = 0; idx < stepPairs.length; idx++) {
    const pair = stepPairs[idx];
    options.onProgress?.(`Compressing PDF: rendering ${totalPages} page(s) at ${Math.round(pair.scale * 100)}% scale...`);

    const newPdf = await PDFDocument.create();

    for (let pNum = 1; pNum <= totalPages; pNum++) {
      options.onProgress?.(`Compressing PDF: processing page ${pNum}/${totalPages}...`);

      const page = await pdfDoc.getPage(pNum);
      const viewport = page.getViewport({ scale: pair.scale });

      const curW = Math.max(1, Math.round(viewport.width));
      const curH = Math.max(1, Math.round(viewport.height));

      const canvas = createRenderingCanvas(curW, curH);
      canvas.width = curW;
      canvas.height = curH;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get 2D rendering context for PDF compression');

      // Render PDF page to canvas
      await (page.render({ canvasContext: ctx as any, viewport }) as any).promise;

      // Convert page canvas to JPEG bytes
      const pageJpegBlob = await canvasToBlob(canvas, 'image/jpeg', pair.quality);
      const pageJpegBytes = new Uint8Array(await pageJpegBlob.arrayBuffer());

      // Embed JPEG page image into pdf-lib document
      const embeddedJpg = await newPdf.embedJpg(pageJpegBytes);
      const newPage = newPdf.addPage([embeddedJpg.width, embeddedJpg.height]);
      newPage.drawImage(embeddedJpg, {
        x: 0,
        y: 0,
        width: embeddedJpg.width,
        height: embeddedJpg.height,
      });
    }

    const compressedPdfBytes = await newPdf.save();
    bestSize = compressedPdfBytes.byteLength;

    if (bestSize <= options.maxSizeBytes) {
      const compressedBlob = new Blob([compressedPdfBytes as any], { type: 'application/pdf' });
      const compressedFile = new File([compressedBlob], fileName, { type: 'application/pdf' });

      return {
        success: true,
        file: compressedFile,
        wasCompressed: true,
        originalSize,
        compressedSize: bestSize,
        warning: 'Note: Flattened PDF renders pages as images; text becomes non-selectable.',
      };
    }
  }

  // Failed to compress below limit even at smallest step
  return {
    success: false,
    wasCompressed: false,
    originalSize,
    compressedSize: bestSize,
    error: `Cannot compress ${totalPages}-page PDF below ${Math.round(options.maxSizeBytes / 1024)} KB without severe degradation.`,
  };
}
