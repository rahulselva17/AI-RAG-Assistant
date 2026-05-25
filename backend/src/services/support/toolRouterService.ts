import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type ToolName =
  | "RAG_QA"
  | "SUMMARIZE_DOCUMENT"
  | "EXPLAIN_AGENT_TRACE"
  | "SQL_DATABASE"
  | "FALLBACK";

export const routeToTool = async (question: string): Promise<ToolName> => {
  const lower = question.toLowerCase();

  if (
    lower.includes("how many documents") ||
    lower.includes("number of documents") ||
    lower.includes("count documents") ||
    lower.includes("list documents") ||
    lower.includes("show documents") ||
    lower.includes("uploaded documents") ||
    lower.includes("how many chunks") ||
    lower.includes("number of chunks") ||
    lower.includes("count chunks") ||
    lower.includes("latest document") ||
    lower.includes("last uploaded")
  ) {
    return "SQL_DATABASE";
  }

  if (
    lower.includes("summarize") ||
    lower.includes("summary")
  ) {
    return "SUMMARIZE_DOCUMENT";
  }

  if (
    lower.includes("agent trace") ||
    lower.includes("workflow") ||
    lower.includes("agent steps")
  ) {
    return "EXPLAIN_AGENT_TRACE";
  }

  return "RAG_QA";
};