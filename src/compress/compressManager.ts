import { detectSlotSizeLimit, SlotSizeLimitDetection } from './sizeParser';
import { compressImage, CompressionResult } from './imageCompressor';
import { compressPdf } from './pdfCompressor';

export interface CompressManagerOptions {
  slotElement: HTMLElement;
  presetLimitBytes?: number | null;
  onProgress?: (status: string) => void;
}

export interface CompressManagerResult {
  success: boolean;
  file: File;
  wasCompressed: boolean;
  originalSize: number;
  compressedSize: number;
  warning?: string;
  error?: string;
  detectedLimitKB?: number | null;
}

/**
 * High-level compression manager.
 * Detects limits from the slot or falls back to preset, then compresses images or PDFs if needed.
 */
export async function compressFileIfNeeded(
  file: File,
  options: CompressManagerOptions
): Promise<CompressManagerResult> {
  const originalSize = file.size;

  // 1. Detect limit from slot DOM
  const slotDetection: SlotSizeLimitDetection = detectSlotSizeLimit(options.slotElement);
  const targetLimitBytes = slotDetection.maxSizeBytes || options.presetLimitBytes || null;

  // If no size limit is specified or detected, or file is already smaller than limit
  if (!targetLimitBytes || originalSize <= targetLimitBytes) {
    return {
      success: true,
      file,
      wasCompressed: false,
      originalSize,
      compressedSize: originalSize,
      detectedLimitKB: slotDetection.maxSizeKB,
    };
  }

  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name);

  if (isImage) {
    const res: CompressionResult = await compressImage(file, {
      maxSizeBytes: targetLimitBytes,
      isPngOnly: slotDetection.isPngOnly,
      onProgress: options.onProgress,
    });

    if (res.success && res.file) {
      return {
        success: true,
        file: res.file,
        wasCompressed: res.wasCompressed,
        originalSize: res.originalSize,
        compressedSize: res.compressedSize,
        warning: res.warning,
        detectedLimitKB: slotDetection.maxSizeKB,
      };
    } else {
      return {
        success: false,
        file,
        wasCompressed: false,
        originalSize,
        compressedSize: res.compressedSize,
        error: res.error || 'Failed to compress image below target limit.',
        detectedLimitKB: slotDetection.maxSizeKB,
      };
    }
  }

  if (isPdf) {
    const res: CompressionResult = await compressPdf(file, {
      maxSizeBytes: targetLimitBytes,
      onProgress: options.onProgress,
    });

    if (res.success && res.file) {
      return {
        success: true,
        file: res.file,
        wasCompressed: res.wasCompressed,
        originalSize: res.originalSize,
        compressedSize: res.compressedSize,
        warning: res.warning,
        detectedLimitKB: slotDetection.maxSizeKB,
      };
    } else {
      return {
        success: false,
        file,
        wasCompressed: false,
        originalSize,
        compressedSize: res.compressedSize,
        error: res.error || 'Failed to compress PDF below target limit.',
        detectedLimitKB: slotDetection.maxSizeKB,
      };
    }
  }

  // Non-image / non-pdf (e.g. text/plain, zip) cannot be lossily compressed
  return {
    success: false,
    file,
    wasCompressed: false,
    originalSize,
    compressedSize: originalSize,
    error: `Unsupported format for local lossy compression (${file.type || 'unknown'}).`,
    detectedLimitKB: slotDetection.maxSizeKB,
  };
}
