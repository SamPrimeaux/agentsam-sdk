import React, { useMemo, useState } from "react";
import { CoProSheet } from "./sheet";

type ExportState = "idle" | "preparing" | "rendering" | "encoding" | "finalizing" | "complete" | "cancelled";

export function CoProExportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [resolution, setResolution] = useState("1080x1920");
  const [fps, setFps] = useState("30");
  const [quality, setQuality] = useState("High");
  const [captions, setCaptions] = useState("Separate");
  const [state, setState] = useState<ExportState>("idle");
  const [progress, setProgress] = useState(0);

  const working = !["idle", "complete", "cancelled"].includes(state);
  const label = useMemo(() => state.charAt(0).toUpperCase() + state.slice(1), [state]);

  function runLocalExportFlow() {
    setState("preparing");
    setProgress(8);
    const stages: Array<[ExportState, number, number]> = [
      ["rendering", 36, 350],
      ["encoding", 68, 800],
      ["finalizing", 92, 1250],
      ["complete", 100, 1650],
    ];
    for (const [next, value, delay] of stages) {
      window.setTimeout(() => {
        setState((current) => current === "cancelled" ? current : next);
        setProgress((current) => current === 0 && next !== "complete" ? current : value);
      }, delay);
    }
  }

  return (
    <CoProSheet
      open={open}
      title="Export"
      detent="expanded"
      onClose={onClose}
      footer={
        <button
          className="copro-sheet-primary"
          disabled={working}
          onClick={state === "complete" ? onClose : runLocalExportFlow}
        >
          {state === "complete" ? "Done" : "Export video"}
        </button>
      }
    >
      <div className="copro-export-grid">
        <label><span>Format</span><strong>MP4</strong></label>
        <label><span>Resolution</span><select value={resolution} onChange={(e) => setResolution(e.target.value)}><option>1080x1920</option><option>1920x1080</option><option>1080x1080</option></select></label>
        <label><span>Frame rate</span><select value={fps} onChange={(e) => setFps(e.target.value)}><option>24</option><option>30</option><option>60</option></select></label>
        <label><span>Quality</span><select value={quality} onChange={(e) => setQuality(e.target.value)}><option>Standard</option><option>High</option><option>Maximum</option></select></label>
        <label><span>Codec</span><strong>Automatic</strong></label>
        <label><span>Audio</span><strong>On</strong></label>
        <label><span>Captions</span><select value={captions} onChange={(e) => setCaptions(e.target.value)}><option>Burned in</option><option>Separate</option><option>None</option></select></label>
      </div>

      {state !== "idle" ? (
        <div className="copro-export-progress">
          <div><strong>{label}</strong><span>{progress}%</span></div>
          <div className="copro-progress-track"><i style={{ width: progress + "%" }} /></div>
          {working ? <button onClick={() => { setState("cancelled"); setProgress(0); }}>Cancel</button> : null}
          {state === "cancelled" ? <p>Export cancelled. Your project is unchanged.</p> : null}
          {state === "complete" ? <p>Local export workflow complete. Production render adapters plug into this same job UI.</p> : null}
        </div>
      ) : null}
    </CoProSheet>
  );
}
