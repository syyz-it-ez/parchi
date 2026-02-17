// Content Script - Runs in the context of web pages
// This script can access the DOM and communicate with the background script

type HighlightEntry = {
  element: HTMLElement;
  originalOutline: string;
  originalOutlineOffset: string;
};

type FindElementQuery = {
  text?: string;
  role?: string;
  label?: string;
  selector?: string;
  exact?: boolean;
  includeHidden?: boolean;
  limit?: number;
};

type FoundElement = {
  selector: string;
  text: string;
  role: string;
  label: string;
  tagName: string;
  visible: boolean;
  score: number;
};

class ContentScriptHandler {
  highlightedElements: Set<HighlightEntry>;

  constructor() {
    this.highlightedElements = new Set();
    this.init();
  }

  init() {
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep channel open for async response
    });

    // Signal that content script is ready
    this.notifyReady();
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.action) {
        case 'highlight_element':
          this.highlightElement(message.selector);
          sendResponse({ success: true });
          break;

        case 'unhighlight_all':
          this.unhighlightAll();
          sendResponse({ success: true });
          break;

        case 'get_element_info':
          const info = this.getElementInfo(message.selector);
          sendResponse({ success: true, info });
          break;

        case 'simulate_hover':
          this.simulateHover(message.selector);
          sendResponse({ success: true });
          break;

        case 'get_all_inputs':
          const inputs = this.getAllInputs();
          sendResponse({ success: true, inputs });
          break;

        case 'get_all_buttons':
          const buttons = this.getAllButtons();
          sendResponse({ success: true, buttons });
          break;

        case 'get_visible_text':
          const text = this.getVisibleText(message.selector, message.maxChars);
          sendResponse({ success: true, text });
          break;

        case 'find_elements':
          const results = this.findElements(message.query || {});
          sendResponse({ success: true, results });
          break;

        case 'click_by_text': {
          const result = this.clickByText(message.text, {
            role: message.role,
            exact: message.exact,
          });
          sendResponse(result);
          break;
        }

        case 'click_by_role': {
          const result = this.clickByRole(message.role, {
            name: message.name,
            exact: message.exact,
          });
          sendResponse(result);
          break;
        }

        case 'type_by_label': {
          const result = this.typeByLabel(message.label, message.text, {
            exact: message.exact,
          });
          sendResponse(result);
          break;
        }

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  notifyReady() {
    chrome.runtime
      .sendMessage({
        type: 'content_script_ready',
        url: window.location.href,
      })
      .catch(() => {
        // Extension context may not be ready yet
      });
  }

  highlightElement(selector) {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) return;

    // Add highlight style
    const originalOutline = element.style.outline;
    const originalOutlineOffset = element.style.outlineOffset;

    element.style.outline = '3px solid #4f46e5';
    element.style.outlineOffset = '2px';

    this.highlightedElements.add({
      element,
      originalOutline,
      originalOutlineOffset,
    });

    // Auto-remove after 3 seconds
    setTimeout(() => {
      element.style.outline = originalOutline;
      element.style.outlineOffset = originalOutlineOffset;
    }, 3000);
  }

  unhighlightAll() {
    this.highlightedElements.forEach(({ element, originalOutline, originalOutlineOffset }) => {
      element.style.outline = originalOutline;
      element.style.outlineOffset = originalOutlineOffset;
    });
    this.highlightedElements.clear();
  }

  getElementInfo(selector) {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) return null;

    const rect = element.getBoundingClientRect();
    const typedElement = element as HTMLElement & { value?: string; type?: string };
    return {
      tagName: element.tagName,
      id: element.id,
      className: element.className,
      textContent: element.textContent?.substring(0, 200),
      value: typedElement.value,
      type: typedElement.type,
      position: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
      visible: this.isElementVisible(element),
      attributes: Array.from(element.attributes).reduce((acc, attr) => {
        acc[attr.name] = attr.value;
        return acc;
      }, {}),
    };
  }

  isElementVisible(element) {
    const style = window.getComputedStyle(element);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      element.offsetParent !== null
    );
  }

  simulateHover(selector) {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) return;

    const mouseoverEvent = new MouseEvent('mouseover', {
      view: window,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(mouseoverEvent);
  }

  getAllInputs() {
    const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input, textarea, select',
    );
    return Array.from(inputs).map((input, index) => {
      const label = this.findLabelForInput(input);
      const placeholder =
        input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement ? input.placeholder : '';
      return {
        index,
        tagName: input.tagName,
        type: input.type,
        id: input.id,
        name: input.name,
        placeholder,
        value: input.value,
        label: label?.textContent?.trim(),
        selector: this.getOptimalSelector(input),
      };
    });
  }

  getAllButtons() {
    const buttons = document.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
      'button, input[type="button"], input[type="submit"], [role="button"]',
    );
    return Array.from(buttons).map((button, index) => ({
      index,
      tagName: button.tagName,
      text: button.textContent?.trim() || button.value,
      id: button.id,
      className: button.className,
      selector: this.getOptimalSelector(button),
    }));
  }

  findLabelForInput(input: HTMLElement & { id?: string }) {
    // Try to find associated label
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) return label;
    }

    // Check if input is inside a label
    const parentLabel = input.closest('label');
    if (parentLabel) return parentLabel;

    // Check previous sibling
    const prevSibling = input.previousElementSibling;
    if (prevSibling && prevSibling.tagName === 'LABEL') {
      return prevSibling;
    }

    return null;
  }

  getOptimalSelector(element: HTMLElement & { name?: string }) {
    // Try ID first
    if (element.id) {
      return `#${element.id}`;
    }

    // Try name attribute
    if (element.name) {
      return `[name="${element.name}"]`;
    }

    // Try data attributes
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      if (attr.name.startsWith('data-') && attr.value) {
        return `[${attr.name}="${attr.value}"]`;
      }
    }

    // Fall back to nth-child selector
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(element) + 1;
      return `${element.tagName.toLowerCase()}:nth-child(${index})`;
    }

    return element.tagName.toLowerCase();
  }

  normalizeText(value: string) {
    return value.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  getImplicitRole(element: HTMLElement) {
    const tag = element.tagName.toLowerCase();
    if (tag === 'button') return 'button';
    if (tag === 'a' && (element as HTMLAnchorElement).href) return 'link';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'select') return 'combobox';
    if (tag === 'input') {
      const input = element as HTMLInputElement;
      const type = (input.type || 'text').toLowerCase();
      if (['button', 'submit', 'reset'].includes(type)) return 'button';
      if (['checkbox', 'radio'].includes(type)) return type;
      if (['email', 'text', 'search', 'password', 'tel', 'url', 'number'].includes(type)) return 'textbox';
    }
    return '';
  }

  getAccessibleName(element: HTMLElement) {
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl?.textContent?.trim()) return labelEl.textContent.trim();
    }

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      const label = this.findLabelForInput(element);
      if (label?.textContent?.trim()) return label.textContent.trim();
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        const placeholder = element.placeholder;
        if (placeholder && placeholder.trim()) return placeholder.trim();
      }
    }

    if (element.tagName.toLowerCase() === 'img') {
      const alt = element.getAttribute('alt');
      if (alt && alt.trim()) return alt.trim();
    }

    const text = (element as HTMLElement).innerText || element.textContent || '';
    if (text.trim()) return text.trim();

    const title = element.getAttribute('title');
    if (title && title.trim()) return title.trim();

    if (element instanceof HTMLInputElement && element.value) return element.value;

    return '';
  }

  getElementRole(element: HTMLElement) {
    const explicit = element.getAttribute('role');
    if (explicit && explicit.trim()) return explicit.trim().toLowerCase();
    const implicit = this.getImplicitRole(element);
    return implicit ? implicit.toLowerCase() : '';
  }

  getElementLabel(element: HTMLElement) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      const label = this.findLabelForInput(element);
      if (label?.textContent?.trim()) return label.textContent.trim();
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
    }
    return '';
  }

  scoreMatch(candidate: string, query: string, exact = false) {
    if (!query) return 0;
    if (!candidate) return 0;
    const normalizedCandidate = this.normalizeText(candidate);
    const normalizedQuery = this.normalizeText(query);
    if (!normalizedCandidate || !normalizedQuery) return 0;
    if (exact) return normalizedCandidate === normalizedQuery ? 2 : 0;
    if (normalizedCandidate === normalizedQuery) return 2;
    if (normalizedCandidate.startsWith(normalizedQuery)) return 1.5;
    if (normalizedCandidate.includes(normalizedQuery)) return 1;
    return 0;
  }

  collectCandidates(query: FindElementQuery, options: { clickableOnly?: boolean } = {}) {
    const selector = query.selector;
    if (selector) {
      return Array.from(document.querySelectorAll<HTMLElement>(selector));
    }
    if (options.clickableOnly) {
      return Array.from(
        document.querySelectorAll<HTMLElement>(
          'button, a[href], input[type="button"], input[type="submit"], input[type="reset"], [role="button"], [role="link"]',
        ),
      );
    }
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, a[href], input, textarea, select, [role], [aria-label], [aria-labelledby]',
      ),
    );
  }

  findElements(query: FindElementQuery, options: { clickableOnly?: boolean } = {}): FoundElement[] {
    const candidates = this.collectCandidates(query, options);
    const includeHidden = query.includeHidden === true;
    const limit = typeof query.limit === 'number' && query.limit > 0 ? query.limit : 10;
    const results: FoundElement[] = [];

    candidates.forEach((element) => {
      const visible = this.isElementVisible(element);
      if (!includeHidden && !visible) return;

      const text = this.getAccessibleName(element);
      const role = this.getElementRole(element);
      const label = this.getElementLabel(element);

      let score = 0;
      if (query.text) score += this.scoreMatch(text, query.text, query.exact);
      if (query.label) score += this.scoreMatch(label || text, query.label, query.exact);
      if (query.role) score += role === query.role.toLowerCase() ? 1.5 : 0;

      if (!query.text && !query.label && !query.role) score = 1;
      if (score <= 0) return;

      results.push({
        selector: this.getOptimalSelector(element),
        text: text || '',
        role: role || '',
        label: label || '',
        tagName: element.tagName,
        visible,
        score,
      });
    });

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  clickByText(text: string, options: { role?: string; exact?: boolean } = {}) {
    if (!text) return { success: false, error: 'Missing text query.' };
    const results = this.findElements({ text, role: options.role, exact: options.exact }, { clickableOnly: true });
    const candidate = results[0];
    if (!candidate) {
      return { success: false, error: 'No matching element found.', matches: [] };
    }
    const element = document.querySelector<HTMLElement>(candidate.selector);
    if (!element) return { success: false, error: 'Matched element not found in DOM.' };

    element.scrollIntoView({ block: 'center', inline: 'center' });
    if (!this.isElementVisible(element)) {
      return { success: false, error: 'Matched element is not visible.', match: candidate };
    }
    element.click();
    return { success: true, selector: candidate.selector, match: candidate, matches: results };
  }

  clickByRole(role: string, options: { name?: string; exact?: boolean } = {}) {
    if (!role) return { success: false, error: 'Missing role.' };
    const normalizedRole = role.toLowerCase();
    const restrictToClickable = ['button', 'link'].includes(normalizedRole);
    const results = this.findElements(
      { role, text: options.name, exact: options.exact },
      { clickableOnly: restrictToClickable },
    );
    const candidate = results[0];
    if (!candidate) return { success: false, error: 'No matching element found.', matches: [] };
    const element = document.querySelector<HTMLElement>(candidate.selector);
    if (!element) return { success: false, error: 'Matched element not found in DOM.' };

    element.scrollIntoView({ block: 'center', inline: 'center' });
    if (!this.isElementVisible(element)) {
      return { success: false, error: 'Matched element is not visible.', match: candidate };
    }
    element.click();
    return { success: true, selector: candidate.selector, match: candidate, matches: results };
  }

  setElementValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
    const proto = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && typeof descriptor.set === 'function') {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  }

  dispatchInputEvents(element: HTMLElement, value: string) {
    const inputEvent =
      typeof InputEvent !== 'undefined'
        ? new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' })
        : new Event('input', { bubbles: true });
    element.dispatchEvent(inputEvent);
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  typeByLabel(label: string, text: string, options: { exact?: boolean } = {}) {
    if (!label) return { success: false, error: 'Missing label query.' };
    const inputs: Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> = Array.from(
      document.querySelectorAll('input, textarea, select'),
    );
    let bestElement: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null = null;
    let bestScore = 0;
    let bestSelector = '';

    inputs.forEach((input) => {
      if (!this.isElementVisible(input)) return;
      const labelText = this.getElementLabel(input);
      const score = this.scoreMatch(labelText || this.getAccessibleName(input), label, options.exact);
      if (score > 0 && (!bestElement || score > bestScore)) {
        bestElement = input;
        bestScore = score;
        bestSelector = this.getOptimalSelector(input);
      }
    });

    if (!bestElement) return { success: false, error: 'No matching input found.' };
    const target = bestElement as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    target.focus();
    this.setElementValue(target, text ?? '');
    this.dispatchInputEvents(target, text ?? '');
    return { success: true, selector: bestSelector };
  }

  getVisibleText(selector?: string, maxChars = 10000) {
    const root = selector ? document.querySelector<HTMLElement>(selector) : document.body;
    if (!root) return '';

    // Get all text nodes that are actually visible
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        const style = window.getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return NodeFilter.FILTER_REJECT;
        }

        // Filter out script and style tags
        if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') {
          return NodeFilter.FILTER_REJECT;
        }

        const text = node.textContent?.trim() || '';
        return text.length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });

    const textParts: string[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      textParts.push(node.textContent?.trim() || '');
    }

    return textParts.join(' ').substring(0, maxChars); // Limit output size
  }
}

// Initialize content script
const contentScriptHandler = new ContentScriptHandler();
