<script lang="ts">
  import dagre from "@dagrejs/dagre";
  import { onMount } from "svelte";
  import {
    Box,
    Glue,
    type ParagraphElement,
    type Node,
    createParagraphElements,
    makeHyphenatorProcessor,
    Penalty,
    ParagraphLayout,
    Line,
    type BreakableElement,
    getFitnessClass,
  } from "./line_breaking";
  import fr from "./fr.json";
  import type { HyphenateTreeNode } from "./hyphenate";
  import Graph from "./Graph.svelte";

  let content = `J'ai été condamné à l'amende pour avoir vu passer une chienne,
j'ai pensé être empalé pour un griffon, j'ai été envoyé au supplice parce que
j'avais fait des vers à la louange du roi, j'ai été sur le point d'être étranglé
parce que la reine avait des rubans jaunes, et me voici esclave avec toi parce
qu'un brutal a battu sa maîtresse.`;

  let paragraphCanvasElement: HTMLCanvasElement;
  let context: CanvasRenderingContext2D;

  let lineWidth = 360;
  let maxRatio = 2;
  let doHyphenate = true;

  let step = -30;
  let elements: ParagraphElement[] = [];
  let layout: ParagraphLayout;
  let index = 0;
  let graph = new dagre.graphlib.Graph();

  $: lineWidth, maxRatio, doHyphenate, textChanged();

  onMount(() => {
    context = paragraphCanvasElement.getContext("2d")!;
    if (false) {
      const interval = setInterval(() => {
        lineWidth += step;
        if (lineWidth < 350 || lineWidth > 900) {
          step = -step;
        }
        textChanged();
      }, 1000);
      textChanged();

      return () => clearInterval(interval);
    } else {
      textChanged();
    }
  });

  function computeWidth(word: string) {
    context.font = "20px Arial";
    return context.measureText(word).width;
  }

  function simpleWordProcessor(word: string) {
    return [new Box(word, computeWidth(word))];
  }

  function textChanged() {
    if (!context) return;

    const wordProcessor = doHyphenate
      ? makeHyphenatorProcessor(fr as any as HyphenateTreeNode, computeWidth)
      : simpleWordProcessor;

    elements = createParagraphElements(wordProcessor, computeWidth, content);
    layout = new ParagraphLayout(elements, lineWidth);
    layout.maxRatio = maxRatio;
    index = 0;

    nodeId = 0;
    mergedNodes.clear();

    // renderParagraph(layout.process());
    // graph = makeGraph();
  }

  function restart() {
    textChanged();
    renderParagraph([]);
  }

  function terminate() {
    while (index < elements.length) {
      layout.processOne(elements[index], index);
      index += 1;
      graph = makeGraph();
    }
    renderParagraph(layout.finish());
  }

  function createTempNode(node: Node, element: ParagraphElement): Node {
    const fakeBreakable = {
      penaltyWidth() {
        return 0;
      },
    } as BreakableElement;
    const ratio = layout.computeAdjustmentRatio(
      node,
      element.type === "penalty"
        ? (element as any as BreakableElement)
        : fakeBreakable,
    );
    const fitness = getFitnessClass(ratio);
    return {
      id: 0,
      flagged: false,
      endPosition: index + 1,
      line: node.line + 1,
      ratio,
      fitness,
      totalDemerits: 0,
      totalShrink: 0,
      totalStretch: 0,
      totalWidth: 0,
      previous: node,
    };
  }

  function next() {
    if (index < elements.length) {
      const element = elements[index];
      layout.processOne(element, index);
      const activeNodeLines = layout.activeNodes.map((node) =>
        layout.createLine(createTempNode(node, element)),
      );
      index++;

      context.clearRect(0, 0, 1000, 500);

      renderParagraph(activeNodeLines);
    } else {
      renderParagraph(layout.finish());
    }
    graph = makeGraph();
  }

  function renderParagraph(lines: Line[]) {
    context.clearRect(0, 0, 1000, 500);

    let x = 0;
    let y = 20;

    lines.forEach((line) => {
      renderLine(line, x, y);
      x = 0;
      y += 30;
    });

    context.beginPath();
    context.moveTo(lineWidth, 0);
    context.lineTo(lineWidth, 500);
    context.stroke();
  }

  function renderLine(line: Line, x: number, y: number) {
    context.font = "20px Arial";
    line.elements.forEach((e, i) => {
      if (e.type === "box") {
        context.fillStyle =
          i < line.elements.length - 2 || line.ratio >= -1.0 ? "black" : "red";
        context.fillText(e.content, x, y);
        x += e.width;
      } else if (e.type === "glue") {
        x += e.width;
      }
    });
    context.font = "10px Courier";
    context.fillStyle = acceptable(line.ratio) ? "green" : "black";
    context.fillText(
      `${line.ratio.toFixed(2)} ${fitness(line.ratio)}`,
      lineWidth + 10,
      y - 5,
    );
  }

  function fitness(f: number): string {
    if (f < -1) return "TOO TIGHT";
    if (f < -0.5) return "TIGHT";
    if (f < 0.5) return "NORMAL";
    if (f < 1) return "LOOSE";
    if (f < layout.maxRatio) return "VERY LOOSE";
    return "TOO LOOSE";
  }

  function acceptable(f: number): boolean {
    return f >= -1 && f < layout.maxRatio;
  }

  let nodeId = 0;
  let mergedNodes = new Map<number, MergedNodes>();

  interface Edge {
    cost: number;
    to: MergedNodes;
  }

  class MergedNodes {
    id: number;
    edges: Edge[] = [];
    nodes: Node[] = [];

    constructor(node: Node) {
      this.id = nodeId++;
      this.nodes.push(node);
    }

    addNode(node: Node) {
      if (!this.nodes.includes(node)) {
        this.nodes.push(node);
      }
    }

    text() {
      let index = this.nodes[0].endPosition - 1;
      let result = "";
      let isFirst = true;
      while (index >= 0) {
        const e = elements[index];
        if (e.type === "box") {
          const box = e as Box;
          if (
            isFirst &&
            index + 1 < elements.length &&
            elements[index + 1].type === "penalty"
          ) {
            result = "-";
          }
          result = box.content + result;
        } else if (e.type === "penalty") {
          // ignore
        } else {
          break;
        }
        index -= 1;
        isFirst = false;
      }
      return result;
    }
  }

  function makeGraph(): dagre.graphlib.Graph {
    const g = new dagre.graphlib.Graph();
    g.setGraph({});
    g.setDefaultEdgeLabel(function () {
      return {};
    });
    const toProcess: Node[] = [...layout.activeNodes];
    const nodes: Node[] = [];
    while (toProcess.length > 0) {
      const node = toProcess.shift();
      if (node && !nodes.includes(node)) {
        nodes.push(node);
        if (node?.previous) {
          toProcess.push(node.previous);
        }
      }
    }
    function getMergedNode(node: Node) {
      let m = mergedNodes.get(node.endPosition);
      if (!m) {
        mergedNodes.set(node.endPosition, (m = new MergedNodes(node)));
      } else {
        m.addNode(node);
      }
      return m;
    }
    nodes.forEach((node) => {
      const n = getMergedNode(node);
      if (node?.previous) {
        const m = getMergedNode(node.previous);
        n.edges.push({
          cost: node.totalDemerits - node.previous.totalDemerits,
          to: m,
        });
      }
    });
    mergedNodes.forEach((node) => {
      g.setNode(node.id.toString(), {
        label: node.text(),
        width: 20,
        height: 20,
      });
    });
    mergedNodes.forEach((node) => {
      node.edges.forEach((edge) => {
        g.setEdge(edge.to.id.toString(), node.id.toString(), {
          name: `${Math.ceil(edge.cost)}`,
        });
      });
    });
    return g;
  }
</script>

<h1>Line Breaking</h1>

<div>
  <p>Starting from a raw text</p>
  <textarea
    rows="6"
    class="form-control"
    bind:value={content}
    onkeyup={textChanged}
  ></textarea>

  <p>First step is to split it into chunks:</p>
  <ul>
    <li>Box of fixed width usually containing text,</li>
    <li>Glue, a space that can shrink or expand a definite amount,</li>
    <li>
      Penalty is a possible place where the line can be broken, but at a certain
      cost.
    </li>
  </ul>

  <p>
    In order to give more flexibility in the way lines are broken, words can be
    split into smaller pieces called hyphenation, theses pieces are separated by
    penalties.
  </p>
  <div class="buttons">
    <input type="checkbox" bind:checked={doHyphenate} />&nbsp;Hyphenate
  </div>

  <div class="elements">
    {#each elements as element, i}
      {#if element.type === "box"}
        <span
          class="box {i == index ? 'select' : ''}"
          title="width {(element as Box).width.toFixed(2)}"
          >{(element as Box).content}</span
        >
      {:else if element.type === "glue"}
        <span
          class="glue {i == index ? 'select' : ''}"
          title="width {(element as Glue).width.toFixed(2)}, +{(
            element as Glue
          ).stretchability.toFixed(2)}, -{(
            element as Glue
          ).shrinkability.toFixed(2)}">&nbsp</span
        >
      {:else if element.type === "penalty"}
        <span
          class="penalty {i == index ? 'select' : ''}"
          title="width {(element as Penalty).width.toFixed(2)}, value {(
            element as Penalty
          ).value}">&nbsp</span
        >
      {/if}
    {/each}
  </div>

  <p>
    Then theses elements are accumulated one by one to form a line. For each
    line a ratio is computed from the available space given by the glues:
  </p>
  <ul>
    <li>below -1.0 is too tight</li>
    <li>between -1.0 and -0.5 is tight but acceptable</li>
    <li>between -0.5 and 0.5 is normal, thus acceptable</li>
    <li>between 0.5 and <code>maxRatio</code> is loose but acceptable</li>
    <li>above <code>maxRatio</code> is not acceptable</li>
  </ul>
  <p>
    For each line break a cost is computed, depending on the ratio and the
    relative class of two lines. Every acceptable line breaks are kept and form
    a graph of solutions. The minimum cost path is the best solution. The higher <code
      >maxRatio</code
    > is the more solutions will be investigated.
  </p>

  <div class="buttons">
    Width: <input bind:value={lineWidth} />
    Max Ratio: <input bind:value={maxRatio} />
    <button onclick={next}>Next Piece</button>
    <button onclick={terminate}>Terminate</button>
    <button onclick={restart}>Restart</button>
  </div>

  <div class="side-by-side">
    <div id="result-pane">
      <canvas width="600px" height="500px" bind:this={paragraphCanvasElement}
      ></canvas>
    </div>
    <div id="result-pane">
      <Graph {graph} />
    </div>
  </div>
</div>

<style>
  .form-control {
    margin-bottom: 10px;
  }
  #result-pane {
    padding: 20px 0px;
  }
  .select {
    background-color: lightgray;
  }
  .elements {
    margin: 20px 0;
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .elements span {
    border: 2px solid;
    border-radius: 5px;
  }
  .elements span.box {
    border-color: black;
  }
  .elements span.glue {
    border-color: #99ff99;
    width: 20px;
  }
  .elements span.penalty {
    border-color: #ff9999;
    width: 20px;
  }
  .buttons {
    margin-top: 10px;
  }
  button {
    border: none;
    border-radius: 5px;
    padding: 5px 10px;
  }
  .side-by-side {
    display: flex;
    flex-wrap: nowrap;
  }
</style>
