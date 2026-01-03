const chatBox = document.getElementById('chat-box');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');

// 1. HIDDEN CONTEXT: This is sent to AI but never shown in the UI
// Ideally, fetch this from a file, but here is the logic:
const SYSTEM_PROMPT = `You are Xeno Helper. You help users with the Xeno executor.
Do not mention you are an AI. Be concise and helpful.`; 

// Store conversation history
let conversationHistory = [
    { role: "system", content: SYSTEM_PROMPT }
];

chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = userInput.value.trim();
    if (!message) return;

    // --- ANTI-SPAM LOCK ---
    // Disable inputs immediately so user cannot send again
    setInputState(false);

    // 1. Add User Message to UI
    appendMessage(message, 'user-message');
    userInput.value = '';

    // 2. Add to History
    conversationHistory.push({ role: "user", content: message });

    // 3. Show Loading Indicator
    const loadingId = appendLoader();

    try {
        // 4. Send to your Vercel API
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: conversationHistory })
        });

        const data = await response.json();

        // Remove Loader
        removeLoader(loadingId);

        if (response.ok && data.choices && data.choices.length > 0) {
            const aiResponse = data.choices[0].message.content;
            
            // Add AI Message to UI
            appendMessage(aiResponse, 'bot-message');
            
            // Add to History
            conversationHistory.push({ role: "assistant", content: aiResponse });
        } else {
            appendMessage("Error: Could not reach Xeno servers.", 'bot-message');
        }

    } catch (error) {
        removeLoader(loadingId);
        appendMessage("Network error. Please try again.", 'bot-message');
        console.error(error);
    } finally {
        // --- RELEASE ANTI-SPAM LOCK ---
        // Re-enable inputs only after everything is done
        setInputState(true);
        userInput.focus();
    }
});

function appendMessage(text, className) {
    const div = document.createElement('div');
    div.classList.add('message', className);
    // Convert newlines to <br> for formatting
    div.innerHTML = text.replace(/\n/g, '<br>'); 
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function appendLoader() {
    const id = 'loader-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.classList.add('message', 'bot-message', 'typing-indicator');
    div.innerText = "Xeno is thinking...";
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    return id;
}

function removeLoader(id) {
    const loader = document.getElementById(id);
    if (loader) loader.remove();
}

// Helper to toggle spam protection
function setInputState(isEnabled) {
    userInput.disabled = !isEnabled;
    sendBtn.disabled = !isEnabled;
    if (isEnabled) {
        chatForm.style.opacity = "1";
    } else {
        chatForm.style.opacity = "0.5";
    }
}