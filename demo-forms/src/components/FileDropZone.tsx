import React, { useRef, useState } from 'react';
import { UploadCloud, CheckCircle2 } from 'lucide-react';

interface FileDropZoneProps {
  id: string;
  name: string;
  label: string;
  hint: string;
  accept?: string;
  required?: boolean;
  maxSizeKB?: number;
  onFileSelect?: (file: File) => void;
}

export const FileDropZone: React.FC<FileDropZoneProps> = ({
  id,
  name,
  label,
  hint,
  accept = '.pdf,.jpg,.jpeg,.png',
  required = false,
  maxSizeKB,
  onFileSelect,
}) => {
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [fileSizeKB, setFileSizeKB] = useState<number | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (files && files.length > 0) {
      const file = files[0];
      const kb = Math.round(file.size / 1024);
      setSelectedFileName(file.name);
      setFileSizeKB(kb);

      if (maxSizeKB && kb > maxSizeKB) {
        setSizeError(`File size exceeds maximum allowed ${maxSizeKB} KB limit (${kb} KB).`);
      } else {
        setSizeError(null);
      }

      if (onFileSelect) onFileSelect(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-1.5" data-formpilot-dropzone-wrapper="true">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="block text-xs font-semibold text-slate-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <span className="text-[11px] font-medium text-slate-500 hint">{hint}</span>
      </div>

      {/* Styled upload dropzone */}
      <div
        data-formpilot-dropzone="true"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition ${
          isDragOver
            ? 'border-blue-500 bg-blue-50/50'
            : selectedFileName
            ? 'border-emerald-400 bg-emerald-50/30'
            : 'border-slate-300 hover:border-slate-400 bg-slate-50/60'
        }`}
      >
        {selectedFileName ? (
          <div className="flex items-center justify-center space-x-2 text-emerald-700">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span className="text-xs font-semibold">{selectedFileName}</span>
            <span className="text-[10px] text-emerald-600">({fileSizeKB} KB)</span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-1 text-slate-500">
            <UploadCloud className="w-6 h-6 text-slate-400" />
            <p className="text-xs">
              <span className="text-blue-600 font-semibold underline">Click to upload</span> or drag and drop
            </p>
            <p className="text-[10px] text-slate-400">{hint}</p>
          </div>
        )}

        {/* Hidden native input behind styled button */}
        <input
          ref={inputRef}
          type="file"
          id={id}
          name={name}
          accept={accept}
          required={required}
          aria-invalid={sizeError ? 'true' : 'false'}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {sizeError && (
        <div role="alert" className="text-red-500 text-[11px] font-medium error-message flex items-center space-x-1">
          <span>⚠️ {sizeError}</span>
        </div>
      )}
    </div>
  );
};
