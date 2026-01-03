// api/chat.js
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const fullConversation = req.body.messages;

  if (!Array.isArray(fullConversation)) {
    return res.status(400).json({ error: "Invalid message format." });
  }

  // --- NEW: LOAD CONTEXT FROM FILE ---
  let systemContext = "";
  try {
    // This looks for context.md inside the current "api" folder
    const contextPath = path.join(process.cwd(), 'api', 'context.md');
    systemContext = fs.readFileSync(contextPath, 'utf8');
  } catch (error) {
    console.error("Could not read context.md:", error);
    // Fallback if file is missing
    systemContext = "You are a helpful assistant for Xeno Helpers."; 
  }

  // Define the Role: Mentor for Xeno Helpers
  const masterPrompt = `
    ${systemContext}
    
    IMPORTANT INSTRUCTION:
    You are a support assistant strictly for Xeno Helpers (the support). 
    Your goal is to train them on how to fix issues. 
    Use the context above to answer their technical questions.
  `;

  // Insert our System Prompt at the very start of the conversation
  // We filter out any old system messages from the client to enforce ours
  const cleanMessages = fullConversation.filter(msg => msg.role !== 'system');
  
  const finalMessages = [
    { role: "system", content: masterPrompt },
    ...cleanMessages
  ];
  // -----------------------------------

  // 1. Create a list of keys to try in order
  const apiKeys = [
    process.env.API_KEY,   // Primary
    process.env.API_KEY_2, // Backup 1
    process.env.API_KEY_3  // Backup 2
  ].filter(Boolean);

  if (apiKeys.length === 0) {
    return res.status(500).json({
      error: "API keys missing.",
      details: "Add API_KEY in Vercel > Environment Variables."
    });
  }

  let lastError = null;
  let lastStatus = 500;

  // 2. Loop through the keys
  for (const currentKey of apiKeys) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${currentKey}`,
          "Content-Type": "application/json",
          "Referer": "https://xeno.onl",
          "X-Title": "Xeno Help RAG"
        },
        body: JSON.stringify({
          model: "tngtech/deepseek-r1t2-chimera:free",
          messages: finalMessages, // <--- We send the updated list here
          temperature: 0.7,
          max_tokens: 2000
        })
      });

      const data = await response.json();

      if (response.ok) {
        return res.status(200).json({
          choices: data.choices
        });
      }

      console.warn(`Key ending in ...${currentKey.slice(-4)} failed: ${response.status}`);
      lastStatus = response.status;
      lastError = data.error || "External API Error";

    } catch (err) {
      console.error("Network Error with key:", err);
      lastError = err.message;
    }
  }

  return res.status(lastStatus).json({
    error: "All API keys failed.",
    details: lastError
  });
}
