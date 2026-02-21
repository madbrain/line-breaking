<script lang="ts">
  import { onMount } from "svelte";
  import { lineBreak, type Box, Glue } from "./line_breaking";
  import fr from "./fr.json";
  import type { HyphenateTreeNode } from "./hyphenate";

  let content = `J'ai été condamné à l'amende pour avoir vu passer une chienne,
j'ai pensé être empalé pour un griffon, j'ai été envoyé au supplice parce que
j'avais fait des vers à la louange du roi, j'ai été sur le point d'être étranglé
parce que la reine avait des rubans jaunes, et me voici esclave avec toi parce
qu'un brutal a battu sa maîtresse.`;

  let canvasElement: HTMLCanvasElement;
  let context: CanvasRenderingContext2D;
  let lineWidth = 350;
  let step = 30;

  onMount(() => {
    context = canvasElement.getContext("2d")!;
    context.font = "20px Arial";

    const interval = setInterval(() => {
      lineWidth += step;
      if (lineWidth < 350 || lineWidth > 900) {
        step = -step;
      }
      textChanged();
    }, 1000);
    textChanged();

    return () => clearInterval(interval);
  });

  function computeWidth(word: string) {
    return context.measureText(word).width;
  }

  function textChanged() {
    const result = lineBreak(
      fr as any as HyphenateTreeNode,
      content,
      computeWidth,
      lineWidth,
    );
    let x = 0;
    let y = 20;
    context.clearRect(0, 0, 1000, 500);
    result.forEach((line) => {
      line.forEach((e) => {
        if (e.type === "box") {
          const box = e as Box;
          context.fillText(box.content, x, y);
          x += box.width;
        } else if (e.type === "glue") {
          const glue = e as Glue;
          x += glue.width;
        } else {
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(x - 4, y + 6);
          context.lineTo(x + 4, y + 6);
          context.closePath();
          context.stroke();
        }
      });
      x = 0;
      y += 30;
    });
    context.beginPath();
    context.moveTo(lineWidth, 0);
    context.lineTo(lineWidth, 500);
    context.stroke();
  }
</script>

<h1>Line Breaking</h1>

<div>
  <textarea
    rows="6"
    class="form-control"
    bind:value={content}
    on:keyup={textChanged}
  ></textarea>

  <div id="result-pane">
    <canvas width="1000px" height="500px" bind:this={canvasElement}></canvas>
  </div>
</div>

<style>
  #result-pane {
    padding: 20px 0px;
  }
</style>
