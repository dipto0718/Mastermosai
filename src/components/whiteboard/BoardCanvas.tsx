"use client";
import katex from "katex";
import { memo, useMemo } from "react";
import { BOARD_HEIGHT, BOARD_WIDTH, CHALK_HEX, type BoardElement, type BoardStep, type ChalkColour } from "@/lib/whiteboard";

/** Catmull-Rom spline through the points, as SVG cubic Béziers. */
export function smoothPath(points: [number, number][], closed: boolean): string {
  if (points.length < 2) return "";
  const pts = closed ? [points[points.length - 1], ...points, points[0], points[1]] : [points[0], ...points, points[points.length - 1]];
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < pts.length - 2; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`;
  }
  return closed ? d + " Z" : d;
}

function polyPath(points: [number, number][], closed: boolean) {
  return points.map((p, i) => `${i ? "L" : "M"} ${p[0]} ${p[1]}`).join(" ") + (closed ? " Z" : "");
}

function dist(a: [number, number], b: [number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

const STROKE = 3.5;

function Arrowhead({ id, color }: { id: string; color: ChalkColour }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10" fill="none" stroke={CHALK_HEX[color]} strokeWidth="1.6" />
    </marker>
  );
}

function MathLabel({ x, y, latex, size, color, delay, animate }: { x: number; y: number; latex: string; size: number; color: ChalkColour; delay: number; animate: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, { throwOnError: false, displayMode: false, output: "html" });
    } catch {
      return latex;
    }
  }, [latex]);
  const width = Math.min(BOARD_WIDTH - x, Math.max(80, latex.length * size * 0.6));
  return (
    <foreignObject x={x} y={y - size * 1.1} width={width} height={size * 2.2} className={animate ? "chalk-fade" : undefined} style={{ animationDelay: `${delay}s` }}>
      <div className="chalk-math" style={{ color: CHALK_HEX[color], fontSize: size, lineHeight: 1.3, whiteSpace: "nowrap" }} dangerouslySetInnerHTML={{ __html: html }} />
    </foreignObject>
  );
}

function Element({ el, idx, stepKey, animate }: { el: BoardElement; idx: number; stepKey: string; animate: boolean }) {
  const delay = animate ? idx * 0.25 : 0;
  const stroke = (len: number) =>
    animate ? { className: "chalk-stroke", style: { ["--len" as string]: Math.ceil(len + 10), animationDelay: `${delay}s` } } : {};
  const fade = animate ? { className: "chalk-fade", style: { animationDelay: `${delay}s` } } : {};
  const common = { fill: "none", strokeWidth: STROKE, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  switch (el.type) {
    case "text":
      return (
        <text x={el.x} y={el.y} fill={CHALK_HEX[el.color]} fontSize={el.size} fontFamily="var(--font-kalam), var(--font-geist-sans), sans-serif" {...fade}>
          {el.text}
        </text>
      );
    case "math":
      return <MathLabel x={el.x} y={el.y} latex={el.latex} size={el.size} color={el.color} delay={delay} animate={animate} />;
    case "line":
    case "arrow": {
      const markerId = `arrow-${stepKey}-${idx}`;
      return (
        <g>
          {el.type === "arrow" && (
            <defs>
              <Arrowhead id={markerId} color={el.color} />
            </defs>
          )}
          <line
            x1={el.from[0]}
            y1={el.from[1]}
            x2={el.to[0]}
            y2={el.to[1]}
            stroke={CHALK_HEX[el.color]}
            strokeDasharray={el.dashed ? "10 9" : undefined}
            markerEnd={el.type === "arrow" ? `url(#${markerId})` : undefined}
            {...common}
            {...(el.dashed ? fade : stroke(dist(el.from, el.to)))}
          />
        </g>
      );
    }
    case "rect":
      return <rect x={el.x} y={el.y} width={el.width} height={el.height} stroke={CHALK_HEX[el.color]} {...common} {...stroke(2 * (el.width + el.height))} />;
    case "circle":
      return <circle cx={el.cx} cy={el.cy} r={el.r} stroke={CHALK_HEX[el.color]} {...common} {...stroke(2 * Math.PI * el.r)} />;
    case "path": {
      const pts = el.points as [number, number][];
      const d = el.smooth ? smoothPath(pts, el.closed) : polyPath(pts, el.closed);
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
      if (el.closed) len += dist(pts[pts.length - 1], pts[0]);
      return <path d={d} stroke={CHALK_HEX[el.color]} {...common} {...stroke(len * 1.2)} />;
    }
    case "point":
      return (
        <g {...fade}>
          <circle cx={el.x} cy={el.y} r={6} fill={CHALK_HEX[el.color]} />
          {el.label && (
            <text x={el.x + 12} y={el.y - 10} fill={CHALK_HEX[el.color]} fontSize={28} fontFamily="var(--font-kalam), sans-serif">
              {el.label}
            </text>
          )}
        </g>
      );
    case "axes": {
      const [ox, oy] = el.origin;
      const xEnd: [number, number] = [Math.min(BOARD_WIDTH - 10, ox + el.xLength), oy];
      const yEnd: [number, number] = [ox, Math.max(10, oy - el.yLength)];
      const markerId = `axes-${stepKey}-${idx}`;
      return (
        <g>
          <defs>
            <Arrowhead id={markerId} color={el.color} />
          </defs>
          <line x1={ox} y1={oy} x2={xEnd[0]} y2={xEnd[1]} stroke={CHALK_HEX[el.color]} markerEnd={`url(#${markerId})`} {...common} {...stroke(el.xLength)} />
          <line x1={ox} y1={oy} x2={yEnd[0]} y2={yEnd[1]} stroke={CHALK_HEX[el.color]} markerEnd={`url(#${markerId})`} {...common} {...stroke(el.yLength)} />
          <text x={xEnd[0] - 10} y={oy + 34} fill={CHALK_HEX[el.color]} fontSize={26} fontFamily="var(--font-kalam), sans-serif" {...fade}>
            {el.xLabel}
          </text>
          <text x={ox - 34} y={yEnd[1] + 12} fill={CHALK_HEX[el.color]} fontSize={26} fontFamily="var(--font-kalam), sans-serif" {...fade}>
            {el.yLabel}
          </text>
        </g>
      );
    }
  }
}

/** Renders steps 0..upTo. Only the newest step animates. */
export const BoardCanvas = memo(function BoardCanvas({ steps, upTo, boardKey, animate }: { steps: BoardStep[]; upTo: number; boardKey: string; animate: boolean }) {
  return (
    <svg viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} className="block h-full w-full" role="img" aria-label={steps[upTo]?.caption}>
      <defs>
        <filter id="chalk-texture">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.4" />
        </filter>
      </defs>
      <g filter="url(#chalk-texture)">
        {steps.slice(0, upTo + 1).map((step, s) => (
          <g key={`${boardKey}-${s}`}>
            {step.elements.map((el, i) => (
              <Element key={i} el={el} idx={i} stepKey={`${boardKey}-${s}`} animate={animate && s === upTo} />
            ))}
          </g>
        ))}
      </g>
    </svg>
  );
});
