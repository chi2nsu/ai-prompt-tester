export const MOCK_MODELS = [
  { id: 'gpt-5.3-instant', name: 'GPT 5.3 instant', provider: 'OpenAI' },
  { id: 'gpt-5.4-mini', name: 'GPT 5.4 mini', provider: 'OpenAI' },
  { id: 'gemini-3-flash', name: 'Gemini 3 Flash', provider: 'Google' },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash-Lite', provider: 'Google' }
];

export const mockFetchCompletion = async (modelId, conversation, prompt) => {
  // Simulate network delay between 1s and 3s
  const delay = Math.floor(Math.random() * 2000) + 1000;
  
  return new Promise((resolve) => {
    setTimeout(() => {
      let responseText = '';
      
      if (modelId === 'gpt-5.3-instant') {
        responseText = `[GPT 5.3 instant response]\n\nI have reviewed the script and your system prompt.\n\nScript understood: "${conversation.substring(0, 30)}..."\n\nFollowing System Prompt: Based on your system instructions ("${prompt}"), here is my lightning-fast output. The structure is direct and to the point.`;
      } else if (modelId === 'gpt-5.4-mini') {
        responseText = `[GPT 5.4 mini response]\n\nHello! I am GPT 5.4 mini.\n\nScript Size: ${conversation.length > 0 ? "Provided" : "Empty"}\nSystem Prompt: ${prompt}\n\nHere is a concise and efficient response.`;
      } else if (modelId === 'gemini-3-flash') {
         responseText = `[Gemini 3 Flash response]\n\nHello! I've processed the conversational script and the system prompt you provided.\n\nScript Size: ${conversation.length > 0 ? "Provided" : "Empty"}\nSystem Prompt: ${prompt}\n\nHere is a detailed, structured, and helpful response referencing the rules correctly.`;
      } else if (modelId === 'gemini-3.1-flash-lite') {
         responseText = `[Gemini 3.1 Flash-Lite response]\n\nHello! This is Gemini 3.1 Flash-Lite response.\n\nScript Size: ${conversation.length > 0 ? "Provided" : "Empty"}\nSystem Prompt: ${prompt}\n\nOptimized response for speed and efficiency under prompt rules.`;
      } else {
         responseText = `Generic response from ${modelId} for prompt: ${prompt}`;
      }
      
      resolve({
        id: crypto.randomUUID(),
        modelId,
        text: responseText,
        timestamp: Date.now()
      });
    }, delay);
  });
};
