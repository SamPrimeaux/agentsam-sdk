import type { DetectedItem, LogEntry } from '../../lib/robotics/runtime/types';

export function DetectionLogOverlay({ log }: { log: LogEntry }) {
  if (!log.result || !Array.isArray(log.result)) return null;
  const results = log.result as DetectedItem[];
  return (
    <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 pointer-events-none w-full h-full z-10">
      {results.map((item, index) => {
        if (item.box_2d) { const [ymin, xmin, ymax, xmax] = item.box_2d; return <rect key={index} x={xmin} y={ymin} width={xmax-xmin} height={ymax-ymin} fill="rgba(79,70,229,0.15)" stroke="#4f46e5" strokeWidth="2" vectorEffect="non-scaling-stroke" />; }
        if (item.point) { const [y, x] = item.point; return <circle key={index} cx={x} cy={y} r="10" fill="#4f46e5" stroke="white" strokeWidth="2" vectorEffect="non-scaling-stroke" />; }
        return null;
      })}
    </svg>
  );
}
