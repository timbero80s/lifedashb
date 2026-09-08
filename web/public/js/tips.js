// Rotating, hand-written tips shown in the ticker between live headlines.
// Edit freely — one string per tip. [TIP] tag is added automatically.
// Focus: getting more out of Claude Code and Claude as a coworker.

export const TIPS = [
  'Claude Code: keep a CLAUDE.md in your repo root — project facts, commands and conventions load automatically every session.',
  'Claude Code: type "/" to see slash commands. /review, /init and custom commands in .claude/commands live here.',
  'Point Claude Code at a screenshot or a Figma export and ask it to build the UI — it reads images.',
  'Ask Claude Code to "make a plan first, do not write code yet" for anything non-trivial, then approve the plan.',
  'Claude as coworker: give it the goal and the constraints, not step-by-step instructions — it plans better with room.',
  'Stuck build? Paste the full error into Claude Code and let it run the commands to diagnose. It can see command output.',
  'Claude Code hooks: run a formatter or test suite automatically after every edit via .claude/settings.json.',
  'Use MCP servers to give Claude live access to your calendar, GitHub, databases — one config, then just ask.',
  'Claude Code: "/clear" resets context between unrelated tasks so answers stay sharp and fast.',
  'Have Claude write the commit message and the PR description — it just read every line of the diff.',
  'Claude as coworker: ask it to review its own work — "what did you miss? what would break this?" catches real bugs.',
  'Long task? Ask Claude Code to work in small verified steps and run the tests after each one.',
  'Claude Code can scaffold a whole project: "set up a Vite + TypeScript app with ESLint and a test runner".',
  'Give Claude examples of your house style (a file it should match) and it will follow the pattern.',
  'Claude Code: subagents run big searches in parallel without filling your main context — ask it to "use a subagent".',
  'Rubber-duck with Claude before you code: describe the problem out loud and ask what approach it would take.',
];
