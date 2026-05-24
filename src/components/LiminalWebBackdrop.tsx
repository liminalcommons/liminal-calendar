/**
 * LiminalWebBackdrop — a decorative, breathing node-graph rendered behind the
 * landing copy. The "Liminal Web" is canonically depicted as a network map of
 * interlinked sensemaking communities; this echoes that symbol (and the Glass
 * Bead Game's own node art) as a slow living constellation in the grove
 * palette.
 *
 * Deterministic by construction — fixed node/edge coordinates, index-derived
 * animation delays, no `Math.random()` / `new Date()` in render — so it is
 * hydration-safe and cannot reintroduce a React #418 mismatch. Purely
 * decorative: aria-hidden, pointer-events: none.
 */

// Clustered layout in a 0 0 800 600 viewBox: five hubs (larger nodes) with
// satellites around them, the way the liminal-web map shows overlapping
// communities. Hubs first so edges can reference them by index.
const NODES: { x: number; y: number; r: number; hub?: boolean }[] = [
  // hubs
  { x: 400, y: 300, r: 4, hub: true }, // 0 — center
  { x: 190, y: 170, r: 3.5, hub: true }, // 1
  { x: 630, y: 190, r: 3.5, hub: true }, // 2
  { x: 250, y: 470, r: 3.5, hub: true }, // 3
  { x: 580, y: 450, r: 3.5, hub: true }, // 4
  // satellites
  { x: 110, y: 280, r: 2.5 }, // 5
  { x: 300, y: 90, r: 2.5 }, // 6
  { x: 500, y: 110, r: 2.5 }, // 7
  { x: 710, y: 320, r: 2.5 }, // 8
  { x: 450, y: 520, r: 2.5 }, // 9
  { x: 150, y: 430, r: 2.5 }, // 10
  { x: 690, y: 500, r: 2.5 }, // 11
  { x: 360, y: 200, r: 2.5 }, // 12
  { x: 520, y: 330, r: 2.5 }, // 13
  { x: 280, y: 350, r: 2.5 }, // 14
];

// Edges as [from, to] node indices — hub-to-hub plus hub-to-satellite, the
// overlapping-community topology of the liminal-web map.
const EDGES: [number, number][] = [
  [0, 1], [0, 2], [0, 3], [0, 4],
  [0, 12], [0, 13], [0, 14],
  [1, 5], [1, 6], [1, 12], [1, 14],
  [2, 7], [2, 8], [2, 12], [2, 13],
  [3, 10], [3, 14], [3, 9],
  [4, 11], [4, 13], [4, 9],
  [1, 2], [3, 4],
];

export function LiminalWebBackdrop({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className={`pointer-events-none select-none text-grove-accent ${className}`}
      style={{
        // Radial fade so the center (where the copy sits) stays clear and the
        // web dissolves toward the edges.
        maskImage:
          'radial-gradient(ellipse 70% 70% at 50% 45%, transparent 8%, black 75%)',
        WebkitMaskImage:
          'radial-gradient(ellipse 70% 70% at 50% 45%, transparent 8%, black 75%)',
      }}
    >
      <g className="liminal-web-drift">
        {EDGES.map(([a, b], i) => (
          <line
            key={`e${i}`}
            className="liminal-edge"
            x1={NODES[a].x}
            y1={NODES[a].y}
            x2={NODES[b].x}
            y2={NODES[b].y}
            stroke="currentColor"
            strokeWidth={0.6}
            style={{ animationDelay: `${(i % 6) * 0.9}s` }}
          />
        ))}
        {NODES.map((n, i) => (
          <circle
            key={`n${i}`}
            className="liminal-node"
            cx={n.x}
            cy={n.y}
            r={n.r}
            fill="currentColor"
            style={{ animationDelay: `${(i % 7) * 0.8}s` }}
          />
        ))}
      </g>
    </svg>
  );
}
