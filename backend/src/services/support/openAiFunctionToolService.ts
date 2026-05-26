import OpenAI from "openai";
import pool from "../../db";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_document_count",
      description: "Get the total number of uploaded documents.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_chunk_count",
      description: "Get the total number of document chunks stored.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_uploaded_documents",
      description: "List uploaded documents with IDs, names, and chunk counts.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_latest_document",
      description: "Get the most recently uploaded document.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
];

const executeTool = async (toolName: string) => {
  if (toolName === "get_document_count") {
    const result = await pool.query("SELECT COUNT(*) FROM documents");
    return {
      documentCount: Number(result.rows[0].count),
    };
  }

  if (toolName === "get_chunk_count") {
    const result = await pool.query("SELECT COUNT(*) FROM document_chunks");
    return {
      chunkCount: Number(result.rows[0].count),
    };
  }

  if (toolName === "list_uploaded_documents") {
    const result = await pool.query(`
      SELECT 
        d.id,
        d.name,
        d.created_at,
        COUNT(dc.id) AS chunk_count
      FROM documents d
      LEFT JOIN document_chunks dc
        ON d.id = dc.document_id
      GROUP BY d.id
      ORDER BY d.created_at DESC
    `);

    return {
      documents: result.rows,
    };
  }

  if (toolName === "get_latest_document") {
    const result = await pool.query(`
      SELECT id, name, created_at
      FROM documents
      ORDER BY created_at DESC
      LIMIT 1
    `);

    return {
      latestDocument: result.rows[0] || null,
    };
  }

  return {
    error: "Unknown tool",
  };
};

export const runOpenAIFunctionToolAgent = async (question: string) => {
  const firstResponse = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a tool-using database assistant. Use tools when the user asks about uploaded document counts, chunk counts, document lists, or latest uploaded documents.",
      },
      {
        role: "user",
        content: question,
      },
    ],
    tools,
    tool_choice: "auto",
  });

  const message = firstResponse.choices[0].message;
  const toolCalls = message.tool_calls || [];

  if (toolCalls.length === 0) {
    return {
      usedFunctionCalling: false,
      answer:
        "No database function was selected. This question should be handled by the RAG workflow.",
      toolCalls: [],
    };
  }

  const toolMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  for (const toolCall of toolCalls) {
    const toolName = toolCall.function.name;
    const toolResult = await executeTool(toolName);

    toolMessages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: JSON.stringify(toolResult),
    });
  }

  const finalResponse = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a helpful assistant. Convert tool results into a clear user-facing answer.",
      },
      {
        role: "user",
        content: question,
      },
      message,
      ...toolMessages,
    ],
  });

  return {
    usedFunctionCalling: true,
    selectedFunctions: toolCalls.map((call) => call.function.name),
    answer: finalResponse.choices[0].message.content || "",
    toolCalls: toolCalls.map((call) => ({
      id: call.id,
      name: call.function.name,
      arguments: call.function.arguments,
    })),
  };
};