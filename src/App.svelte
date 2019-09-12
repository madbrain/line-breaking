<NavBar name="Line Breaking"/>

<main role="main" class="container">

  <div class="content">
    <Router {routes}/>
  </div>

</main><!-- /.container -->

<style>
:global(body) {
  padding-top: 5rem;
}
.content {
  padding: 3rem 1.5rem;
}
</style>

<script>
    import NavBar from './NavBar.svelte';
    import Hyphenation from './Hyphenation.svelte';
    import Paragraph from './Paragraph.svelte';
    import Router from 'svelte-spa-router';

    let routes = {
        '/': Hyphenation,
        '/hyphenation': Hyphenation,
        '/paragraph': Paragraph,
    };
</script>
