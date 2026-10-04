import React, { useEffect, useState } from "react";
import { CoProSheet } from "./sheet";

export function CoProToolSheet({
  tool,
  open,
  onClose,
  initialSpeed = 1,
  initialVolume = 1,
  initialText = "",
  hasSelection = false,
  onSpeedChange,
  onVolumeChange,
  onTextCommit,
  onMediaPicked,
}: {
  tool: string | null;
  open: boolean;
  onClose: () => void;
  initialSpeed?: number;
  initialVolume?: number;
  initialText?: string;
  hasSelection?: boolean;
  onSpeedChange?: (rate: number) => void;
  onVolumeChange?: (volume: number) => void;
  onTextCommit?: (text: string, kind: "overlay" | "captions") => void;
  onMediaPicked?: (file: File) => void;
}) {
  const [speed, setSpeed] = useState(initialSpeed);
  const [volume, setVolume] = useState(Math.round(initialVolume * 100));
  const [text, setText] = useState(initialText);

  useEffect(() => setSpeed(initialSpeed), [initialSpeed, tool]);
  useEffect(() => setVolume(Math.round(initialVolume * 100)), [initialVolume, tool]);
  useEffect(() => setText(initialText), [initialText, tool]);

  const title = tool ? tool.charAt(0).toUpperCase() + tool.slice(1) : "Tool";

  return (
    <CoProSheet open={open} title={title} detent="half" onClose={onClose}>
      {tool === "speed" ? (
        <div className="copro-tool-control">
          <div className="copro-value-row"><span>Speed</span><strong>{speed.toFixed(2)}×</strong></div>
          <input
            type="range"
            min=".25"
            max="4"
            step=".05"
            value={speed}
            onChange={(e) => {
              const value = Number(e.target.value);
              setSpeed(value);
              onSpeedChange?.(value);
            }}
          />
          <div className="copro-preset-row">
            {[.5,1,1.5,2].map((value) => (
              <button
                className={Math.abs(speed - value) < .001 ? "is-active" : ""}
                key={value}
                onClick={() => {
                  setSpeed(value);
                  onSpeedChange?.(value);
                }}
              >{value}×</button>
            ))}
          </div>
        </div>
      ) : tool === "volume" || tool === "audio" ? (
        <div className="copro-tool-control">
          <div className="copro-value-row"><span>Volume</span><strong>{volume}%</strong></div>
          <input
            type="range"
            min="0"
            max="200"
            value={volume}
            onChange={(e) => {
              const value = Number(e.target.value);
              setVolume(value);
              onVolumeChange?.(value / 100);
            }}
          />
          <div className="copro-toggle-list">
            <button disabled title="Fade editing lands with audio envelopes">Fade in</button>
            <button disabled title="Fade editing lands with audio envelopes">Fade out</button>
            <button disabled title="Requires audio cleanup capability">Noise cleanup</button>
          </div>
        </div>
      ) : tool === "text" || tool === "captions" ? (
        <div className="copro-tool-control">
          <label className="copro-text-field">
            <span>{tool === "captions" ? "Caption" : "Text"}</span>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={tool === "captions" ? "Type caption…" : "Add text…"}
            />
          </label>
          <button
            className="copro-inline-primary"
            disabled={!text.trim()}
            onClick={() => {
              if (!text.trim()) return;
              onTextCommit?.(text.trim(), tool === "captions" ? "captions" : "overlay");
              onClose();
            }}
          >
            {hasSelection ? "Update" : tool === "captions" ? "Add caption" : "Add text"}
          </button>
          <div className="copro-toggle-list">
            <button disabled title="Style editor is not enabled yet">Style</button>
            <button disabled title="Canvas positioning lands with overlay transforms">Position</button>
            <button disabled title="Animation adapter is not enabled yet">Animation</button>
          </div>
        </div>
      ) : tool === "effects" || tool === "templates" ? (
        <div className="copro-tool-grid">
          {["Clean","Punch","Soft","Film","Mono","Warm"].map((label) => (
            <button disabled title="Effect adapter not enabled yet" key={label}>
              <i>{label.slice(0,1)}</i><span>{label}</span>
            </button>
          ))}
        </div>
      ) : tool === "media" ? (
        <div className="copro-media-import">
          <input
            id="copro-file-input"
            type="file"
            accept="video/*,audio/*,image/*"
            multiple={false}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (!file) return;
              onMediaPicked?.(file);
              onClose();
            }}
          />
          <label htmlFor="copro-file-input" className="copro-file-picker">
            <b>＋</b><strong>Choose media</strong><span>Video, image, or audio from this device</span>
          </label>
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
