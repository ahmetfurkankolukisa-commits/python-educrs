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
