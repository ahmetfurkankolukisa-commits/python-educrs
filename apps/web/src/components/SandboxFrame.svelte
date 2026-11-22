<script lang="ts">
  // The hidden sandbox iframe (a different site, plan §3.1) and its handshake.
  import type { SandboxClient, SandboxStatus } from "../lib/sandbox.ts";

  interface Props {
    client: SandboxClient;
    onstatus: (status: SandboxStatus, reason?: string) => void;
  }
  let { client, onstatus }: Props = $props();
  let frame = $state<HTMLIFrameElement>();

  $effect(() => {
    if (!frame) return;
    return client.attach(frame, onstatus);
  });
</script>

<iframe bind:this={frame} title="Python sandbox" src={`${client.origin}/index.html`} sandbox="allow-scripts allow-same-origin" hidden></iframe>
