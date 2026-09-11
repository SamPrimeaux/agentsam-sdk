import React, { useState, useRef } from 'react';
import { 
  Video, 
  Sparkles, 
  Upload, 
  X, 
  Play, 
  Pause, 
  Download, 
  Film, 
  RotateCw, 
  CheckCircle2, 
  AlertCircle,
  Camera
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialImageUrl?: string;
}

export const VeoStudioModal: React.FC<Props> = ({ isOpen, onClose, initialImageUrl }) => {
  const [image, setImage] = useState<string | null>(initialImageUrl || null);
  const [prompt, setPrompt] = useState('Cinematic architectural drone flythrough of modern luxury residence at sunset, smooth camera pan, photorealistic lighting');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [resolution, setResolution] = useState<'720p' | '1080p'>('720p');
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  if (!isOpen) return null;

  const presets = [
    { label: 'Drone Sunset Orbit', prompt: 'Cinematic drone orbit around this modern villa during golden hour sunset, warm ambient lighting, 4K architectural showcase' },
    { label: 'Interior Walkthrough', prompt: 'Smooth eye-level steadycam walkthrough through the open-plan living room into the kitchen with natural morning sunlight' },
    { label: 'Cathedral Ceiling Fly-In', prompt: 'Slow cinematic dolly zoom through the glass patio entrance showing high ceilings, hardwood textures, and architectural details' },
    { label: 'Night Architectural Glow', prompt: 'Moody twilight architectural showcase with warm interior warm spotlighting glowing through floor-to-ceiling glass windows' },
  ];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleStartGeneration = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setError(null);
    setVideoUrl(null);
    setProgress(10);
    setStatusMessage('Initiating Veo video synthesis (veo-3.1-fast-generate-preview)...');

    try {
      // 1. Trigger generate
      const res = await fetch('/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          image,
          aspectRatio,
          resolution,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to start video generation');
      }

      const operationName = data.operationName;
      setStatusMessage('Synthesizing cinematic architectural camera trajectories...');
      setProgress(25);

      // 2. Poll status
      let done = false;
      let attempts = 0;
      const maxAttempts = 60;

      while (!done && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 3500));
        attempts++;
        setProgress((prev) => Math.min(90, prev + 4));

        const statusRes = await fetch('/api/video/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operationName }),
        });
        const statusData = await statusRes.json();

        if (statusData.error) {
          throw new Error(statusData.error);
        }

        if (statusData.done) {
          done = true;
          break;
        }

        if (attempts > 5) setStatusMessage('Rendering lighting, temporal motion, and reflections...');
        if (attempts > 12) setStatusMessage('Finalizing MP4 video stream encoding...');
      }

      if (!done) {
        throw new Error('Video generation timed out. Please try again.');
      }

      // 3. Download & Render Video Blob
      setStatusMessage('Downloading rendered architectural video...');
      setProgress(95);

      const downloadRes = await fetch('/api/video/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationName }),
      });

      if (!downloadRes.ok) {
        throw new Error('Failed to retrieve synthesized video file');
      }

      const blob = await downloadRes.blob();
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setProgress(100);
      setStatusMessage('Video generated successfully!');
    } catch (err: any) {
      console.error('Veo video generation error:', err);
      setError(err.message || 'Failed to generate video');
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
            <div className="p-2 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
              <Film className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-white">Veo Architectural Video Animator</h2>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  veo-3.1-fast-generate-preview
                </span>
              </div>
              <p className="text-[11px] text-gray-400">Animate floor plan renders or uploaded architectural photos into cinematic flythrough videos</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-[#333] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#1E1E1E]">
          {/* Left: Input Image & Configuration */}
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                Input Image / Render Snapshot
              </label>

              {image ? (
                <div className="relative rounded overflow-hidden border border-[#333] bg-[#252525] group">
                  <img src={image} alt="Source render" className="w-full h-44 object-cover" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center space-x-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2.5 py-1 rounded bg-[#333] text-white text-xs font-medium hover:bg-[#444]"
                    >
                      Change Photo
                    </button>
                    <button
                      onClick={() => setImage(null)}
                      className="px-2.5 py-1 rounded bg-rose-600 text-white text-xs font-medium hover:bg-rose-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-44 rounded border-2 border-dashed border-[#444] hover:border-emerald-500/50 bg-[#252525] hover:bg-[#2a2a2a] transition cursor-pointer flex flex-col items-center justify-center p-3 text-center"
                >
                  <Upload className="w-6 h-6 text-gray-400 mb-1.5" />
                  <span className="text-xs font-medium text-gray-200">Upload Photo or Blueprint</span>
                  <span className="text-[10px] text-gray-500 mt-0.5">PNG, JPG, WebP supported</span>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            </div>

            {/* Prompt */}
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                Camera Motion & Video Prompt
              </label>
              <textarea
                rows={2}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe camera movement, lighting, mood, time of day..."
                className="w-full bg-[#252525] border border-[#333] rounded p-2 text-xs text-white focus:outline-none focus:border-emerald-500 resize-none placeholder:text-gray-500"
              />
            </div>

            {/* Presets */}
            <div>
              <span className="text-[10px] text-gray-400 block mb-1 font-mono">Quick Camera Trajectories:</span>
              <div className="flex flex-wrap gap-1">
                {presets.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setPrompt(p.prompt)}
                    className="px-2 py-0.5 bg-[#252525] hover:bg-[#333] border border-[#333] hover:border-emerald-500/40 text-gray-300 hover:text-white rounded text-[11px] transition"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect Ratio & Resolution */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="text-[10px] text-gray-400 block mb-1 font-mono">Aspect Ratio</label>
                <div className="grid grid-cols-2 gap-1 bg-[#252525] p-0.5 rounded border border-[#333]">
                  <button
                    onClick={() => setAspectRatio('16:9')}
                    className={`py-1 text-xs font-medium rounded transition ${
                      aspectRatio === '16:9' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    16:9
                  </button>
                  <button
                    onClick={() => setAspectRatio('9:16')}
                    className={`py-1 text-xs font-medium rounded transition ${
                      aspectRatio === '9:16' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    9:16
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-gray-400 block mb-1 font-mono">Resolution</label>
                <div className="grid grid-cols-2 gap-1 bg-[#252525] p-0.5 rounded border border-[#333]">
                  <button
                    onClick={() => setResolution('720p')}
                    className={`py-1 text-xs font-medium rounded transition ${
                      resolution === '720p' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    720p HD
                  </button>
                  <button
                    onClick={() => setResolution('1080p')}
                    className={`py-1 text-xs font-medium rounded transition ${
                      resolution === '1080p' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    1080p
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Output Player & Generation Progress */}
          <div className="flex flex-col justify-between space-y-3">
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                Synthesized Video Output
              </label>

              <div className="flex-1 min-h-[200px] rounded border border-[#333] bg-[#252525] flex flex-col items-center justify-center p-3 relative overflow-hidden">
                {videoUrl ? (
                  <div className="w-full h-full flex flex-col items-center justify-center">
                    <video
                      ref={videoRef}
                      src={videoUrl}
                      controls
                      autoPlay
                      loop
                      className="w-full max-h-56 rounded object-contain bg-black shadow-lg"
                    />
                  </div>
                ) : isGenerating ? (
                  <div className="text-center space-y-3 max-w-xs">
                    <div className="w-10 h-10 mx-auto rounded bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 animate-spin">
                      <RotateCw className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-white">Veo Generative Engine</h4>
                      <p className="text-[11px] text-gray-400 mt-0.5">{statusMessage}</p>
                    </div>

                    <div className="w-full bg-[#1E1E1E] rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                ) : error ? (
                  <div className="text-center p-3 space-y-1.5 text-rose-400">
                    <AlertCircle className="w-6 h-6 mx-auto" />
                    <p className="text-xs font-medium">{error}</p>
                  </div>
                ) : (
                  <div className="text-center text-gray-500 space-y-1.5">
                    <Film className="w-8 h-8 mx-auto stroke-1" />
                    <p className="text-xs">Generated video preview will appear here</p>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-2">
              <button
                onClick={handleStartGeneration}
                disabled={isGenerating || !prompt.trim()}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded shadow-sm disabled:opacity-50 transition flex items-center justify-center space-x-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isGenerating ? 'Generating Video...' : 'Generate Veo Video'}</span>
              </button>

              {videoUrl && (
                <a
                  href={videoUrl}
                  download="AgentSam-Veo-Walkthrough.mp4"
                  className="px-3 py-2 bg-[#252525] hover:bg-[#333] border border-[#333] text-white rounded text-xs font-medium flex items-center space-x-1 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save MP4</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
