import React, { useState, useEffect } from 'react';
import {
  FileText,
  Upload,
  Trash2,
  Eye,
  EyeOff,
  X,
  Plus,
  Shield,
  FileCheck,
  Sparkles,
  Loader2,
  Tag,
} from 'lucide-react';
import {
  isStorageUnlocked,
  getAllStoredDocuments,
  deleteDocument,
  saveDocument,
  updateDocumentMetadata,
  saveProfileRecord,
  getAllDecryptedProfileRecords,
  deleteProfileRecord,
  getDocumentDecryptedBlob,
} from '../../src/storage/db';
import {
  DocumentType,
  ProfileRecord,
  StoredDocument,
} from '../../src/types/profile';
import { autoClassifyDocument } from '../../src/extract/classifier';
import { extractDocumentData } from '../../src/extract/documentExtractor';

const FRIENDLY_DOC_TITLES: Record<string, string> = {
  aadhaar: 'Aadhaar Card',
  pan: 'PAN Card',
  marksheet: 'Marksheet',
  income_certificate: 'Income Certificate',
  caste_certificate: 'Caste Certificate',
  passport_photo: 'Passport Photo',
  signature: 'Signature',
  bank_passbook: 'Bank Passbook',
  other: 'General Document',
};

const FRIENDLY_FIELD_TITLES: Record<string, string> = {
  fullName: 'Full Legal Name',
  dob: 'Date of Birth',
  gender: 'Gender',
  fatherName: "Father's Name",
  motherName: "Mother's Name",
  email: 'Email Address',
  mobile: 'Phone Number',
  address: 'Home Address',
  pincode: 'Postal PIN Code',
  aadhaarNumber: 'Aadhaar (UID) Number',
  panNumber: 'PAN Card Number',
  annualIncome: 'Annual Family Income',
  category: 'Social Category',
  bankAccount: 'Bank Account Number',
  ifsc: 'Bank IFSC Code',
  course: 'Course / Degree',
  institution: 'School / College Name',
  marksPercent: 'Marks / Percentage',
};

export const DocumentsAndProfileView: React.FC<{
  onProfileUpdated?: () => void;
}> = ({ onProfileUpdated }) => {
  const [activeTab, setActiveTab] = useState<'docs' | 'details' | 'upload'>('docs');
  const [documents, setDocuments] = useState<Array<Omit<StoredDocument, 'encryptedBlob'>>>([]);
  const [profileRecords, setProfileRecords] = useState<ProfileRecord[]>([]);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  // Editing state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Add detail modal
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newDetailKey, setNewDetailKey] = useState<string>('fullName');
  const [newDetailValue, setNewDetailValue] = useState<string>('');

interface UploadQueueItem {
  file: File;
  name: string;
  docType: DocumentType;
  tagsInput: string;
}

  // Upload queue
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [isProcessingUpload, setIsProcessingUpload] = useState<boolean>(false);
  const [extractingDocId, setExtractingDocId] = useState<string | null>(null);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);

  // Edit document metadata (name, type, custom tags)
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editDocName, setEditDocName] = useState<string>('');
  const [editDocType, setEditDocType] = useState<DocumentType>('other');
  const [editDocTags, setEditDocTags] = useState<string>('');

  // Document preview modal
  const [previewDoc, setPreviewDoc] = useState<{
    id: string;
    name: string;
    type: string;
    mimeType: string;
    url: string;
  } | null>(null);

  const refreshData = async () => {
    if (!isStorageUnlocked()) return;
    try {
      const [docs, prof] = await Promise.all([
        getAllStoredDocuments(),
        getAllDecryptedProfileRecords(),
      ]);
      setDocuments(docs);
      setProfileRecords(prof);
      onProfileUpdated?.();
    } catch (err) {
      console.warn('[FormPilot] Could not refresh documents:', err);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const handleClosePreview = () => {
    if (previewDoc?.url) {
      URL.revokeObjectURL(previewDoc.url);
    }
    setPreviewDoc(null);
  };

  const handleViewDocument = async (d: Omit<StoredDocument, 'encryptedBlob'>) => {
    try {
      const blob = await getDocumentDecryptedBlob(d.id);
      const url = URL.createObjectURL(blob);
      setPreviewDoc({
        id: d.id,
        name: d.name,
        type: d.type,
        mimeType: d.mimeType,
        url,
      });
    } catch (err) {
      alert('Could not open document: ' + String(err));
    }
  };

  const handleDeleteDocument = async (id: string, name: string) => {
    if (confirm(`Delete "${name}" from your saved documents?`)) {
      await deleteDocument(id);
      chrome.runtime.sendMessage({ type: 'DOCUMENTS_UPDATED' }).catch(() => {});
      await refreshData();
    }
  };

  const handleSaveEdit = async (key: string) => {
    await saveProfileRecord({
      key,
      value: editValue.trim(),
      confidence: 1.0,
      source: 'manual',
      verifiedByUser: true,
    });
    setEditingKey(null);
    await refreshData();
  };

  const handleAddManualDetail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDetailValue.trim()) return;

    await saveProfileRecord({
      key: newDetailKey,
      value: newDetailValue.trim(),
      confidence: 1.0,
      source: 'manual',
      verifiedByUser: true,
    });

    setNewDetailValue('');
    setShowAddModal(false);
    await refreshData();
  };

  const handleFileDrop = (files: FileList | File[]) => {
    const items: UploadQueueItem[] = Array.from(files).map((f) => {
      const classified = autoClassifyDocument(f.name);
      const defaultTag = classified.type === 'other' ? '' : classified.type.replace(/_/g, ' ');
      return {
        file: f,
        name: f.name,
        docType: classified.type,
        tagsInput: defaultTag,
      };
    });
    setUploadQueue((prev) => [...prev, ...items]);
    setActiveTab('upload');
  };

  const processUploadQueue = async () => {
    if (uploadQueue.length === 0) return;
    setIsProcessingUpload(true);
    setStatusNotification('Saving and extracting details from documents...');

    try {
      let totalExtracted = 0;
      for (const item of uploadQueue) {
        const parsedTags = item.tagsInput
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean);

        if (!parsedTags.includes(item.docType)) {
          parsedTags.push(item.docType);
        }

        const docRecord = await saveDocument(
          item.file,
          item.name.trim() || item.file.name,
          item.docType,
          parsedTags
        );

        // Extract real details from PDF text, BYOK Gemini vision, OCR, and regex
        const extracted = await extractDocumentData(item.file, item.name || item.file.name, item.docType);
        for (const record of extracted) {
          if (record.value && typeof record.value === 'string' && record.value.trim()) {
            await saveProfileRecord({
              key: record.key,
              value: record.value.trim(),
              confidence: record.confidence,
              source: record.source,
              sourceDocId: docRecord.id,
              sourceDocName: item.name || item.file.name,
              verifiedByUser: false,
            });
            totalExtracted++;
          }
        }
      }

      setUploadQueue([]);
      chrome.runtime.sendMessage({ type: 'DOCUMENTS_UPDATED' }).catch(() => {});
      await refreshData();

      if (totalExtracted > 0) {
        setStatusNotification(`✓ Extracted ${totalExtracted} details! Check the Saved Details tab.`);
        setActiveTab('details');
      } else {
        setStatusNotification('✓ Document saved to device vault.');
        setActiveTab('docs');
      }
      setTimeout(() => setStatusNotification(null), 6000);
    } catch (err) {
      alert('Could not save documents: ' + String(err));
    } finally {
      setIsProcessingUpload(false);
    }
  };

  const handleStartEditDoc = (d: Omit<StoredDocument, 'encryptedBlob'>) => {
    setEditingDocId(d.id);
    setEditDocName(d.name);
    setEditDocType(d.type);
    setEditDocTags((d.tags || []).join(', '));
  };

  const handleSaveDocMetadata = async (id: string) => {
    try {
      const parsedTags = editDocTags
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      if (!parsedTags.includes(editDocType)) {
        parsedTags.push(editDocType);
      }

      await updateDocumentMetadata(id, {
        name: editDocName.trim(),
        type: editDocType,
        tags: parsedTags,
      });

      setEditingDocId(null);
      chrome.runtime.sendMessage({ type: 'DOCUMENTS_UPDATED' }).catch(() => {});
      await refreshData();
      setStatusNotification('✓ Document tags updated! QuickAttach will now match these keywords.');
      setTimeout(() => setStatusNotification(null), 5000);
    } catch (err) {
      alert('Failed to update tags: ' + String(err));
    }
  };

  const handleExtractFromExistingDoc = async (d: Omit<StoredDocument, 'encryptedBlob'>) => {
    setExtractingDocId(d.id);
    setStatusNotification(`Reading and extracting details from "${d.name}"...`);

    try {
      const blob = await getDocumentDecryptedBlob(d.id);
      const extracted = await extractDocumentData(blob, d.name, d.type);
      let count = 0;

      for (const record of extracted) {
        if (record.value && typeof record.value === 'string' && record.value.trim()) {
          await saveProfileRecord({
            key: record.key,
            value: record.value.trim(),
            confidence: record.confidence,
            source: record.source,
            sourceDocId: d.id,
            sourceDocName: d.name,
            verifiedByUser: false,
          });
          count++;
        }
      }

      await refreshData();

      if (count > 0) {
        setStatusNotification(`✓ Extracted ${count} details from "${d.name}"!`);
        setActiveTab('details');
      } else {
        alert(
          `Could not extract standard fields from "${d.name}". You can add details directly using "+ Add Detail" in the Saved Details tab.`
        );
        setStatusNotification(null);
      }
      setTimeout(() => setStatusNotification(null), 6000);
    } catch (err) {
      alert('Extraction failed: ' + String(err));
      setStatusNotification(null);
    } finally {
      setExtractingDocId(null);
    }
  };

  const isSensitiveField = (key: string) => {
    const lower = key.toLowerCase();
    return (
      lower.includes('aadhaar') ||
      lower.includes('pan') ||
      lower.includes('bank') ||
      lower.includes('account') ||
      lower.includes('ifsc')
    );
  };

  const maskValue = (val: string) => {
    if (!val) return '';
    if (val.length <= 4) return '••••';
    return '•••• •••• ' + val.slice(-4);
  };

  const isDocOutOfDate = (d: Omit<StoredDocument, 'encryptedBlob'>) => {
    const name = d.name.toLowerCase();
    const isIncome = d.type === 'income_certificate' || name.includes('income');
    const hasPastYear = name.includes('2021') || name.includes('2022') || name.includes('2023');
    const isOld = Date.now() - d.addedAt > 365 * 24 * 3600 * 1000;
    return isIncome && (hasPastYear || isOld);
  };

  const formatUploadDate = (timestamp: number) => {
    try {
      return new Date(timestamp).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return 'Recently';
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800 text-xs">
      {/* Friendly privacy reminder banner */}
      <div className="p-3 bg-emerald-50 border-b border-emerald-200 flex items-start space-x-2 text-emerald-900 text-xs">
        <Shield className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        <p className="leading-snug">
          <strong>Safe & Private:</strong> Your files and answers are stored securely on this computer only. Nothing is sent anywhere without your permission.
        </p>
      </div>

      {/* Live Status Notification */}
      {statusNotification && (
        <div className="p-2.5 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs font-medium flex items-center space-x-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>{statusNotification}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-3 pt-2 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('docs')}
          className={`pb-2 px-3 border-b-2 transition cursor-pointer flex items-center space-x-1.5 ${
            activeTab === 'docs'
              ? 'border-indigo-600 text-indigo-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>My Documents ({documents.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('details')}
          className={`pb-2 px-3 border-b-2 transition cursor-pointer flex items-center space-x-1.5 ${
            activeTab === 'details'
              ? 'border-indigo-600 text-indigo-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileCheck className="w-3.5 h-3.5" />
          <span>Saved Details ({profileRecords.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('upload')}
          className={`pb-2 px-3 border-b-2 transition cursor-pointer flex items-center space-x-1.5 ${
            activeTab === 'upload'
              ? 'border-indigo-600 text-indigo-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Add New</span>
          {uploadQueue.length > 0 && (
            <span className="w-4 h-4 bg-indigo-600 text-white rounded-full text-[10px] flex items-center justify-center">
              {uploadQueue.length}
            </span>
          )}
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* TAB 1: DOCUMENTS */}
        {activeTab === 'docs' && (
          <div className="space-y-3">
            {documents.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-dashed border-slate-300 space-y-3">
                <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                  <Upload className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-slate-800">No documents saved yet</h4>
                  <p className="text-xs text-slate-500">
                    Add your certificates or photo so Sahayak can fill and attach them for you.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('upload')}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  Add a document
                </button>
              </div>
            ) : (
              documents.map((d) => {
                const isStale = isDocOutOfDate(d);
                const title = FRIENDLY_DOC_TITLES[d.type] || 'Document';

                if (editingDocId === d.id) {
                  return (
                    <div
                      key={d.id}
                      className="p-3 bg-indigo-50/80 rounded-xl border border-indigo-300 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-indigo-900 flex items-center space-x-1">
                          <Tag className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Edit Document & QuickAttach Tags</span>
                        </span>
                        <button onClick={() => setEditingDocId(null)} className="text-slate-400 hover:text-slate-600">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-slate-600">Document Name</label>
                        <input
                          type="text"
                          value={editDocName}
                          onChange={(e) => setEditDocName(e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-slate-600">Category Type</label>
                        <select
                          value={editDocType}
                          onChange={(e) => setEditDocType(e.target.value as DocumentType)}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                        >
                          {Object.entries(FRIENDLY_DOC_TITLES).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-slate-600">
                          Custom Tags / Search Keywords (comma separated)
                        </label>
                        <input
                          type="text"
                          value={editDocTags}
                          onChange={(e) => setEditDocTags(e.target.value)}
                          placeholder="e.g. income, scholarship, father, bonafide"
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs outline-none focus:border-indigo-500"
                        />
                        <p className="text-[10px] text-indigo-700">
                          💡 Type any of these words into the floating QuickAttach box to instantly match this file!
                        </p>
                      </div>

                      <div className="flex justify-end space-x-1.5 pt-1">
                        <button
                          onClick={() => setEditingDocId(null)}
                          className="px-2.5 py-1 bg-white border border-slate-300 rounded text-xs text-slate-600"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveDocMetadata(d.id)}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-bold"
                        >
                          Save Tags
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={d.id}
                    className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2 hover:border-slate-300 transition"
                  >
                    {/* Top Row: Title, Out of date badge, and Delete button */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-2 min-w-0 flex-wrap gap-y-1">
                        <span className="font-bold text-sm text-slate-900 truncate">{title}</span>
                        {isStale && (
                          <span
                            className="inline-flex items-center px-2 py-0.5 bg-amber-100 border border-amber-300 text-amber-900 rounded-full text-[10px] font-bold whitespace-nowrap shrink-0"
                            title="Statutory schemes require income certificates issued within the current financial year. This document may be older than 1 year."
                          >
                            ⚠️ Out of date?
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => handleDeleteDocument(d.id, d.name)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition shrink-0 border border-transparent hover:border-rose-200"
                        title={`Delete ${d.name}`}
                        aria-label={`Delete ${d.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Middle Row: File Name */}
                    <p className="text-xs text-slate-500 font-mono truncate" title={d.name}>
                      {d.name}
                    </p>

                    {/* Custom Tags Pills */}
                    {d.tags && d.tags.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        {d.tags.map((t) => (
                          <span
                            key={t}
                            className="px-1.5 py-0.2 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded text-[10px] font-mono"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Bottom Row: Date/Size on left, Action buttons on right */}
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1.5 border-t border-slate-100">
                      <span>{formatUploadDate(d.addedAt)} • {Math.round(d.sizeBytes / 1024)} KB</span>

                      <div className="flex items-center space-x-1.5 shrink-0">
                        <button
                          onClick={() => handleStartEditDoc(d)}
                          className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-xs font-semibold cursor-pointer flex items-center space-x-1"
                          title="Edit custom tags for quick attachment"
                        >
                          <Tag className="w-3 h-3 text-slate-500" />
                          <span>Tags</span>
                        </button>

                        <button
                          onClick={() => handleExtractFromExistingDoc(d)}
                          disabled={extractingDocId === d.id}
                          className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-md text-xs font-semibold cursor-pointer flex items-center space-x-1 disabled:opacity-50"
                          title="Extract information from this document"
                        >
                          {extractingDocId === d.id ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin text-amber-600" />
                              <span>Reading...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3 h-3 text-amber-600" />
                              <span>Extract</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => handleViewDocument(d)}
                          className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md text-xs font-semibold cursor-pointer"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 2: SAVED DETAILS */}
        {activeTab === 'details' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-bold text-slate-700">Information for filling forms</span>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md text-xs font-semibold flex items-center space-x-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Add Detail</span>
              </button>
            </div>

            {showAddModal && (
              <form onSubmit={handleAddManualDetail} className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-indigo-900">Add New Information</span>
                  <button type="button" onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-slate-700">What is this?</label>
                  <select
                    value={newDetailKey}
                    onChange={(e) => setNewDetailKey(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-800"
                  >
                    {Object.entries(FRIENDLY_FIELD_TITLES).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-slate-700">Answer</label>
                  <input
                    type="text"
                    value={newDetailValue}
                    onChange={(e) => setNewDetailValue(e.target.value)}
                    placeholder="Enter answer..."
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-800 outline-none"
                  />
                </div>

                <div className="flex justify-end space-x-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-2.5 py-1 bg-white border border-slate-300 text-slate-600 rounded-md text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 bg-indigo-600 text-white rounded-md text-xs font-bold"
                  >
                    Save Detail
                  </button>
                </div>
              </form>
            )}

            {profileRecords.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                No information saved yet. Upload a document or click "+ Add Detail" above.
              </p>
            ) : (
              profileRecords.map((r) => {
                const sensitive = isSensitiveField(r.key);
                const isRevealed = revealedKeys.has(r.key);
                const title = FRIENDLY_FIELD_TITLES[r.key] || r.key;

                return (
                  <div
                    key={r.key}
                    className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-semibold text-xs text-slate-700">{title}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-500 font-medium">
                          {r.source === 'regex' ? 'Text Match' : r.source === 'gemini' ? 'AI Vision' : r.source === 'ocr' ? 'OCR' : r.source}
                        </span>
                      </div>

                      <div className="flex items-center space-x-1">
                        {sensitive && (
                          <button
                            onClick={() => {
                              setRevealedKeys((prev) => {
                                const next = new Set(prev);
                                if (next.has(r.key)) next.delete(r.key);
                                else next.add(r.key);
                                return next;
                              });
                            }}
                            className="p-1 text-slate-400 hover:text-slate-600"
                            title={isRevealed ? 'Hide' : 'Show'}
                            aria-label={isRevealed ? 'Hide' : 'Show'}
                          >
                            {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setEditingKey(r.key);
                            setEditValue(r.value);
                          }}
                          className="text-xs text-indigo-600 hover:underline font-semibold"
                        >
                          Edit
                        </button>
                        <button
                          onClick={async () => {
                            await deleteProfileRecord(r.key);
                            await refreshData();
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600"
                          title="Delete detail"
                          aria-label="Delete detail"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {editingKey === r.key ? (
                      <div className="flex items-center space-x-2 pt-1">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="flex-1 px-2.5 py-1 text-xs border border-indigo-400 rounded-md outline-none"
                        />
                        <button
                          onClick={() => handleSaveEdit(r.key)}
                          className="px-2.5 py-1 bg-indigo-600 text-white rounded-md text-xs font-bold"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingKey(null)}
                          className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <span className="font-semibold text-sm text-slate-900 block truncate">
                        {sensitive && !isRevealed ? maskValue(r.value) : r.value}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 3: UPLOAD */}
        {activeTab === 'upload' && (
          <div className="space-y-4">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files) handleFileDrop(e.dataTransfer.files);
              }}
              className="p-6 bg-white border-2 border-dashed border-indigo-200 rounded-xl text-center space-y-2 hover:border-indigo-400 transition"
            >
              <Upload className="w-8 h-8 text-indigo-600 mx-auto" />
              <div>
                <p className="font-bold text-sm text-slate-800">Choose documents or drop them here</p>
                <p className="text-xs text-slate-500">Supports PDF, JPG, PNG (Marksheet, Income, Aadhaar, Photo)</p>
              </div>

              <input
                type="file"
                multiple
                id="doc-upload-input"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) handleFileDrop(e.target.files);
                }}
              />
              <label
                htmlFor="doc-upload-input"
                className="inline-block px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer transition"
              >
                Browse Files
              </label>
            </div>

            {uploadQueue.length > 0 && (
              <div className="space-y-3">
                <span className="font-bold text-xs text-slate-800 block">
                  Documents ready to save ({uploadQueue.length})
                </span>

                {uploadQueue.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 text-xs shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 truncate max-w-[200px]" title={item.file.name}>
                        {item.file.name}
                      </span>
                      <button
                        onClick={() => setUploadQueue((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-rose-600 p-1"
                        title="Remove from queue"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">
                          Category Type
                        </label>
                        <select
                          value={item.docType}
                          onChange={(e) => {
                            const val = e.target.value as DocumentType;
                            setUploadQueue((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, docType: val } : it))
                            );
                          }}
                          className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-xs"
                        >
                          {Object.entries(FRIENDLY_DOC_TITLES).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">
                          QuickAttach Tags
                        </label>
                        <input
                          type="text"
                          value={item.tagsInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setUploadQueue((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, tagsInput: val } : it))
                            );
                          }}
                          placeholder="e.g. income, scholarship"
                          className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-xs outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-400">
                      💡 Tip: Enter words (e.g. <code>income</code>, <code>scholarship</code>) so typing them in QuickAttach instantly attaches this file.
                    </p>
                  </div>
                ))}

                <button
                  onClick={processUploadQueue}
                  disabled={isProcessingUpload}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  {isProcessingUpload ? 'Saving and extracting details...' : 'Save & Extract all to vault'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-3">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
              <span className="font-bold text-xs truncate max-w-[220px]">{previewDoc.name}</span>
              <button onClick={handleClosePreview} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 flex-1 overflow-auto bg-slate-100 flex items-center justify-center">
              {previewDoc.mimeType.startsWith('image/') ? (
                <img src={previewDoc.url} alt={previewDoc.name} className="max-w-full max-h-[300px] object-contain rounded" />
              ) : (
                <iframe src={previewDoc.url} className="w-full h-[300px] bg-white rounded border" title={previewDoc.name} />
              )}
            </div>

            <div className="px-4 py-2.5 bg-white border-t border-slate-200 flex justify-end">
              <button
                onClick={handleClosePreview}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
