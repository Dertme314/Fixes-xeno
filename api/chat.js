// api/chat.js
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const fullConversation = req.body.messages;
  const mode = req.body.mode;

  if (!Array.isArray(fullConversation)) {
    return res.status(400).json({ error: "Invalid message format." });
  }

  // --- MODE DEFINITIONS ---
  const MODES = {
    fast: {
      model: "xiaomi/mimo-v2-flash:free",
      prompt: "Answer very quickly and concisely."
    },
    pro: {
      model: "tngtech/deepseek-r1t2-chimera:free",
      prompt: "Think step-by-step. Enclose your thought process in <think> tags, then provide the final answer."
    },
    thinking: {
      model: "xiaomi/mimo-v2-flash:free",
      prompt: "You are a sophisticated problem solver. Solve complex problems by thinking deeply.",
      enableReasoning: true
    },
    simple: {
      model: "xiaomi/mimo-v2-flash:free",
      prompt: "Explain everything very simply, as if to a beginner. Avoid technical jargon. Keep explanations concise and easy to digest."
    }
  };

  // --- NEW: LOAD CONTEXT FROM FILE ---
  let systemContext = "";
  try {
    // This looks for context.md inside the current "api" folder
    const contextPath = path.join(process.cwd(), 'api', 'context.md');
    systemContext = fs.readFileSync(contextPath, 'utf8');
  } catch (error) {
    console.error("Could not read context.md:", error);
    // Fallback if file is missing
    systemContext = "You are a helpful assistant training Xeno Helpers."; 
  }

  // Define the Role: Mentor for Xeno Helpers
  const masterPrompt = `
    ${systemContext}
    
    IMPORTANT INSTRUCTION:
    You are a support assistant strictly for Xeno Helpers (the support). 
    Your goal is to train them on how to fix issues. 
    Use the context above to answer their technical questions.
  `;

  // --- FIX: REBUILD SYSTEM PROMPT SERVER-SIDE ---
  // Filter out the client's system message to avoid duplication/conflicts
  const cleanMessages = fullConversation.filter(msg => msg.role !== 'system');
  
  // Construct Final System Content: Context + Role + Mode Instruction
  const selectedMode = MODES[mode] || MODES['fast'];
  const finalSystemContent = `${masterPrompt}\n\nMODE INSTRUCTION:\n${selectedMode.prompt}`;

  const finalMessages = [
    { role: "system", content: finalSystemContent },
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
      const requestBody = {
        model: selectedMode.model,
        messages: finalMessages, // <--- We send the updated list here
        temperature: 0.8,
        max_tokens: 8000,
        stream: true // <--- ENABLE STREAMING
      };
      if (selectedMode.enableReasoning) {
        requestBody.reasoning = { enabled: true };
      }

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${currentKey}`,
          "Content-Type": "application/json",
          "Referer": "https://xeno.onl",
          "X-Title": "Xeno Help RAG"
        },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        // Set headers for Server-Sent Events (SSE)
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Content-Encoding': 'none'
        });

        // Send initial comment to force flush headers and prevent buffering
        res.write(': stream-start\n\n');

        // Pipe the stream from OpenRouter directly to the client
        for await (const chunk of response.body) {
          res.write(chunk);
        }
        res.end();
        return; // Exit successfully
      }

      // If not OK, try to read error body
      const errorText = await response.text();
      console.warn(`Key ending in ...${currentKey.slice(-4)} failed: ${response.status}`);
      lastStatus = response.status;
      lastError = errorText || "External API Error";

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
