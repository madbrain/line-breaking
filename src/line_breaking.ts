import { hyphenate } from "./hyphenate";

interface ParagraphElement {
  type: string;
}

interface BreakableElement {
  penalty(): number;
  penaltyWidth(): number;
  isFlagged(): boolean;
}

class Box implements ParagraphElement {
  type = "box";
  constructor(public content: any, public width: number /* w_i */) {}
}

const INFINITE_STRETCH = 100000;

class Glue implements ParagraphElement, BreakableElement {
  type = "glue";
  constructor(
    public width: number, // w_i
    public stretchability: number, // y_i
    public shrinkability: number // z_i
  ) {}

  penalty() {
    return 0;
  }

  penaltyWidth() {
    return 0;
  }

  isFlagged() {
    return false;
  }
}

const INTERWORD_GLUE = (v: number) => new Glue(v, v / 2, v / 3);
const FINISHING_GLUE = new Glue(0, INFINITE_STRETCH, 0);

const MANDATORY_BREAK = -1000;
const PROHIBITED_BREAK = 1000;

class Penalty implements ParagraphElement, BreakableElement {
  type = "penalty";
  constructor(
    public width: number, // w_i
    public value: number, // p_i
    public flagged: boolean // f_i
  ) {}

  penalty() {
    return this.value;
  }

  penaltyWidth() {
    return this.width;
  }

  isFlagged() {
    return this.flagged;
  }
}

const FORCE_BREAK = new Penalty(0, MANDATORY_BREAK, true);
const HYPHEN_PENALTY = 50;

enum FitnessClass {
  TIGHT_LINE,
  NORMAL_LINE,
  LOOSE_LINE,
  VERY_LOOSE_LINE,
}

function getFitnessClass(r: number): FitnessClass {
  if (r < -0.5) {
    return FitnessClass.TIGHT_LINE;
  }
  if (r <= 0.5) {
    return FitnessClass.NORMAL_LINE;
  }
  if (r <= 1) {
    return FitnessClass.LOOSE_LINE;
  }
  return FitnessClass.VERY_LOOSE_LINE;
}

class Node {
  flagged = false; // TODO store flagged when creating new nodes

  constructor(
    public position = 0,
    public line = 0,
    public fitness = FitnessClass.NORMAL_LINE,
    public totalWidth = 0,
    public totalStretch = 0,
    public totalShrink = 0,
    public totalDemerits = 0,
    public ratio = 0,
    public previous: Node | null = null
  ) {}
}

const INFINITE_RATIO = 10000;
const MAXIMUM_SHRINK_RATIO = -1;
const CONSECUTIVE_FLAGGED_PENALTY = 3000;
const CONSECUTIVE_CLASS_PENALTY = 3000;

class Context {
  activeNodes: Array<Node> = [new Node()];
  widthSum = 0;
  stretchSum = 0;
  shrinkSum = 0;

  // input parameter
  maxRatio = 2;

  constructor(
    private elements: Array<ParagraphElement>,
    private lineWidthValue: number
  ) {}

  process() {
    this.elements.forEach((e, b) => {
      if (e.type === "box") {
        this.widthSum += (<Box>e).width;
      } else if (e.type === "glue") {
        if (this.elements[b - 1].type == "box") {
          this.processFeasible(<BreakableElement>(<any>e), b);
        }
        const glue = <Glue>e;
        this.widthSum += glue.width;
        this.stretchSum += glue.stretchability;
        this.shrinkSum += glue.shrinkability;
      } /* if e.type === "penalty" */ else {
        const penalty = <Penalty>e;
        if (penalty.value != PROHIBITED_BREAK) {
          this.processFeasible(<BreakableElement>(<any>e), b);
        }
      }
    });
    let current = null;
    let currentDemerits = 0;
    this.activeNodes.forEach((node) => {
      if (current == null || node.totalDemerits < currentDemerits) {
        current = node;
        currentDemerits = node.totalDemerits;
      }
    });
    let lineBreaks: Array<Node> = [];
    while (current.line > 0) {
      lineBreaks.unshift(current);
      current = current.previous;
    }

    // =============================================

    const lines = [];
    let elementIndex = 0;
    for (let lineIndex = 0; lineIndex < lineBreaks.length; ++lineIndex) {
      let currentLine = [];
      lines.push(currentLine);
      const lineBreak = lineBreaks[lineIndex];
      for (; elementIndex < lineBreak.position; ++elementIndex) {
        const e = this.elements[elementIndex];
        if (e.type === "box") {
          currentLine.push(e);
        } else if (e.type === "glue") {
          const glue = <Glue>e;
          let w = glue.width;
          if (lineBreak.ratio < 0) {
            w += lineBreak.ratio * glue.shrinkability;
          } else {
            w += lineBreak.ratio * glue.stretchability;
          }
          currentLine.push({ type: "glue", width: w });
        } /* if e.type === "penalty" */ else {
          // currentLine.push({type: "penalty"});
        }
      }
      if (
        lineBreak.position < this.elements.length &&
        this.elements[lineBreak.position].type === "penalty"
      ) {
        const penalty = <Penalty>this.elements[lineBreak.position];
        if (penalty.width > 0) {
          currentLine.push({ type: "box", width: penalty.width, content: "-" });
        }
      }

      // Same effect as compute after
      while (
        elementIndex < this.elements.length &&
        (this.elements[elementIndex].type === "glue" ||
          this.elements[elementIndex].type === "penalty")
      ) {
        ++elementIndex;
      }
    }

    return lines;
  }

  private processFeasible(e: BreakableElement, b: number) {
    const demeritsByClass = {};
    this.activeNodes.slice().forEach((a) => {
      const r = this.computeAdjustmentRatio(a, e);
      if (r < MAXIMUM_SHRINK_RATIO || e.penalty() == MANDATORY_BREAK) {
        this.deactivate(a);
      }
      if (MAXIMUM_SHRINK_RATIO <= r && r < this.maxRatio) {
        const result = this.computeDemeritsAndFitnessClass(a, e, r);
        this.updateDemeritsByClass(demeritsByClass, result, a);
      }
    });
    this.insertNewActiveNodes(demeritsByClass, b);
    // TODO fail if activeNodes.length == 0
  }

  private insertNewActiveNodes(
    demeritsByClass: { [c: number]: any },
    b: number
  ) {
    if (Object.keys(demeritsByClass).length > 0) {
      Object.keys(demeritsByClass).forEach((c) => {
        const { demerits, node, ratio } = demeritsByClass[c];
        // TODO test demerits < min(demerits) + gamma
        const { tw, ty, tz } = this.computeAfter(b);
        const newNode = new Node(
          b,
          node.line + 1,
          <FitnessClass>(<any>parseInt(c)),
          tw,
          ty,
          tz,
          demerits,
          ratio,
          node
        );
        this.activeNodes.push(newNode);
      });
    }
  }

  private deactivate(node: Node) {
    this.activeNodes = this.activeNodes.filter((a) => a != node);
  }

  private computeAdjustmentRatio(a: Node, e: BreakableElement) {
    let L = this.widthSum - a.totalWidth + e.penaltyWidth();
    const lineWidth = this.lineWidth(a.line + 1);
    if (L < lineWidth) {
      const Y = this.stretchSum - a.totalStretch;
      if (Y > 0) {
        return (lineWidth - L) / Y;
      } else {
        return INFINITE_RATIO;
      }
    } else if (L > lineWidth) {
      const Z = this.shrinkSum - a.totalShrink;
      if (Z > 0) {
        return (lineWidth - L) / Z;
      } else {
        return INFINITE_RATIO;
      }
    } else {
      return 0;
    }
  }

  private computeDemeritsAndFitnessClass(
    a: Node,
    e: BreakableElement,
    r: number
  ) {
    let d = 0;
    if (e.penalty() >= 0) {
      d = Math.pow(1 + 100 * Math.pow(Math.abs(r), 3) + e.penalty(), 2);
    } else if (e.penalty() != MANDATORY_BREAK) {
      d =
        Math.pow(1 + 100 * Math.pow(Math.abs(r), 3), 2) -
        Math.pow(e.penalty(), 2);
    } else {
      d = Math.pow(1 + 100 * Math.pow(Math.abs(r), 3), 2);
    }
    if (a.flagged && e.isFlagged()) {
      d += CONSECUTIVE_FLAGGED_PENALTY;
    }
    const c = getFitnessClass(r);
    if (Math.abs(a.fitness - c) > 1) {
      d += CONSECUTIVE_CLASS_PENALTY;
    }
    d += a.totalDemerits;
    return { demerits: d, fitnessClass: c, ratio: r };
  }

  private updateDemeritsByClass(demeritsByClass, result: any, node: Node) {
    if (
      demeritsByClass[result.fitnessClass] === undefined ||
      result.demerits < demeritsByClass[result.fitnessClass].demerits
    ) {
      demeritsByClass[result.fitnessClass] = {
        demerits: result.demerits,
        node: node,
        ratio: result.ratio,
      };
      // TODO compute global minimum
    }
  }

  /* absorb potential glue and non mandatory penalty after the break */
  private computeAfter(b: number) {
    let tw = this.widthSum;
    let ty = this.stretchSum;
    let tz = this.shrinkSum;
    for (let i = b; i < this.elements.length; ++i) {
      const e = this.elements[i];
      if (e.type === "box") {
        break;
      } else if (e.type === "glue") {
        const glue = <Glue>e;
        tw += glue.width;
        ty += glue.stretchability;
        tz += glue.shrinkability;
      } else {
        const penalty = <Penalty>e;
        if (penalty.value === MANDATORY_BREAK && i > b) {
          break;
        }
      }
    }
    return { tw, ty, tz };
  }

  private lineWidth(lineNumber: number) {
    return this.lineWidthValue;
  }
}

function hyphenateWord(
  langTree,
  word: string,
  computeWidth: (word: string) => number
) {
  const wordAndPunct = word.match(/([^.,;:]+)(.*)/);
  const hyphenation = hyphenate(langTree, wordAndPunct[1]);
  const result = [];
  const hyphenPenalty = new Penalty(computeWidth("-"), HYPHEN_PENALTY, true);
  hyphenation.forEach((w, i) => {
    if (i != hyphenation.length - 1) {
      const width = computeWidth(w);
      result.push(new Box(w, width));
      result.push(hyphenPenalty);
    } else {
      const part = w + wordAndPunct[2];
      const width = computeWidth(part);
      result.push(new Box(part, width));
    }
  });
  return result;
}

function createElements(
  langTree,
  content: string,
  computeWidth: (word: string) => number
) {
  const result = content.split(/[ \n]+/);
  const elements = [];
  const interwordSpace = INTERWORD_GLUE(computeWidth(" "));
  result.forEach((word) => {
    const parts = hyphenateWord(langTree, word, computeWidth);
    elements.push(...parts);
    elements.push(interwordSpace);
  });
  elements.push(FINISHING_GLUE, FORCE_BREAK);
  return elements;
}

export function lineBreak(
  langTree,
  content: string,
  computeWidth: (word: string) => number,
  lineWidth: number
) {
  const context = new Context(
    createElements(langTree, content, computeWidth),
    lineWidth
  );
  return context.process();
}
