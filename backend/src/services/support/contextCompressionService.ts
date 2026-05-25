import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const compressRetrievedContext = async (
  question: string,
  context: string
) => {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
You are a context compression agent for a RAG system.

Your job:
- Keep only information relevant to the user's question.
- Remove unrelated noise.
- Preserve important facts, definitions, formulas, constraints, and source-backed details.
- Do not answer the question.
- Do not add new facts.
- Return concise compressed context only.
        `,
      },
      {
        role: "user",
        content: `
Question:
${question}

Retrieved context:
${context}
        `,
      },
    ],
  });

  return response.choices[0].message.content || context;
};