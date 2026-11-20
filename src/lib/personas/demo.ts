import type { GuideEvent } from "../events";
import type { GuideRequest } from "../schemas";
import type { Board } from "../whiteboard";

/** Scripted personas for demo mode: no API calls, the whole app can be tried offline. */

export const PYTHAGORAS_BOARD: Board = {
  title: "Pythagoras' theorem",
  steps: [
    {
      caption: "A right-angled triangle. The right angle is at C.",
      elements: [
        { type: "path", points: [[200, 480], [560, 480], [200, 210]], smooth: false, closed: true, color: "white" },
        { type: "rect", x: 200, y: 450, width: 30, height: 30, color: "white" },
        { type: "point", x: 200, y: 480, label: "C", color: "white" },
        { type: "point", x: 560, y: 480, label: "B", color: "white" },
        { type: "point", x: 200, y: 210, label: "A", color: "white" },
      ],
    },
    {
      caption: "The two shorter sides are a and b. The longest side, opposite the right angle, is the hypotenuse c.",
      elements: [
        { type: "text", x: 370, y: 530, text: "a = 4", size: 30, color: "blue" },
        { type: "text", x: 110, y: 350, text: "b = 3", size: 30, color: "blue" },
        { type: "text", x: 400, y: 320, text: "c = ?", size: 30, color: "yellow" },
      ],
    },
    {
      caption: "The theorem: the square on the hypotenuse equals the sum of the squares on the other two sides.",
      elements: [{ type: "math", x: 640, y: 200, latex: "a^2 + b^2 = c^2", size: 38, color: "yellow" }],
    },
    {
      caption: "Put in the numbers and take the square root.",
      elements: [
        { type: "math", x: 640, y: 290, latex: "4^2 + 3^2 = 16 + 9 = 25", size: 28, color: "white" },
        { type: "math", x: 640, y: 370, latex: "c = \\sqrt{25} = 5", size: 34, color: "pink" },
      ],
    },
  ],
};

const LESSON = `Let us build this from the picture on the board, step by step.

**1. What we have.** A right-angled triangle with the right angle at $C$. The two sides that make the right angle are $a = 4$ and $b = 3$.

**2. The theorem.** For every right-angled triangle,

$$a^2 + b^2 = c^2$$

where $c$ is the **hypotenuse**, the side opposite the right angle (always the longest side).

**3. Why it is true, in one idea.** If you draw a square on each side, the area of the big square on $c$ is exactly the two smaller squares put together. That is all the formula says: *area + area = area*.

**4. Our numbers.** $16 + 9 = 25$, so $c = \\sqrt{25} = 5$.

Now you try: a ladder is 13 m long and its foot is 5 m from the wall. How high up the wall does it reach?`;

function chunks(text: string, size = 24): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isGreeting(msg: string) {
  return /^(hi|hello|hey|namaste|namaskar|nomoskar|good (morning|evening|afternoon)|thanks|thank you|ok|okay)\b/i.test(msg.trim());
}

export async function* runDemoTurn(req: GuideRequest, signal: AbortSignal): AsyncGenerator<GuideEvent> {
  const name = req.profile?.name ?? "friend";
  await sleep(400);

  if (isGreeting(req.message)) {
    yield {
      type: "little_master",
      text: `Hello ${name}! I'm Little Master. Ask me anything you're studying and I'll bring Akash Master in. (Demo mode: try "Explain Pythagoras' theorem".)`,
    };
    return;
  }

  const briefing = {
    mode: req.mode ?? ("concept" as const),
    topic: "Pythagoras' theorem",
    studentNeeds: "A clear first-principles explanation with a worked example.",
    focus: "Build intuition before the formula.",
    shouldDraw: true,
  };
  yield { type: "little_master", text: "Great question! Let me take you to Akash Master, he'll draw it out for you." };
  yield { type: "handover", briefing };
  yield { type: "akash_start" };
  await sleep(500);

  const intro = req.image
    ? "Thank you for showing me your working. In demo mode I can't read drawings yet, so let me show you a worked example instead.\n\n"
    : "";
  if (intro) yield { type: "akash_delta", text: intro };
  yield { type: "board", board: PYTHAGORAS_BOARD };

  for (const part of chunks(LESSON)) {
    if (signal.aborted) break;
    yield { type: "akash_delta", text: part };
    await sleep(25);
  }
  yield { type: "akash_end", text: intro + LESSON, boardTitles: [PYTHAGORAS_BOARD.title] };
  if (signal.aborted) return;

  await sleep(300);
  yield {
    type: "notes",
    notes: {
      summary: "Learned Pythagoras' theorem with a 3-4-5 triangle; set a ladder problem as practice.",
      memories: [
        {
          kind: "progress",
          subject: "Mathematics",
          topic: "Pythagoras' theorem",
          fact: "Has been introduced to a^2 + b^2 = c^2 using the 3-4-5 triangle.",
          confidence: 0.7,
        },
      ],
    },
  };
}
