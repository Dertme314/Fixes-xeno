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

// Mobile Menu (Updated ID to match new HTML)
const mobileMenuBtn = document.getElementById('mobile-menu-open'); 
const mobileMenuCloseBtn = document.getElementById('mobile-menu-close'); // Added close btn
const sidebar = document.getElementById('sidebar'); // Changed to ID to match new HTML

// Model Selector Elements
const modelSelector = document.getElementById('model-selector');
const modelDropdown = document.getElementById('model-dropdown');
const currentModelSpan = document.getElementById('current-model');
const modelOptions = document.querySelectorAll('.model-option');

// --- CONSTANTS & PROMPTS ---
const STORAGE_KEY = 'xeno_chats_v1';

// 1. Base Context (The knowledge base)
const systemContext = `You are Xeno Helper. You help users with the Xeno executor. Do not mention you are an AI. Be concise. formatting: Use Markdown.`;

// 2. Master Prompt (The actual instruction sent to the AI)
const basePrompt = `
${systemContext}

IMPORTANT INSTRUCTION:
You are a support assistant strictly for Xeno Helpers (the support team). 
Your goal is to train them on how to fix issues. 
Use the context above to answer their technical questions.
`;

const PROMPTS = {
    fast: "Answer quickly and concisely.",
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
        // Load the most recent chat
        loadChat(allChats[0].id);
    } else {
        startNewChat();
    }

    // Model Selector Logic
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
                
                // Update current chat system prompt if it exists
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
});

// --- CORE CHAT LOGIC ---

// Helper to start chat from Suggestion Chips
window.fillInput = (text) => {
    userInput.value = text;
    userInput.focus();
}

function startNewChat() {
    currentChatId = Date.now().toString();
    // Create new entry
    const newChat = {
        id: currentChatId,
        title: "New Chat",
        messages: [{ role: "system", content: getMasterPrompt() }],
        timestamp: Date.now()
    };
    allChats.unshift(newChat); // Add to top
    saveToStorage();
    renderHistory();
    renderChatUI();
    
    // Close sidebar on mobile when starting new chat
    if (window.innerWidth <= 768) {
        sidebar.classList.remove('show');
    }
}

function loadChat(id) {
    currentChatId = id;
    renderHistory();
    renderChatUI();
    
    // Close sidebar on mobile when selecting chat
    if (window.innerWidth <= 768) {
        sidebar.classList.remove('show');
    }
}

chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = userInput.value.trim();
    if (!message) return;

    // 1. Get current chat object
    let chat = allChats.find(c => c.id === currentChatId);
    if (!chat) {
        // Should not happen, but safe fallback
        startNewChat();
        chat = allChats.find(c => c.id === currentChatId);
    }

    // 2. Lock Input (Anti-Spam)
    setInputState(false);

    // 3. Update Title if it's the first user message
    if (chat.messages.length === 1) {
        chat.title = message.substring(0, 30);
        renderHistory(); // Refresh sidebar title
    }

    // 4. Add User Message
    chat.messages.push({ role: "user", content: message });
    saveToStorage();
    renderChatUI(); // Update UI immediately
    
    // Reset Textarea Height
    userInput.value = '';
    userInput.style.height = 'auto';

    // 5. Trigger Generation
    await generateResponse(chat);
});

async function generateResponse(chat) {
    const loadingId = appendLoader();
    
    // Setup Abort Controller
    if (currentController) currentController.abort(); // Safety check
    currentController = new AbortController();
    isUserStop = false;
    if (stopBtn) stopBtn.classList.remove('hidden');

    const timeoutId = setTimeout(() => {
        if (currentController) currentController.abort();
    }, 120000); // 120s timeout

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

        // --- STREAMING LOGIC ---
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        let buffer = "";

        // Create a placeholder message for the AI
        const aiMsgObj = { role: "assistant", content: "" };
        chat.messages.push(aiMsgObj);
        saveToStorage();
        renderChatUI(); // Renders the empty bubble

        // Helper to update the specific message bubble in the DOM
        const updateLastBubble = (text) => {
            const bubbles = chatBox.querySelectorAll('.bot-message');
            const lastBubble = bubbles[bubbles.length - 1];
            if (!lastBubble) return;

            // Target the text container inside the new structure
            const contentDiv = lastBubble.querySelector('.message-text');
            if (!contentDiv) return;

            // Check if user has toggled the details element
            const existingDetails = contentDiv.querySelector('.thinking-details');
            const wasOpen = existingDetails ? existingDetails.hasAttribute('open') : true; // Default to open during stream

            // Use helper to format
            contentDiv.innerHTML = formatMessage(text, wasOpen);

            // Re-attach copy buttons dynamically during stream
            contentDiv.querySelectorAll('pre').forEach(pre => {
                if (pre.querySelector('.copy-code-btn')) return; // Skip if already exists
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
            
            // Auto-scroll
            chatBox.scrollTop = chatBox.scrollHeight;
        };

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete line in buffer

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
                aiMsgObj.content = fullText; // Update state
                updateLastBubble(fullText);  // Update UI
            }
        }
        
        // Final save
        saveToStorage();
        // Re-render to ensure code copy buttons etc are attached properly
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

// Stop Button Listener
if (stopBtn) {
    stopBtn.addEventListener('click', () => {
        if (currentController) {
            isUserStop = true;
            currentController.abort();
        }
    });
}

// Auto-resize textarea
userInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

// Handle Enter key (submit if no shift)
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        // Trigger submit
        chatForm.dispatchEvent(new Event('submit'));
    }
});

// --- RENDER FUNCTIONS ---

function formatMessage(text, isOpen = false) {
    // Parse <think> tags
    const thinkMatch = text.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
    const thinkContent = thinkMatch ? thinkMatch[1] : null;
    // Remove the think block to get the main answer
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

    // Logic for showing Welcome Screen
    if (!chat || chat.messages.length <= 1) {
        chatBox.appendChild(welcomeScreen);
        welcomeScreen.classList.remove('hidden'); // Ensure it's visible via class
        return;
    }

    // Hide welcome screen if we have messages
    if (welcomeScreen.parentNode === chatBox) {
        chatBox.removeChild(welcomeScreen); 
    }

    // Render messages (skip index 0 which is system prompt)
    chat.messages.slice(1).forEach(msg => {
        const wrapper = document.createElement('div');
        // Add specific classes for the new CSS
        wrapper.className = `message ${msg.role === 'user' ? 'user-message' : 'bot-message'}`;
        
        if (msg.role === 'user') {
            // UI CHANGE: Wrap user text in the bubble div
            const bubble = document.createElement('div');
            bubble.className = 'user-message-content';
            bubble.innerHTML = msg.content.replace(/\n/g, '<br>');
            wrapper.appendChild(bubble);
        } else {
            // --- BOT MESSAGE STRUCTURE ---
            const row = document.createElement('div');
            row.className = 'message-row';
            
            // 1. Avatar
            const avatar = document.createElement('div');
            avatar.className = 'ai-avatar';
            avatar.innerHTML = '<span class="material-symbols-outlined">smart_toy</span>';
            
            // 2. Text Content
            const textDiv = document.createElement('div');
            textDiv.className = 'message-text';
            textDiv.innerHTML = formatMessage(msg.content, false);

            // Add copy buttons to code blocks
            textDiv.querySelectorAll('pre').forEach(pre => {
                const copyBtn = document.createElement('button');
                copyBtn.className = 'copy-code-btn'; // Updated class in CSS?
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

            // 3. Action Toolbar
            const actions = document.createElement('div');
            actions.className = 'message-actions';
            
            // Copy Response
            const copyBtn = createActionBtn('content_copy', 'Copy Response');
            copyBtn.onclick = () => navigator.clipboard.writeText(msg.content);
            actions.appendChild(copyBtn);

            // Regenerate (Only for the last message)
            const isLast = chat.messages.indexOf(msg) === chat.messages.length - 1;
            if (isLast) {
                const redoBtn = createActionBtn('refresh', 'Regenerate');
                redoBtn.onclick = () => {
                    chat.messages.pop(); // Remove current AI message
                    saveToStorage();
                    renderChatUI();
                    generateResponse(chat); // Re-run generation
                };
                actions.appendChild(redoBtn);
            }

            // Good/Bad Feedback (Visual only)
            const goodBtn = createActionBtn('thumb_up', 'Good Response');
            const badBtn = createActionBtn('thumb_down', 'Bad Response');
            
            goodBtn.onclick = () => { goodBtn.style.color = '#a8c7fa'; badBtn.style.color = ''; };
            badBtn.onclick = () => { badBtn.style.color = '#ffb4b4'; goodBtn.style.color = ''; };
            
            actions.appendChild(goodBtn);
            actions.appendChild(badBtn);

            wrapper.appendChild(actions);
        }
        chatBox.appendChild(wrapper);
    });
    
    // Scroll to bottom
    chatBox.scrollTop = chatBox.scrollHeight;
}

function renderHistory() {
    historyList.innerHTML = '';
    allChats.forEach(chat => {
        const container = document.createElement('div');
        container.className = `history-item ${chat.id === currentChatId ? 'active' : ''}`;

        // Title
        const titleSpan = document.createElement('span');
        titleSpan.innerText = chat.title;
        titleSpan.style.flex = "1";
        titleSpan.style.overflow = "hidden";
        titleSpan.style.textOverflow = "ellipsis";

        // Delete Button (UI CHANGE: Using Material Symbols)
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-chat-btn material-symbols-outlined';
        delBtn.innerHTML = "delete"; // Material Icon name
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

    // If we deleted the current chat, switch to another or new one
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
    // UI CHANGE: Spinning icon instead of text
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
    div.style.color = '#ffb4b4'; // Lighter red for dark mode
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

// Mobile Menu Handlers
if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
        sidebar.classList.add('show');
    });
}
if (mobileMenuCloseBtn) {
    mobileMenuCloseBtn.addEventListener('click', () => {
        sidebar.classList.remove('show');
    });
}

newChatBtn.addEventListener('click', () => {
    startNewChat();
});

// Settings Logic
settingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
    // Calculate rough storage size
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

// Close modal if clicking outside
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.add('hidden');
});