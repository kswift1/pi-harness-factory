# pi-harness-factory

Create, switch, and manage functional harness profiles for Pi Coding Agent.

## Concept

`pi-harness-factory` turns Pi into a project-local harness factory. A harness is a compiled working mode: tool access, mutation scope, validation strictness, safety gates, workflow rules, UI label, memory hints, recommended Pi packages, and capabilities.

The goal is not just to pick a persona. The factory helps you answer:

> What should the agent be allowed to do, how strict should it be, and what safety checks should apply for this project?

## Install

Try from a local checkout without installing permanently:

```bash
pi -e ./
```

Install from GitHub:

```bash
pi install git:github.com/sungwon-kim/pi-harness-factory
```

Install from npm, after publishing:

```bash
pi install npm:pi-harness-factory
```

## Main menu

Run:

```text
/factory
```

The factory opens a menu:

```text
Use a harness
Create a harness
Current harness
Manage harnesses
```

### Use a harness

Opens an interactive card browser. Cards summarize each harness by functional behavior:

- mode / role
- allowed tools
- validation strictness
- mutation scope
- safety level
- confirmations
- workflow rules

You can also use direct commands:

```text
/factory browse
/factory list
/factory pick <profile-id>
/factory use <profile-id>
```

### Create a harness

Creates a project-local harness with a guided flow:

1. Choose role
   - Coder
   - Reviewer
   - Researcher
   - DevOps
   - PM / Writer
   - Custom
2. Choose role preset
   - Safe implementation
   - Strict TDD
   - Read-only review
   - Evidence researcher
   - Release operator
3. Customize harnessing axes
   - mutation scope
   - validation strictness
   - safety gates
   - autonomy
   - output style
4. Preview compiled rules
5. Save only or Save & Activate

Generated profiles are saved under:

```text
.pi/harness-factory/profiles/<profile-id>.json
```

### Current harness

Shows the active harness and the rules currently affecting Pi:

- persona / role summary
- allowed and blocked tools
- guards
- workflow flags
- policies
- recommended packages
- memory rules injected into the system prompt

The active project profile is stored at:

```text
.pi/harness-factory/active.json
```

### Manage harnesses

Provides project-local profile management:

- Duplicate harness
  - Copy a preset or existing harness into `.pi/harness-factory/profiles/`.
  - Useful before editing bundled presets.
- Edit project harness
  - Modify project-local mutation scope, validation strictness, safety gates, autonomy, and output style.
- Delete project harness
  - Deletes project-local profiles only.
  - Bundled presets cannot be deleted.
- Import / Export
  - Export a harness profile to JSON.
  - Import a harness JSON into the current project after validation and confirmation.

## Built-in presets

- `safe-coder` — cautious everyday implementation mode with safety gates.
- `code-reviewer` — read-only review mode focused on actionable findings.
- `researcher` — evidence-first research mode with uncertainty handling.

## Harnessing axes

Generated and edited profiles are built from functional axes.

### Mutation scope

```text
Read-only
Artifacts only
Minimal edits
Focused refactors
Broad refactors
```

### Validation strictness

```text
Manual
After edits
Always
Test-first
Release-grade
```

### Safety gates

```text
Lightweight
Balanced
Strict
Read-only
Release-safe
```

### Autonomy

```text
Ask first
Plan then act
Act within scope
Autonomous
Review-gated
```

### Output style

```text
Concise summary
Detailed rationale
Findings table
Artifact-first
```

These choices compile into the profile fields Pi uses at runtime:

- `tools.allowed`
- `tools.blocked`
- `tools.readOnly`
- `guards`
- `workflow`
- `policies`
- `capabilities`
- `memory`

## Commands

```text
/factory
/factory help
/factory browse
/factory list
/factory pick <profile-id>
/factory create
/factory active
/factory preview <profile-id>
/factory use <profile-id>
/factory switch <profile-id>
/factory manage
```

## What the MVP enforces

- Blocks tools listed in the active profile's `tools.blocked`.
- Enforces read-only mode for `write` and `edit` when enabled.
- Asks before sensitive file access, such as `.env`, private keys, credentials, or secrets.
- Asks before dangerous shell commands, such as recursive delete, `sudo`, force push, or `chmod 777`.
- Asks before `git push` when the active profile requires it.
- Shows the active harness label in the Pi status area.
- Injects active harness instructions into the agent system prompt.
- Records recommended packages, allowed packages, and capability bindings in generated profiles.

## Safety model

This package is a Pi extension and prompt/tool-policy layer, not an OS sandbox. It is designed to make Pi sessions more consistent by combining generated instructions with extension hooks. It cannot control commands run outside Pi or tools that bypass Pi's extension hooks.

## Development

Run validation:

```bash
npm test
npm pack --dry-run
```
