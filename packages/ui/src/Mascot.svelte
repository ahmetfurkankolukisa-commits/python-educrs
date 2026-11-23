<script lang="ts">
  // Byte, the mascot (docs/05-f3-mvp0.md §17.11): the logo tile come alive — a tiny computer whose
  // screen is its face. Decoration only (aria-hidden): the meaning is always in the text next to
  // it, never in the drawing. Coloured with tokens, so it follows all three themes. Blink, wave and
  // hop are CSS and stop under prefers-reduced-motion (or with `still`).
  import type { MascotMood } from "./types.ts";

  interface Props {
    mood?: MascotMood;
    /** Rendered width and height in CSS px. */
    size?: number;
    /** No motion at all (lists, repeated use). */
    still?: boolean;
  }
  let { mood = "hello", size = 96, still = false }: Props = $props();
  const smiling = $derived(mood === "happy" || mood === "celebrate");
</script>

<svg class="byte {mood}" class:still width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" focusable="false" data-testid="mascot" data-mood={mood}>
  <ellipse class="ground" cx="60" cy="113" rx="28" ry="4" />
  <g class="body">
    {#if mood === "celebrate"}
      <rect class="shell" x="10" y="30" width="10" height="26" rx="5" transform="rotate(-25 15 56)" />
      <rect class="shell" x="100" y="30" width="10" height="26" rx="5" transform="rotate(25 105 56)" />
    {:else if mood === "hello"}
      <rect class="shell" x="10" y="52" width="10" height="24" rx="5" />
      <g class="wave"><rect class="shell" x="100" y="30" width="10" height="26" rx="5" transform="rotate(25 105 56)" /></g>
    {:else}
      <rect class="shell" x="10" y="52" width="10" height="24" rx="5" />
      <rect class="shell" x="100" y="52" width="10" height="24" rx="5" />
    {/if}
    <rect class="edge" x="40" y="97" width="14" height="12" rx="6" />
    <rect class="edge" x="66" y="97" width="14" height="12" rx="6" />
    <rect class="edge" x="20" y="31" width="80" height="72" rx="20" />
    <rect class="shell" x="20" y="25" width="80" height="72" rx="20" />
    <rect class="screen" x="30" y="35" width="60" height="46" rx="12" />
    <path class="spark" d="M60 3l2.6 7.4L70 13l-7.4 2.6L60 23l-2.6-7.4L50 13l7.4-2.6z" />

    {#if smiling}
      <path class="line" d="M44 56q5-7 10 0M66 56q5-7 10 0" />
      <path class="ink" d="M51 63h18a9 9 0 0 1-18 0z" />
      <circle class="cheek" cx="40" cy="65" r="3.5" />
      <circle class="cheek" cx="80" cy="65" r="3.5" />
    {:else if mood === "thinking"}
      <g class="eyes"><circle class="ink" cx="52" cy="51" r="4.5" /><circle class="ink" cx="74" cy="51" r="4.5" /></g>
      <path class="line" d="M54 68h11" />
    {:else if mood === "oops"}
      <path class="line" d="M43 47l11-3M77 47l-11-3" />
      <g class="eyes"><circle class="ink" cx="49" cy="56" r="4.5" /><circle class="ink" cx="71" cy="56" r="4.5" /></g>
      <path class="line" d="M53 69q3.5-3 7 0t7 0" />
    {:else}
      <g class="eyes"><circle class="ink" cx="49" cy="54" r="4.5" /><circle class="ink" cx="71" cy="54" r="4.5" /></g>
      <path class="line" d="M52 66q8 7 16 0" />
    {/if}
  </g>

  {#if mood === "thinking"}
    <!-- a question mark, drawn (no font needed) -->
    <path class="mark" d="M98 12c0-4 3-6.5 6.5-6.5S111 8 111 11.5c0 4-5 4.500-5 9" />
    <circle class="mark-dot" cx="106" cy="26" r="2" />
  {:else if mood === "celebrate"}
    <path class="spark" d="M22 6l1.4 3.6L27 11l-3.6 1.4L22 16l-1.4-3.6L17 11l3.6-1.4z" />
    <path class="confetti-a" d="M98 4l1.4 3.6L103 9l-3.6 1.4L98 14l-1.4-3.6L93 9l3.6-1.4z" />
    <circle class="confetti-b" cx="82" cy="15" r="2.5" />
    <circle class="confetti-a" cx="38" cy="17" r="2.5" />
  {/if}
</svg>

<style>
  .byte {
    flex: 0 0 auto;
    display: block;
    overflow: visible;
    /* a drawing, not text: Windows forced colours must not flatten it */
    forced-color-adjust: none;
  }
  .ground {
    fill: var(--color-text);
    opacity: 0.12;
  }
  .shell {
    fill: var(--color-accent);
  }
  .edge {
    fill: var(--color-accent-shadow);
  }
  .screen {
    fill: var(--color-surface);
  }
  .ink {
    fill: var(--color-text);
  }
  .line {
    fill: none;
    stroke: var(--color-text);
    stroke-width: 3.2;
    stroke-linecap: round;
  }
  .spark {
    fill: var(--color-streak-fill);
  }
  .cheek {
    fill: var(--color-streak-fill);
    opacity: 0.45;
  }
  .mark {
    fill: none;
    stroke: var(--color-streak-fill);
    stroke-width: 3.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .mark-dot {
    fill: var(--color-streak-fill);
  }
  .confetti-a {
    fill: var(--color-xp);
  }
  .confetti-b {
    fill: var(--color-success);
  }

  /* Motion: a blink now and then, a wave on hello, two hops on celebrate. */
  .eyes {
    transform-origin: 60px 54px;
    animation: blink 5s infinite;
  }
  .wave {
    transform-origin: 105px 56px;
    animation: wave 1.6s ease-in-out 2;
  }
  .celebrate .body {
    animation: hop 0.5s ease-out 2;
  }
  .still .eyes,
  .still .wave,
  .still .body {
    animation: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .eyes,
    .wave,
    .celebrate .body {
      animation: none;
    }
  }
  @keyframes blink {
    0%,
    46%,
    50%,
    100% {
      transform: scaleY(1);
    }
    48% {
      transform: scaleY(0.1);
    }
  }
  @keyframes wave {
    0%,
    100% {
      transform: rotate(0deg);
    }
    50% {
      transform: rotate(-16deg);
    }
  }
  @keyframes hop {
    0%,
    100% {
      transform: translateY(0);
    }
    40% {
      transform: translateY(-7px);
    }
  }
</style>
