import { createMessage, normalizeConversationHistory } from '../../ai/message-schema.js';
import { dedupeThinking, extractThinking } from '../../ai/message-utils.js';
import { buildQaSpec } from '../../types/qa-spec.js';
import { SidePanelUI } from './panel-ui.js';

(SidePanelUI.prototype as any).persistHistory = async function persistHistory() {
  // Default to saving history unless explicitly disabled
  const saveEnabled = this.elements.saveHistory?.value !== 'false';
  if (!saveEnabled) return;
  
  // Only persist if there's actual content
  if (!this.displayHistory || this.displayHistory.length === 0) return;
  
  const entry = {
    id: this.sessionId,
    startedAt: this.sessionStartedAt,
    updatedAt: Date.now(),
    title: this.firstUserMessage || 'Session',
    messageCount: this.displayHistory.length,
    transcript: this.displayHistory.slice(-200),
    toolEvents: Array.isArray(this.qaToolEvents) ? this.qaToolEvents.slice(-500) : [],
    lastRunId: this.lastRunId || undefined,
  };
  
  try {
    const existing = await chrome.storage.local.get(['chatSessions']);
    const sessions = existing.chatSessions || [];
    const filtered = sessions.filter((s: any) => s.id !== entry.id);
    filtered.unshift(entry);
    const trimmed = filtered.slice(0, 50); // Keep more sessions
    await chrome.storage.local.set({ chatSessions: trimmed });
    this.loadHistoryList();
  } catch (e) {
    console.error('Failed to persist history:', e);
  }
};

(SidePanelUI.prototype as any).loadHistoryList = async function loadHistoryList() {
  if (!this.elements.historyItems) return;

  const saveEnabled = this.elements.saveHistory?.value !== 'false';
  if (!saveEnabled) {
    this.elements.historyItems.innerHTML =
      '<div class="history-empty">History is off. Enable “Save History” in Settings to see past chats.</div>';
    return;
  }
  
  try {
    const { chatSessions = [] } = await chrome.storage.local.get(['chatSessions']);
    this.elements.historyItems.innerHTML = '';
    
    if (!chatSessions.length) {
      this.elements.historyItems.innerHTML = '<div class="history-empty">No saved chats yet.</div>';
      return;
    }
    
    chatSessions.forEach((session: any) => {
      const item = document.createElement('div');
      item.className = 'history-item';
      const date = new Date(session.updatedAt || session.startedAt || Date.now());
      const msgCount = session.messageCount || session.transcript?.length || 0;
      const timeAgo = this.formatTimeAgo(date);
      const hasToolEvents = Array.isArray(session.toolEvents) && session.toolEvents.length > 0;
      
      item.innerHTML = `
        <div class="history-item-main">
          <div class="history-title">${this.escapeHtml(session.title || 'Untitled Session')}</div>
          <div class="history-meta">
            <span>${timeAgo}</span>
            <span class="history-meta-dot">·</span>
            <span>${msgCount} messages</span>
          </div>
        </div>
        <div class="history-actions">
          <button class="history-action history-export" title="Export QA Spec" ${hasToolEvents ? '' : 'disabled'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 3v12"></path>
              <polyline points="8 11 12 15 16 11"></polyline>
              <path d="M20 21H4"></path>
            </svg>
          </button>
          <button class="history-action history-replay" title="Replay QA Spec" ${hasToolEvents ? '' : 'disabled'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </button>
          <button class="history-delete" title="Delete" data-session-id="${session.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `;
      
      // Click to load session
      item.querySelector('.history-item-main')?.addEventListener('click', () => {
        this.loadSession(session);
      });

      item.querySelector('.history-export')?.addEventListener('click', (e: Event) => {
        e.stopPropagation();
        this.exportQaSpecForSession(session);
      });

      item.querySelector('.history-replay')?.addEventListener('click', (e: Event) => {
        e.stopPropagation();
        this.replayQaSpecForSession(session);
      });
      
      // Delete button
      item.querySelector('.history-delete')?.addEventListener('click', (e: Event) => {
        e.stopPropagation();
        this.deleteSession(session.id);
      });
      
      this.elements.historyItems.appendChild(item);
    });
  } catch (e) {
    console.error('Failed to load history:', e);
    this.elements.historyItems.innerHTML = '<div class="history-empty">Failed to load history.</div>';
  }
};

(SidePanelUI.prototype as any).exportQaSpecForSession = function exportQaSpecForSession(session: any) {
  try {
    const toolEvents = Array.isArray(session?.toolEvents) ? session.toolEvents : [];
    if (!toolEvents.length) {
      this.updateStatus('No tool events captured for this session.', 'warning');
      return;
    }
    const spec = buildQaSpec(toolEvents, {
      name: session.title ? `${session.title} QA Spec` : 'QA Spec',
      sessionId: session.id,
      runId: session.lastRunId || undefined,
    });
    if (!spec.steps.length) {
      this.updateStatus('No replayable steps found for this session.', 'warning');
      return;
    }
    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    const safeName = (spec.name || 'qa-spec').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    anchor.download = `parchi-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    this.updateStatus('QA spec exported', 'success');
  } catch (error) {
    console.error('Failed to export QA spec:', error);
    this.updateStatus('Unable to export QA spec', 'error');
  }
};

(SidePanelUI.prototype as any).replayQaSpecForSession = function replayQaSpecForSession(session: any) {
  const toolEvents = Array.isArray(session?.toolEvents) ? session.toolEvents : [];
  if (!toolEvents.length) {
    this.updateStatus('No tool events captured for this session.', 'warning');
    return;
  }

  const spec = buildQaSpec(toolEvents, {
    name: session.title ? `${session.title} QA Spec` : 'QA Spec',
    sessionId: session.id,
    runId: session.lastRunId || undefined,
  });

  if (!spec.steps.length) {
    this.updateStatus('No replayable steps found for this session.', 'warning');
    return;
  }

  if (!this.isAccessReady()) {
    this.updateAccessUI();
    this.updateStatus('Sign in required to replay QA spec', 'warning');
    return;
  }

  this.startNewSession();
  const label = `Replay QA spec: ${spec.name}`;
  this.displayUserMessage(label);
  const displayEntry = createMessage({ role: 'user', content: label });
  if (displayEntry) {
    this.displayHistory.push(displayEntry);
    this.contextHistory.push(displayEntry);
  }
  this.firstUserMessage = this.firstUserMessage || label;

  chrome.runtime.sendMessage({
    type: 'run_qa_spec',
    spec,
    sessionId: this.sessionId,
  });
  this.updateStatus('Running QA spec...', 'active');
};

(SidePanelUI.prototype as any).loadSession = function loadSession(session: any) {
  this.switchView('chat');
  if (Array.isArray(session.transcript)) {
    this.recordScrollPosition();
    const normalized = normalizeConversationHistory(session.transcript || []);
    this.displayHistory = normalized;
    this.contextHistory = normalized;
    this.sessionId = session.id || `session-${Date.now()}`;
    this.firstUserMessage = session.title || '';
    if (Array.isArray(session.toolEvents)) {
      this.qaToolEvents = session.toolEvents;
      this.qaToolEventIndex = new Map();
      session.toolEvents.forEach((event: any) => {
        if (event?.id) {
          this.qaToolEventIndex.set(event.id, event);
        }
      });
    }
    this.renderConversationHistory();
    this.updateContextUsage();
  }
};

(SidePanelUI.prototype as any).deleteSession = async function deleteSession(sessionId: string) {
  try {
    const { chatSessions = [] } = await chrome.storage.local.get(['chatSessions']);
    const filtered = chatSessions.filter((s: any) => s.id !== sessionId);
    await chrome.storage.local.set({ chatSessions: filtered });
    this.loadHistoryList();
  } catch (e) {
    console.error('Failed to delete session:', e);
  }
};

(SidePanelUI.prototype as any).clearAllHistory = async function clearAllHistory() {
  if (!confirm('Clear all chat history? This cannot be undone.')) return;
  
  try {
    await chrome.storage.local.set({ chatSessions: [] });
    this.loadHistoryList();
  } catch (e) {
    console.error('Failed to clear history:', e);
  }
};

(SidePanelUI.prototype as any).formatTimeAgo = function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
};

(SidePanelUI.prototype as any).renderConversationHistory = function renderConversationHistory() {
  this.elements.chatMessages.innerHTML = '';
  this.toolCallViews.clear();
  this.lastChatTurn = null;
  this.resetActivityPanel();

  this.displayHistory.forEach((msg: any) => {
    if (msg.role === 'system' || msg.meta?.kind === 'summary') {
      this.displaySummaryMessage(msg);
      return;
    }
    if (msg.role === 'user') {
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message user';
      messageDiv.innerHTML = `
          <div class="message-header">You</div>
          <div class="message-content">${this.escapeHtml(msg.content || '')}</div>
        `;
      this.elements.chatMessages.appendChild(messageDiv);
    } else if (msg.role === 'assistant') {
      const rawContent = typeof msg.content === 'string' ? msg.content : this.safeJsonStringify(msg.content);
      const parsed = extractThinking(rawContent, msg.thinking || null);
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message assistant';
      let html = `<div class="message-header">Assistant</div>`;
      const showThinking = this.elements.showThinking.value === 'true';
      if (parsed.thinking && showThinking) {
        const cleanedThinking = dedupeThinking(parsed.thinking);
        html += `
            <div class="thinking-block collapsed">
              <button class="thinking-header" type="button" aria-expanded="false">
                <svg class="chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
                Thinking
              </button>
              <div class="thinking-content">${this.escapeHtml(cleanedThinking)}</div>
            </div>
          `;
      }
      if (parsed.content && parsed.content.trim() !== '') {
        html += `<div class="message-content markdown-body">${this.renderMarkdown(parsed.content)}</div>`;
      }
      messageDiv.innerHTML = html;

      const thinkingHeader = messageDiv.querySelector('.thinking-header');
      if (thinkingHeader) {
        thinkingHeader.addEventListener('click', () => {
          const block = thinkingHeader.closest('.thinking-block');
          if (!block || block.classList.contains('thinking-hidden')) return;
          block.classList.toggle('collapsed');
          const expanded = !block.classList.contains('collapsed');
          thinkingHeader.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        });
      }

      this.elements.chatMessages.appendChild(messageDiv);
    }
  });
  this.restoreScrollPosition();
  this.updateChatEmptyState();
};
