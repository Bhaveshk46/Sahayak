export interface ImageCompressionOptions {
  maxSizeBytes: number;
  isPngOnly?: boolean;
  minQuality?: number;
  minScale?: number;
  onProgress?: (msg: string) => void;
}

export interface CompressionResult {
  success: boolean;
  file?: File;
  wasCompressed: boolean;
  originalSize: number;
  compressedSize: number;
  warning?: string;
  error?: string;
}

export function createRenderingCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  throw new Error('Canvas not supported in this environment');
}

/**
 * Loads an image Blob into an HTMLImageElement or ImageBitmap.
 */
export async function loadImageElement(blob: Blob): Promise<{ width: number; height: number; source: HTMLImageElement | ImageBitmap }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      return { width: bitmap.width, height: bitmap.height, source: bitmap };
    } catch {
      // Fallback to Image
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height, source: img });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for compression'));
    };
    img.src = url;
  });
}

/**
 * Encodes canvas to Blob with fallback support for OffscreenCanvas and HTMLCanvasElement.
 */
export async function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  mimeType: string,
  quality?: number
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return (canvas as OffscreenCanvas).convertToBlob({ type: mimeType, quality });
  }

  return new Promise((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob returned null'));
      },
      mimeType,
      quality
    );
  });
}

/**
 * Compresses an image file to stay within maxSizeBytes.
 * 1. Binary/step down search over JPEG quality.
 * 2. Downscales dimensions if quality reduction alone is insufficient.
 * 3. Warns on PNG-only slots rather than silently converting to JPEG.
 */
export async function compressImage(
  file: File | Blob,
  options: ImageCompressionOptions
): Promise<CompressionResult> {
  const originalSize = file.size;
  const fileName = file instanceof File ? file.name : 'image.jpg';

  // If already under limit, no compression needed
  if (originalSize <= options.maxSizeBytes) {
    const out = file instanceof File ? file : new File([file], fileName, { type: file.type || 'image/jpeg' });
    return {
      success: true,
      file: out,
      wasCompressed: false,
      originalSize,
      compressedSize: originalSize,
    };
  }

  options.onProgress?.(`Compressing image (${Math.round(originalSize / 1024)} KB -> ${Math.round(options.maxSizeBytes / 1024)} KB max)...`);

  const { width: origWidth, height: origHeight, source } = await loadImageElement(file);

  // Handle PNG-only slot constraint
  if (options.isPngOnly) {
    // PNG only supports lossless compression via dimension downscaling
    const scales = [0.85, 0.70, 0.55, 0.40, 0.30, 0.25];
    for (const scale of scales) {
      const curW = Math.max(1, Math.round(origWidth * scale));
      const curH = Math.max(1, Math.round(origHeight * scale));

      const canvas = createRenderingCanvas(curW, curH);
      canvas.width = curW;
      canvas.height = curH;

      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
      if (ctx) {
        ctx.drawImage(source as any, 0, 0, curW, curH);
      }

      const blob = await canvasToBlob(canvas, 'image/png');
      if (blob.size <= options.maxSizeBytes) {
        const out = new File([blob], fileName.replace(/\.[^/.]+$/, '') + '.png', { type: 'image/png' });
        return {
          success: true,
          file: out,
          wasCompressed: true,
          originalSize,
          compressedSize: blob.size,
          warning: 'Slot requires PNG only. Image downscaled to meet size limit.',
        };
      }
    }

    return {
      success: false,
      wasCompressed: false,
      originalSize,
      compressedSize: originalSize,
      error: 'Slot requires PNG format only. PNG cannot be compressed below limit without converting to JPEG.',
    };
  }

  // Lossy JPEG compression with Quality and Scale step-down
  const qualitySteps = [0.90, 0.80, 0.70, 0.60, 0.50, 0.40, 0.30, 0.20];
  const scaleSteps = [1.0, 0.85, 0.70, 0.55, 0.45, 0.35, 0.25];

  let bestBlob: Blob | null = null;

  for (const scale of scaleSteps) {
    const curW = Math.max(1, Math.round(origWidth * scale));
    const curH = Math.max(1, Math.round(origHeight * scale));

    const canvas = createRenderingCanvas(curW, curH);
    canvas.width = curW;
    canvas.height = curH;

    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (ctx) {
      // Fill white background for transparent PNG converted to JPEG
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, curW, curH);
      ctx.drawImage(source as any, 0, 0, curW, curH);
    }

    for (const q of qualitySteps) {
      const blob = await canvasToBlob(canvas, 'image/jpeg', q);
      bestBlob = blob;

      if (blob.size <= options.maxSizeBytes) {
        const outName = fileName.replace(/\.[^/.]+$/, '') + '.jpg';
        const compressedFile = new File([blob], outName, { type: 'image/jpeg' });
        return {
          success: true,
          file: compressedFile,
          wasCompressed: true,
          originalSize,
          compressedSize: blob.size,
        };
      }
    }
  }

  // Failed to reach limit even at minimum scale & quality
  return {
    success: false,
    wasCompressed: false,
    originalSize,
    compressedSize: bestBlob ? bestBlob.size : originalSize,
    error: `Cannot compress image below ${Math.round(options.maxSizeBytes / 1024)} KB without severe quality degradation.`,
  };
}
