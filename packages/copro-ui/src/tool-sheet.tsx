import React, { useState } from "react";
import { CoProSheet } from "./sheet";

export function CoProToolSheet({
  tool,
  open,
  onClose,
}: {
  tool: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(100);
  const [text, setText] = useState("");
  const title = tool ? tool.charAt(0).toUpperCase() + tool.slice(1) : "Tool";

  return (
    <CoProSheet open={open} title={title} detent="half" onClose={onClose}>
      {tool === "speed" ? (
        <div className="copro-tool-control">
          <div className="copro-value-row"><span>Speed</span><strong>{speed.toFixed(2)}×</strong></div>
          <input type="range" min=".25" max="4" step=".05" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
          <div className="copro-preset-row">{[.5,1,1.5,2].map((value) => <button className={speed === value ? "is-active" : ""} key={value} onClick={() => setSpeed(value)}>{value}×</button>)}</div>
        </div>
      ) : tool === "volume" || tool === "audio" ? (
        <div className="copro-tool-control">
          <div className="copro-value-row"><span>Volume</span><strong>{volume}%</strong></div>
          <input type="range" min="0" max="200" value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
          <div className="copro-toggle-list"><button>Fade in</button><button>Fade out</button><button>Noise cleanup</button></div>
        </div>
      ) : tool === "text" || tool === "captions" ? (
        <div className="copro-tool-control">
          <label className="copro-text-field"><span>{tool === "captions" ? "Caption" : "Text"}</span><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={tool === "captions" ? "Type caption…" : "Add text…"}/></label>
          <div className="copro-toggle-list"><button>Style</button><button>Position</button><button>Animation</button></div>
        </div>
      ) : tool === "effects" || tool === "templates" ? (
        <div className="copro-tool-grid">
          {["Clean","Punch","Soft","Film","Mono","Warm"].map((label) => <button key={label}><i>{label.slice(0,1)}</i><span>{label}</span></button>)}
        </div>
      ) : tool === "media" ? (
        <div className="copro-media-import">
          <input id="copro-file-input" type="file" accept="video/*,audio/*,image/*" multiple />
          <label htmlFor="copro-file-input" className="copro-file-picker"><b>＋</b><strong>Choose media</strong><span>Video, image, or audio from this device</span></label>
        </div>
      ) : (
        <div className="copro-capability-note">
          <strong>{title}</strong>
          <p>This control is not available in the current local capability set yet.</p>
        </div>
      )}
    </CoProSheet>
  );
}
