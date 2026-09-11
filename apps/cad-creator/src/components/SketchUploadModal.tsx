import React, { useState, useRef } from 'react';
import { 
  FileScan, 
  Upload, 
  X, 
  Sparkles, 
  RotateCw, 
  AlertCircle,
  CheckCircle2,
  FileCode
} from 'lucide-react';
import { ProjectState } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onApplyParsedPlan: (plan: Partial<ProjectState>) => void;
}

export const SketchUploadModal: React.FC<Props> = ({ isOpen, onClose, onApplyParsedPlan }) => {
  const [sketchImage, setSketchImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [parsedSummary, setParsedSummary] = useState<any | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setSketchImage(event.target?.result as string);
      setParsedSummary(null);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleParseSketch = async () => {
    if (!sketchImage) return;
    setIsProcessing(true);
    setError(null);
    setProgressMsg('Analyzing architectural drawing with Gemini Vision...');

    try {
      const res = await fetch('/api/vision/parse-sketch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: sketchImage }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to parse architectural sketch');
      }

      setParsedSummary(data);
      setProgressMsg('Extraction complete! Found structured CAD vector geometry.');
    } catch (err: any) {
      console.error('Vision parsing error:', err);
      setError(err.message || 'Failed to parse sketch');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApply = () => {
    if (!parsedSummary) return;
    onApplyParsedPlan(parsedSummary);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="bg-[#252525] border border-[#333] rounded w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-3.5 border-b border-[#333] flex items-center justify-between bg-[#252525]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded bg-blue-600/20 border border-blue-500/40 text-blue-400">
              <FileScan className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Napkin Sketch & Drawing to BIM</h2>
              <p className="text-[11px] text-gray-400">Upload hand-drawn floor plan sketches or blueprint images to generate 2D CAD & 3D BIM models</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-[#333] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3 overflow-y-auto bg-[#1E1E1E]">
          {sketchImage ? (
            <div className="relative rounded overflow-hidden border border-[#333] bg-[#252525] flex items-center justify-center p-2">
              <img src={sketchImage} alt="Uploaded sketch" className="max-h-52 object-contain" />
              <button
                onClick={() => setSketchImage(null)}
                className="absolute top-2 right-2 px-2.5 py-1 bg-black/80 hover:bg-black text-white rounded text-xs font-medium"
              >
                Change Photo
              </button>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-44 rounded border-2 border-dashed border-[#444] hover:border-blue-500/50 bg-[#252525] hover:bg-[#2a2a2a] transition cursor-pointer flex flex-col items-center justify-center p-4 text-center"
            >
              <Upload className="w-6 h-6 text-gray-400 mb-1.5" />
              <span className="text-xs font-semibold text-gray-200">Upload Napkin Sketch or Blueprint Photo</span>
              <span className="text-[10px] text-gray-500 mt-0.5">Accepts PNG, JPG, WebP photo of drawing</span>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />

          {/* Action to Parse */}
          {sketchImage && !parsedSummary && (
            <button
              onClick={handleParseSketch}
              disabled={isProcessing}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded shadow-sm disabled:opacity-50 transition flex items-center justify-center space-x-1.5"
            >
              {isProcessing ? (
                <>
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{progressMsg}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Parse Sketch into 2D CAD & 3D BIM</span>
                </>
              )}
            </button>
          )}

          {/* Results Summary */}
          {parsedSummary && (
            <div className="p-3 rounded bg-[#252525] border border-emerald-500/40 space-y-2.5">
              <div className="flex items-center space-x-2 text-emerald-400 text-xs font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Extracted {parsedSummary.walls?.length || 0} Walls, {parsedSummary.doors?.length || 0} Doors, {parsedSummary.rooms?.length || 0} Rooms</span>
              </div>
              <p className="text-[11px] text-gray-300">
                AgentSam has mapped your hand sketch into precise geometric CAD lines and 3D extrusions.
              </p>

              <button
                onClick={handleApply}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded shadow-sm transition"
              >
                Apply Generated BIM to Studio Canvas
              </button>
            </div>
          )}

          {error && (
            <div className="p-2.5 rounded bg-rose-950/40 border border-rose-500/30 flex items-center space-x-2 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
