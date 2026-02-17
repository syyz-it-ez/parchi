type ToolDefinition = {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
};

type SessionTabSummary = {
  id: number;
  title?: string;
  url?: string;
};

type GroupOptions = {
  title?: string;
  color?: chrome.tabGroups.ColorEnum;
};

// Maximum number of tabs allowed per session to prevent runaway tab creation
const MAX_SESSION_TABS = 5;

export class BrowserTools {
  tools: Record<string, true>;
  private sessionTabs: Map<number, SessionTabSummary>;
  private currentSessionTabId: number | null;
  private sessionTabGroupId: number | null;

  constructor() {
    this.sessionTabs = new Map();
    this.currentSessionTabId = null;
    this.sessionTabGroupId = null;
    this.tools = {
      navigate: true,
      openTab: true,
      click: true,
      type: true,
      pressKey: true,
      scroll: true,
      getContent: true,
      getVisibleText: true,
      getElementInfo: true,
      getAllInputs: true,
      getAllButtons: true,
      highlightElement: true,
      unhighlightAll: true,
      simulateHover: true,
      findElements: true,
      clickByText: true,
      clickByRole: true,
      typeByLabel: true,
      waitForSelector: true,
      waitForText: true,
      assertVisible: true,
      assertText: true,
      assertUrl: true,
      assertValue: true,
      getDomSnapshot: true,
      screenshot: true,
      screenshotElement: true,
      getTabs: true,
      closeTab: true,
      switchTab: true,
      focusTab: true,
      groupTabs: true,
      describeSessionTabs: true,
    };
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'navigate',
        description: 'Navigate the current tab to a URL.',
        input_schema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Absolute URL to visit.' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
          required: ['url'],
        },
      },
      {
        name: 'openTab',
        description: `Open a new tab with a URL. Limited to ${MAX_SESSION_TABS} tabs per session - prefer navigating existing tabs over opening new ones.`,
        input_schema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Absolute URL to open.' },
          },
          required: ['url'],
        },
      },
      {
        name: 'click',
        description: 'Click an element by CSS selector.',
        input_schema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector to click.' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
          required: ['selector'],
        },
      },
      {
        name: 'clickByText',
        description: 'Click a visible element by matching its text or accessible name.',
        input_schema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Visible text or accessible name to match.' },
            exact: { type: 'boolean', description: 'Require exact match (default: false).' },
            role: { type: 'string', description: 'Optional role filter (e.g., button, link).' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
          required: ['text'],
        },
      },
      {
        name: 'clickByRole',
        description: 'Click a visible element by role and optional name.',
        input_schema: {
          type: 'object',
          properties: {
            role: { type: 'string', description: 'Role to match (e.g., button, link, checkbox).' },
            name: { type: 'string', description: 'Optional accessible name to match.' },
            exact: { type: 'boolean', description: 'Require exact name match (default: false).' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
          required: ['role'],
        },
      },
      {
        name: 'type',
        description: 'Type text into an input or textarea.',
        input_schema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector for the input.' },
            text: { type: 'string', description: 'Text to enter.' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
          required: ['selector', 'text'],
        },
      },
      {
        name: 'typeByLabel',
        description: 'Type text into a form field matched by its label or accessible name.',
        input_schema: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Label text or accessible name to match.' },
            text: { type: 'string', description: 'Text to enter.' },
            exact: { type: 'boolean', description: 'Require exact label match (default: false).' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
          required: ['label', 'text'],
        },
      },
      {
        name: 'pressKey',
        description: 'Press a key in the page.',
        input_schema: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Keyboard key (e.g., Enter, ArrowDown).' },
            selector: { type: 'string', description: 'Optional selector to target.' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
          required: ['key'],
        },
      },
      {
        name: 'scroll',
        description: 'Scroll the page.',
        input_schema: {
          type: 'object',
          properties: {
            direction: { type: 'string', description: 'up, down, top, or bottom.' },
            amount: { type: 'number', description: 'Scroll amount in pixels.' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
        },
      },
      {
        name: 'getContent',
        description: 'Extract page content.',
        input_schema: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'text, html, title, url, or links.' },
            selector: { type: 'string', description: 'Optional selector to scope content.' },
            maxChars: { type: 'number', description: 'Max characters to return (default: 8000).' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
        },
      },
      {
        name: 'getVisibleText',
        description: 'Extract visible text content only.',
        input_schema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'Optional selector to scope text.' },
            maxChars: { type: 'number', description: 'Max characters to return (default: 10000).' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
        },
      },
      {
        name: 'getElementInfo',
        description: 'Get info and attributes for a specific element.',
        input_schema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector for the element.' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
          required: ['selector'],
        },
      },
      {
        name: 'getAllInputs',
        description: 'List form inputs with labels and selectors.',
        input_schema: {
          type: 'object',
          properties: {
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
        },
      },
      {
        name: 'getAllButtons',
        description: 'List clickable buttons with selectors.',
        input_schema: {
          type: 'object',
          properties: {
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
        },
      },
      {
        name: 'findElements',
        description: 'Find elements by text, role, label, or selector.',
        input_schema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Text or accessible name to match.' },
            role: { type: 'string', description: 'Role to match (e.g., button, link, textbox).' },
            label: { type: 'string', description: 'Label text to match (for inputs).' },
            selector: { type: 'string', description: 'CSS selector to seed the search.' },
            exact: { type: 'boolean', description: 'Require exact match (default: false).' },
            includeHidden: { type: 'boolean', description: 'Include hidden elements (default: false).' },
            limit: { type: 'number', description: 'Max results to return (default: 10).' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
        },
      },
      {
        name: 'highlightElement',
        description: 'Temporarily outline an element by selector.',
        input_schema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector for the element.' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
          required: ['selector'],
        },
      },
      {
        name: 'unhighlightAll',
        description: 'Remove all highlights from the page.',
        input_schema: {
          type: 'object',
          properties: {
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
        },
      },
      {
        name: 'simulateHover',
        description: 'Trigger a hover event for an element.',
        input_schema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector for the element.' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
          required: ['selector'],
        },
      },
      {
        name: 'waitForSelector',
        description: 'Wait until a selector appears (and optionally is visible).',
        input_schema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector to wait for.' },
            visible: { type: 'boolean', description: 'Require visible element (default: true).' },
            timeoutMs: { type: 'number', description: 'Timeout in ms (default: 10000).' },
            intervalMs: { type: 'number', description: 'Polling interval in ms (default: 200).' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
          required: ['selector'],
        },
      },
      {
        name: 'waitForText',
        description: 'Wait until text appears in the page or a selector.',
        input_schema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Text to wait for.' },
            selector: { type: 'string', description: 'Optional selector to scope search.' },
            match: { type: 'string', description: 'includes, exact, or regex (default: includes).' },
            caseSensitive: { type: 'boolean', description: 'Case sensitive match (default: false).' },
            timeoutMs: { type: 'number', description: 'Timeout in ms (default: 10000).' },
            intervalMs: { type: 'number', description: 'Polling interval in ms (default: 200).' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
          required: ['text'],
        },
      },
      {
        name: 'assertVisible',
        description: 'Assert that an element is visible.',
        input_schema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector to assert.' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
          required: ['selector'],
        },
      },
      {
        name: 'assertText',
        description: 'Assert that text exists in the page or a selector.',
        input_schema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Text to assert.' },
            selector: { type: 'string', description: 'Optional selector to scope search.' },
            match: { type: 'string', description: 'includes, exact, or regex (default: includes).' },
            caseSensitive: { type: 'boolean', description: 'Case sensitive match (default: false).' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
          required: ['text'],
        },
      },
      {
        name: 'assertUrl',
        description: 'Assert that the current URL matches.',
        input_schema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL or pattern to assert.' },
            match: { type: 'string', description: 'includes, exact, or regex (default: includes).' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
          required: ['url'],
        },
      },
      {
        name: 'assertValue',
        description: 'Assert that a form field has a value.',
        input_schema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector for the input.' },
            value: { type: 'string', description: 'Expected value.' },
            match: { type: 'string', description: 'exact or includes (default: exact).' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
          required: ['selector', 'value'],
        },
      },
      {
        name: 'getDomSnapshot',
        description: 'Capture a DOM snapshot (outerHTML) for the page or a selector.',
        input_schema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'Optional selector to snapshot.' },
            maxChars: { type: 'number', description: 'Max characters to return (default: 20000).' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
        },
      },
      {
        name: 'screenshot',
        description: 'Capture a screenshot of the current tab.',
        input_schema: {
          type: 'object',
          properties: {
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
        },
      },
      {
        name: 'screenshotElement',
        description: 'Capture a screenshot of a specific element.',
        input_schema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector for the element.' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
          required: ['selector'],
        },
      },
      {
        name: 'getTabs',
        description: 'List tabs in the current window.',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'closeTab',
        description: 'Close a tab by id.',
        input_schema: {
          type: 'object',
          properties: {
            tabId: { type: 'number', description: 'Tab id to close.' },
          },
          required: ['tabId'],
        },
      },
      {
        name: 'switchTab',
        description: 'Activate a tab by id.',
        input_schema: {
          type: 'object',
          properties: {
            tabId: { type: 'number', description: 'Tab id to activate.' },
          },
          required: ['tabId'],
        },
      },
      {
        name: 'focusTab',
        description: 'Focus a tab by id.',
        input_schema: {
          type: 'object',
          properties: {
            tabId: { type: 'number', description: 'Tab id to focus.' },
          },
          required: ['tabId'],
        },
      },
      {
        name: 'groupTabs',
        description: 'Group tabs together with an optional name and color.',
        input_schema: {
          type: 'object',
          properties: {
            tabIds: { type: 'array', items: { type: 'number' }, description: 'Tabs to group.' },
            title: { type: 'string', description: 'Group title.' },
            color: { type: 'string', description: 'Group color name.' },
          },
        },
      },
      {
        name: 'describeSessionTabs',
        description: 'List tabs captured for this session.',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }

  getSessionTabSummaries(): SessionTabSummary[] {
    return Array.from(this.sessionTabs.values());
  }

  getCurrentSessionTabId(): number | null {
    return this.currentSessionTabId;
  }

  async configureSessionTabs(tabs: chrome.tabs.Tab[], options: GroupOptions = {}) {
    this.sessionTabs.clear();
    this.sessionTabGroupId = null;
    tabs.forEach((tab) => {
      if (typeof tab.id !== 'number') return;
      this.sessionTabs.set(tab.id, { id: tab.id, title: tab.title, url: tab.url });
      if (!this.currentSessionTabId) {
        this.currentSessionTabId = tab.id;
      }
    });
    if (tabs.length > 0) {
      // Create session tab group with "Parchi" title and blue color
      await this.ensureSessionTabGroup({ title: options.title || 'Parchi', color: options.color || 'blue' });
    }
  }

  async ensureSessionTabGroup(options: GroupOptions = { title: 'Parchi', color: 'blue' }) {
    const sessionTabIds = Array.from(this.sessionTabs.keys());
    if (sessionTabIds.length === 0) return;

    try {
      if (this.sessionTabGroupId !== null) {
        // Add tabs to existing group
        await chrome.tabs.group({ groupId: this.sessionTabGroupId, tabIds: sessionTabIds });
      } else {
        // Create new group
        const groupId = await chrome.tabs.group({ tabIds: sessionTabIds });
        await chrome.tabGroups.update(groupId, {
          title: options.title || 'Parchi',
          color: options.color || 'blue',
          collapsed: false,
        });
        this.sessionTabGroupId = groupId;
      }
    } catch (error) {
      // Tab grouping may fail in some Chrome configurations, fail silently
      console.warn('Failed to group tabs:', error);
    }
  }

  async executeTool(toolName: string, args: Record<string, any> = {}) {
    try {
      switch (toolName) {
        case 'navigate':
          return await this.navigate(args);
        case 'openTab':
          return await this.openTab(args);
        case 'click':
          return await this.click(args);
        case 'type':
          return await this.type(args);
        case 'pressKey':
          return await this.pressKey(args);
        case 'scroll':
          return await this.scroll(args);
        case 'getContent':
          return await this.getContent(args);
        case 'getVisibleText':
          return await this.getVisibleText(args);
        case 'getElementInfo':
          return await this.getElementInfo(args);
        case 'getAllInputs':
          return await this.getAllInputs(args);
        case 'getAllButtons':
          return await this.getAllButtons(args);
        case 'highlightElement':
          return await this.highlightElement(args);
        case 'unhighlightAll':
          return await this.unhighlightAll(args);
        case 'simulateHover':
          return await this.simulateHover(args);
        case 'findElements':
          return await this.findElements(args);
        case 'clickByText':
          return await this.clickByText(args);
        case 'clickByRole':
          return await this.clickByRole(args);
        case 'typeByLabel':
          return await this.typeByLabel(args);
        case 'waitForSelector':
          return await this.waitForSelector(args);
        case 'waitForText':
          return await this.waitForText(args);
        case 'assertVisible':
          return await this.assertVisible(args);
        case 'assertText':
          return await this.assertText(args);
        case 'assertUrl':
          return await this.assertUrl(args);
        case 'assertValue':
          return await this.assertValue(args);
        case 'getDomSnapshot':
          return await this.getDomSnapshot(args);
        case 'screenshot':
          return await this.screenshot(args);
        case 'screenshotElement':
          return await this.screenshotElement(args);
        case 'getTabs':
          return await this.getTabs();
        case 'closeTab':
          return await this.closeTab(args);
        case 'switchTab':
          return await this.focusTab(args);
        case 'focusTab':
          return await this.focusTab(args);
        case 'groupTabs':
          return await this.groupTabs(args);
        case 'describeSessionTabs':
          return {
            success: true,
            tabs: this.getSessionTabSummaries(),
            tabCount: this.sessionTabs.size,
            maxTabs: MAX_SESSION_TABS,
            canOpenMore: this.sessionTabs.size < MAX_SESSION_TABS,
          };
        default:
          return { success: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (error) {
      // Catch any unhandled errors in tool execution
      console.error(`Tool execution error (${toolName}):`, error);
      return {
        success: false,
        error: `Tool "${toolName}" failed: ${error?.message || String(error)}`,
        hint: 'Try a different approach or check the arguments.',
      };
    }
  }

  private async resolveTabId(args: Record<string, any> = {}) {
    if (typeof args.tabId === 'number') return args.tabId;
    if (this.currentSessionTabId) return this.currentSessionTabId;
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    return active?.id ?? null;
  }

  private async runInTab(tabId: number, func: (...args: any[]) => unknown, args: any[] = []): Promise<any> {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func,
      args,
    });
    return results?.[0]?.result ?? null;
  }

  private async sendToContentScript(tabId: number, message: Record<string, any>) {
    try {
      const result = await chrome.tabs.sendMessage(tabId, message);
      return result;
    } catch (error) {
      return {
        success: false,
        error: 'Content script unavailable on this page.',
        details: error?.message || String(error),
      };
    }
  }

  private async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async navigate(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) return { success: false, error: 'No active tab.' };
    
    const url = args.url;
    if (!url || typeof url !== 'string') {
      return { success: false, error: 'Missing or invalid url parameter.' };
    }
    
    // Validate URL format
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('chrome://')) {
      return { 
        success: false, 
        error: `Invalid URL: "${url}". URLs must start with http://, https://, or chrome://`,
        hint: 'For Google searches, use: https://www.google.com/search?q=your+query',
      };
    }
    
    try {
      await chrome.tabs.update(tabId, { url });
      this.currentSessionTabId = tabId;
      return { success: true, tabId, url };
    } catch (error) {
      return { 
        success: false, 
        error: `Navigation failed: ${error?.message || String(error)}`,
      };
    }
  }

  private async openTab(args: Record<string, any>) {
    // Enforce tab limit to prevent runaway tab creation
    if (this.sessionTabs.size >= MAX_SESSION_TABS) {
      return {
        success: false,
        error: `Tab limit reached (max ${MAX_SESSION_TABS} tabs per session). Close existing tabs with closeTab or use navigate on current tab.`,
        hint: 'Use closeTab({ tabId: <id> }) to close a tab, or navigate({ url: "..." }) to reuse current tab.',
      };
    }
    
    // Validate URL
    const url = args.url;
    if (!url || typeof url !== 'string') {
      return { success: false, error: 'Missing or invalid url parameter.' };
    }
    
    // Check if it looks like a valid URL
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('chrome://')) {
      return { 
        success: false, 
        error: `Invalid URL: "${url}". URLs must start with http://, https://, or chrome://`,
        hint: 'Use navigate({ url: "https://google.com/search?q=..." }) for searches.',
      };
    }
    
    try {
      const tab = await chrome.tabs.create({ url, active: true });
      if (tab.id) {
        this.sessionTabs.set(tab.id, { id: tab.id, title: tab.title, url: tab.url });
        this.currentSessionTabId = tab.id;
        // Add new tab to session group
        await this.ensureSessionTabGroup();
      }
      return { success: true, tabId: tab.id, url };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to open tab: ${error?.message || String(error)}`,
        hint: 'Try using navigate() on current tab instead.',
      };
    }
  }

  private async focusTab(args: Record<string, any>) {
    const tabId = typeof args.tabId === 'number' ? args.tabId : null;
    if (!tabId) return { success: false, error: 'Missing tabId.' };
    await chrome.tabs.update(tabId, { active: true });
    this.currentSessionTabId = tabId;
    return { success: true, tabId };
  }

  private async closeTab(args: Record<string, any>) {
    const tabId = typeof args.tabId === 'number' ? args.tabId : null;
    if (!tabId) return { success: false, error: 'Missing tabId.' };
    await chrome.tabs.remove(tabId);
    this.sessionTabs.delete(tabId);
    if (this.currentSessionTabId === tabId) {
      this.currentSessionTabId = null;
    }
    return { success: true, tabId };
  }

  private async click(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) return { success: false, error: 'No active tab.' };
    const selector = String(args.selector || '');
    const result = await this.runInTab(
      tabId,
      (sel) => {
        const el = document.querySelector<HTMLElement>(sel);
        if (!el) return { success: false, error: 'Element not found.' };
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const visible =
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          rect.width > 0 &&
          rect.height > 0;
        if (!visible) {
          return { success: false, error: 'Element is not visible.' };
        }
        if ('disabled' in el && (el as HTMLButtonElement).disabled) {
          return { success: false, error: 'Element is disabled.' };
        }
        try {
          el.scrollIntoView({ block: 'center', inline: 'center' });
        } catch {
          // Ignore scroll errors
        }
        el.click();
        return { success: true };
      },
      [selector],
    );
    return result || { success: false, error: 'Script execution failed.' };
  }

  private async type(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) return { success: false, error: 'No active tab.' };
    const selector = String(args.selector || '');
    const text = String(args.text ?? '');
    const result = await this.runInTab(
      tabId,
      (sel, value) => {
        const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(sel);
        if (!el) return { success: false, error: 'Element not found.' };
        if ('disabled' in el && (el as HTMLInputElement).disabled) {
          return { success: false, error: 'Element is disabled.' };
        }
        if ('readOnly' in el && (el as HTMLInputElement).readOnly) {
          return { success: false, error: 'Element is read-only.' };
        }
        el.focus();
        const proto = Object.getPrototypeOf(el);
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor && typeof descriptor.set === 'function') {
          descriptor.set.call(el, value);
        } else {
          el.value = value;
        }
        const inputEvent =
          typeof InputEvent !== 'undefined'
            ? new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' })
            : new Event('input', { bubbles: true });
        el.dispatchEvent(inputEvent);
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true };
      },
      [selector, text],
    );
    return result || { success: false, error: 'Script execution failed.' };
  }

  private async pressKey(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) return { success: false, error: 'No active tab.' };
    const key = String(args.key || '');
    const selector = args.selector ? String(args.selector) : '';
    const result = await this.runInTab(
      tabId,
      (k, sel) => {
        const target = sel ? document.querySelector<HTMLElement>(sel) : document.body;
        if (!target) return { success: false, error: 'Target not found.' };
        target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
        target.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }));
        return { success: true };
      },
      [key, selector],
    );
    return result || { success: false, error: 'Script execution failed.' };
  }

  private async scroll(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) return { success: false, error: 'No active tab.' };
    const direction = String(args.direction || 'down');
    const amount = typeof args.amount === 'number' ? args.amount : 600;
    const result = await this.runInTab(
      tabId,
      (dir, amt) => {
        if (dir === 'top') {
          window.scrollTo({ top: 0, behavior: 'instant' });
        } else if (dir === 'bottom') {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
        } else if (dir === 'up') {
          window.scrollBy({ top: -amt, behavior: 'instant' });
        } else {
          window.scrollBy({ top: amt, behavior: 'instant' });
        }
        return { success: true };
      },
      [direction, amount],
    );
    return result || { success: false, error: 'Script execution failed.' };
  }

  private async getContent(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) return { success: false, error: 'No active tab.' };
    const type = String(args.type || args.mode || 'text');
    const selector = args.selector ? String(args.selector) : '';
    const maxChars = typeof args.maxChars === 'number' && args.maxChars > 0 ? args.maxChars : 8000;
    const result = await this.runInTab(
      tabId,
      (t, sel, limit) => {
        const base = sel ? document.querySelector<HTMLElement>(sel) : document.body;
        if (!base) return { success: false, error: 'Target not found.' };
        const normalizedType = ['text', 'html', 'title', 'url', 'links'].includes(t) ? t : 'text';
        const truncate = (value: string) => {
          const length = value.length;
          if (length <= limit) {
            return { content: value, truncated: false, contentLength: length };
          }
          return { content: value.slice(0, limit), truncated: true, contentLength: length };
        };
        if (normalizedType === 'html') {
          const result = truncate(base.innerHTML);
          return { success: true, ...result };
        }
        if (normalizedType === 'title') {
          const result = truncate(document.title || '');
          return { success: true, ...result };
        }
        if (normalizedType === 'url') {
          const result = truncate(window.location.href || '');
          return { success: true, ...result };
        }
        if (normalizedType === 'links') {
          const links = Array.from(base.querySelectorAll('a'))
            .slice(0, 200)
            .map((link) => ({
              text: link.textContent || '',
              href: link.href,
            }));
          const result = truncate(JSON.stringify(links));
          return { success: true, items: links.length, ...result };
        }
        const result = truncate(base.innerText || '');
        return { success: true, ...result };
      },
      [type, selector, maxChars],
    );
    return result || { success: false, error: 'Script execution failed.' };
  }

  private async getVisibleText(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) return { success: false, error: 'No active tab.' };
    const selector = args.selector ? String(args.selector) : undefined;
    const maxChars = typeof args.maxChars === 'number' && args.maxChars > 0 ? args.maxChars : undefined;
    const result = await this.sendToContentScript(tabId, {
      action: 'get_visible_text',
      selector,
      maxChars,
    });
    return result || { success: false, error: 'Content script unavailable.' };
  }

  private async getElementInfo(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) return { success: false, error: 'No active tab.' };
    const selector = String(args.selector || '');
    if (!selector) return { success: false, error: 'Missing selector.' };
    const result = await this.sendToContentScript(tabId, {
      action: 'get_element_info',
      selector,
    });
    return result || { success: false, error: 'Content script unavailable.' };
  }

  private async getAllInputs(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) return { success: false, error: 'No active tab.' };
    const result = await this.sendToContentScript(tabId, { action: 'get_all_inputs' });
    return result || { success: false, error: 'Content script unavailable.' };
  }

  private async getAllButtons(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) return { success: false, error: 'No active tab.' };
    const result = await this.sendToContentScript(tabId, { action: 'get_all_buttons' });
    return result || { success: false, error: 'Content script unavailable.' };
  }

  private async highlightElement(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) return { success: false, error: 'No active tab.' };
    const selector = String(args.selector || '');
    if (!selector) return { success: false, error: 'Missing selector.' };
    const result = await this.sendToContentScript(tabId, { action: 'highlight_element', selector });
    return result || { success: false, error: 'Content script unavailable.' };
  }

  private async unhighlightAll(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) return { success: false, error: 'No active tab.' };
    const result = await this.sendToContentScript(tabId, { action: 'unhighlight_all' });
    return result || { success: false, error: 'Content script unavailable.' };
  }

  private async simulateHover(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) return { success: false, error: 'No active tab.' };
    const selector = String(args.selector || '');
    if (!selector) return { success: false, error: 'Missing selector.' };
    const result = await this.sendToContentScript(tabId, { action: 'simulate_hover', selector });
    return result || { success: false, error: 'Content script unavailable.' };
  }

  private async findElements(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) return { success: false, error: 'No active tab.' };
    const query = {
      text: args.text ? String(args.text) : undefined,
      role: args.role ? String(args.role) : undefined,
      label: args.label ? String(args.label) : undefined,
      selector: args.selector ? String(args.selector) : undefined,
      exact: args.exact === true,
      includeHidden: args.includeHidden === true,
      limit: typeof args.limit === 'number' ? args.limit : undefined,
    };
    const result = await this.sendToContentScript(tabId, { action: 'find_elements', query });
    return result || { success: false, error: 'Content script unavailable.' };
  }

  private async clickByText(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) return { success: false, error: 'No active tab.' };
    const text = String(args.text || '');
    if (!text) return { success: false, error: 'Missing text.' };
    const result = await this.sendToContentScript(tabId, {
      action: 'click_by_text',
      text,
      role: args.role ? String(args.role) : undefined,
      exact: args.exact === true,
    });
    return result || { success: false, error: 'Content script unavailable.' };
  }

  private async clickByRole(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) return { success: false, error: 'No active tab.' };
    const role = String(args.role || '');
    if (!role) return { success: false, error: 'Missing role.' };
    const result = await this.sendToContentScript(tabId, {
      action: 'click_by_role',
      role,
      name: args.name ? String(args.name) : undefined,
      exact: args.exact === true,
    });
    return result || { success: false, error: 'Content script unavailable.' };
  }

  private async typeByLabel(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) return { success: false, error: 'No active tab.' };
    const label = String(args.label || '');
    const text = String(args.text ?? '');
    if (!label) return { success: false, error: 'Missing label.' };
    const result = await this.sendToContentScript(tabId, {
      action: 'type_by_label',
      label,
      text,
      exact: args.exact === true,
    });
    return result || { success: false, error: 'Content script unavailable.' };
  }

  private normalizeMatchMode(value: unknown, fallback: 'includes' | 'exact' | 'regex' = 'includes') {
    const mode = typeof value === 'string' ? value.toLowerCase() : '';
    if (mode === 'exact' || mode === 'regex' || mode === 'includes') return mode;
    return fallback;
  }

  private async waitForCondition(
    tabId: number,
    checkFn: (...args: any[]) => unknown,
    args: any[],
    options: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
  ) {
    const timeoutMs = typeof options.timeoutMs === 'number' && options.timeoutMs > 0 ? options.timeoutMs : 10000;
    const intervalMs = typeof options.intervalMs === 'number' && options.intervalMs > 0 ? options.intervalMs : 200;
    const start = Date.now();
    let lastResult: any = null;

    while (Date.now() - start < timeoutMs) {
      lastResult = await this.runInTab(tabId, checkFn, args);
      if (lastResult?.ok) {
        return { success: true, ...lastResult, elapsedMs: Date.now() - start };
      }
      await this.sleep(intervalMs);
    }

    return {
      success: false,
      error: `Timeout waiting for ${options.label || 'condition'} (${timeoutMs}ms).`,
      lastResult,
      elapsedMs: Date.now() - start,
    };
  }

  private async waitForSelector(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) return { success: false, error: 'No active tab.' };
    const selector = String(args.selector || '');
    if (!selector) return { success: false, error: 'Missing selector.' };
    const visible = args.visible !== false;
    return this.waitForCondition(
      tabId,
      (sel, requireVisible) => {
        const el = document.querySelector<HTMLElement>(sel);
        if (!el) return { ok: false, reason: 'not_found' };
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const isVisible =
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          rect.width > 0 &&
          rect.height > 0;
        if (requireVisible && !isVisible) return { ok: false, reason: 'not_visible' };
        return { ok: true, found: true, visible: isVisible };
      },
      [selector, visible],
      { timeoutMs: args.timeoutMs, intervalMs: args.intervalMs, label: `selector ${selector}` },
    );
  }

  private async waitForText(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) return { success: false, error: 'No active tab.' };
    const text = String(args.text || '');
    if (!text) return { success: false, error: 'Missing text.' };
    const selector = args.selector ? String(args.selector) : '';
    const match = this.normalizeMatchMode(args.match, 'includes');
    const caseSensitive = args.caseSensitive === true;
    return this.waitForCondition(
      tabId,
      (needle, sel, mode, sensitive) => {
        const base = sel ? document.querySelector<HTMLElement>(sel) : document.body;
        if (!base) return { ok: false, reason: 'target_not_found' };
        const rawText = base.innerText || base.textContent || '';
        let haystack = rawText;
        let query = String(needle);
        let matched = false;
        if (mode === 'regex') {
          try {
            const regex = new RegExp(String(needle), sensitive ? '' : 'i');
            matched = regex.test(rawText);
          } catch {
            matched = false;
          }
        } else {
          if (!sensitive) {
            haystack = haystack.toLowerCase();
            query = query.toLowerCase();
          }
          if (mode === 'exact') {
            matched = haystack.trim() === query.trim();
          } else {
            matched = haystack.includes(query);
          }
        }
        return matched ? { ok: true } : { ok: false, reason: 'text_not_found' };
      },
      [text, selector, match, caseSensitive],
      { timeoutMs: args.timeoutMs, intervalMs: args.intervalMs, label: `text "${text}"` },
    );
  }

  private async assertVisible(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) return { success: false, error: 'No active tab.' };
    const selector = String(args.selector || '');
    if (!selector) return { success: false, error: 'Missing selector.' };
    const result = await this.runInTab(tabId, (sel) => {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) return { ok: false, error: 'Element not found.' };
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const visible =
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0' &&
        rect.width > 0 &&
        rect.height > 0;
      if (!visible) return { ok: false, error: 'Element not visible.' };
      return { ok: true };
    }, [selector]);
    if (result?.ok) return { success: true };
    return { success: false, error: result?.error || 'Assertion failed.' };
  }

  private async assertText(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) return { success: false, error: 'No active tab.' };
    const text = String(args.text || '');
    if (!text) return { success: false, error: 'Missing text.' };
    const selector = args.selector ? String(args.selector) : '';
    const match = this.normalizeMatchMode(args.match, 'includes');
    const caseSensitive = args.caseSensitive === true;
    const result = await this.runInTab(
      tabId,
      (needle, sel, mode, sensitive) => {
        const base = sel ? document.querySelector<HTMLElement>(sel) : document.body;
        if (!base) return { ok: false, error: 'Target not found.' };
        const rawText = base.innerText || base.textContent || '';
        let haystack = rawText;
        let query = String(needle);
        let matched = false;
        if (mode === 'regex') {
          try {
            const regex = new RegExp(query, sensitive ? '' : 'i');
            matched = regex.test(rawText);
          } catch {
            matched = false;
          }
        } else {
          if (!sensitive) {
            haystack = haystack.toLowerCase();
            query = query.toLowerCase();
          }
          if (mode === 'exact') {
            matched = haystack.trim() === query.trim();
          } else {
            matched = haystack.includes(query);
          }
        }
        return matched ? { ok: true } : { ok: false, error: 'Text not found.' };
      },
      [text, selector, match, caseSensitive],
    );
    if (result?.ok) return { success: true };
    return { success: false, error: result?.error || 'Assertion failed.' };
  }

  private async assertUrl(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) return { success: false, error: 'No active tab.' };
    const url = String(args.url || '');
    if (!url) return { success: false, error: 'Missing url.' };
    const match = this.normalizeMatchMode(args.match, 'includes');
    const result = await this.runInTab(tabId, (needle, mode) => {
      const current = window.location.href || '';
      let matched = false;
      if (mode === 'exact') {
        matched = current === needle;
      } else if (mode === 'regex') {
        try {
          matched = new RegExp(String(needle)).test(current);
        } catch {
          matched = false;
        }
      } else {
        matched = current.includes(String(needle));
      }
      return matched ? { ok: true } : { ok: false, error: `URL mismatch: ${current}` };
    }, [url, match]);
    if (result?.ok) return { success: true };
    return { success: false, error: result?.error || 'Assertion failed.' };
  }

  private async assertValue(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) return { success: false, error: 'No active tab.' };
    const selector = String(args.selector || '');
    const value = String(args.value ?? '');
    if (!selector) return { success: false, error: 'Missing selector.' };
    const match = typeof args.match === 'string' && args.match.toLowerCase() === 'includes' ? 'includes' : 'exact';
    const result = await this.runInTab(tabId, (sel, expected, mode) => {
      const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(sel);
      if (!el) return { ok: false, error: 'Element not found.' };
      const actual = el.value ?? '';
      const matched = mode === 'includes' ? actual.includes(expected) : actual === expected;
      return matched ? { ok: true } : { ok: false, error: `Value mismatch: "${actual}"` };
    }, [selector, value, match]);
    if (result?.ok) return { success: true };
    return { success: false, error: result?.error || 'Assertion failed.' };
  }

  private async getDomSnapshot(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) return { success: false, error: 'No active tab.' };
    const selector = args.selector ? String(args.selector) : '';
    const maxChars = typeof args.maxChars === 'number' && args.maxChars > 0 ? args.maxChars : 20000;
    const result = await this.runInTab(
      tabId,
      (sel, limit) => {
        const base = sel ? document.querySelector<HTMLElement>(sel) : document.documentElement;
        if (!base) return { success: false, error: 'Target not found.' };
        const html = base.outerHTML || '';
        const length = html.length;
        if (length <= limit) {
          return { success: true, content: html, truncated: false, contentLength: length };
        }
        return { success: true, content: html.slice(0, limit), truncated: true, contentLength: length };
      },
      [selector, maxChars],
    );
    return result || { success: false, error: 'Script execution failed.' };
  }

  private async screenshot(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) return { success: false, error: 'No active tab.' };
    const tab = await chrome.tabs.get(tabId);
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    return { success: true, dataUrl };
  }

  private async screenshotElement(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) return { success: false, error: 'No active tab.' };
    const selector = String(args.selector || '');
    if (!selector) return { success: false, error: 'Missing selector.' };

    const rectResult = await this.runInTab(
      tabId,
      (sel) => {
        const el = document.querySelector<HTMLElement>(sel);
        if (!el) return { success: false, error: 'Element not found.' };
        try {
          el.scrollIntoView({ block: 'center', inline: 'center' });
        } catch {
          // ignore
        }
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          return { success: false, error: 'Element has no visible size.' };
        }
        return {
          success: true,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          dpr: window.devicePixelRatio || 1,
        };
      },
      [selector],
    );

    if (!rectResult?.success) {
      return rectResult || { success: false, error: 'Failed to resolve element bounds.' };
    }

    await this.sleep(100);
    const tab = await chrome.tabs.get(tabId);
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const cropped = await this.cropScreenshot(dataUrl, rectResult.rect, rectResult.dpr);
    return { success: true, dataUrl: cropped, rect: rectResult.rect };
  }

  private async cropScreenshot(
    dataUrl: string,
    rect: { x: number; y: number; width: number; height: number },
    dpr = 1,
  ) {
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
      return dataUrl;
    }
    try {
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const scale = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
      const sx = Math.max(0, Math.floor(rect.x * scale));
      const sy = Math.max(0, Math.floor(rect.y * scale));
      const sw = Math.min(bitmap.width - sx, Math.ceil(rect.width * scale));
      const sh = Math.min(bitmap.height - sy, Math.ceil(rect.height * scale));
      if (sw <= 0 || sh <= 0) return dataUrl;
      const canvas = new OffscreenCanvas(sw, sh);
      const ctx = canvas.getContext('2d');
      if (!ctx) return dataUrl;
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
      const outBlob = await canvas.convertToBlob({ type: 'image/png' });
      return this.blobToDataUrl(outBlob);
    } catch {
      return dataUrl;
    }
  }

  private async blobToDataUrl(blob: Blob) {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return `data:${blob.type};base64,${btoa(binary)}`;
  }

  private async getTabs() {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    return {
      success: true,
      tabs: tabs.map((tab) => ({ id: tab.id, title: tab.title, url: tab.url })),
    };
  }

  private async groupTabs(args: Record<string, any>) {
    const tabIds = Array.isArray(args.tabIds) ? args.tabIds.filter((id) => typeof id === 'number') : [];
    if (!tabIds.length) {
      return { success: false, error: 'No tab ids provided.' };
    }
    await this.groupTabsInternal(tabIds, { title: args.title, color: args.color });
    return { success: true, tabIds };
  }

  private async groupTabsInternal(tabIds: number[], options: GroupOptions) {
    if (!tabIds.length) return;
    const groupId = await chrome.tabs.group({ tabIds });
    if (options.title || options.color) {
      await chrome.tabGroups.update(groupId, {
        title: options.title,
        color: options.color,
      });
    }
  }
}
