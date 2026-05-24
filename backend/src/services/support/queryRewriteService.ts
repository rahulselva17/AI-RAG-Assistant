import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const rewriteQueryForRetrieval = async (question: string) => {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Rewrite the user question into a better search query for retrieving relevant support document chunks. Return only the rewritten query.",
      },
      {
        role: "user",
        content: question,
      },
    ],
  });

  return response.choices[0].message.content || question;
};