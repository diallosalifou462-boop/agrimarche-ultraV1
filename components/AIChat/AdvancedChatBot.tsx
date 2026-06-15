'use client';

import { useState } from 'react';

export default function AdvancedChatBot() {
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState('');

  async function sendMessage() {
    if (!input) return;

    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: input,
      }),
    });

    const data = await res.json();

    setMessages((prev) => [...prev, `User: ${input}`, `AI: ${data.response}`]);
    setInput('');
  }

  return (
    <div className="fixed bottom-4 right-4 bg-white shadow-lg rounded-xl p-4 w-80 z-50">
      <h2 className="font-bold mb-2">AgriBot IA</h2>

      <div className="h-48 overflow-auto border rounded p-2 mb-2 text-sm">
        {messages.map((m, i) => (
          <div key={i}>{m}</div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="border rounded px-2 py-1 flex-1"
          placeholder="Posez une question..."
        />

        <button
          onClick={sendMessage}
          className="bg-green-600 text-white px-3 py-1 rounded"
        >
          Envoyer
        </button>
      </div>
    </div>
  );
}