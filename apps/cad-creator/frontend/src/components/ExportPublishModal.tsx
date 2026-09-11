import React, { useState } from 'react';
import {
  X,
  Download,
  Share2,
  HardDrive,
  Github,
  Cloud,
  Server,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Layers,
  Sparkles,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { DesignProject, ExportFormat, PublisherDestinationId, DesignArtifact, PublishResult } from '@inneranimalmedia/agentsam-cad-shared';
import { exportProjectToArtifact, downloadFile } from '../lib/exporters';
import { listPublishers, getPublisher } from '../lib/publishers';

interface ExportPublishModalProps {
  project: DesignProject;
  isOpen: boolean;
  onClose: () => void;
  canExport: boolean;
}

export const ExportPublishModal: React.FC<ExportPublishModalProps> = ({
  project,
  isOpen,
  onClose,
  canExport,
}) => {
  const [selectedTab, setSelectedTab] = useState<'export' | 'publish'>('export');
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('dxf');
  const [selectedDestination, setSelectedDestination] = useState<PublisherDestinationId>('github');
  const [commitMessage, setCommitMessage] = useState<string>(
    `Release spatial design v${project.version || 1}: ${project.name}`
  );
  const [credentials, setCredentials] = useState<Record<string, string>>({
    repoOwner: '',
    repoName: 'agentsam-cad-project',
    branch: 'main',
    token: '',
    endpointUrl: '',
    apiKey: '',
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const publishers = listPublishers();
  const currentPublisher = getPublisher(selectedDestination);

  const FORMAT_DESCRIPTIONS: Record<ExportFormat, { label: string; desc: string; ext: string; icon: string }> = {
    dxf: { label: 'AutoCAD DXF (R12)', desc: 'Industry-standard 2D CAD with WALLS, DOORS, and ROOM_LABELS layers.', ext: '.dxf', icon: '📐' },
    svg: { label: 'Vector Plan (SVG)', desc: 'Crisp architectural plan with title block, grid, and dimension callouts.', ext: '.svg', icon: '🎨' },
    obj: { label: 'Wavefront 3D (OBJ)', desc: '3D polygonal mesh of walls, floors, and spatial volumes in real-world meters.', ext: '.obj', icon: '🧊' },
    scad: { label: 'OpenSCAD Script (SCAD)', desc: 'Pure code parametric script with CSG boolean subtractions for doors/windows.', ext: '.scad', icon: '💻' },
    stl: { label: 'Fabrication Mesh (STL)', desc: 'Watertight triangulated mesh ready for 3D printing and CNC slicers.', ext: '.stl', icon: '🖨️' },
    json: { label: 'Canonical Project (JSON)', desc: 'Complete AgentSam Design Studio project schema with layers, metadata & history.', ext: '.json', icon: '📄' },
    gltf: { label: 'GLTF 2.0 (JSON)', desc: 'Web3D and metaverse ready spatial transmission schema.', ext: '.gltf', icon: '🌐' },
    '3mf': { label: '3D Manufacturing Format', desc: 'Compact manufacturing container with material and unit metadata.', ext: '.3mf', icon: '📦' },
  };

  const handleDownloadSingle = async (format: ExportFormat) => {
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const artifact = await exportProjectToArtifact(project, format);
      const str = typeof artifact.content === 'string' ? artifact.content : new TextDecoder().decode(artifact.content);
      downloadFile(str, artifact.filename, artifact.mimeType);
    } catch (err: any) {
      setErrorMessage(err.message || 'Export failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePublish = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    setPublishResult(null);

    try {
      // 1. Generate core bundle artifacts
      const formats: ExportFormat[] = ['json', 'svg', 'dxf', 'scad', 'obj'];
      const artifacts: DesignArtifact[] = [];

      for (const fmt of formats) {
        const art = await exportProjectToArtifact(project, fmt);
        artifacts.push(art);
      }

      // 2. Publish through selected provider
      const result = await currentPublisher.publishProject(project, artifacts, {
        destination: selectedDestination,
        commitMessage,
        credentials,
      });

      setPublishResult(result);
    } catch (err: any) {
      setErrorMessage(err.message || 'Publishing failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Export & Publish CAD Artifacts</h2>
              <p className="text-xs text-slate-400">
                {project.name} (v{project.version || 1})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-6">
          <button
            onClick={() => setSelectedTab('export')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center space-x-2 transition ${
              selectedTab === 'export'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>Direct File Export</span>
          </button>
          <button
            onClick={() => setSelectedTab('publish')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center space-x-2 transition ${
              selectedTab === 'publish'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cloud className="w-4 h-4" />
            <span>Publish & Cloud Adapters</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {publishResult && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-2">
              <div className="flex items-center space-x-2 text-emerald-400 text-xs font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                <span>{publishResult.message}</span>
              </div>
              {publishResult.targetUrl && (
                <div className="flex items-center space-x-2 text-xs">
                  <span className="text-slate-400">Target URL:</span>
                  <a
                    href={publishResult.targetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline flex items-center space-x-1"
                  >
                    <span>{publishResult.targetUrl}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          )}

          {selectedTab === 'export' ? (
            <div className="space-y-3">
              <span className="text-xs font-semibold text-slate-300 block">
                Select Format for Single-Click Download:
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                {(['dxf', 'svg', 'obj', 'scad', 'stl', 'json'] as ExportFormat[]).map((fmt) => {
                  const meta = FORMAT_DESCRIPTIONS[fmt];
                  return (
                    <div
                      key={fmt}
                      onClick={() => setSelectedFormat(fmt)}
                      className={`p-3 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                        selectedFormat === fmt
                          ? 'bg-blue-950/40 border-blue-500/50'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="text-base">{meta.icon}</span>
                          <div>
                            <span className="text-xs font-bold text-white block">{meta.label}</span>
                            <span className="text-[10px] text-slate-500 font-mono">{meta.ext}</span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadSingle(fmt);
                          }}
                          disabled={!canExport || isProcessing}
                          className="p-1.5 bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white rounded-lg transition"
                          title={`Download ${meta.label}`}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-2 line-clamp-2">{meta.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Destination selector */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-2">
                  Select Publishing Adapter:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {publishers.map((pub) => {
                    const isSelected = selectedDestination === pub.id;
                    return (
                      <div
                        key={pub.id}
                        onClick={() => setSelectedDestination(pub.id)}
                        className={`p-3 rounded-xl border cursor-pointer transition text-center space-y-1 ${
                          isSelected
                            ? 'bg-blue-950/40 border-blue-500/50 text-white'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex justify-center">
                          {pub.id === 'github' && <Github className="w-5 h-5 text-indigo-400" />}
                          {pub.id === 'cloudflare' && <Cloud className="w-5 h-5 text-amber-400" />}
                          {pub.id === 'local' && <HardDrive className="w-5 h-5 text-blue-400" />}
                          {pub.id === 'docker' && <Server className="w-5 h-5 text-emerald-400" />}
                        </div>
                        <span className="text-xs font-bold block">{pub.displayName}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Dynamic Credentials & options form */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center space-x-2 text-xs text-slate-300 font-semibold">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Adapter Configuration & Security Manifest</span>
                </div>

                {currentPublisher.capabilities.authFields?.map((field) => (
                  <div key={field.key} className="space-y-1">
                    <label className="text-[11px] text-slate-400 block">{field.label}</label>
                    <input
                      type={field.type}
                      placeholder={field.placeholder}
                      value={credentials[field.key] || ''}
                      onChange={(e) => setCredentials({ ...credentials, [field.key]: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                ))}

                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400 block">Commit / Release Note</label>
                  <input
                    type="text"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            {project.walls.length} walls • {project.rooms.length} rooms • {(project.parametricObjects || []).length} parametric assemblies
          </span>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition"
            >
              Close
            </button>

            {selectedTab === 'export' ? (
              <button
                onClick={() => handleDownloadSingle(selectedFormat)}
                disabled={!canExport || isProcessing}
                className="flex items-center space-x-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow transition disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isProcessing ? 'Generating...' : `Export ${selectedFormat.toUpperCase()}`}</span>
              </button>
            ) : (
              <button
                onClick={handlePublish}
                disabled={!canExport || isProcessing}
                className="flex items-center space-x-1.5 px-4 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold shadow transition disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isProcessing ? 'Publishing Package...' : 'Publish to Target'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
