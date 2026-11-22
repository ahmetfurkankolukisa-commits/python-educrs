<script lang="ts">
  // "Try it now" box on the home page: free Run, no grading.
  import CodeWorkspace from "./CodeWorkspace.svelte";
  import SandboxFrame from "./SandboxFrame.svelte";
  import { SandboxClient, type SandboxStatus } from "../lib/sandbox.ts";

  // Inlined at build time; the build fails if it is missing (scripts/write-headers.mjs).
  const client = new SandboxClient(import.meta.env.PUBLIC_RUN_ORIGIN ?? "");
  let code = $state('name = input("What is your name? ")\nprint("Hello,", name)');
  let status = $state<SandboxStatus>("loading");
  let failReason = $state("");
</script>

<CodeWorkspace {client} {status} {failReason} bind:code />
<SandboxFrame {client} onstatus={(s, reason) => { status = s; failReason = reason ?? ""; }} />
