# API Specification

This document describes the internal tool surface exposed to the AI agent.

## Tool Interface
Each tool has:
- `name`
- `description`
- `input_schema` (JSON Schema object with properties/required fields)

Tools are defined in `/Users/spacecr8ed/projects/parchi/tools/browser-tools.ts` via `getToolDefinitions()`.

## Core Tool Categories
- **Navigation/Interaction**: `navigate`, `openTab`, `click`, `clickByText`, `clickByRole`, `type`, `typeByLabel`, `pressKey`, `scroll`
- **Extraction**: `getContent`, `getVisibleText`, `getElementInfo`, `getAllInputs`, `getAllButtons`, `findElements`, `getDomSnapshot`
- **Verification**: `waitForSelector`, `waitForText`, `assertVisible`, `assertText`, `assertUrl`, `assertValue`
- **Screenshots**: `screenshot`, `screenshotElement`
- **Tabs**: `getTabs`, `closeTab`, `switchTab`, `focusTab`, `groupTabs`, `describeSessionTabs`
- **Helpers**: `highlightElement`, `unhighlightAll`, `simulateHover`

## Runtime Messaging
Runtime messages and schema are defined in `/Users/spacecr8ed/projects/parchi/types/runtime-messages.ts`.
