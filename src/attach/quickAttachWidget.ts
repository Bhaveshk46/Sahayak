import { DocumentMetadata, rankDocumentsForSlot, checkDocumentTypeMismatch, DocumentMismatchResult } from './documentRanker';
import { detectSlotSizeLimit } from '../compress/sizeParser';

export interface AttachDocumentResult {
  success: boolean;
  error?: string;
  wasCompressed?: boolean;
  originalSize?: number;
  compressedSize?: number;
  warning?: string;
}

export interface QuickAttachWidgetOptions {
  slotElement: HTMLElement;
  slotLabel: string;
  slotHint?: string;
  getDocuments: () => DocumentMetadata[];
  onAttachDocument: (
    doc: DocumentMetadata,
    targetLimitBytes?: number | null,
    onProgress?: (msg: string) => void
  ) => Promise<AttachDocumentResult>;
  onGuidedFallbackNeeded?: (slotElement: HTMLElement, doc: DocumentMetadata) => void;
}

export class QuickAttachWidget {
  public hostElement: HTMLElement;
  public shadowRoot: ShadowRoot;
  public slotElement: HTMLElement;
  public slotLabel: string;
  public slotHint: string;
  public detectedLimitKB: number | null = null;
  public selectedPresetLimitBytes: number | null = null;

  private getDocuments: () => DocumentMetadata[];
  private onAttachDocument: (
    doc: DocumentMetadata,
    targetLimitBytes?: number | null,
    onProgress?: (msg: string) => void
  ) => Promise<AttachDocumentResult>;
  private onGuidedFallbackNeeded?: (slotElement: HTMLElement, doc: DocumentMetadata) => void;

  private searchInput!: HTMLInputElement;
  private suggestionsList!: HTMLUListElement;
  private statusBadge!: HTMLElement;
  private warningModal!: HTMLElement;
  private isOpen: boolean = false;
  private pendingWarningDoc: DocumentMetadata | null = null;
  private attachedFileName: string | null = null;

  constructor(options: QuickAttachWidgetOptions) {
    this.slotElement = options.slotElement;
    this.slotLabel = options.slotLabel;
    this.slotHint = options.slotHint || '';
    this.getDocuments = options.getDocuments;
    this.onAttachDocument = options.onAttachDocument;
    this.onGuidedFallbackNeeded = options.onGuidedFallbackNeeded;

    // Detect size limit from slot DOM (Requirement 1)
    const limitDetection = detectSlotSizeLimit(this.slotElement);
    this.detectedLimitKB = limitDetection.maxSizeKB;
    this.selectedPresetLimitBytes = limitDetection.maxSizeBytes;

    // Create host element with isolation (starts hidden until valid position is calculated)
    const doc = this.slotElement.ownerDocument || document;
    this.hostElement = doc.createElement('div');
    this.hostElement.className = 'formpilot-quick-attach-host';
    this.hostElement.setAttribute('data-formpilot-widget', 'true');
    this.hostElement.style.position = 'absolute';
    this.hostElement.style.zIndex = '999999';
    this.hostElement.style.pointerEvents = 'auto';
    this.hostElement.style.display = 'none';

    // Open Shadow DOM so website styles cannot affect widget
    this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });

    this.render();
    this.updatePosition();
    this.setupListeners();
  }

  private render(): void {
    const style = document.createElement('style');
    style.textContent = `
      :host {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 11px;
        color: #1e293b;
        user-select: none;
      }
      .widget-container {
        display: flex;
        flex-direction: column;
        width: 240px;
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.06);
        overflow: visible;
        position: relative;
        transition: border-color 0.15s ease;
      }
      .widget-container.attached {
        border-color: #10b981;
        background: #f0fdf4;
      }
      .input-wrapper {
        display: flex;
        align-items: center;
        padding: 4px 6px;
        background: inherit;
        border-radius: 6px;
      }
      .icon {
        font-size: 11px;
        margin-right: 5px;
        color: #6366f1;
        flex-shrink: 0;
      }
      .search-input {
        width: 100%;
        border: none;
        outline: none;
        background: transparent;
        font-size: 11px;
        color: #0f172a;
      }
      .search-input::placeholder {
        color: #94a3b8;
      }
      .limit-tag {
        font-size: 8.5px;
        font-weight: 600;
        color: #4338ca;
        background: #e0e7ff;
        padding: 1px 4px;
        border-radius: 3px;
        white-space: nowrap;
        margin-left: 4px;
      }
      .preset-bar {
        display: flex;
        align-items: center;
        gap: 3px;
        padding: 2px 6px 3px 6px;
        background: #f8fafc;
        border-top: 1px solid #f1f5f9;
        font-size: 9px;
        color: #64748b;
      }
      .preset-btn {
        padding: 1px 4px;
        border-radius: 3px;
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #475569;
        cursor: pointer;
        font-size: 8.5px;
        line-height: 1.2;
      }
      .preset-btn.active {
        background: #6366f1;
        color: #ffffff;
        border-color: #6366f1;
        font-weight: 600;
      }
      .suggestions-list {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        max-height: 180px;
        overflow-y: auto;
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
        list-style: none;
        margin: 0;
        padding: 3px;
        display: none;
        z-index: 1000;
      }
      .suggestions-list.open {
        display: block;
      }
      .suggestion-item {
        padding: 6px 8px;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 2px;
        transition: background 0.1s ease;
      }
      .suggestion-item:hover, .suggestion-item.selected {
        background: #eef2ff;
      }
      .item-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .item-name {
        font-weight: 600;
        color: #1e293b;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 140px;
      }
      .item-badge {
        font-size: 9px;
        padding: 1px 4px;
        border-radius: 3px;
        font-weight: 600;
        background: #dbeafe;
        color: #1d4ed8;
      }
      .item-badge.recommended {
        background: #dcfce7;
        color: #15803d;
      }
      .item-meta {
        font-size: 9px;
        color: #64748b;
        font-family: monospace;
      }
      .empty-state {
        padding: 8px;
        text-align: center;
        color: #64748b;
        font-size: 10px;
      }
      .status-badge {
        display: none;
        padding: 3px 6px;
        font-size: 10px;
        font-weight: 600;
        border-radius: 4px;
        margin: 2px 4px 4px 4px;
        flex-direction: column;
        gap: 2px;
      }
      .status-badge.success {
        display: flex;
        background: #dcfce7;
        color: #166534;
      }
      .status-badge.progress {
        display: flex;
        background: #eff6ff;
        color: #1d4ed8;
      }
      .status-badge.error {
        display: flex;
        background: #fee2e2;
        color: #991b1b;
      }
      .sub-warning {
        font-size: 8.5px;
        color: #b45309;
        font-weight: normal;
        line-height: 1.2;
      }
      .undo-attach-btn {
        margin-left: 6px;
        padding: 1px 4px;
        font-size: 8.5px;
        font-weight: 600;
        background: #f1f5f9;
        color: #475569;
        border: 1px solid #cbd5e1;
        border-radius: 3px;
        cursor: pointer;
      }
      .undo-attach-btn:hover {
        background: #fee2e2;
        color: #991b1b;
        border-color: #fca5a5;
      }
      .warning-box {
        display: none;
        padding: 8px;
        background: #fffbeb;
        border: 1px solid #fde68a;
        border-radius: 6px;
        margin: 4px;
        font-size: 10px;
        color: #92400e;
      }
      .warning-box.visible {
        display: block;
      }
      .warning-actions {
        display: flex;
        justify-content: flex-end;
        gap: 6px;
        margin-top: 6px;
      }
      .btn {
        padding: 3px 8px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
        border: none;
      }
      .btn-cancel {
        background: #e2e8f0;
        color: #334155;
      }
      .btn-confirm {
        background: #f59e0b;
        color: #ffffff;
      }
    `;

    this.shadowRoot.appendChild(style);

    const container = document.createElement('div');
    container.className = 'widget-container';

    // Input row
    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'input-wrapper';

    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = '📎';

    this.searchInput = document.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.className = 'search-input';
    this.searchInput.placeholder = 'Type: photo, income...';
    this.searchInput.setAttribute('aria-label', 'Attach a document');
    this.searchInput.title = 'Attach a document';

    inputWrapper.appendChild(icon);
    inputWrapper.appendChild(this.searchInput);

    if (this.detectedLimitKB) {
      const limitBadge = document.createElement('span');
      limitBadge.className = 'limit-tag';
      limitBadge.textContent = `Max ${this.detectedLimitKB}K`;
      limitBadge.title = `Detected limit: ${this.detectedLimitKB} KB`;
      inputWrapper.appendChild(limitBadge);
    }

    container.appendChild(inputWrapper);

    // Preset selection when size limit is unknown (Requirement 1)
    if (!this.detectedLimitKB) {
      const presetBar = document.createElement('div');
      presetBar.className = 'preset-bar';
      const label = document.createElement('span');
      label.textContent = 'Limit:';
      presetBar.appendChild(label);

      const presets = [
        { label: '50K', bytes: 50 * 1024 },
        { label: '100K', bytes: 100 * 1024 },
        { label: '200K', bytes: 200 * 1024 },
        { label: '500K', bytes: 500 * 1024 },
        { label: 'None', bytes: null },
      ];

      presets.forEach(({ label: pLabel, bytes }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'preset-btn';
        btn.textContent = pLabel;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectedPresetLimitBytes = bytes;
          presetBar.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
        });
        presetBar.appendChild(btn);
      });

      container.appendChild(presetBar);
    }

    // Status badge (Progress, Green tick & compressed file name)
    this.statusBadge = document.createElement('div');
    this.statusBadge.className = 'status-badge';
    container.appendChild(this.statusBadge);

    // Warning confirmation container
    this.warningModal = document.createElement('div');
    this.warningModal.className = 'warning-box';
    container.appendChild(this.warningModal);

    // Suggestions dropdown
    this.suggestionsList = document.createElement('ul');
    this.suggestionsList.className = 'suggestions-list';
    container.appendChild(this.suggestionsList);

    this.shadowRoot.appendChild(container);
  }

  public focus(): void {
    this.searchInput.focus();
    this.openSuggestions();
  }

  public updatePosition(): void {
    if (!this.slotElement || !this.slotElement.isConnected) {
      this.hostElement.style.display = 'none';
      return;
    }

    const rect = this.slotElement.getBoundingClientRect();

    // Guard: If the slot element is hidden, detached, or has zero layout bounds (0x0 or unrendered origin 0,0),
    // keep the host element hidden so it never floats orphaned at (0, 0) in the top-left corner.
    if (
      rect.width === 0 ||
      rect.height === 0 ||
      (rect.top === 0 && rect.left === 0 && rect.bottom === 0)
    ) {
      this.hostElement.style.display = 'none';
      return;
    }

    const doc = this.slotElement.ownerDocument || document;
    const win = doc.defaultView || window;
    const scrollX = win.scrollX || win.pageXOffset || 0;
    const scrollY = win.scrollY || win.pageYOffset || 0;

    // Position next to the right edge of slot if space permits, or neatly pinned to top-right
    let left = rect.right + scrollX + 8;
    let top = rect.top + scrollY;

    // Check boundary overlap with window width
    if (rect.right + 250 > win.innerWidth) {
      left = Math.max(scrollX + 8, rect.left + scrollX);
      top = rect.bottom + scrollY + 4;
    }

    this.hostElement.style.left = `${left}px`;
    this.hostElement.style.top = `${top}px`;
    this.hostElement.style.display = 'block';
  }

  private setupListeners(): void {
    this.searchInput.addEventListener('focus', () => {
      this.openSuggestions();
    });

    this.searchInput.addEventListener('input', () => {
      this.renderSuggestions(this.searchInput.value);
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (!e.composedPath().includes(this.hostElement)) {
        this.closeSuggestions();
      }
    });

    // Keyboard navigation
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeSuggestions();
      } else if (e.key === 'Enter') {
        const firstOption = this.suggestionsList.querySelector('.suggestion-item') as HTMLElement;
        if (firstOption && (firstOption as any).__doc) {
          e.preventDefault();
          this.handleSelectDocument((firstOption as any).__doc);
        }
      }
    });
  }

  public openSuggestions(): void {
    this.isOpen = true;
    this.renderSuggestions(this.searchInput.value);
    this.suggestionsList.classList.add('open');
  }

  public closeSuggestions(): void {
    this.isOpen = false;
    this.suggestionsList.classList.remove('open');
  }

  private renderSuggestions(query: string): void {
    this.suggestionsList.innerHTML = '';
    const docs = this.getDocuments();

    if (docs.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty-state';
      empty.textContent = 'Vault empty. Upload files in Profile tab.';
      this.suggestionsList.appendChild(empty);
      return;
    }

    const ranked = rankDocumentsForSlot(docs, this.slotLabel, this.slotHint, query);

    for (const r of ranked) {
      const item = document.createElement('li');
      item.className = 'suggestion-item';
      (item as any).__doc = r.doc;

      const header = document.createElement('div');
      header.className = 'item-header';

      const name = document.createElement('span');
      name.className = 'item-name';
      name.textContent = r.doc.name;

      const badge = document.createElement('span');
      badge.className = `item-badge ${r.isTopRecommendation ? 'recommended' : ''}`;
      badge.textContent = r.isTopRecommendation ? '★ Recommended' : r.doc.type;

      header.appendChild(name);
      header.appendChild(badge);
      item.appendChild(header);

      const meta = document.createElement('div');
      meta.className = 'item-meta';
      const sizeKB = r.doc.sizeBytes ? Math.round(r.doc.sizeBytes / 1024) : 0;
      meta.textContent = `${r.doc.type} • ${sizeKB} KB`;
      item.appendChild(meta);

      item.addEventListener('click', () => {
        this.handleSelectDocument(r.doc);
      });

      this.suggestionsList.appendChild(item);
    }
  }

  private async handleSelectDocument(doc: DocumentMetadata): Promise<void> {
    this.closeSuggestions();

    // Requirement 5: Check wrong-document warning
    const mismatch = checkDocumentTypeMismatch(doc.type, this.slotLabel, this.slotHint);
    if (mismatch.mismatch) {
      this.promptMismatchConfirmation(doc, mismatch);
      return;
    }

    await this.performAttachment(doc);
  }

  private promptMismatchConfirmation(doc: DocumentMetadata, mismatch: DocumentMismatchResult): void {
    this.pendingWarningDoc = doc;
    this.warningModal.innerHTML = '';
    this.warningModal.classList.add('visible');

    const msg = document.createElement('div');
    msg.textContent = mismatch.warningMessage || 'Document type mismatch warning.';
    this.warningModal.appendChild(msg);

    const actions = document.createElement('div');
    actions.className = 'warning-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      this.warningModal.classList.remove('visible');
      this.pendingWarningDoc = null;
    });

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-confirm';
    confirmBtn.textContent = 'Attach Anyway';
    confirmBtn.addEventListener('click', async () => {
      this.warningModal.classList.remove('visible');
      if (this.pendingWarningDoc) {
        await this.performAttachment(this.pendingWarningDoc);
        this.pendingWarningDoc = null;
      }
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    this.warningModal.appendChild(actions);
  }

  private async performAttachment(doc: DocumentMetadata): Promise<void> {
    this.searchInput.value = 'Attaching...';
    this.statusBadge.className = 'status-badge progress';
    this.statusBadge.textContent = '⏳ Preparing file...';

    const res = await this.onAttachDocument(
      doc,
      this.selectedPresetLimitBytes,
      (progressStatus) => {
        this.statusBadge.className = 'status-badge progress';
        this.statusBadge.textContent = `⏳ ${progressStatus}`;
      }
    );

    if (res.success) {
      this.attachedFileName = doc.name;
      this.showSuccess(
        doc.name,
        res.wasCompressed,
        res.originalSize,
        res.compressedSize,
        res.warning
      );
    } else {
      this.searchInput.value = '';
      this.showError(res.error || 'Attach failed');
      if (this.onGuidedFallbackNeeded) {
        this.onGuidedFallbackNeeded(this.slotElement, doc);
      }
    }
  }

  public showSuccess(
    fileName: string,
    wasCompressed?: boolean,
    originalSize?: number,
    compressedSize?: number,
    warning?: string
  ): void {
    const container = this.shadowRoot.querySelector('.widget-container');
    container?.classList.add('attached');

    this.searchInput.value = '';
    this.searchInput.placeholder = fileName;

    this.statusBadge.className = 'status-badge success';
    this.statusBadge.innerHTML = '';

    const titleDiv = document.createElement('div');
    if (wasCompressed && originalSize && compressedSize) {
      const origKB = Math.round(originalSize / 1024);
      const newKB = Math.round(compressedSize / 1024);
      titleDiv.textContent = `✓ Attached: ${fileName} (Compressed ${origKB} KB -> ${newKB} KB)`;
    } else {
      titleDiv.textContent = `✓ Attached: ${fileName}`;
    }

    const undoBtn = document.createElement('button');
    undoBtn.className = 'undo-attach-btn';
    undoBtn.textContent = 'Undo';
    undoBtn.title = 'Remove attached file and clear slot';
    undoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.undoAttachment();
    });
    titleDiv.appendChild(undoBtn);

    this.statusBadge.appendChild(titleDiv);

    if (warning) {
      const warnDiv = document.createElement('div');
      warnDiv.className = 'sub-warning';
      warnDiv.textContent = `⚠️ ${warning}`;
      this.statusBadge.appendChild(warnDiv);
    }
  }

  public showError(errorText: string): void {
    this.statusBadge.className = 'status-badge error';
    this.statusBadge.innerHTML = '';

    const errDiv = document.createElement('div');
    if (
      errorText.toLowerCase().includes('storage is locked') ||
      errorText.toLowerCase().includes('vault is locked')
    ) {
      errDiv.textContent = '🔒 Vault is locked. Open Side Panel to unlock.';
    } else {
      errDiv.textContent = "Couldn't attach. Click here to choose the file.";
      errDiv.style.cursor = 'pointer';
      errDiv.addEventListener('click', () => {
        this.slotElement.click();
      });
    }
    this.statusBadge.appendChild(errDiv);
  }

  public isSuggestionsOpen(): boolean {
    return this.isOpen;
  }

  public getAttachedFileName(): string | null {
    return this.attachedFileName;
  }

  public undoAttachment(): void {
    const input = this.slotElement.matches('input[type="file"]')
      ? (this.slotElement as HTMLInputElement)
      : this.slotElement.querySelector<HTMLInputElement>('input[type="file"]');

    if (input) {
      input.value = '';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    this.attachedFileName = null;
    this.searchInput.placeholder = 'Type: photo, income...';
    this.searchInput.value = '';
    const container = this.shadowRoot.querySelector('.widget-container');
    container?.classList.remove('attached');
    this.statusBadge.className = 'status-badge';
    this.statusBadge.innerHTML = '';
  }

  public destroy(): void {
    if (this.hostElement && this.hostElement.parentNode) {
      this.hostElement.parentNode.removeChild(this.hostElement);
    }
  }
}
