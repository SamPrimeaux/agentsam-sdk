import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { evidenceError } from './contract.js';

const defaultExec = promisify(execFile);
const BIG = { maxBuffer: 32 * 1024 * 1024 };

/**
 * Media adapter for `seal`: probes a stored video and proves it decodes. A passing probe is a
 * decoder smoke check, not visual parity. Browser recordings often lack a duration header, so the
 * duration falls back to what the decoder actually read.
 */
export function createFfprobeMedia({ ffprobe = 'ffprobe', ffmpeg = 'ffmpeg', decode = true, exec = defaultExec } = {}) {
  return {
    async probe({ path: file }) {
      if (typeof file !== 'string' || file.length === 0) throw evidenceError('evidence_media_path_required');
      const { stdout } = await exec(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file], BIG);
      const meta = JSON.parse(stdout);
      const streams = meta.streams ?? [];
      const video = streams.find((s) => s.codec_type === 'video');
      const audio = streams.find((s) => s.codec_type === 'audio');
      let seconds = Number(meta.format?.duration ?? video?.duration);
      let decoded = null;
      if (decode && video) {
        try {
          const { stderr } = await exec(ffmpeg, ['-nostdin', '-v', 'error', '-xerror', '-stats', '-i', file, '-map', '0:v:0', '-f', 'null', '-'], BIG);
          decoded = true;
          if (!Number.isFinite(seconds) || seconds <= 0) {
            const times = [...String(stderr).matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
            const last = times.at(-1);
            if (last) seconds = Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]);
          }
        } catch { decoded = false; }
      }
      return {
        container: meta.format?.format_name ?? null,
        durationMs: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null,
        video: video ? { codec: video.codec_name, width: video.width, height: video.height, frames: video.nb_frames ? Number(video.nb_frames) : null } : null,
        audio: audio ? { codec: audio.codec_name, channels: audio.channels } : null,
        decoded,
      };
    },
  };
}
