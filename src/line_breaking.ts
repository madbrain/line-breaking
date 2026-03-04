import { hyphenate, type HyphenateTreeNode } from "./hyphenate";

export interface ParagraphElement {
  type: string;
}

export interface BreakableElement {
  penalty(): number;
  penaltyWidth(): number;
  isFlagged(): boolean;
}

export class Box implements ParagraphElement {
  type = "box";
  constructor(
    public content: any,
    public width: number /* w_i */,
  ) {}
}

const INFINITE_STRETCH = 100000;

export class Glue implements ParagraphElement, BreakableElement {
  type = "glue";
  constructor(
    public width: number, // w_i
    public stretchability: number, // y_i
    public shrinkability: number, // z_i
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

function makeInterWordGlue(v: number) {
  return new Glue(v, v / 2, v / 3);
}

const FINISHING_GLUE = new Glue(0, INFINITE_STRETCH, 0);

const MANDATORY_BREAK = -1000;
const PROHIBITED_BREAK = 1000;

export class Penalty implements ParagraphElement, BreakableElement {
  type = "penalty";
  constructor(
    public width: number, // w_i
    public value: number, // p_i
    public flagged: boolean, // f_i
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

  isProhibitedBreak() {
    return this.value == PROHIBITED_BREAK;
  }
}

const FORCE_BREAK = new Penalty(0, MANDATORY_BREAK, true);

const HYPHEN_PENALTY = 50;

function makeHyphenPenalty(width: number) {
  return new Penalty(width, HYPHEN_PENALTY, true);
}

export enum FitnessClass {
  TIGHT_LINE,
  NORMAL_LINE,
  LOOSE_LINE,
  VERY_LOOSE_LINE,
}

export function getFitnessClass(r: number): FitnessClass {
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

let nodeId = 0;

export class Node {
  id = nodeId++;
  flagged = false; // TODO store flagged when creating new nodes

  constructor(
    public endPosition = 0,
    public line = 0,
    public fitness = FitnessClass.NORMAL_LINE,
    public totalWidth = 0,
    public totalStretch = 0,
    public totalShrink = 0,
    public totalDemerits = 0,
    public ratio = 0,
    public previous: Node | null = null,
  ) {}
}

export type LineElement =
  | {
      type: "box";
      content: string;
      width: number;
    }
  | {
      type: "glue";
      width: number;
    };

export class Line {
  constructor(
    public elements: LineElement[],
    public ratio: number,
    public fitness: FitnessClass,
    public node: Node,
  ) {}
}

interface LineQuality {
  demerits: number;
  fitnessClass: FitnessClass;
}

interface LineStats {
  demerits: number;
  node: Node;
  ratio: number;
}

const INFINITE_RATIO = 10000;
const MAXIMUM_SHRINK_RATIO = -1;
const CONSECUTIVE_FLAGGED_PENALTY = 3000;
const CONSECUTIVE_CLASS_PENALTY = 3000;

export class ParagraphLayout {
  activeNodes: Array<Node> = [new Node()];
  widthSum = 0;
  stretchSum = 0;
  shrinkSum = 0;

  // input parameter
  maxRatio = 2;

  constructor(
    private elements: Array<ParagraphElement>,
    private lineWidthValue: number,
  ) {}

  process(): Line[] {
    this.elements.forEach((e, index) => {
      this.processOne(e, index);
    });
    return this.finish();
  }

  processOne(element: ParagraphElement, index: number) {
    if (element.type === "box") {
      this.widthSum += (element as Box).width;
    } else if (element.type === "glue") {
      if (this.elements[index - 1].type == "box") {
        this.processFeasibleBreak(element as any as BreakableElement, index);
      }
      const glue = element as Glue;
      this.widthSum += glue.width;
      this.stretchSum += glue.stretchability;
      this.shrinkSum += glue.shrinkability;
    } /* if e.type === "penalty" */ else {
      const penalty = element as Penalty;
      if (!penalty.isProhibitedBreak()) {
        this.processFeasibleBreak(element as any as BreakableElement, index);
      }
    }
  }

  public finish(): Line[] {
    let bestNode: Node | null = null;
    let currentDemerits = 0;
    this.activeNodes.forEach((node) => {
      if (bestNode == null || node.totalDemerits < currentDemerits) {
        bestNode = node;
        currentDemerits = node.totalDemerits;
      }
    });
    if (!bestNode) {
      throw Error(`no solution! ${this.lineWidthValue}`);
    }
    const nodes: Array<Node> = [];
    while (bestNode && (bestNode as Node).line > 0) {
      let p = bestNode as Node;
      if (p.line > 0) {
        nodes.unshift(p);
        bestNode = p.previous;
      }
    }

    // =============================================

    const lines: Line[] = [];
    for (let nodeIndex = 0; nodeIndex < nodes.length; ++nodeIndex) {
      const node = nodes[nodeIndex];
      lines.push(this.createLine(node));
    }
    return lines;
  }

  createLine(node: Node): Line {
    let lineElements: LineElement[] = [];
    let elementIndex = node.previous ? node.previous.endPosition : 0;

    // Same effect as compute after -> skip previous end of line elements
    while (
      elementIndex < this.elements.length &&
      (this.elements[elementIndex].type === "glue" ||
        this.elements[elementIndex].type === "penalty")
    ) {
      ++elementIndex;
    }

    for (; elementIndex < node.endPosition; ++elementIndex) {
      const e = this.elements[elementIndex];
      if (e.type === "box") {
        const box = e as Box;
        lineElements.push({
          type: "box",
          content: box.content,
          width: box.width,
        });
      } else if (e.type === "glue") {
        const glue = e as Glue;
        let w = glue.width;
        if (node.ratio < 0) {
          w += Math.max(-1, node.ratio) * glue.shrinkability;
        } else {
          w += node.ratio * glue.stretchability;
        }
        lineElements.push({ type: "glue", width: w });
      }
    }
    if (
      node.endPosition < this.elements.length &&
      this.elements[node.endPosition].type === "penalty"
    ) {
      const penalty = this.elements[node.endPosition] as Penalty;
      if (penalty.width > 0) {
        lineElements.push({
          type: "box",
          width: penalty.width,
          content: "-",
        });
      }
    }
    return {
      elements: lineElements,
      ratio: node.ratio,
      fitness: node.fitness,
      node: node,
    };
  }

  private processFeasibleBreak(element: BreakableElement, index: number) {
    const demeritsByClass = new Map<FitnessClass, LineStats>();
    this.activeNodes.slice().forEach((node) => {
      const ratio = this.computeAdjustmentRatio(node, element);
      if (
        ratio < MAXIMUM_SHRINK_RATIO ||
        element.penalty() == MANDATORY_BREAK
      ) {
        if (this.activeNodes.length == 1) {
          const result = this.computeDemeritsAndFitnessClass(
            node,
            element,
            ratio,
          );
          this.updateDemeritsByClass(demeritsByClass, result, node, ratio);
        }
        this.deactivate(node);
      }
      if (MAXIMUM_SHRINK_RATIO <= ratio && ratio < this.maxRatio) {
        const result = this.computeDemeritsAndFitnessClass(
          node,
          element,
          ratio,
        );
        this.updateDemeritsByClass(demeritsByClass, result, node, ratio);
      }
    });
    this.insertNewActiveNodes(demeritsByClass, index);
  }

  private insertNewActiveNodes(
    demeritsByClass: Map<FitnessClass, LineStats>,
    index: number,
  ) {
    if (demeritsByClass.size > 0) {
      demeritsByClass.forEach(({ demerits, node, ratio }, fitness) => {
        // TODO test demerits < min(demerits) + gamma
        const { tw, ty, tz } = this.computeAfter(index);
        const newNode = new Node(
          index,
          node.line + 1,
          fitness,
          tw,
          ty,
          tz,
          demerits,
          ratio,
          node,
        );
        this.activeNodes.push(newNode);
      });
    }
  }

  private deactivate(node: Node) {
    this.activeNodes = this.activeNodes.filter((a) => a != node);
  }

  computeAdjustmentRatio(node: Node, element: BreakableElement) {
    let L = this.widthSum - node.totalWidth + element.penaltyWidth();
    const lineWidth = this.lineWidth(node.line + 1);
    if (L < lineWidth) {
      const Y = this.stretchSum - node.totalStretch;
      if (Y > 0) {
        return (lineWidth - L) / Y;
      } else {
        return INFINITE_RATIO;
      }
    } else if (L > lineWidth) {
      const Z = this.shrinkSum - node.totalShrink;
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
    node: Node,
    element: BreakableElement,
    ratio: number,
  ): LineQuality {
    let d = 0;
    if (element.penalty() >= 0) {
      d = Math.pow(
        1 + 100 * Math.pow(Math.abs(ratio), 3) + element.penalty(),
        2,
      );
    } else if (element.penalty() != MANDATORY_BREAK) {
      d =
        Math.pow(1 + 100 * Math.pow(Math.abs(ratio), 3), 2) -
        Math.pow(element.penalty(), 2);
    } else {
      d = Math.pow(1 + 100 * Math.pow(Math.abs(ratio), 3), 2);
    }
    if (node.flagged && element.isFlagged()) {
      d += CONSECUTIVE_FLAGGED_PENALTY;
    }
    const c = getFitnessClass(ratio);
    if (Math.abs(node.fitness - c) > 1) {
      d += CONSECUTIVE_CLASS_PENALTY;
    }
    d += node.totalDemerits;
    return { demerits: d, fitnessClass: c };
  }

  private updateDemeritsByClass(
    demeritsByClass: Map<FitnessClass, LineStats>,
    lineQuality: LineQuality,
    node: Node,
    ratio: number,
  ) {
    const stats = demeritsByClass.get(lineQuality.fitnessClass);
    if (stats === undefined || lineQuality.demerits < stats.demerits) {
      demeritsByClass.set(lineQuality.fitnessClass, {
        demerits: lineQuality.demerits,
        node: node,
        ratio: ratio,
      });
      // TODO compute global minimum
    }
  }

  /* absorb potential glue and non mandatory penalty after the break */
  private computeAfter(index: number) {
    let tw = this.widthSum;
    let ty = this.stretchSum;
    let tz = this.shrinkSum;
    for (let i = index; i < this.elements.length; ++i) {
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
        if (penalty.value === MANDATORY_BREAK && i > index) {
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

export type WordProcessor = (word: string) => ParagraphElement[];

export type Hyphenator = (word: string) => string[];

export function makeHyphenator(langTree: HyphenateTreeNode): Hyphenator {
  return (word: string) => hyphenate(langTree, word);
}

export function hyphenateWord(
  hyphenator: Hyphenator,
  word: string,
  computeWidth: (word: string) => number,
  hyphenPenalty: Penalty,
) {
  const result: ParagraphElement[] = [];
  const wordAndPunctuations = word.match(/([^.,;:]+)(.*)/);
  if (wordAndPunctuations) {
    const hyphenation = hyphenator(wordAndPunctuations[1]);
    hyphenation.forEach((w, i) => {
      if (i != hyphenation.length - 1) {
        const width = computeWidth(w);
        result.push(new Box(w, width));
        result.push(hyphenPenalty);
      } else {
        const part = w + wordAndPunctuations[2];
        const width = computeWidth(part);
        result.push(new Box(part, width));
      }
    });
  } else {
    throw Error(`bad punctuation regexp '${word}'`);
  }
  return result;
}

export function makeHyphenatorProcessor(
  langTree: HyphenateTreeNode,
  computeWidth: (word: string) => number,
): WordProcessor {
  const hyphenator = makeHyphenator(langTree);
  const hyphenPenalty = makeHyphenPenalty(computeWidth("-"));
  return (word: string) => {
    return hyphenateWord(hyphenator, word, computeWidth, hyphenPenalty);
  };
}

export function createParagraphElements(
  wordProcessor: WordProcessor,
  computeWidth: (word: string) => number,
  content: string,
) {
  const interWordGlue = makeInterWordGlue(computeWidth(" "));
  const words = content.split(/\s+/);
  const elements = words.flatMap((word, i) => {
    const step = [];
    if (i > 0) {
      step.push(interWordGlue);
    }
    const parts = wordProcessor(word);
    step.push(...parts);
    return step;
  });
  return [...elements, FINISHING_GLUE, FORCE_BREAK];
}

export function lineBreak(
  wordProcessor: WordProcessor,
  content: string,
  computeWidth: (word: string) => number,
  lineWidth: number,
) {
  const layout = new ParagraphLayout(
    createParagraphElements(wordProcessor, computeWidth, content),
    lineWidth,
  );
  return layout.process();
}
