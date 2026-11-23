import { describe, it, expect, vi, beforeAll } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { detectSlotSizeLimit } from './sizeParser';
import { compressImage } from './imageCompressor';
import { compressPdf } from './pdfCompressor';
import { compressFileIfNeeded } from './compressManager';

describe('M7 Local Compression Suite', () => {
  describe('1. Size Parsing & Slot Limit Detection', () => {
    it('detects 200 KB limit and non-PNG-only from dropzone wrapper', () => {
      const wrapper = document.createElement('div');
      wrapper.setAttribute('data-formpilot-dropzone-wrapper', 'true');

      const hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = 'Max size 200 KB, PDF only';
      wrapper.appendChild(hint);

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf';
      wrapper.appendChild(input);

      const detection = detectSlotSizeLimit(wrapper);
      expect(detection.maxSizeKB).toBe(200);
      expect(detection.maxSizeBytes).toBe(204800);
      expect(detection.isPngOnly).toBe(false);
      expect(detection.acceptedTypes).toContain('.pdf');
    });

    it('detects PNG-only slot constraint from accept attribute', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.png, image/png';
      input.setAttribute('data-hint', 'Upload signature (under 50KB)');

      const detection = detectSlotSizeLimit(input);
      expect(detection.maxSizeKB).toBe(50);
      expect(detection.maxSizeBytes).toBe(51200);
      expect(detection.isPngOnly).toBe(true);
    });

    it('returns null limit when no size text is present', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.title = 'Upload Resume';

      const detection = detectSlotSizeLimit(input);
      expect(detection.maxSizeBytes).toBeNull();
      expect(detection.maxSizeKB).toBeNull();
    });
  });

  describe('2. Image Step-Down Compression Loop', () => {
    // Helper to create a fake image blob of specific byte size
    const createFakeImageBlob = (sizeBytes: number, type = 'image/jpeg'): File => {
      const content = new Uint8Array(sizeBytes);
      return new File([content], 'sample_photo.jpg', { type });
    };

    const valid1x1JpegBase64 =
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
    const validJpegBytes = Uint8Array.from(atob(valid1x1JpegBase64), (c) => c.charCodeAt(0));

    beforeAll(() => {
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
        return {
          canvas: this,
          fillStyle: '',
          fillRect: vi.fn(),
          drawImage: vi.fn(),
          save: vi.fn(),
          restore: vi.fn(),
          transform: vi.fn(),
          scale: vi.fn(),
          translate: vi.fn(),
          beginPath: vi.fn(),
          closePath: vi.fn(),
          stroke: vi.fn(),
          fill: vi.fn(),
          clip: vi.fn(),
          clearRect: vi.fn(),
          getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
          setTransform: vi.fn(),
          resetTransform: vi.fn(),
        } as any;
      };

      HTMLCanvasElement.prototype.toBlob = function (callback, type) {
        const fakeBlob = new Blob([validJpegBytes], { type: type || 'image/jpeg' });
        callback(fakeBlob);
      };
    });

    it('returns file unchanged if already smaller than limit', async () => {
      const smallFile = createFakeImageBlob(40 * 1024); // 40 KB
      const res = await compressImage(smallFile, { maxSizeBytes: 50 * 1024 });

      expect(res.success).toBe(true);
      expect(res.wasCompressed).toBe(false);
      expect(res.compressedSize).toBe(40 * 1024);
      expect(res.file).toBe(smallFile);
    });

    it('steps down image quality and dimensions to meet max size', async () => {
      // Mock loadImageElement and canvasToBlob
      const originalFile = createFakeImageBlob(1024 * 1024); // 1 MB photo
      const targetLimit = 50 * 1024; // 50 KB limit

      // Mock canvas with custom toBlob behavior that shrinks with lower quality
      const origToBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
        // Quality between 0.2 and 0.9. Simulate encoded output size proportional to quality
        const simulatedSize = Math.round(150 * 1024 * (quality || 0.8) * (this.width / 1000));
        const fakeBlob = new Blob([new Uint8Array(simulatedSize)], { type: type || 'image/jpeg' });
        callback(fakeBlob);
      };

      // Mock createImageBitmap
      const origCreateImageBitmap = globalThis.createImageBitmap;
      (globalThis as any).createImageBitmap = vi.fn().mockResolvedValue({
        width: 1200,
        height: 1600,
        close: vi.fn(),
      });

      const progressSteps: string[] = [];
      const res = await compressImage(originalFile, {
        maxSizeBytes: targetLimit,
        onProgress: (msg) => progressSteps.push(msg),
      });

      expect(res.success).toBe(true);
      expect(res.wasCompressed).toBe(true);
      expect(res.compressedSize).toBeLessThanOrEqual(targetLimit);
      expect(progressSteps.length).toBeGreaterThan(0);

      // Restore mocks
      HTMLCanvasElement.prototype.toBlob = origToBlob;
      globalThis.createImageBitmap = origCreateImageBitmap;
    });

    it('fails gracefully and reports error when target limit is impossibly low (failure path)', async () => {
      const originalFile = createFakeImageBlob(500 * 1024);
      const impossibleLimit = 500; // 500 bytes!

      // Mock canvas toBlob that never reaches under 500 bytes
      const origToBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback, _type) {
        const fakeBlob = new Blob([new Uint8Array(5000)], { type: 'image/jpeg' });
        callback(fakeBlob);
      };

      (globalThis as any).createImageBitmap = vi.fn().mockResolvedValue({
        width: 800,
        height: 600,
        close: vi.fn(),
      });

      const res = await compressImage(originalFile, { maxSizeBytes: impossibleLimit });

      expect(res.success).toBe(false);
      expect(res.wasCompressed).toBe(false);
      expect(res.error).toContain('Cannot compress image below');

      HTMLCanvasElement.prototype.toBlob = origToBlob;
    });

    it('warns and rejects lossy conversion on PNG-only slots if size exceeds limit', async () => {
      const pngFile = new File([new Uint8Array(300 * 1024)], 'signature.png', { type: 'image/png' });

      // Mock canvas toBlob for PNG that stays at 120 KB (above 50 KB limit)
      const origToBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback, _type) {
        const fakeBlob = new Blob([new Uint8Array(120 * 1024)], { type: 'image/png' });
        callback(fakeBlob);
      };

      (globalThis as any).createImageBitmap = vi.fn().mockResolvedValue({
        width: 600,
        height: 300,
        close: vi.fn(),
      });

      const res = await compressImage(pngFile, {
        maxSizeBytes: 50 * 1024,
        isPngOnly: true,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('PNG format only');

      HTMLCanvasElement.prototype.toBlob = origToBlob;
    });
  });

  describe('3. Compression Manager & Presets', () => {
    it('uses user preset limit when slot DOM does not specify size limit', async () => {
      const slotElement = document.createElement('div');
      const largeFile = new File([new Uint8Array(800 * 1024)], 'photo.jpg', { type: 'image/jpeg' });

      // Mock toBlob to compress down to 80 KB
      const origToBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback, _type) {
        const fakeBlob = new Blob([new Uint8Array(80 * 1024)], { type: 'image/jpeg' });
        callback(fakeBlob);
      };

      (globalThis as any).createImageBitmap = vi.fn().mockResolvedValue({
        width: 800,
        height: 600,
        close: vi.fn(),
      });

      // User chose 100 KB preset (100 * 1024)
      const res = await compressFileIfNeeded(largeFile, {
        slotElement,
        presetLimitBytes: 100 * 1024,
      });

      expect(res.success).toBe(true);
      expect(res.wasCompressed).toBe(true);
      expect(res.compressedSize).toBe(80 * 1024);

      HTMLCanvasElement.prototype.toBlob = origToBlob;
    });

    it('keeps original file instance unchanged if compression is skipped', async () => {
      const slotElement = document.createElement('div');
      const smallFile = new File([new Uint8Array(30 * 1024)], 'cert.pdf', { type: 'application/pdf' });

      const res = await compressFileIfNeeded(smallFile, {
        slotElement,
        presetLimitBytes: 200 * 1024,
      });

      expect(res.success).toBe(true);
      expect(res.wasCompressed).toBe(false);
      expect(res.file).toBe(smallFile);
      expect(res.originalSize).toBe(30 * 1024);
    });
  });

  describe('4. PDF Compression & Warning Verification', () => {
    it('returns PDF file unchanged if already under limit', async () => {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([300, 400]);
      const pdfBytes = await pdfDoc.save();
      const smallPdf = new File([pdfBytes as any], 'small.pdf', { type: 'application/pdf' });

      const res = await compressPdf(smallPdf, { maxSizeBytes: 500 * 1024 });
      expect(res.success).toBe(true);
      expect(res.wasCompressed).toBe(false);
      expect(res.file).toBe(smallPdf);
    });

    it('reports failure when PDF limit is impossibly low', async () => {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([300, 400]);
      const pdfBytes = await pdfDoc.save();
      const pdfFile = new File([pdfBytes as any], 'test.pdf', { type: 'application/pdf' });

      // Impossible limit of 10 bytes
      const res = await compressPdf(pdfFile, { maxSizeBytes: 10 });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Cannot compress');
    });
  });
});
