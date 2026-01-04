// DOM Elements
const chatBox = document.getElementById('chat-box');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const historyList = document.getElementById('history-list');
const stopBtn = document.getElementById('stop-btn');
const newChatBtn = document.getElementById('new-chat-btn');
const welcomeScreen = document.getElementById('welcome-screen');

// Settings Elements
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettings = document.getElementById('close-settings');
const clearDataBtn = document.getElementById('clear-data-btn');
const storageInfo = document.getElementById('storage-info');

// Mobile Menu
const mobileMenuBtn = document.getElementById('mobile-menu-open'); 
const mobileMenuCloseBtn = document.getElementById('mobile-menu-close');
const sidebar = document.getElementById('sidebar');

// Model Selector Elements
const modelSelector = document.getElementById('model-selector');
const modelDropdown = document.getElementById('model-dropdown');
const currentModelSpan = document.getElementById('current-model');
const modelOptions = document.querySelectorAll('.model-option');

// --- CONSTANTS & PROMPTS ---
const STORAGE_KEY = 'xeno_chats_v1';
const STORAGE_KEY_SIDEBAR = 'sidebar-collapsed';

// Base Context
const systemContext = `You are Xeno Helper. You help users with the Xeno executor. Do not mention you are an AI. Be concise. formatting: Use Markdown.`;

// Master Prompt
const basePrompt = `
${systemContext}

IMPORTANT INSTRUCTION:
You are a support assistant strictly for Xeno Helpers (the support team). 
Your goal is to train them on how to fix issues. 
Use the context above to answer their technical questions.
`;

const PROMPTS = {
    fast: "Answer very quickly and concisely.",
    thinking: "Think step-by-step. Enclose your thought process in <think> tags, then provide the final answer."
};

let currentMode = 'fast';

function getMasterPrompt() {
    return `${basePrompt}\n\nMODE INSTRUCTION:\n${PROMPTS[currentMode]}`;
}

// State
let allChats = [];
let currentChatId = null;
let currentController = null;
let isUserStop = false;

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
    loadChatsFromStorage();
    if (allChats.length > 0) {
        loadChat(allChats[0].id);
    } else {
        startNewChat();
    }

    if (modelSelector) {
        modelSelector.addEventListener('click', (e) => {
            e.stopPropagation();
            modelDropdown.classList.toggle('hidden');
        });

        document.addEventListener('click', () => {
            if (!modelDropdown.classList.contains('hidden')) {
                modelDropdown.classList.add('hidden');
            }
        });

        modelOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const mode = option.dataset.mode;
                const title = option.querySelector('.option-title').textContent;
                
                currentModelSpan.textContent = title;
                currentMode = mode;
                
                if (currentChatId) {
                    const chat = allChats.find(c => c.id === currentChatId);
                    if (chat && chat.messages.length > 0 && chat.messages[0].role === 'system') {
                        chat.messages[0].content = getMasterPrompt();
                        saveToStorage();
                    }
                }
                
                modelDropdown.classList.add('hidden');
            });
        });
    }

    const savedSidebarState = localStorage.getItem(STORAGE_KEY_SIDEBAR);
    if (window.innerWidth > 768 && savedSidebarState === 'true') {
        sidebar.classList.add('collapsed');
    }
});

// --- CORE CHAT LOGIC ---

window.fillInput = (text) => {
    userInput.value = text;
    userInput.focus();
}

function startNewChat() {
    currentChatId = Date.now().toString();
    const newChat = {
        id: currentChatId,
        title: "New Chat",
        messages: [{ role: "system", content: getMasterPrompt() }],
        timestamp: Date.now()
    };
    allChats.unshift(newChat);
    saveToStorage();
    renderHistory();
    renderChatUI();
    
    if (window.innerWidth <= 768) {
        sidebar.classList.remove('show');
    }
}

function loadChat(id) {
    currentChatId = id;
    renderHistory();
    renderChatUI();
    
    if (window.innerWidth <= 768) {
        sidebar.classList.remove('show');
    }
}

chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = userInput.value.trim();
    if (!message) return;

    let chat = allChats.find(c => c.id === currentChatId);
    if (!chat) {
        startNewChat();
        chat = allChats.find(c => c.id === currentChatId);
    }

    setInputState(false);

    if (chat.messages.length === 1) {
        chat.title = message.substring(0, 30);
        renderHistory();
    }

    chat.messages.push({ role: "user", content: message });
    saveToStorage();
    renderChatUI();
    
    userInput.value = '';
    userInput.style.height = 'auto';

    await generateResponse(chat);
});

async function generateResponse(chat) {
    const loadingId = appendLoader();
    
    if (currentController) currentController.abort();
    currentController = new AbortController();
    isUserStop = false;
    if (stopBtn) stopBtn.classList.remove('hidden');

    const timeoutId = setTimeout(() => {
        if (currentController) currentController.abort();
    }, 120000);

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: chat.messages }),
            signal: currentController.signal
        });

        clearTimeout(timeoutId);
        removeLoader(loadingId);

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Server Error");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        let buffer = "";

        const aiMsgObj = { role: "assistant", content: "" };
        chat.messages.push(aiMsgObj);
        saveToStorage();
        renderChatUI();

        const updateLastBubble = (text) => {
            const bubbles = chatBox.querySelectorAll('.bot-message');
            const lastBubble = bubbles[bubbles.length - 1];
            if (!lastBubble) return;

            const contentDiv = lastBubble.querySelector('.message-text');
            if (!contentDiv) return;

            const existingDetails = contentDiv.querySelector('.thinking-details');
            const wasOpen = existingDetails ? existingDetails.hasAttribute('open') : true;

            contentDiv.innerHTML = formatMessage(text, wasOpen);

            contentDiv.querySelectorAll('pre').forEach(pre => {
                if (pre.querySelector('.copy-code-btn')) return;
                const copyBtn = document.createElement('button');
                copyBtn.className = 'copy-code-btn';
                copyBtn.innerText = 'Copy';
                copyBtn.style.position = 'absolute';
                copyBtn.style.top = '10px';
                copyBtn.style.right = '10px';
                copyBtn.onclick = () => {
                    const code = pre.querySelector('code')?.innerText || pre.innerText;
                    navigator.clipboard.writeText(code).then(() => {
                        copyBtn.innerText = 'Copied!';
                        setTimeout(() => copyBtn.innerText = 'Copy', 2000);
                    });
                };
                pre.style.position = 'relative';
                pre.appendChild(copyBtn);
            });
            
            chatBox.scrollTop = chatBox.scrollHeight;
        };

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop();

            let chunkContent = "";

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6);
                    if (dataStr === '[DONE]') continue;
                    try {
                        const data = JSON.parse(dataStr);
                        const content = data.choices[0]?.delta?.content || "";
                        chunkContent += content;
                    } catch (e) { console.error("Stream parse error", e); }
                }
            }
            
            if (chunkContent) {
                fullText += chunkContent;
                aiMsgObj.content = fullText;
                updateLastBubble(fullText);
            }
        }
        
        saveToStorage();
        renderChatUI(); 

    } catch (err) {
        clearTimeout(timeoutId);
        removeLoader(loadingId);
        if (err.name === 'AbortError') {
            if (isUserStop) {
                appendTempError("Generation stopped.");
            } else {
                appendTempError("Request timed out. Please try again.");
            }
        } else {
            appendTempError("Error: " + err.message);
            console.error(err);
        }
    } finally {
        setInputState(true);
        userInput.focus();
        if (stopBtn) stopBtn.classList.add('hidden');
        currentController = null;
    }
}

if (stopBtn) {
    stopBtn.addEventListener('click', () => {
        if (currentController) {
            isUserStop = true;
            currentController.abort();
        }
    });
}

userInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatForm.dispatchEvent(new Event('submit'));
    }
});

// --- RENDER FUNCTIONS ---

function formatMessage(text, isOpen = false) {
    const thinkMatch = text.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
    const thinkContent = thinkMatch ? thinkMatch[1] : null;
    let mainContent = text.replace(/<think>[\s\S]*?<\/think>/, '').replace(/<think>[\s\S]*/, '');

    let html = '';
    if (thinkMatch) {
        const openAttr = isOpen ? 'open' : '';
        html += `<details class="thinking-details" ${openAttr}>
            <summary class="thinking-summary">
                <span class="material-symbols-outlined" style="font-size:16px">psychology</span> 
                Thinking Process
                <span class="material-symbols-outlined" style="font-size:16px; margin-left:auto;">expand_more</span>
            </summary>
            <div class="thinking-content">
                ${typeof marked !== 'undefined' ? marked.parse(thinkContent || "") : (thinkContent || "")}
            </div>
        </details>`;
    }
    html += typeof marked !== 'undefined' ? marked.parse(mainContent) : mainContent;
    return html;
}

function renderChatUI() {
    chatBox.innerHTML = '';
    const chat = allChats.find(c => c.id === currentChatId);

    if (!chat || chat.messages.length <= 1) {
        chatBox.appendChild(welcomeScreen);
        welcomeScreen.classList.remove('hidden');
        return;
    }

    if (welcomeScreen.parentNode === chatBox) {
        chatBox.removeChild(welcomeScreen); 
    }

    chat.messages.slice(1).forEach(msg => {
        const wrapper = document.createElement('div');
        wrapper.className = `message ${msg.role === 'user' ? 'user-message' : 'bot-message'}`;
        
        if (msg.role === 'user') {
            const bubble = document.createElement('div');
            bubble.className = 'user-message-content';
            bubble.innerHTML = msg.content.replace(/\n/g, '<br>');
            wrapper.appendChild(bubble);
        } else {
            const row = document.createElement('div');
            row.className = 'message-row';
            
            const avatar = document.createElement('div');
            avatar.className = 'ai-avatar';
            avatar.innerHTML = '<span class="material-symbols-outlined">smart_toy</span>';
            
            const textDiv = document.createElement('div');
            textDiv.className = 'message-text';
            textDiv.innerHTML = formatMessage(msg.content, false);

            textDiv.querySelectorAll('pre').forEach(pre => {
                const copyBtn = document.createElement('button');
                copyBtn.className = 'copy-code-btn';
                copyBtn.innerText = 'Copy';
                copyBtn.style.position = 'absolute';
                copyBtn.style.top = '10px';
                copyBtn.style.right = '10px';
                
                copyBtn.onclick = () => {
                    const code = pre.querySelector('code')?.innerText || pre.innerText;
                    navigator.clipboard.writeText(code).then(() => {
                        copyBtn.innerText = 'Copied!';
                        setTimeout(() => copyBtn.innerText = 'Copy', 2000);
                    });
                };
                pre.style.position = 'relative';
                pre.appendChild(copyBtn);
            });

            row.appendChild(avatar);
            row.appendChild(textDiv);
            wrapper.appendChild(row);

            const actions = document.createElement('div');
            actions.className = 'message-actions';
            
            const copyBtn = createActionBtn('content_copy', 'Copy Response');
            copyBtn.onclick = () => navigator.clipboard.writeText(msg.content);
            actions.appendChild(copyBtn);

            const isLast = chat.messages.indexOf(msg) === chat.messages.length - 1;
            if (isLast) {
                const redoBtn = createActionBtn('refresh', 'Regenerate');
                redoBtn.onclick = () => {
                    chat.messages.pop();
                    saveToStorage();
                    renderChatUI();
                    generateResponse(chat);
                };
                actions.appendChild(redoBtn);
            }

            const goodBtn = createActionBtn('thumb_up', 'Good Response');
            const badBtn = createActionBtn('thumb_down', 'Bad Response');
            
            if (msg.feedback === 'good') goodBtn.style.color = '#a8c7fa';
            if (msg.feedback === 'bad') badBtn.style.color = '#ffb4b4';
            
            goodBtn.onclick = () => { 
                if (msg.feedback === 'good') {
                    msg.feedback = null;
                    goodBtn.style.color = '';
                } else {
                    msg.feedback = 'good';
                    goodBtn.style.color = '#a8c7fa';
                    badBtn.style.color = '';
                }
                saveToStorage();
            };
            
            badBtn.onclick = () => { 
                if (msg.feedback === 'bad') {
                    msg.feedback = null;
                    badBtn.style.color = '';
                } else {
                    msg.feedback = 'bad';
                    badBtn.style.color = '#ffb4b4';
                    goodBtn.style.color = '';
                }
                saveToStorage();
            };
            
            actions.appendChild(goodBtn);
            actions.appendChild(badBtn);

            wrapper.appendChild(actions);
        }
        chatBox.appendChild(wrapper);
    });
    
    chatBox.scrollTop = chatBox.scrollHeight;
}

function renderHistory() {
    historyList.innerHTML = '';
    allChats.forEach(chat => {
        const container = document.createElement('div');
        container.className = `history-item ${chat.id === currentChatId ? 'active' : ''}`;

        const titleSpan = document.createElement('span');
        titleSpan.innerText = chat.title;
        titleSpan.style.flex = "1";
        titleSpan.style.overflow = "hidden";
        titleSpan.style.textOverflow = "ellipsis";

        const delBtn = document.createElement('button');
        delBtn.className = 'delete-chat-btn material-symbols-outlined';
        delBtn.innerHTML = "delete";
        delBtn.onclick = (e) => deleteChat(e, chat.id);

        container.appendChild(titleSpan);
        container.appendChild(delBtn);
        container.onclick = () => loadChat(chat.id);

        historyList.appendChild(container);
    });
}

function deleteChat(e, id) {
    e.stopPropagation();
    if (!confirm("Delete this chat?")) return;

    allChats = allChats.filter(c => c.id !== id);
    saveToStorage();

    if (currentChatId === id) {
        if (allChats.length > 0) {
            loadChat(allChats[0].id);
        } else {
            startNewChat();
        }
    } else {
        renderHistory();
    }
}

function appendLoader() {
    const div = document.createElement('div');
    div.id = 'temp-loader';
    div.className = 'message bot-message';
    div.innerHTML = `
        <div class="message-row">
            <div class="ai-avatar">
                <span class="material-symbols-outlined">smart_toy</span>
            </div>
            <div class="message-text">
                <span class="material-symbols-outlined" style="animation:spin 1s linear infinite; font-size:20px; vertical-align: middle;">sync</span>
                <span style="margin-left: 8px; vertical-align: middle;">Thinking...</span>
            </div>
        </div>`;
    
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    return 'temp-loader';
}

function removeLoader(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function appendTempError(msg) {
    const div = document.createElement('div');
    div.className = 'message bot-message';
    div.style.color = '#ffb4b4';
    div.innerText = msg;
    chatBox.appendChild(div);
}

function createActionBtn(icon, title) {
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.title = title;
    btn.innerHTML = `<span class="material-symbols-outlined">${icon}</span>`;
    return btn;
}

// --- STORAGE & UTILS ---

function loadChatsFromStorage() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        try {
            allChats = JSON.parse(raw);
        } catch (e) {
            console.error("Failed to parse history", e);
            allChats = [];
        }
    }
}

function saveToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allChats));
}

function setInputState(enabled) {
    userInput.disabled = !enabled;
    sendBtn.disabled = !enabled;
    chatForm.style.opacity = enabled ? "1" : "0.5";
}

// --- BUTTON EVENTS ---

if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
        sidebar.classList.add('show');
        if (window.innerWidth <= 768) {
            sidebar.classList.add('show');
        } else {
            sidebar.classList.remove('collapsed');
            localStorage.setItem(STORAGE_KEY_SIDEBAR, 'false');
        }
    });
}
if (mobileMenuCloseBtn) {
    mobileMenuCloseBtn.addEventListener('click', () => {
        sidebar.classList.remove('show');
        if (window.innerWidth <= 768) {
            sidebar.classList.remove('show');
        } else {
            sidebar.classList.add('collapsed');
            localStorage.setItem(STORAGE_KEY_SIDEBAR, 'true');
        }
    });
}

newChatBtn.addEventListener('click', () => {
    startNewChat();
});

settingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
    const size = (localStorage.getItem(STORAGE_KEY) || "").length;
    storageInfo.innerText = (size / 1024).toFixed(2) + " KB";
});

closeSettings.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
});

clearDataBtn.addEventListener('click', () => {
    if(confirm("Are you sure? This deletes all chat history.")) {
        localStorage.removeItem(STORAGE_KEY);
        allChats = [];
        startNewChat();
        settingsModal.classList.add('hidden');
    }
});

settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.add('hidden');
});