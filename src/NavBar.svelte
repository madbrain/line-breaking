<script>
  import NavLink from "./NavLink.svelte";
  import { link } from "svelte-spa-router";
  export let name;
</script>

<nav class="navbar navbar-expand-md navbar-dark bg-dark fixed-top">
  <a class="navbar-brand" href="/" use:link>{name}</a>
  <button
    class="navbar-toggler"
    type="button"
    data-toggle="collapse"
    data-target="#navbarsExampleDefault"
    aria-controls="navbarsExampleDefault"
    aria-expanded="false"
    aria-label="Toggle navigation"
  >
    <span class="navbar-toggler-icon"></span>
  </button>

  <div class="collapse navbar-collapse" id="navbarsExampleDefault">
    <ul class="navbar-nav mr-auto">
      <NavLink label="Hyphenation" href="/hyphenation" />
      <NavLink label="Paragraph" href="/paragraph" />
    </ul>
  </div>
</nav>
