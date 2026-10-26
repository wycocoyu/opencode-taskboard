# opencode-taskboard

Project Issue Kanban (`项目看板`) + `@Multi-Agent` Requirement Discussion + Dual-Pane Session Binding patch for OpenCode Desktop 2.1.2.

- **Default State**: Disabled (`enabled: false`) so it does not inject into the sidebar or main workbench unless explicitly toggled on.
- **Toggle On/Off**: Press `⌘⇧K` (or Command Palette → `开启项目 Issue 看板模块 (实验性)` / `关闭并隐藏项目 Issue 看板模块`).
- **Fill-Only Composer Safety**: Clicking any sync/split button only pre-fills the right-pane Composer input box (`createTabComposerState`) and never auto-sends prompts.
