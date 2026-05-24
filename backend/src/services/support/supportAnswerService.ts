import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const streamSupportAnswer = async (
    question: string,
    context: string,
    category: string,
    priority: string,
    sentiment: string
  ) => {
    return client.chat.completions.create({
      model: "gpt-4o-mini",
      stream: true,
  
      messages: [
        {
          role: "system",
          content: `
  You are an AI customer support assistant.
  
  Rules:
  - Answer only using the provided context.
  - Be clear, polite, and helpful.
  - If context is insufficient, say that more information is needed.
  - Include a short suggested next action.
  - Match tone based on customer sentiment.
          `,
        },
        {
          role: "user",
          content: `
  Customer question:
  ${question}
  
  Detected category: ${category}
  Priority: ${priority}
  Sentiment: ${sentiment}
  
  Knowledge base context:
  ${context}
  
  Return:
  1. Customer-facing answer
  2. Suggested next action
          `,
        },
      ],
    });
  };
  
export const generateSupportAnswer = async (
  question: string,
  context: string,
  category: string,
  priority: string,
  sentiment: string
) => {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
You are an AI customer support assistant.

Rules:
- Answer only using the provided context.
- Be clear, polite, and helpful.
- If context is insufficient, say that more information is needed.
- Include a short suggested next action.
- Match tone based on customer sentiment.
        `,
      },
      {
        role: "user",
        content: `
Customer question:
${question}

Detected category: ${category}
Priority: ${priority}
Sentiment: ${sentiment}

Knowledge base context:
${context}

Return:
1. Customer-facing answer
2. Suggested next action
        `,
      },
    ],
  });

  return response.choices[0].message.content;
};