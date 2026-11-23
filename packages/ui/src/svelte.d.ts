declare module "*.svelte" {
  import type { Component } from "svelte";
  const component: Component<any>;
  export default component;
}

declare module "*?url" {
  const url: string;
  export default url;
}
