<script lang="ts">
  // The mark (docs/05-f3-mvp0.md §17.7): an indigo "pressable" tile with a prompt and a coral spark.
  // Our own drawing; deliberately not the Python logo.
  interface Props {
    size?: number;
  }
  let { size = 32 }: Props = $props();
</script>

<svg class="logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
  <rect x="1" y="3.5" width="30" height="27.5" rx="8" fill="#312e81" />
  <rect x="1" y="1" width="30" height="27" rx="8" fill="#4338ca" />
  <path d="M9 9.5l6 5-6 5" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
  <path d="M17 19.5h6" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" />
  <path d="M24.5 4.5l1.1 2.6 2.6 1.1-2.6 1.1-1.1 2.6-1.1-2.6-2.6-1.1 2.6-1.1z" fill="#fb923c" />
</svg>

<style>
  .logo {
    flex: 0 0 auto;
    display: block;
  }
</style>
