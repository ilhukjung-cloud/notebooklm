/**
 * ui.ts - Microsoft Teams 스타일 채팅 UI
 *
 * 단일 HTML 파일로 구현 (inline CSS + JS)
 * Cloudflare Worker에서 Response로 반환합니다.
 *
 * [이어서 작업할 때 참고]
 * - UI 디자인 수정: getHtml() 함수 내 HTML/CSS 수정
 * - 새 기능 추가: <script> 내 JavaScript 수정
 * - 도구 상태 표시 추가: toolLabels 객체에 한국어 라벨 추가
 */

export function getHtml(): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI Assistant</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; height: 100vh; display: flex; background: #f5f5f5; color: #242424; }

  /* 사이드바 */
  .sidebar {
    width: 68px; background: #292929; display: flex; flex-direction: column; align-items: center; padding: 12px 0; gap: 8px; flex-shrink: 0;
  }
  .sidebar-icon {
    width: 44px; height: 44px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
    color: #b3b3b3; cursor: pointer; font-size: 20px; transition: background 0.15s;
  }
  .sidebar-icon:hover { background: #3d3d3d; }
  .sidebar-icon.active { background: #4f4f4f; color: #fff; }
  .sidebar-logo { width: 44px; height: 44px; border-radius: 8px; background: #6264A7; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 18px; margin-bottom: 12px; }

  /* 채널 패널 */
  .channel-panel {
    width: 280px; background: #fff; border-right: 1px solid #e0e0e0; display: flex; flex-direction: column; flex-shrink: 0;
  }
  .channel-header {
    padding: 16px 20px; font-size: 18px; font-weight: 600; border-bottom: 1px solid #e8e8e8;
  }
  .channel-list { padding: 8px 12px; flex: 1; overflow-y: auto; }
  .channel-item {
    padding: 10px 12px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background 0.15s;
  }
  .channel-item:hover { background: #f0f0f0; }
  .channel-item.active { background: #E8EBFA; }
  .channel-avatar {
    width: 36px; height: 36px; border-radius: 50%; background: #6264A7; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; flex-shrink: 0;
  }
  .channel-info { flex: 1; min-width: 0; }
  .channel-name { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .channel-preview { font-size: 12px; color: #616161; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* 메인 채팅 */
  .main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .chat-header {
    height: 56px; padding: 0 24px; display: flex; align-items: center; border-bottom: 1px solid #e0e0e0; background: #fff; gap: 12px; flex-shrink: 0;
  }
  .chat-header-avatar { width: 32px; height: 32px; border-radius: 50%; background: #6264A7; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 13px; }
  .chat-header-name { font-weight: 600; font-size: 16px; }
  .chat-header-status { font-size: 12px; color: #616161; }

  .messages {
    flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 4px;
  }
  .msg-group { display: flex; gap: 12px; padding: 8px 0; }
  .msg-avatar {
    width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px; flex-shrink: 0; margin-top: 2px;
  }
  .msg-avatar.ai { background: #6264A7; color: #fff; }
  .msg-avatar.user { background: #C4314B; color: #fff; }
  .msg-body { flex: 1; min-width: 0; }
  .msg-header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
  .msg-name { font-weight: 600; font-size: 14px; }
  .msg-time { font-size: 12px; color: #616161; }
  .msg-text {
    font-size: 14px; line-height: 1.6; word-break: break-word;
  }
  .msg-text p { margin: 4px 0; }
  .msg-text strong { font-weight: 600; }
  .msg-text code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-family: 'Cascadia Code', 'Consolas', monospace; font-size: 13px; }
  .msg-text pre { background: #1e1e1e; color: #d4d4d4; padding: 12px 16px; border-radius: 8px; margin: 8px 0; overflow-x: auto; font-size: 13px; }
  .msg-text pre code { background: none; padding: 0; color: inherit; }
  .msg-text ul, .msg-text ol { padding-left: 20px; margin: 4px 0; }
  .msg-text li { margin: 2px 0; }

  .tool-badge {
    display: inline-flex; align-items: center; gap: 4px; background: #E8EBFA; color: #6264A7; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 500; margin: 4px 4px 4px 0;
  }
  .tool-badge .icon { font-size: 14px; }

  /* 타이핑 인디케이터 */
  .typing { display: flex; align-items: center; gap: 4px; padding: 4px 0; }
  .typing-dot {
    width: 6px; height: 6px; background: #6264A7; border-radius: 50%;
    animation: typing 1.4s infinite;
  }
  .typing-dot:nth-child(2) { animation-delay: 0.2s; }
  .typing-dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes typing { 0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); } 30% { opacity: 1; transform: scale(1); } }
  .typing-text { font-size: 12px; color: #616161; margin-left: 4px; }

  /* 입력 영역 */
  .input-area {
    padding: 12px 24px 20px; background: #fff; border-top: 1px solid #e0e0e0;
  }
  .input-box {
    display: flex; align-items: flex-end; background: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 8px; padding: 8px 12px; gap: 8px; transition: border-color 0.15s;
  }
  .input-box:focus-within { border-color: #6264A7; }
  .input-box textarea {
    flex: 1; border: none; background: none; resize: none; font-family: inherit; font-size: 14px; line-height: 1.5; max-height: 120px; outline: none; color: #242424;
  }
  .input-box textarea::placeholder { color: #999; }
  .send-btn {
    width: 36px; height: 36px; border: none; background: #6264A7; color: #fff; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; transition: background 0.15s;
  }
  .send-btn:hover { background: #4F52B5; }
  .send-btn:disabled { background: #ccc; cursor: not-allowed; }

  /* 반응형 */
  @media (max-width: 768px) {
    .sidebar { width: 52px; }
    .channel-panel { display: none; }
    .chat-header { padding: 0 16px; }
    .messages { padding: 12px 16px; }
    .input-area { padding: 8px 16px 12px; }
  }
</style>
</head>
<body>

<!-- 사이드바 -->
<div class="sidebar">
  <div class="sidebar-logo">AI</div>
  <div class="sidebar-icon active" title="Chat">&#128172;</div>
  <div class="sidebar-icon" title="Tools">&#128295;</div>
  <div class="sidebar-icon" title="Settings">&#9881;</div>
</div>

<!-- 채널 패널 -->
<div class="channel-panel">
  <div class="channel-header">AI Assistant</div>
  <div class="channel-list">
    <div class="channel-item active">
      <div class="channel-avatar">G</div>
      <div class="channel-info">
        <div class="channel-name">Gemini Assistant</div>
        <div class="channel-preview">무엇이든 물어보세요</div>
      </div>
    </div>
    <div class="channel-item">
      <div class="channel-avatar" style="background:#0078D4">T</div>
      <div class="channel-info">
        <div class="channel-name">사용 가능한 도구</div>
        <div class="channel-preview">날씨, 환율, 번역, 검색...</div>
      </div>
    </div>
  </div>
</div>

<!-- 메인 채팅 영역 -->
<div class="main">
  <div class="chat-header">
    <div class="chat-header-avatar">G</div>
    <div>
      <div class="chat-header-name">Gemini AI Assistant</div>
      <div class="chat-header-status">온라인 | Powered by Gemini 3 Pro</div>
    </div>
  </div>

  <div class="messages" id="messages">
    <div class="msg-group">
      <div class="msg-avatar ai">AI</div>
      <div class="msg-body">
        <div class="msg-header">
          <span class="msg-name">AI Assistant</span>
          <span class="msg-time">지금</span>
        </div>
        <div class="msg-text">
          안녕하세요! AI 어시스턴트입니다. 다음과 같은 것들을 도와드릴 수 있어요:<br><br>
          <span class="tool-badge"><span class="icon">🌤️</span> 날씨 조회</span>
          <span class="tool-badge"><span class="icon">💱</span> 환율 변환</span>
          <span class="tool-badge"><span class="icon">🌐</span> 번역</span>
          <span class="tool-badge"><span class="icon">📝</span> 요약</span>
          <span class="tool-badge"><span class="icon">🔍</span> 웹 검색</span>
          <span class="tool-badge"><span class="icon">🔗</span> URL 조회</span>
          <span class="tool-badge"><span class="icon">🧮</span> 계산</span>
          <span class="tool-badge"><span class="icon">🕐</span> 시간 조회</span>
          <br><br>무엇이든 물어보세요!
        </div>
      </div>
    </div>
  </div>

  <div class="input-area">
    <div class="input-box">
      <textarea id="input" rows="1" placeholder="메시지를 입력하세요..." onkeydown="handleKey(event)"></textarea>
      <button class="send-btn" id="sendBtn" onclick="sendMessage()" title="전송">&#10148;</button>
    </div>
  </div>
</div>

<script>
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
let history = [];
let isLoading = false;

const toolLabels = {
  weather: '🌤️ 날씨 조회',
  exchange_rate: '💱 환율 조회',
  translate: '🌐 번역 중',
  summarize: '📝 요약 중',
  web_search: '🔍 검색 중',
  fetch_url: '🔗 페이지 조회',
  calculate: '🧮 계산 중',
  datetime: '🕐 시간 조회',
};

// 텍스트 영역 자동 높이
inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
});

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function getTime() {
  return new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderMarkdown(text) {
  // 코드 블록
  text = text.replace(/\`\`\`(\\w*)?\\n([\\s\\S]*?)\`\`\`/g, '<pre><code>$2</code></pre>');
  // 인라인 코드
  text = text.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
  // 볼드
  text = text.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
  // 리스트
  text = text.replace(/^[\\-\\*] (.+)$/gm, '<li>$1</li>');
  text = text.replace(/(<li>.*<\\/li>)/s, '<ul>$1</ul>');
  // 번호 리스트
  text = text.replace(/^\\d+\\. (.+)$/gm, '<li>$1</li>');
  // 줄바꿈
  text = text.replace(/\\n/g, '<br>');
  return text;
}

function addMessage(role, text, toolsUsed) {
  const isAi = role === 'assistant';
  const group = document.createElement('div');
  group.className = 'msg-group';

  let toolBadges = '';
  if (toolsUsed && toolsUsed.length > 0) {
    toolBadges = '<div style="margin-bottom:6px">' +
      toolsUsed.map(t => '<span class="tool-badge">' + (toolLabels[t] || t) + '</span>').join('') +
      '</div>';
  }

  group.innerHTML =
    '<div class="msg-avatar ' + (isAi ? 'ai' : 'user') + '">' + (isAi ? 'AI' : 'Me') + '</div>' +
    '<div class="msg-body">' +
      '<div class="msg-header">' +
        '<span class="msg-name">' + (isAi ? 'AI Assistant' : '나') + '</span>' +
        '<span class="msg-time">' + getTime() + '</span>' +
      '</div>' +
      toolBadges +
      '<div class="msg-text">' + (isAi ? renderMarkdown(text) : escapeHtml(text)) + '</div>' +
    '</div>';

  messagesEl.appendChild(group);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showTyping() {
  const el = document.createElement('div');
  el.id = 'typing-indicator';
  el.className = 'msg-group';
  el.innerHTML =
    '<div class="msg-avatar ai">AI</div>' +
    '<div class="msg-body">' +
      '<div class="typing">' +
        '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>' +
        '<span class="typing-text">생각하는 중...</span>' +
      '</div>' +
    '</div>';
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function removeTyping() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || isLoading) return;

  isLoading = true;
  sendBtn.disabled = true;
  inputEl.value = '';
  inputEl.style.height = 'auto';

  addMessage('user', text);
  history.push({ role: 'user', text });

  showTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: history.slice(0, -1) }),
    });

    const data = await res.json();
    removeTyping();

    addMessage('assistant', data.reply, data.tools_used);
    history.push({ role: 'assistant', text: data.reply });
  } catch (err) {
    removeTyping();
    addMessage('assistant', '오류가 발생했습니다. 다시 시도해주세요.');
  }

  isLoading = false;
  sendBtn.disabled = false;
  inputEl.focus();
}
</script>
</body>
</html>`;
}
