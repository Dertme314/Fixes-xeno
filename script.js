// DOM Elements
const chatBox = document.getElementById('chat-box');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const historyList = document.getElementById('history-list');
const newChatBtn = document.getElementById('new-chat-btn');
const welcomeScreen = document.getElementById('welcome-screen');

// Settings Elements
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettings = document.getElementById('close-settings');
const clearDataBtn = document.getElementById('clear-data-btn');
const storageInfo = document.getElementById('storage-info');

// Mobile Menu
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const sidebar = document.querySelector('.sidebar');
let sidebarOverlay;

// --- CONSTANTS & PROMPTS ---
const STORAGE_KEY = 'xeno_chats_v1';

// 1. Base Context (The knowledge base)
const systemContext = `You are Xeno Helper. You help users with the Xeno executor. Do not mention you are an AI. Be concise.`;

// 2. Master Prompt (The actual instruction sent to the AI)
const masterPrompt = `
${systemContext}

IMPORTANT INSTRUCTION:
You are a support assistant strictly for Xeno Helpers (the support team). 
Your goal is to train them on how to fix issues. 
Use the context above to answer their technical questions.
`;

// State
let allChats = [];
let currentChatId = null;

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
    loadChatsFromStorage();
    if (allChats.length > 0) {
        // Load the most recent chat
        loadChat(allChats[0].id);
    } else {
        startNewChat();
    }

    // Create overlay for mobile
    sidebarOverlay = document.createElement('div');
    sidebarOverlay.className = 'sidebar-overlay';
    document.body.appendChild(sidebarOverlay);

    sidebarOverlay.addEventListener('click', closeSidebar);
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
        // UPDATED: Uses masterPrompt instead of SYSTEM_PROMPT
        messages: [{ role: "system", content: masterPrompt }],
        timestamp: Date.now()
    };
    allChats.unshift(newChat); // Add to top
    saveToStorage();
    renderHistory();
    renderChatUI();
}

function loadChat(id) {
    currentChatId = id;
    renderHistory();
    renderChatUI();
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
        chat.title = message.substring(0, 20) + (message.length > 20 ? "..." : "");
        renderHistory(); // Refresh sidebar title
    }

    // 4. Add User Message
    chat.messages.push({ role: "user", content: message });
    saveToStorage();
    renderChatUI(); // Update UI immediately

    // 5. API Call
    const loadingId = appendLoader();

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: chat.messages })
        });

        const data = await response.json();
        removeLoader(loadingId);

        if (response.ok && data.choices?.length > 0) {
            const aiMsg = data.choices[0].message.content;
            chat.messages.push({ role: "assistant", content: aiMsg });
            saveToStorage();
            renderChatUI();
        } else {
            appendTempError("Server Error: " + (data.error || "Unknown"));
        }
    } catch (err) {
        removeLoader(loadingId);
        appendTempError("Network Error");
        console.error(err);
    } finally {
        setInputState(true);
        userInput.focus();
        userInput.value = ''; // Ensure clear
        userInput.style.height = 'auto'; // Reset height
    }
});

// Auto-resize textarea
userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = userInput.scrollHeight + 'px';
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

function renderChatUI() {
    chatBox.innerHTML = '';
    const chat = allChats.find(c => c.id === currentChatId);

    if (!chat || chat.messages.length <= 1) {
        // Show Welcome Screen if only system prompt exists
        chatBox.appendChild(welcomeScreen);
        welcomeScreen.style.display = 'flex';
        return;
    }

    // Hide welcome screen if we have messages
    if (welcomeScreen.parentNode === chatBox) {
        chatBox.removeChild(welcomeScreen); 
    }

    // Render messages (skip index 0 which is system prompt)
    chat.messages.slice(1).forEach(msg => {
        const div = document.createElement('div');
        div.classList.add('message', msg.role === 'user' ? 'user-message' : 'bot-message');
        if (msg.role === 'user') {
            div.innerHTML = msg.content.replace(/\n/g, '<br>');
        } else {
            // Check if marked is available, fallback to text if not
            div.innerHTML = (typeof marked !== 'undefined') ? marked.parse(msg.content) : msg.content;

            // Add copy buttons to code blocks
            div.querySelectorAll('pre').forEach(pre => {
                const copyBtn = document.createElement('button');
                copyBtn.classList.add('copy-code-btn');
                copyBtn.innerText = 'Copy';
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
        }
        chatBox.appendChild(div);
    });
    
    chatBox.scrollTop = chatBox.scrollHeight;
}

function renderHistory() {
    historyList.innerHTML = '';
    allChats.forEach(chat => {
        const container = document.createElement('div');
        container.classList.add('history-item');
        if (chat.id === currentChatId) container.classList.add('active');

        // Title
        const titleSpan = document.createElement('span');
        titleSpan.innerText = chat.title;
        titleSpan.style.flex = "1";
        titleSpan.style.overflow = "hidden";
        titleSpan.style.textOverflow = "ellipsis";

        // Delete Button
        const delBtn = document.createElement('button');
        delBtn.innerHTML = "&times;";
        delBtn.classList.add('delete-chat-btn');
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
    div.classList.add('message', 'bot-message', 'typing-indicator');
    div.innerText = "Xeno is thinking...";
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
    div.classList.add('message', 'bot-message');
    div.style.color = '#ff6b6b';
    div.innerText = msg;
    chatBox.appendChild(div);
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

// Mobile Menu
if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
        sidebar.classList.add('show');
        sidebarOverlay.classList.add('show');
    });
}

function closeSidebar() {
    sidebar.classList.remove('show');
    sidebarOverlay.classList.remove('show');
}

newChatBtn.addEventListener('click', () => {
    startNewChat();
    closeSidebar();
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
