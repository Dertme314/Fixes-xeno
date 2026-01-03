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

// Constants
const STORAGE_KEY = 'xeno_chats_v1';
const SYSTEM_PROMPT = `You are Xeno Helper. You help users with the Xeno executor. Do not mention you are an AI. Be concise.`;

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
        messages: [{ role: "system", content: SYSTEM_PROMPT }],
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
    div.innerHTML = marked.parse(msg.content);
}
        chatBox.appendChild(div);
    });
    
    chatBox.scrollTop = chatBox.scrollHeight;
}

function renderHistory() {
    historyList.innerHTML = '';
    allChats.forEach(chat => {
        const btn = document.createElement('div');
        btn.classList.add('history-item');
        if (chat.id === currentChatId) btn.classList.add('active');
        btn.innerText = chat.title;
        btn.onclick = () => loadChat(chat.id);
        historyList.appendChild(btn);
    });
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

newChatBtn.addEventListener('click', startNewChat);

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
