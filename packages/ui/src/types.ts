/** Types shared by the lesson components (and the app that feeds them). */
export type PanelTone = "correct" | "mixup" | "wrong" | "unavailable";

export interface PathNodeView {
  lessonId: string;
  title: string;
  href: string;
  state: "completed" | "next" | "todo";
  inProgress: boolean;
}

export interface PathModuleView {
  id: string;
  title: string;
  nodes: PathNodeView[];
}

/** Byte's expressions (docs/05-f3-mvp0.md §17.11). */
export type MascotMood = "hello" | "happy" | "thinking" | "oops" | "celebrate";

/** A colour theme the learner can pick; "system" follows the device (docs/05-f3-mvp0.md §17.18). */
export type ThemeChoice = "system" | "light" | "dark" | "high-contrast";
