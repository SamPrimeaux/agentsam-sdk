import React, { useState, useRef } from 'react';
import { 
  Sparkles, 
  Image as ImageIcon, 
  Upload, 
  X, 
  Download, 
  Wand2, 
  Layers, 
  Sun, 
  Video,
  AlertCircle
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialImageUrl?: string;
  onSendToVeo?: (imageUrl: string) => void;
}

export const ImageGenModal: React.FC<Props> = ({ isOpen, onClose, initialImageUrl, onSendToVeo }) => {
  const [sourceImage, setSourceImage] = useState<string | null>(initialImageUrl || null);
  const [prompt, setPrompt] = useState('Photorealistic architectural render of a modern luxury villa, floor-to-ceiling glass, timber slats, minimalist interior, golden hour sunlight, architectural digest magazine style');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '16:9' | '4:3' | '3:4' | '9:16'>('16:9');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<{ url: string; prompt: string }[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const stylePresets = [
    { label: 'Modern Minimalist', prompt: 'Modern minimalist architectural design, clean geometric lines, off-white stucco, recessed LED lighting, expansive glass windows' },
    { label: 'Japandi Luxury', prompt: 'Japandi architectural aesthetic, natural light oak wood, raw concrete, tatami texture, bonsai indoor garden, soft diffuse daylight' },
    { label: 'Industrial Brooklyn Loft', prompt: 'Industrial loft interior, exposed red brick walls, black steel frame windows, polished concrete floors, high timber ceilings' },
    { label: 'Scandinavian Warm', prompt: 'Scandinavian modern residence, blonde wood floors, soft linen furniture, neutral warm color palette, large open living space' },
  ];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setSourceImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setError(null);

    try {
      const endpoint = sourceImage ? '/api/image/edit' : '/api/image/generate';
      const bodyPayload = sourceImage
        ? { image: sourceImage, prompt, aspectRatio }
        : { prompt, aspectRatio };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to generate image');
      }

      if (data.imageUrl) {
        setGeneratedImages((prev) => [{ url: data.imageUrl, prompt }, ...prev]);
        setSelectedImage(data.imageUrl);
      }
    } catch (err: any) {
      console.error('Image generation failed:', err);
      setError(err.message || 'Image generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="bg-[#252525] border border-[#333] rounded w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-3.5 border-b border-[#333] flex items-center justify-between bg-[#252525]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded bg-blue-600/20 border border-blue-500/40 text-blue-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-white">Gemini Architectural Image Studio</h2>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  gemini-3.1-flash-image-preview
                </span>
              </div>
              <p className="text-[11px] text-gray-400">Generate photorealistic renderings or edit architectural concept images with natural language</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-[#333] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#1E1E1E]">
          {/* Left: Input & Prompt Form */}
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  Source Image (Optional for Image Editing)
                </label>
                {sourceImage && (
                  <button
                    onClick={() => setSourceImage(null)}
                    className="text-[10px] text-rose-400 hover:underline"
                  >
                    Clear (Switch to Text-to-Image)
                  </button>
                )}
              </div>

              {sourceImage ? (
                <div className="relative rounded overflow-hidden border border-blue-500/40 bg-[#252525]">
                  <img src={sourceImage} alt="Base render" className="w-full h-36 object-cover" />
                  <div className="absolute bottom-1.5 left-1.5 px-2 py-0.5 bg-black/80 rounded text-[10px] text-white">
                    Editing Active Render
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-28 rounded border border-dashed border-[#444] hover:border-blue-500/50 bg-[#252525] hover:bg-[#2a2a2a] transition cursor-pointer flex flex-col items-center justify-center p-2.5 text-center"
                >
                  <Upload className="w-5 h-5 text-gray-400 mb-1" />
                  <span className="text-xs font-medium text-gray-300">Drop render or photo to edit</span>
                  <span className="text-[10px] text-gray-500">Leave blank for fresh text-to-image</span>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            </div>

            {/* Prompt */}
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                {sourceImage ? 'Editing Instructions' : 'Architectural Concept Prompt'}
              </label>
              <textarea
                rows={2}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={sourceImage ? "e.g. Change walls to dark concrete and add warm golden hour lighting..." : "Describe building materials, lighting, angles, environment..."}
                className="w-full bg-[#252525] border border-[#333] rounded p-2 text-xs text-white focus:outline-none focus:border-blue-500 resize-none placeholder:text-gray-500"
              />
            </div>

            {/* Style Presets */}
            <div>
              <span className="text-[10px] text-gray-400 block mb-1 font-mono">Architectural Presets:</span>
              <div className="flex flex-wrap gap-1">
                {stylePresets.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setPrompt(p.prompt)}
                    className="px-2 py-0.5 bg-[#252525] hover:bg-[#333] border border-[#333] hover:border-blue-500/40 text-gray-300 hover:text-white rounded text-[11px] transition"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect Ratio */}
            <div>
              <label className="text-[10px] text-gray-400 block mb-1 font-mono">Aspect Ratio</label>
              <div className="flex space-x-1 bg-[#252525] p-0.5 rounded border border-[#333]">
                {(['16:9', '4:3', '1:1', '3:4', '9:16'] as const).map((ar) => (
                  <button
                    key={ar}
                    onClick={() => setAspectRatio(ar)}
                    className={`flex-1 py-1 text-xs font-medium rounded transition ${
                      aspectRatio === ar ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {ar}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded shadow-sm disabled:opacity-50 transition flex items-center justify-center space-x-1.5"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>{isGenerating ? 'Synthesizing Render...' : sourceImage ? 'Edit with Gemini' : 'Generate Architectural Render'}</span>
            </button>
          </div>

          {/* Right: Render Preview & Gallery */}
          <div className="flex flex-col justify-between space-y-3">
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                High-Resolution Render Output
              </label>

              <div className="h-56 rounded border border-[#333] bg-[#252525] flex items-center justify-center relative overflow-hidden">
                {selectedImage ? (
                  <img src={selectedImage} alt="Generated render" className="w-full h-full object-contain bg-black" />
                ) : isGenerating ? (
                  <div className="text-center space-y-2">
                    <div className="w-8 h-8 mx-auto rounded bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 animate-pulse">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <p className="text-[11px] text-gray-400">Gemini is rendering photorealistic lighting and materials...</p>
                  </div>
                ) : error ? (
                  <div className="text-center p-3 space-y-1.5 text-rose-400">
                    <AlertCircle className="w-6 h-6 mx-auto" />
                    <p className="text-xs font-medium">{error}</p>
                  </div>
                ) : (
                  <div className="text-center text-gray-500 space-y-1.5">
                    <ImageIcon className="w-8 h-8 mx-auto stroke-1" />
                    <p className="text-xs">Generated renders will appear here</p>
                  </div>
                )}
              </div>

              {/* Action buttons for selected render */}
              {selectedImage && (
                <div className="flex space-x-2 mt-2.5">
                  <a
                    href={selectedImage}
                    download="AgentSam-Design-Render.png"
                    className="flex-1 py-1.5 bg-[#252525] hover:bg-[#333] border border-[#333] text-white rounded text-xs font-medium flex items-center justify-center space-x-1.5 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PNG</span>
                  </a>
                  {onSendToVeo && (
                    <button
                      onClick={() => {
                        onSendToVeo(selectedImage);
                        onClose();
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium flex items-center space-x-1 transition"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Animate in Veo</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* History Thumbnails */}
            {generatedImages.length > 0 && (
              <div>
                <span className="text-[10px] text-gray-400 block mb-1 font-mono">Session Render History:</span>
                <div className="flex space-x-1.5 overflow-x-auto pb-0.5">
                  {generatedImages.map((img, i) => (
                    <img
                      key={i}
                      src={img.url}
                      alt={`Render ${i}`}
                      onClick={() => setSelectedImage(img.url)}
                      className={`w-14 h-14 rounded object-cover cursor-pointer border transition ${
                        selectedImage === img.url ? 'border-blue-500' : 'border-[#333] opacity-70 hover:opacity-100'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
