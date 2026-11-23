import { QuickAttachWidget } from './quickAttachWidget';
import { attachFileToSlot } from './fileAttacher';
import { DocumentMetadata } from './documentRanker';
import { hexToBuffer } from '../storage/crypto';
import { compressFileIfNeeded } from '../compress/compressManager';

export class QuickAttachManager {
  private document: Document;
  private widgets: Map<HTMLElement, QuickAttachWidget> = new Map();
  private storedDocuments: DocumentMetadata[] = [];
  private isVisible: boolean = true;
  private lastInteractedSlot: HTMLElement | null = null;
  private mutationObserver: MutationObserver | null = null;
  private repositionThrottle: ReturnType<typeof setTimeout> | null = null;

  constructor(doc: Document = document) {
    this.document = doc;
  }

  public init(): void {
    this.fetchStoredDocumentsMetadata();
    this.scanAndMountWidgets();
    this.setupGlobalListeners();
    this.setupMutationObserver();
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.widgets.forEach((widget) => {
      widget.hostElement.style.display = visible ? 'block' : 'none';
      if (visible) widget.updatePosition();
    });
  }

  public setStoredDocuments(docs: DocumentMetadata[]): void {
    this.storedDocuments = docs;
  }

  private fetchStoredDocumentsMetadata(): void {
    try {
      chrome.runtime.sendMessage({ type: 'GET_STORED_DOCUMENTS_METADATA' }, (response) => {
        if (response?.success && Array.isArray(response.documents)) {
          this.storedDocuments = response.documents;
        }
      });
    } catch {
      // In tests or non-extension environment
    }
  }

  /**
   * Discovers upload slots across the document (native file inputs, styled dropzones, and wrappers).
   */
  public findUploadSlotElements(): Array<{ element: HTMLElement; label: string; hint: string }> {
    const slots: Array<{ element: HTMLElement; label: string; hint: string }> = [];
    const seenElements = new Set<HTMLElement>();

    // 1. Dropzones and custom dropzone wrappers
    const dropzones = this.document.querySelectorAll<HTMLElement>(
      '[data-formpilot-dropzone], [data-formpilot-dropzone-wrapper], .dropzone, [data-dropzone]'
    );
    dropzones.forEach((dz) => {
      const target = (dz.querySelector('[data-formpilot-dropzone]') || dz) as HTMLElement;
      if (!seenElements.has(target)) {
        seenElements.add(target);
        if (dz !== target) seenElements.add(dz);

        // Mark any nested <input type="file"> as already covered
        target.querySelectorAll<HTMLElement>('input[type="file"]').forEach((inp) => seenElements.add(inp));
        if (dz !== target) {
          dz.querySelectorAll<HTMLElement>('input[type="file"]').forEach((inp) => seenElements.add(inp));
        }

        const label = this.resolveLabelForElement(target);
        const hint = this.resolveHintForElement(target);
        slots.push({ element: target, label, hint });
      }
    });

    // 2. Native <input type="file">
    const fileInputs = this.document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    fileInputs.forEach((input) => {
      // If already covered by a dropzone slot above, skip
      if (seenElements.has(input)) {
        return;
      }

      // Check if input is enclosed in an already-seen dropzone or wrapper
      const wrapper = input.closest<HTMLElement>(
        '[data-formpilot-dropzone-wrapper], [data-formpilot-dropzone], .dropzone, [data-dropzone], label'
      );
      if (wrapper && seenElements.has(wrapper)) {
        seenElements.add(input);
        return;
      }

      let visibleElement: HTMLElement = input;
      const isHidden =
        input.classList.contains('hidden') ||
        input.style.display === 'none' ||
        input.style.visibility === 'hidden' ||
        (input.offsetWidth === 0 && input.offsetHeight === 0);

      if (isHidden) {
        if (wrapper) {
          visibleElement = wrapper;
        } else if (input.id) {
          const associatedLabel = this.document.querySelector<HTMLElement>(`label[for="${input.id}"]`);
          if (associatedLabel) {
            visibleElement = associatedLabel;
          }
        }
      }

      // Check if visibleElement has already been assigned a widget
      if (seenElements.has(visibleElement)) {
        seenElements.add(input);
        return;
      }

      // Check if visibleElement actually exists in the visual layout
      const rect = visibleElement.getBoundingClientRect();
      const hasLayout =
        rect.width > 0 ||
        rect.height > 0 ||
        visibleElement.offsetWidth > 0 ||
        visibleElement.offsetHeight > 0;

      if (!hasLayout && isHidden) {
        // Completely hidden element with no visible anchor on page
        return;
      }

      seenElements.add(visibleElement);
      seenElements.add(input);
      const label = this.resolveLabelForElement(input);
      const hint = this.resolveHintForElement(input);
      slots.push({ element: visibleElement, label, hint });
    });

    return slots;
  }

  private resolveLabelForElement(element: HTMLElement): string {
    // Check parent wrapper label
    const wrapper = element.closest('[data-formpilot-dropzone-wrapper]');
    if (wrapper) {
      const labelEl = wrapper.querySelector('label');
      if (labelEl && labelEl.textContent?.trim()) {
        return labelEl.textContent.trim();
      }
    }

    // Check associated <label for="...">
    const id = element.id;
    if (id) {
      const label = this.document.querySelector(`label[for="${id}"]`);
      if (label && label.textContent?.trim()) {
        return label.textContent.trim();
      }
    }

    // Check aria-label or placeholder
    const aria = element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.getAttribute('title');
    if (aria) return aria;

    // Check name attribute
    const name = element.getAttribute('name');
    if (name) return name.replace(/[_-]/g, ' ');

    return 'Upload Document';
  }

  private resolveHintForElement(element: HTMLElement): string {
    const wrapper = element.closest('[data-formpilot-dropzone-wrapper]');
    if (wrapper) {
      const hintEl = wrapper.querySelector('.hint, [class*="hint"], small');
      if (hintEl && hintEl.textContent?.trim()) {
        return hintEl.textContent.trim();
      }
    }
    return element.getAttribute('data-hint') || '';
  }

  public scanAndMountWidgets(): void {
    const slots = this.findUploadSlotElements();
    const currentSlotElements = new Set(slots.map((s) => s.element));

    // Remove obsolete widgets
    this.widgets.forEach((widget, element) => {
      if (!currentSlotElements.has(element) || !element.isConnected) {
        widget.destroy();
        this.widgets.delete(element);
      }
    });

    // Mount new widgets
    slots.forEach(({ element, label, hint }) => {
      if (!this.widgets.has(element)) {
        const widget = new QuickAttachWidget({
          slotElement: element,
          slotLabel: label,
          slotHint: hint,
          getDocuments: () => this.storedDocuments,
          onAttachDocument: async (doc, targetLimit, onProgress) =>
            this.handleAttachDocument(element, doc, targetLimit, onProgress),
          onGuidedFallbackNeeded: (el, doc) => this.handleGuidedFallback(el, doc),
        });

        const targetContainer = this.document.body || this.document.documentElement;
        targetContainer.appendChild(widget.hostElement);
        this.widgets.set(element, widget);
        widget.updatePosition();

        if (!this.isVisible) {
          widget.hostElement.style.display = 'none';
        }
      }
    });
  }

  private async handleAttachDocument(
    slotElement: HTMLElement,
    docMeta: DocumentMetadata,
    targetLimitBytes?: number | null,
    onProgress?: (msg: string) => void
  ): Promise<{
    success: boolean;
    error?: string;
    wasCompressed?: boolean;
    originalSize?: number;
    compressedSize?: number;
    warning?: string;
  }> {
    try {
      // 1. Fetch decrypted document blob bytes from background on-demand (Rule 8)
      onProgress?.('Decrypting document from vault...');
      const resp = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: 'GET_DECRYPTED_DOCUMENT_FOR_ATTACH',
            payload: { docId: docMeta.id },
          },
          resolve
        );
      });

      if (!resp?.success || !resp.blobBytesHex) {
        throw new Error(resp?.error || 'Document decryption failed or vault is locked.');
      }

      const rawBytes = hexToBuffer(resp.blobBytesHex);
      const fileBlob = new Blob([rawBytes.buffer as ArrayBuffer], { type: resp.mimeType || 'application/octet-stream' });
      const originalFile = new File([fileBlob], resp.name || docMeta.name, {
        type: resp.mimeType || 'application/octet-stream',
        lastModified: Date.now(),
      });

      // 2. Compress file if needed (M7)
      const compressRes = await compressFileIfNeeded(originalFile, {
        slotElement,
        presetLimitBytes: targetLimitBytes,
        onProgress,
      });

      if (!compressRes.success) {
        return {
          success: false,
          error: compressRes.error,
          wasCompressed: false,
          originalSize: compressRes.originalSize,
          compressedSize: compressRes.compressedSize,
        };
      }

      // 3. Attach file via DataTransfer and events
      onProgress?.('Attaching file to form slot...');
      const attachRes = attachFileToSlot(slotElement, compressRes.file);

      return {
        success: attachRes.success,
        error: attachRes.error,
        wasCompressed: compressRes.wasCompressed,
        originalSize: compressRes.originalSize,
        compressedSize: compressRes.compressedSize,
        warning: compressRes.warning,
      };
    } catch (err: any) {
      console.error('[QuickAttachManager] Error attaching file:', err);
      return { success: false, error: err?.message || String(err) };
    }
  }

  private handleGuidedFallback(slotElement: HTMLElement, doc: DocumentMetadata): void {
    // Requirement 4: Fall back to guided mode - highlight slot and notify side panel
    slotElement.style.outline = '2px solid #ef4444';
    slotElement.style.outlineOffset = '2px';

    try {
      chrome.runtime.sendMessage({
        type: 'GUIDED_FALLBACK_TRIGGERED',
        payload: {
          slotLabel: this.resolveLabelForElement(slotElement),
          documentId: doc.id,
          documentName: doc.name,
          documentType: doc.type,
        },
      });
    } catch {
      // Safe in test environment
    }
  }

  public focusLastSlotWidget(): void {
    if (this.lastInteractedSlot && this.widgets.has(this.lastInteractedSlot)) {
      this.widgets.get(this.lastInteractedSlot)?.focus();
    } else if (this.widgets.size > 0) {
      // Focus first widget if no last slot
      const firstWidget = Array.from(this.widgets.values())[0];
      firstWidget.focus();
    }
  }

  private setupGlobalListeners(): void {
    const win = this.document.defaultView || window;

    // Track user clicks on upload slots
    this.document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      const slot = target.closest<HTMLElement>(
        '[data-formpilot-dropzone], [data-formpilot-dropzone-wrapper], input[type="file"]'
      );
      if (slot && this.widgets.has(slot)) {
        this.lastInteractedSlot = slot;
      }
    });

    // Keyboard shortcut (Alt+A) to focus quick-attach box (Requirement 7)
    this.document.addEventListener('keydown', (e) => {
      if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        this.focusLastSlotWidget();
      }
    });

    // Real-time repositioning on scroll and resize
    const handleReposition = () => {
      if (this.repositionThrottle) return;
      this.repositionThrottle = setTimeout(() => {
        this.repositionThrottle = null;
        if (this.isVisible) {
          this.widgets.forEach((w) => w.updatePosition());
        }
      }, 50);
    };

    win.addEventListener('scroll', handleReposition, { passive: true });
    win.addEventListener('resize', handleReposition, { passive: true });
  }

  private setupMutationObserver(): void {
    this.mutationObserver = new MutationObserver(() => {
      this.scanAndMountWidgets();
      this.widgets.forEach((w) => w.updatePosition());
    });

    const target = this.document.body || this.document.documentElement;
    if (target) {
      this.mutationObserver.observe(target, {
        childList: true,
        subtree: true,
      });
    }
  }

  public destroy(): void {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }
    this.widgets.forEach((w) => w.destroy());
    this.widgets.clear();
  }
}
