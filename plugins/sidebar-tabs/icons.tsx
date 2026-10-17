// Иконки вкладок хозяина: короткий набор Lucide из зависимости плагина (TAB_ICONS в tabs-model.ts), толщина 1.75
// (--icon-stroke-width), 14 px — классом .st-tab. experimental_Icon bb не используется: неизвестное ему имя он рисует
// молнией (W-03). Имя, которого здесь нет, до этого модуля не доходит: tabIcon() возвращает null, вкладка — без иконки.
import {
  Bell, Bot, FileText, Files, FlaskConical, Folder, FolderGit2, GitBranch, History, Inbox, Layers3, ListChecks, ListTodo,
  type LucideIcon, MessageSquare, Rocket, Search, Server,
} from "lucide-react";
import type { TabIcon } from "./tabs-model.ts";

const ARTWORK: Record<TabIcon, LucideIcon> = {
  Bell, Bot, FileText, Files, FlaskConical, Folder, FolderGit2, GitBranch, History, Inbox, Layers3, ListChecks, ListTodo,
  MessageSquare, Rocket, Search, Server,
};

/** The tab's icon; decorative, the label beside it names the tab. */
export function TabIconGlyph({ name }: { name: TabIcon }) {
  const Artwork = ARTWORK[name];
  return <Artwork width={14} height={14} strokeWidth={1.75} aria-hidden="true" focusable="false" />;
}
