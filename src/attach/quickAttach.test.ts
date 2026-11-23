import { describe, it, expect, vi } from 'vitest';
import {
  rankDocumentsForSlot,
  inferExpectedDocumentType,
  checkDocumentTypeMismatch,
  DocumentMetadata,
} from './documentRanker';
import { attachFileToSlot, findAssociatedFileInput } from './fileAttacher';
import { QuickAttachWidget } from './quickAttachWidget';

describe('M6 Quick-Attach Test Suite', () => {
  // Test Document Fixtures
  const testDocs: DocumentMetadata[] = [
    {
      id: 'doc_photo_1',
      name: 'Passport_Photo_WhiteBG.jpg',
      type: 'passport_photo',
      tags: ['photo', 'passport', 'face'],
      sizeBytes: 154200,
    },
    {
      id: 'doc_aadhaar_1',
      name: 'Aadhaar_Card_Masked.pdf',
      type: 'aadhaar',
      tags: ['aadhaar', 'uidai', 'identity'],
      sizeBytes: 345000,
    },
    {
      id: 'doc_pan_1',
      name: 'PAN_Card_ABCDE1234F.pdf',
      type: 'pan',
      tags: ['pan', 'income tax'],
      sizeBytes: 280000,
    },
    {
      id: 'doc_income_1',
      name: 'Tehsildar_Income_Certificate_2024.pdf',
      type: 'income_certificate',
      tags: ['income', 'certificate', 'tahsildar'],
      sizeBytes: 520000,
    },
    {
      id: 'doc_caste_1',
      name: 'OBC_Caste_Certificate.pdf',
      type: 'caste_certificate',
      tags: ['caste', 'category', 'obc'],
      sizeBytes: 410000,
    },
    {
      id: 'doc_marksheet_1',
      name: 'Class_10_SSC_Marksheet.pdf',
      type: 'marksheet',
      tags: ['10th', 'marksheet', 'ssc'],
      sizeBytes: 680000,
    },
  ];

  describe('1. Document Ranking via Fuse.js & Slot Label Prioritization', () => {
    it('ranks passport photo first when slot is labelled "Passport Size Photograph" before typing', () => {
      const ranked = rankDocumentsForSlot(testDocs, 'Passport Size Photograph', '', '');
      expect(ranked.length).toBeGreaterThan(0);
      expect(ranked[0].doc.id).toBe('doc_photo_1');
      expect(ranked[0].doc.type).toBe('passport_photo');
      expect(ranked[0].isTopRecommendation).toBe(true);
      expect(ranked[0].typeMatchesSlot).toBe(true);
    });

    it('ranks Aadhaar card first when slot is labelled "Upload Aadhaar Card / Identity"', () => {
      const ranked = rankDocumentsForSlot(testDocs, 'Upload Aadhaar Card / Identity', '', '');
      expect(ranked.length).toBeGreaterThan(0);
      expect(ranked[0].doc.id).toBe('doc_aadhaar_1');
      expect(ranked[0].doc.type).toBe('aadhaar');
      expect(ranked[0].isTopRecommendation).toBe(true);
    });

    it('ranks Income Certificate first for "Annual Income Proof / Tahsildar Certificate"', () => {
      const ranked = rankDocumentsForSlot(testDocs, 'Annual Income Proof', 'Tahsildar Certificate', '');
      expect(ranked.length).toBeGreaterThan(0);
      expect(ranked[0].doc.id).toBe('doc_income_1');
      expect(ranked[0].doc.type).toBe('income_certificate');
      expect(ranked[0].isTopRecommendation).toBe(true);
    });

    it('correctly filters and ranks when user types a search query', () => {
      // User types "pan" into an arbitrary slot
      const ranked = rankDocumentsForSlot(testDocs, 'Upload Document', '', 'pan');
      expect(ranked.length).toBeGreaterThan(0);
      expect(ranked[0].doc.id).toBe('doc_pan_1');
      expect(ranked[0].doc.type).toBe('pan');
    });

    it('filters by tags and partial keywords (e.g., "ssc" or "10th")', () => {
      const ranked = rankDocumentsForSlot(testDocs, 'Document Slot', '', 'ssc');
      expect(ranked.length).toBeGreaterThan(0);
      expect(ranked[0].doc.id).toBe('doc_marksheet_1');
      expect(ranked[0].doc.type).toBe('marksheet');
    });

    it('handles Hindi & Marathi multilingual slot labels', () => {
      // Hindi label for photo
      const hindiRanked = rankDocumentsForSlot(testDocs, 'पासपोर्ट फोटो अपलोड करें', '', '');
      expect(hindiRanked[0].doc.type).toBe('passport_photo');

      // Marathi label for income certificate (उत्पन्नाचा दाखला)
      const marathiIncomeRanked = rankDocumentsForSlot(testDocs, 'उत्पन्नाचा दाखला जोडा', '', '');
      expect(marathiIncomeRanked[0].doc.type).toBe('income_certificate');

      // Hindi label for Aadhaar
      const hindiAadhaarRanked = rankDocumentsForSlot(testDocs, 'आधार कार्ड की प्रति', '', '');
      expect(hindiAadhaarRanked[0].doc.type).toBe('aadhaar');
    });

    it('infers expected document type accurately', () => {
      const res1 = inferExpectedDocumentType('Passport Size Photo');
      expect(res1.type).toBe('passport_photo');
      expect(res1.confidence).toBeGreaterThanOrEqual(0.9);

      const res2 = inferExpectedDocumentType('जातीचा दाखला');
      expect(res2.type).toBe('caste_certificate');

      const res3 = inferExpectedDocumentType('Some random file');
      expect(res3.type).toBe('other');
    });
  });

  describe('2. Wrong-Document Warning Check', () => {
    it('detects mismatch when PAN card is chosen for a Passport Photo slot', () => {
      const mismatch = checkDocumentTypeMismatch('pan', 'Recent Passport Size Photograph', 'Max 200KB');
      expect(mismatch.mismatch).toBe(true);
      expect(mismatch.expectedType).toBe('passport_photo');
      expect(mismatch.warningMessage).toContain('Passport Photo');
      expect(mismatch.warningMessage).toContain('PAN Card');
    });

    it('detects mismatch when Caste Certificate is chosen for an Aadhaar slot', () => {
      const mismatch = checkDocumentTypeMismatch('caste_certificate', 'Aadhaar Card Copy');
      expect(mismatch.mismatch).toBe(true);
      expect(mismatch.expectedType).toBe('aadhaar');
      expect(mismatch.warningMessage).toContain('Aadhaar Card');
    });

    it('does not flag mismatch when chosen document matches expected slot type', () => {
      const mismatch = checkDocumentTypeMismatch('income_certificate', 'Income Certificate (Latest Financial Year)');
      expect(mismatch.mismatch).toBe(false);
    });

    it('does not flag mismatch when slot label is ambiguous or generic', () => {
      const mismatch = checkDocumentTypeMismatch('pan', 'Supporting Document (Optional)');
      expect(mismatch.mismatch).toBe(false);
    });
  });

  describe('3. File Attachment Logic (DataTransfer & Events)', () => {
    it('findAssociatedFileInput finds native and wrapped file inputs', () => {
      const wrapper = document.createElement('div');
      const input = document.createElement('input');
      input.type = 'file';
      wrapper.appendChild(input);

      const found = findAssociatedFileInput(wrapper);
      expect(found).toBe(input);
    });

    it('attaches File to standard <input type="file"> and fires input and change events', () => {
      const input = document.createElement('input');
      input.type = 'file';
      document.body.appendChild(input);

      let inputFired = false;
      let changeFired = false;
      input.addEventListener('input', () => {
        inputFired = true;
      });
      input.addEventListener('change', () => {
        changeFired = true;
      });

      const file = new File(['dummy photo data'], 'photo.jpg', { type: 'image/jpeg' });
      const result = attachFileToSlot(input, file);

      expect(result.success).toBe(true);
      expect(result.fileName).toBe('photo.jpg');
      expect(input.files).toBeDefined();
      expect(input.files?.length).toBe(1);
      expect(input.files?.[0].name).toBe('photo.jpg');
      expect(inputFired).toBe(true);
      expect(changeFired).toBe(true);

      input.remove();
    });

    it('locates and attaches to hidden file input inside dropzone wrapper', () => {
      const wrapper = document.createElement('div');
      wrapper.setAttribute('data-formpilot-dropzone-wrapper', 'true');

      const dropzone = document.createElement('div');
      dropzone.setAttribute('data-formpilot-dropzone', 'true');

      const hiddenInput = document.createElement('input');
      hiddenInput.type = 'file';
      hiddenInput.className = 'hidden';

      wrapper.appendChild(dropzone);
      wrapper.appendChild(hiddenInput);
      document.body.appendChild(wrapper);

      let changeFired = false;
      hiddenInput.addEventListener('change', () => {
        changeFired = true;
      });

      const file = new File(['income cert content'], 'income_cert.pdf', { type: 'application/pdf' });
      const result = attachFileToSlot(dropzone, file);

      expect(result.success).toBe(true);
      expect(result.inputElement).toBe(hiddenInput);
      expect(hiddenInput.files?.length).toBe(1);
      expect(hiddenInput.files?.[0].name).toBe('income_cert.pdf');
      expect(changeFired).toBe(true);

      wrapper.remove();
    });

    it('dispatches synthetic DragEvents (dragenter, dragover, drop) for pure dropzone without file input', () => {
      const dropzone = document.createElement('div');
      dropzone.className = 'custom-js-dropzone';
      document.body.appendChild(dropzone);

      let dropReceived = false;
      let droppedFileName = '';

      dropzone.addEventListener('drop', (e: any) => {
        dropReceived = true;
        if (e.dataTransfer?.files?.length) {
          droppedFileName = e.dataTransfer.files[0].name;
        }
      });

      const file = new File(['sample doc'], 'document.pdf', { type: 'application/pdf' });
      const result = attachFileToSlot(dropzone, file);

      expect(result.success).toBe(true);
      expect(result.isDropZone).toBe(true);
      expect(dropReceived).toBe(true);
      expect(droppedFileName).toBe('document.pdf');

      dropzone.remove();
    });
  });

  describe('4. QuickAttachWidget Shadow DOM & Lifecycle', () => {
    it('creates an isolated Shadow DOM container with "Type to attach..." placeholder', () => {
      const slot = document.createElement('div');
      document.body.appendChild(slot);

      const attachMock = vi.fn().mockResolvedValue({ success: true });
      const widget = new QuickAttachWidget({
        slotElement: slot,
        slotLabel: 'Photograph',
        getDocuments: () => testDocs,
        onAttachDocument: attachMock,
      });

      expect(widget.shadowRoot).toBeDefined();
      expect(widget.shadowRoot.mode).toBe('open');

      const input = widget.shadowRoot.querySelector('input.search-input') as HTMLInputElement;
      expect(input).toBeDefined();
      expect(input.placeholder).toBe('Type to attach...');

      widget.destroy();
      slot.remove();
    });

    it('displays top recommendation badge in suggestions', () => {
      const slot = document.createElement('div');
      document.body.appendChild(slot);

      const attachMock = vi.fn().mockResolvedValue({ success: true });
      const widget = new QuickAttachWidget({
        slotElement: slot,
        slotLabel: 'Passport Photo',
        getDocuments: () => testDocs,
        onAttachDocument: attachMock,
      });

      widget.focus();

      const items = widget.shadowRoot.querySelectorAll('.suggestion-item');
      expect(items.length).toBe(testDocs.length);

      // Top recommendation should have recommended badge
      const topBadge = items[0].querySelector('.item-badge.recommended');
      expect(topBadge).toBeDefined();
      expect(topBadge?.textContent).toBe('★ Recommended');

      widget.destroy();
      slot.remove();
    });

    it('shows wrong-document warning modal and requires confirmation when mismatched doc selected', async () => {
      const slot = document.createElement('div');
      document.body.appendChild(slot);

      const attachMock = vi.fn().mockResolvedValue({ success: true });
      const widget = new QuickAttachWidget({
        slotElement: slot,
        slotLabel: 'Passport Size Photograph',
        getDocuments: () => testDocs,
        onAttachDocument: attachMock,
      });

      widget.focus();

      // Find the PAN card item in the suggestions list (which is a mismatch for a photo slot)
      const panItem = Array.from(widget.shadowRoot.querySelectorAll('.suggestion-item')).find((el) =>
        el.textContent?.includes('PAN_Card')
      ) as HTMLElement;

      expect(panItem).toBeDefined();

      // Click mismatched item
      panItem.click();

      // Attach should NOT have been called yet! (Requirement 5)
      expect(attachMock).not.toHaveBeenCalled();

      // Warning modal should be visible inside Shadow DOM
      const warningModal = widget.shadowRoot.querySelector('.warning-box') as HTMLElement;
      expect(warningModal).toBeDefined();
      expect(warningModal.classList.contains('visible')).toBe(true);
      expect(warningModal.textContent).toContain('Document Type Mismatch');

      // Click "Attach Anyway" in warning modal
      const confirmBtn = warningModal.querySelector('.btn-confirm') as HTMLButtonElement;
      expect(confirmBtn).toBeDefined();
      confirmBtn.click();

      // Now attach should be called with the PAN doc
      expect(attachMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'doc_pan_1',
          type: 'pan',
        }),
        null,
        expect.any(Function)
      );

      widget.destroy();
      slot.remove();
    });

    it('shows green tick and filename after successful attachment', async () => {
      const slot = document.createElement('div');
      document.body.appendChild(slot);

      const attachMock = vi.fn().mockResolvedValue({ success: true });
      const widget = new QuickAttachWidget({
        slotElement: slot,
        slotLabel: 'Passport Size Photograph',
        getDocuments: () => testDocs,
        onAttachDocument: attachMock,
      });

      widget.focus();

      // Select passport photo (top recommendation)
      const photoItem = widget.shadowRoot.querySelector('.suggestion-item') as HTMLElement;
      photoItem.click();

      // Wait microtask for async attach to complete
      await new Promise((r) => setTimeout(r, 20));

      // Should show success status badge with green tick and filename
      const statusBadge = widget.shadowRoot.querySelector('.status-badge') as HTMLElement;
      expect(statusBadge.classList.contains('success')).toBe(true);
      expect(statusBadge.textContent).toContain('✓');
      expect(statusBadge.textContent).toContain('Passport_Photo_WhiteBG.jpg');

      widget.destroy();
      slot.remove();
    });
  });
});
