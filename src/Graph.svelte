<script lang="ts">
  import dagre from "@dagrejs/dagre";
  import { onMount } from "svelte";

  export let width = 1000;
  export let height = 800;

  export let graph: dagre.graphlib.Graph;

  $: draw(graph);

  let canvasElement: HTMLCanvasElement;
  let context: CanvasRenderingContext2D;

  onMount(() => {
    context = canvasElement.getContext("2d")!;
  });

  function draw(g: dagre.graphlib.Graph) {
    if (g.nodeCount() <= 0) {
      return;
    }
    g.nodes().forEach((id) => {
      const node = g.node(id);
      node.width = Math.max(20, context.measureText(node.label).width + 10);
    });
    dagre.layout(g);

    context.clearRect(0, 0, canvasElement.width, canvasElement.height);
    context.strokeStyle = "1px solid black";
    g.edges().forEach((e) => {
      const edge = g.edge(e);
      context.beginPath();
      (edge.points as { x: number; y: number }[]).forEach((point, i) => {
        if (i === 0) {
          context.moveTo(point.x, point.y);
        } else {
          context.lineTo(point.x, point.y);
        }
      });
      context.stroke();
      context.fillText(
        edge.name,
        (edge.points[0].x + edge.points[edge.points.length - 1].x) / 2,
        (edge.points[0].y + edge.points[edge.points.length - 1].y) / 2,
      );
    });
    context.strokeStyle = "1px solid black";
    context.font = "15px Arial";
    g.nodes().forEach((id) => {
      const node = g.node(id);
      context.fillStyle = "white";
      context.fillRect(
        node.x - node.width / 2,
        node.y - node.height / 2,
        node.width,
        node.height,
      );
      context.strokeRect(
        node.x - node.width / 2,
        node.y - node.height / 2,
        node.width,
        node.height,
      );
      context.fillStyle = "black";
      context.fillText(
        node.label,
        node.x - node.width / 2 + 5,
        node.y + 5,
        node.width,
      );
    });
  }
</script>

<canvas width="{width}px" height="{height}px" bind:this={canvasElement}
></canvas>
