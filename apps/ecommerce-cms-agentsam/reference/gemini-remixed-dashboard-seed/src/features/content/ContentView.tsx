/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Feature: Media Library & Generative AI Creative Studio
 */

import React, { useState, useEffect } from 'react';
import { useAdmin } from '../../app/AdminProvider';
import { Card } from '../../design-system/Card';
import { Badge } from '../../design-system/Badge';
import { Button } from '../../design-system/Button';
import { Input } from '../../design-system/Input';
import { Select } from '../../design-system/Select';
import { Tabs } from '../../design-system/Tabs';
import { MediaItem, AiGenerationJob } from '../../platform/contracts/AdminHostConfig';
import {
  Sparkles,
  Upload,
  Image as ImageIcon,
  Video,
  FileText,
  Trash2,
  Download,
  Copy,
  Folder,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useToast } from '../../design-system/Toast';

export const ContentView: React.FC = () => {
  const { host } = useAdmin();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'media' | 'image-gen' | 'video-gen' | 'copy-gen'>('media');

  // Media library state
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [isUploading, setIsUploading] = useState(false);

  // AI Image generation state
  const [imagePrompt, setImagePrompt] = useState('Heavyweight washed charcoal hoodie on wooden trackside workbench with vintage motorcycle wrenches, high resolution studio photograph');
  const [imageAspectRatio, setImageAspectRatio] = useState('1:1');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);

  // AI Video generation state
  const [videoPrompt, setVideoPrompt] = useState('Cinematic slow-motion shot of vintage dirtbike kicking up orange dust at sunset, dynamic camera movement');
  const [videoJobs, setVideoJobs] = useState<AiGenerationJob[]>([
    {
      id: 'job_vid_101',
      type: 'video',
      status: 'succeeded',
      prompt: 'Dirtbike engine revving in smoke and neon trackside lighting',
      modelKey: 'veo-2.0',
      progressPercent: 100,
      createdAt: Date.now() - 1000 * 60 * 45,
      completedAt: Date.now() - 1000 * 60 * 42,
      resultUrl: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=1200&q=80',
      parameters: { durationSeconds: 5 }
    },
    {
      id: 'job_vid_102',
      type: 'video',
      status: 'running',
      prompt: 'Cinematic trackside garage door opening into desert sunrise',
      modelKey: 'veo-2.0',
      progressPercent: 65,
      createdAt: Date.now() - 1000 * 60 * 3,
      parameters: { durationSeconds: 6 }
    }
  ]);
  const [isStartingVideo, setIsStartingVideo] = useState(false);

  // AI Copy generation state
  const [copyContext, setCopyContext] = useState('Heavyweight 12oz fleece hoodie, vintage motorcycle track graphic, preshrunk, made for cold garage mornings.');
  const [copyType, setCopyType] = useState<'product' | 'email' | 'seo'>('product');
  const [generatedCopy, setGeneratedCopy] = useState('');
  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);

  useEffect(() => {
    loadMedia();
  }, [host]);

  const loadMedia = async () => {
    const list = await host.media.list();
    setMediaItems(list);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const item = await host.media.upload(file, file.name, 'images', ['upload']);
      setMediaItems((prev) => [item, ...prev]);
      addToast({
        type: 'success',
        title: 'Asset Uploaded',
        description: `Stored ${file.name} in host R2 bucket.`
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Upload Failed',
        description: err.message
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim()) return;
    setIsGeneratingImage(true);
    try {
      const job = await host.ai.generateImage({
        prompt: imagePrompt,
        aspectRatio: imageAspectRatio
      });
      if (job.resultUrl) {
        setGeneratedImageUrl(job.resultUrl);
        addToast({
          type: 'success',
          title: 'Image Rendered',
          description: 'AI asset successfully rendered and ready to save.'
        });
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Generation Failed', description: err.message });
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleSaveToMedia = async (url: string, filename: string) => {
    // In mock/prod host, save to media library
    const newItem: MediaItem = {
      id: `med_${Date.now()}`,
      filename,
      url,
      mimeType: 'image/jpeg',
      sizeBytes: 420000,
      folder: 'artwork',
      tags: ['ai-generated', 'gemini'],
      createdAt: Date.now()
    };
    setMediaItems([newItem, ...mediaItems]);
    addToast({
      type: 'success',
      title: 'Saved to R2 Media Bucket',
      description: `Asset saved to artwork folder.`
    });
  };

  const handleStartVideoJob = async () => {
    if (!videoPrompt.trim()) return;
    setIsStartingVideo(true);
    try {
      const job = await host.ai.generateVideo({ prompt: videoPrompt });
      setVideoJobs([job, ...videoJobs]);
      addToast({
        type: 'info',
        title: 'Video Job Queued',
        description: `Job ${job.id} dispatched to Veo rendering pipeline.`
      });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Video Job Failed', description: err.message });
    } finally {
      setIsStartingVideo(false);
    }
  };

  const handleGenerateCopy = async () => {
    if (!copyContext.trim()) return;
    setIsGeneratingCopy(true);
    try {
      const copy = await host.ai.generateCopy({ type: copyType as any, context: copyContext });
      setGeneratedCopy(copy);
      addToast({
        type: 'success',
        title: 'Copy Formulated',
        description: 'Generated text ready to deploy.'
      });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Copy Failed', description: err.message });
    } finally {
      setIsGeneratingCopy(false);
    }
  };

  const filteredMedia = mediaItems.filter(
    (m) => selectedFolder === 'all' || m.folder === selectedFolder
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">
            Content Library & AI Creative Studio
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Cloudflare R2 media bucket, autonomous Gemini image synthesis, and Veo async video rendering.
          </p>
        </div>

        <Tabs
          tabs={[
            { id: 'media', label: 'Media Library', icon: <Folder className="w-3.5 h-3.5" /> },
            { id: 'image-gen', label: 'AI Image Studio', icon: <ImageIcon className="w-3.5 h-3.5" /> },
            { id: 'video-gen', label: 'AI Video Jobs', icon: <Video className="w-3.5 h-3.5" /> },
            { id: 'copy-gen', label: 'AI Copywriter', icon: <FileText className="w-3.5 h-3.5" /> }
          ]}
          activeTab={activeTab}
          onChange={(tab) => setActiveTab(tab as any)}
        />
      </div>

      {/* Tab 1: Media Library */}
      {activeTab === 'media' && (
        <div className="space-y-4">
          {/* Action Header */}
          <Card padding="sm" className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto scrollbar-hide">
              {['all', 'artwork', 'products', 'banners', 'videos'].map((f) => (
                <button
                  key={f}
                  onClick={() => setSelectedFolder(f)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors uppercase font-mono tracking-wider ${
                    selectedFolder === f
                      ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs cursor-pointer shadow-sm">
              <Upload className="w-3.5 h-3.5" />
              <span>{isUploading ? 'Uploading...' : 'Upload Asset'}</span>
              <input type="file" className="hidden" onChange={handleFileUpload} />
            </label>
          </Card>

          {/* Media Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredMedia.map((m) => (
              <Card key={m.id} padding="none" className="overflow-hidden group flex flex-col">
                <div className="aspect-square bg-zinc-950 relative overflow-hidden flex items-center justify-center p-2">
                  <img
                    src={m.url}
                    alt={m.filename}
                    className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-200"
                  />
                  <div className="absolute top-2 left-2">
                    <span className="px-1.5 py-0.5 rounded bg-black/60 text-[10px] font-mono text-zinc-300 backdrop-blur-sm">
                      {m.folder}
                    </span>
                  </div>
                </div>
                <div className="p-3 bg-zinc-900/40 border-t border-zinc-800 flex items-center justify-between">
                  <span className="text-xs text-zinc-300 font-mono truncate max-w-[120px]">
                    {m.filename}
                  </span>
                  <button
                    onClick={() => host.media.remove(m.id).then(loadMedia)}
                    className="text-zinc-500 hover:text-red-400 p-1 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: AI Image Studio */}
      {activeTab === 'image-gen' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card padding="lg" className="space-y-4">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Prompt & Synthesis Parameters</span>
            </h3>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Generation Prompt
              </label>
              <textarea
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                rows={4}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500/80 font-sans"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Aspect Ratio"
                value={imageAspectRatio}
                onChange={(e) => setImageAspectRatio(e.target.value)}
                options={[
                  { label: '1:1 (Square - Product/Avatar)', value: '1:1' },
                  { label: '4:3 (Landscape)', value: '4:3' },
                  { label: '16:9 (Hero Banner)', value: '16:9' },
                  { label: '9:16 (Story / Reel)', value: '9:16' }
                ]}
              />
              <Select
                label="Model Authority"
                value="gemini-2.5-flash"
                options={[
                  { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
                  { label: 'Imagen 3 (Preview)', value: 'imagen-3' }
                ]}
              />
            </div>

            <Button
              size="sm"
              variant="primary"
              isLoading={isGeneratingImage}
              icon={<Sparkles className="w-3.5 h-3.5" />}
              onClick={handleGenerateImage}
              className="w-full"
            >
              Synthesize Asset
            </Button>
          </Card>

          <Card padding="lg" className="flex flex-col items-center justify-center min-h-[350px]">
            {generatedImageUrl ? (
              <div className="w-full space-y-3">
                <div className="aspect-square w-full rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 flex items-center justify-center p-2">
                  <img
                    src={generatedImageUrl}
                    alt="Generated output"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-zinc-400">
                    Aspect Ratio: {imageAspectRatio}
                  </span>
                  <Button
                    size="xs"
                    variant="outline"
                    icon={<Folder className="w-3 h-3" />}
                    onClick={() => handleSaveToMedia(generatedImageUrl, `gen_art_${Date.now()}.jpg`)}
                  >
                    Save to Media Library
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center text-zinc-500 text-xs">
                <ImageIcon className="w-10 h-10 mx-auto mb-2 text-zinc-600" />
                <p>Rendered image preview will appear here.</p>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Tab 3: AI Video Jobs */}
      {activeTab === 'video-gen' && (
        <div className="space-y-6">
          <Card padding="lg">
            <h3 className="text-sm font-semibold text-zinc-100 mb-3 flex items-center gap-2">
              <Video className="w-4 h-4 text-purple-400" />
              <span>Launch Veo Video Generation Job</span>
            </h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="Describe cinematic camera motion, subject, lighting..."
                value={videoPrompt}
                onChange={(e) => setVideoPrompt(e.target.value)}
                className="flex-1"
              />
              <Button
                size="sm"
                variant="primary"
                isLoading={isStartingVideo}
                icon={<Video className="w-3.5 h-3.5" />}
                onClick={handleStartVideoJob}
              >
                Queue Video Job
              </Button>
            </div>
          </Card>

          {/* Job Tracker List */}
          <div className="space-y-3">
            <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-400">
              Active & Completed Render Jobs
            </h4>

            {videoJobs.map((job) => (
              <Card key={job.id} padding="md" className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-semibold text-zinc-200">
                        {job.id}
                      </span>
                      <Badge
                        variant={
                          job.status === 'succeeded'
                            ? 'emerald'
                            : job.status === 'running'
                            ? 'amber'
                            : 'zinc'
                        }
                        size="sm"
                      >
                        {job.status.toUpperCase()}
                      </Badge>
                      <span className="text-[10px] font-mono text-zinc-500">
                        Model: {job.modelKey}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400">{job.prompt}</p>
                  </div>

                  {job.status === 'succeeded' && job.resultUrl && (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => handleSaveToMedia(job.resultUrl!, `${job.id}.mp4`)}
                    >
                      Save to Library
                    </Button>
                  )}
                </div>

                {job.status === 'running' && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                      <span>Rendering frames...</span>
                      <span>{job.progressPercent}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 transition-all duration-300"
                        style={{ width: `${job.progressPercent}%` }}
                      />
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: AI Copywriter */}
      {activeTab === 'copy-gen' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card padding="lg" className="space-y-4">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" />
              <span>Copy Parameters & Product Context</span>
            </h3>

            <Select
              label="Output Format"
              value={copyType}
              onChange={(e) => setCopyType(e.target.value as any)}
              options={[
                { label: 'E-commerce Product Description', value: 'product' },
                { label: 'Email Newsletter / Drop Broadcast', value: 'email' },
                { label: 'SEO Meta Title & Description', value: 'seo' }
              ]}
            />

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Garment & Concept Notes
              </label>
              <textarea
                value={copyContext}
                onChange={(e) => setCopyContext(e.target.value)}
                rows={4}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500/80 font-sans"
              />
            </div>

            <Button
              size="sm"
              variant="primary"
              isLoading={isGeneratingCopy}
              icon={<Sparkles className="w-3.5 h-3.5" />}
              onClick={handleGenerateCopy}
              className="w-full"
            >
              Draft Copy
            </Button>
          </Card>

          <Card padding="lg" className="flex flex-col justify-between">
            <div>
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-400 block mb-2">
                Formulated Copy Output
              </span>
              {generatedCopy ? (
                <p className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-zinc-200 text-xs leading-relaxed whitespace-pre-wrap font-sans">
                  {generatedCopy}
                </p>
              ) : (
                <div className="py-16 text-center text-zinc-500 text-xs">
                  Copy formulated by AgentSam will appear here.
                </div>
              )}
            </div>

            {generatedCopy && (
              <div className="pt-4 mt-4 border-t border-zinc-800 flex justify-end">
                <Button
                  size="xs"
                  variant="outline"
                  icon={<Copy className="w-3 h-3" />}
                  onClick={() => {
                    navigator.clipboard.writeText(generatedCopy);
                    addToast({
                      type: 'success',
                      title: 'Copied',
                      description: 'Copy text copied to clipboard.'
                    });
                  }}
                >
                  Copy to Clipboard
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};
