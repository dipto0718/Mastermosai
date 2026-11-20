import { z } from "zod";

/** Fixed board coordinate space so a board looks the same on every screen. */
export const BOARD_WIDTH = 1000;
export const BOARD_HEIGHT = 600;

/** Chalk colours. Each one carries a meaning Akash Master uses consistently. */
export const CHALK_COLOURS = ["white", "yellow", "blue", "pink", "green", "orange"] as const;
export const ChalkColour = z.enum(CHALK_COLOURS);
export type ChalkColour = z.infer<typeof ChalkColour>;

export const CHALK_HEX: Record<ChalkColour, string> = {
  white: "#f4f1e8",
  yellow: "#f7d774",
  blue: "#8ec9ff",
  pink: "#f6a5c0",
  green: "#9be39b",
  orange: "#ffb37a",
};

const X = z.number().min(0).max(BOARD_WIDTH);
const Y = z.number().min(0).max(BOARD_HEIGHT);
const Point = z.tuple([X, Y]);
const colour = ChalkColour.default("white");

const TextEl = z.object({
  type: z.literal("text"),
  x: X,
  y: Y,
  text: z.string().min(1).max(200),
  size: z.number().min(12).max(72).default(28),
  color: colour,
});
const MathEl = z.object({
  type: z.literal("math"),
  x: X,
  y: Y,
  latex: z.string().min(1).max(400),
  size: z.number().min(12).max(72).default(30),
  color: colour,
});
const LineEl = z.object({
  type: z.enum(["line", "arrow"]),
  from: Point,
  to: Point,
  color: colour,
  dashed: z.boolean().default(false),
});
const RectEl = z.object({
  type: z.literal("rect"),
  x: X,
  y: Y,
  width: z.number().min(1).max(BOARD_WIDTH),
  height: z.number().min(1).max(BOARD_HEIGHT),
  color: colour,
});
const CircleEl = z.object({
  type: z.literal("circle"),
  cx: X,
  cy: Y,
  r: z.number().min(1).max(300),
  color: colour,
});
const PathEl = z.object({
  type: z.literal("path"),
  points: z.array(Point).min(2).max(200),
  smooth: z.boolean().default(false).describe("Draw as a smooth curve through the points"),
  closed: z.boolean().default(false),
  color: colour,
});
const PointEl = z.object({
  type: z.literal("point"),
  x: X,
  y: Y,
  label: z.string().max(40).default(""),
  color: colour,
});
const AxesEl = z.object({
  type: z.literal("axes"),
  origin: Point,
  xLength: z.number().min(20).max(BOARD_WIDTH),
  yLength: z.number().min(20).max(BOARD_HEIGHT),
  xLabel: z.string().max(20).default("x"),
  yLabel: z.string().max(20).default("y"),
  color: colour,
});

export const BoardElement = z.discriminatedUnion("type", [
  TextEl,
  MathEl,
  LineEl,
  RectEl,
  CircleEl,
  PathEl,
  PointEl,
  AxesEl,
]);
export type BoardElement = z.infer<typeof BoardElement>;

export const BoardStep = z.object({
  caption: z.string().min(1).max(300),
  elements: z.array(BoardElement).max(30),
});
export type BoardStep = z.infer<typeof BoardStep>;

export const Board = z.object({
  title: z.string().min(1).max(120),
  steps: z.array(BoardStep).min(1).max(12),
});
export type Board = z.infer<typeof Board>;

/** Validates model output before it reaches the student. Returns a readable error for Akash Master. */
export function validateBoard(input: unknown): { ok: true; board: Board } | { ok: false; error: string } {
  const parsed = Board.safeParse(input);
  if (parsed.success) return { ok: true, board: parsed.data };
  const issues = parsed.error.issues
    .slice(0, 8)
    .map((i) => `${i.path.join(".") || "(board)"}: ${i.message}`)
    .join("; ");
  return { ok: false, error: `Invalid board, nothing was shown to the student. Fix and draw again. ${issues}` };
}

export const WHITEBOARD_TOOL_DESCRIPTION = `Draw on the classroom chalkboard beside the chat. The student sees it step by step with a chalk animation.
Coordinate space is fixed: x 0-${BOARD_WIDTH} (left to right), y 0-${BOARD_HEIGHT} (top to bottom). Keep a 30px margin.
Give 1-12 steps; each step adds up to 30 elements on top of the previous steps and has a short caption.
Element types: text, math (LaTeX, no $ delimiters), line, arrow, rect, circle, path (points; smooth for curves), point (labelled dot), axes.
Chalk colours carry meaning: white = normal, yellow = notice this, blue = given/known, green = correct/result, pink or orange = warning or final answer.
Use large, readable sizes (text 24-36). Do not crowd: a phone shows the board about 330px wide.`;
