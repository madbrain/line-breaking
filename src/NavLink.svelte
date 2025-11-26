<script>
  import { link } from "svelte-spa-router";
  import active from "svelte-spa-router/active";
  export let label;
  export let href;
</script>

<li class="nav-item" use:active={{ path: href, className: "active" }}>
  <a class="nav-link" {href} use:link>{label}</a>
</li>
