<script lang="ts">
  import { onMount } from "svelte";
  import fr from "./fr.json";
  import {
    hyphenate,
    type HyphenateListener,
    type HyphenateTreeNode,
  } from "./hyphenate";
  import { times, constant } from "lodash";

  let name = "anticonstitutionnellement";
  let result = "";
  let steps = "";

  onMount(textChanged);

  class StepsListener implements HyphenateListener {
    content = "";
    onStart(word: string) {
      this.content += word + "\n";
    }
    onMatch(position: number, pattern: string) {
      this.content += times(position, constant(" ")).join("") + pattern + "\n";
    }
    onEnd(word: string) {
      this.content += word + "\n";
    }
  }

  function textChanged() {
    const listener = new StepsListener();
    result = hyphenate(fr as any as HyphenateTreeNode, name, listener).join(
      "-",
    );
    steps = listener.content;
  }
</script>

<h1>Hyphenation</h1>

<p class="lead">
  Word to hyphenate: <input
    type="text"
    bind:value={name}
    on:keyup={textChanged}
  />
</p>

<pre>{steps}</pre>

<h2>{result}</h2>
