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
} from 'lucide-react';
import {
  isStorageUnlocked,
  getAllStoredDocuments,
  deleteDocument,
  saveDocument,
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

  // Upload queue
  const [uploadQueue, setUploadQueue] = useState<Array<{ file: File; docType: DocumentType }>>([]);
  const [isProcessingUpload, setIsProcessingUpload] = useState<boolean>(false);
  const [extractingDocId, setExtractingDocId] = useState<string | null>(null);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);

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
    const items = Array.from(files).map((f) => {
      const classified = autoClassifyDocument(f.name);
      return { file: f, docType: classified.type };
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
        const docRecord = await saveDocument(
          item.file,
          item.file.name,
          item.docType,
          [item.docType]
        );

        // Extract real details from PDF text, BYOK Gemini vision, OCR, and regex
        const extracted = await extractDocumentData(item.file, item.file.name, item.docType);
        for (const record of extracted) {
          if (record.value && typeof record.value === 'string' && record.value.trim()) {
            await saveProfileRecord({
              key: record.key,
              value: record.value.trim(),
              confidence: record.confidence,
              source: record.source,
              sourceDocId: docRecord.id,
              sourceDocName: item.file.name,
              verifiedByUser: false,
            });
            totalExtracted++;
          }
        }
      }

      setUploadQueue([]);
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

                return (
                  <div
                    key={d.id}
                    className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2 hover:border-slate-300 transition"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-0.5">
                        <span className="font-bold text-sm text-slate-900 block">{title}</span>
                        <p className="text-xs text-slate-500 font-mono truncate max-w-[200px]">{d.name}</p>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        {isStale && (
                          <span
                            className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[10px] font-bold"
                            title="This document may be older than 1 year. Check if your form requires a recent one."
                          >
                            ⚠️ Out of date?
                          </span>
                        )}
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
                        <button
                          onClick={() => handleDeleteDocument(d.id, d.name)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                          title="Delete document"
                          aria-label="Delete document"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100">
                      <span>Uploaded {formatUploadDate(d.addedAt)}</span>
                      <span>{Math.round(d.sizeBytes / 1024)} KB</span>
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
              <div className="space-y-2">
                <span className="font-bold text-xs text-slate-800">Ready to save ({uploadQueue.length})</span>
                {uploadQueue.map((item, idx) => (
                  <div key={idx} className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800 truncate max-w-[180px]">{item.file.name}</span>
                    <button
                      onClick={() => setUploadQueue((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                <button
                  onClick={processUploadQueue}
                  disabled={isProcessingUpload}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  {isProcessingUpload ? 'Saving to device...' : 'Save all to my device'}
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
