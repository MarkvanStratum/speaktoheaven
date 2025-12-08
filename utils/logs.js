// utils/logs.js

// Returns a copy of chat history with the AI message appended
export function appendAiOutput(history, aiText) {
  return [...history, { role: "assistant", content: aiText }];
}

// Returns basic internal logs shown to the client for debugging
export function buildLogs(messages, aiText) {
  return {
    totalMessages: messages.length,
    aiPreview: aiText.slice(0, 120),
    time: new Date().toISOString()
  };
}
