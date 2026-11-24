export interface AttachResult {
  success: boolean;
  inputElement?: HTMLInputElement;
  isDropZone?: boolean;
  fileName: string;
  fileSize: number;
  error?: string;
}

/**
 * Finds the nearest or associated native <input type="file"> element.
 */
export function findAssociatedFileInput(element: HTMLElement): HTMLInputElement | null {
  if (element instanceof HTMLInputElement && element.type === 'file') {
    return element;
  }

  // 1. Check inside the element
  const innerInput = element.querySelector<HTMLInputElement>('input[type="file"]');
  if (innerInput) return innerInput;

  // 2. Check if element is a <label for="..."> pointing to an input
  const forAttr = element.getAttribute('for') || element.getAttribute('htmlfor');
  if (forAttr) {
    const pointedInput = element.ownerDocument.getElementById(forAttr);
    if (pointedInput instanceof HTMLInputElement && pointedInput.type === 'file') {
      return pointedInput;
    }
  }

  // 3. Check enclosing wrapper or dropzone container
  const wrapper = element.closest('[data-formpilot-dropzone-wrapper], .dropzone, [data-dropzone]');
  if (wrapper) {
    const wrappedInput = wrapper.querySelector<HTMLInputElement>('input[type="file"]');
    if (wrappedInput) return wrappedInput;
  }

  // 4. Check siblings or parent container
  const parent = element.parentElement;
  if (parent) {
    const siblingInput = parent.querySelector<HTMLInputElement>('input[type="file"]');
    if (siblingInput) return siblingInput;

    const grandparent = parent.parentElement;
    if (grandparent) {
      const gpInput = grandparent.querySelector<HTMLInputElement>('input[type="file"]');
      if (gpInput) return gpInput;
    }
  }

  return null;
}

/**
 * Attaches a File to an upload slot element.
 * 1. If an <input type="file"> exists, uses DataTransfer to assign input.files
 *    and dispatches native 'input' and 'change' events.
 * 2. If no <input type="file"> is present (e.g. pure JS dropzone),
 *    dispatches synthetic dragenter, dragover, and drop DragEvents with dataTransfer.
 */
export function attachFileToSlot(slotElement: HTMLElement, file: File): AttachResult {
  try {
    const doc = slotElement.ownerDocument;
    const win = doc.defaultView || window;

    // Build standard DataTransfer container
    const dataTransfer = new win.DataTransfer();
    dataTransfer.items.add(file);

    const fileInput = findAssociatedFileInput(slotElement);

    // 1. If native input exists, assign files and trigger change events
    if (fileInput) {
      try {
        fileInput.files = dataTransfer.files;
      } catch {
        const descriptor = Object.getOwnPropertyDescriptor(
          win.HTMLInputElement.prototype,
          'files'
        );
        if (descriptor?.set) {
          descriptor.set.call(fileInput, dataTransfer.files);
        } else {
          fileInput.files = dataTransfer.files;
        }
      }

      // Reset React's internal value tracker so synthetic change events fire React component listeners
      const tracker = (fileInput as any)._valueTracker;
      if (tracker && typeof tracker.setValue === 'function') {
        try {
          tracker.setValue('');
        } catch {}
      }

      fileInput.dispatchEvent(new win.Event('input', { bubbles: true, cancelable: true, composed: true }));
      fileInput.dispatchEvent(new win.Event('change', { bubbles: true, cancelable: true, composed: true }));
    }

    // 2. Dispatch synthetic DragEvents (dragenter, dragover, drop) to the slot / dropzone element
    try {
      const createDragEvent = (type: string) => {
        let evt: DragEvent;
        try {
          evt = new win.DragEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            dataTransfer,
          });
        } catch {
          evt = doc.createEvent('DragEvent');
          evt.initEvent(type, true, true);
        }
        try {
          Object.defineProperty(evt, 'dataTransfer', {
            value: dataTransfer,
            configurable: true,
            enumerable: true,
            writable: false,
          });
        } catch {
          // Safe fallback
        }
        return evt;
      };

      slotElement.dispatchEvent(createDragEvent('dragenter'));
      slotElement.dispatchEvent(createDragEvent('dragover'));
      slotElement.dispatchEvent(createDragEvent('drop'));
    } catch (dragErr) {
      console.warn('[FormPilot] DragEvent dispatch error:', dragErr);
    }

    return {
      success: true,
      inputElement: fileInput || undefined,
      isDropZone: !fileInput || slotElement !== fileInput,
      fileName: file.name,
      fileSize: file.size,
    };
  } catch (err: any) {
    console.error('[FormPilot] Failed to attach file to slot:', err);
    return {
      success: false,
      fileName: file.name,
      fileSize: file.size,
      error: err?.message || String(err),
    };
  }
}
