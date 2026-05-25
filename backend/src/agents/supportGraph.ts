import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { classifyTicket } from "../services/support/classifierService";
import { rewriteQueryForRetrieval } from "../services/support/queryRewriteService";
import { generateSupportAnswer } from "../services/support/supportAnswerService";
import { compressRetrievedContext } from "../services/support/contextCompressionService";
import { checkInputGuardrails } from "../services/guardrails/inputGuardrailService";
import { checkRetrievalGuardrails } from "../services/guardrails/retrievalGuardrailService";
import { checkOutputGuardrails } from "../services/guardrails/outputGuardrailService";
import pool from "../db";
import { getEmbedding } from "../services/embeddingService";
import { routeToTool, ToolName } from "../services/support/toolRouterService";
import { runSqlTool } from "../services/support/sqlToolService";

type Chunk = {
    id: number;
    content: string;
    document_name: string;
    distance: number;
};

const SupportGraphState = Annotation.Root({
    question: Annotation<string>,
    documentId: Annotation<number | undefined>,

    classification: Annotation<any>,

    chunks: Annotation<Chunk[]>({
        reducer: (_old, newValue) => newValue,
        default: () => [],
    }),

    healedQuery: Annotation<string | null>({
        reducer: (_old, newValue) => newValue,
        default: () => null,
    }),

    selfHealingUsed: Annotation<boolean>({
        reducer: (_old, newValue) => newValue,
        default: () => false,
    }),

    compressedContext: Annotation<string>({
        reducer: (_old, newValue) => newValue,
        default: () => "",
    }),

    answer: Annotation<string>({
        reducer: (_old, newValue) => newValue,
        default: () => "",
    }),

    blocked: Annotation<boolean>({
        reducer: (_old, newValue) => newValue,
        default: () => false,
    }),

    blockReason: Annotation<string | null>({
        reducer: (_old, newValue) => newValue,
        default: () => null,
    }),

    agentTrace: Annotation<string[]>({
        reducer: (oldValue, newValue) => [...oldValue, ...newValue],
        default: () => [],
    }),
    selectedTool: Annotation<ToolName>({
        reducer: (_old, newValue) => newValue,
        default: () => "RAG_QA",
    }),
});

const sqlToolNode = async (
    state: typeof SupportGraphState.State
): Promise<Partial<typeof SupportGraphState.State>> => {
    const answer = await runSqlTool(state.question);

    return {
        answer,
        agentTrace: ["sql_database_tool_completed"],
    };
};

const routeAfterSupervisor = (state: typeof SupportGraphState.State) => {
    if (state.selectedTool === "SQL_DATABASE") {
        return "sqlTool";
    }

    return "classify";
};

const retrieveChunks = async (
    question: string,
    documentId?: number,
    threshold = 1.5
  ): Promise<Chunk[]> => {
    const questionEmbedding = await getEmbedding(question);
  
    const vectorString = `[${questionEmbedding.join(",")}]`;
  
    let result;
  
    if (documentId) {
      result = await pool.query(
        `
        SELECT 
          dc.id,
          dc.content,
          d.name AS document_name,
  
          dc.embedding <-> $1::vector AS semantic_distance,
  
          CASE
            WHEN LOWER(dc.content) LIKE LOWER($3)
            THEN 0.05
            ELSE 0
          END AS keyword_boost,
  
          (
            (dc.embedding <-> $1::vector)
            -
            CASE
              WHEN LOWER(dc.content) LIKE LOWER($3)
              THEN 0.05
              ELSE 0
            END
          ) AS final_score
  
        FROM document_chunks dc
        JOIN documents d
          ON dc.document_id = d.id
  
        WHERE dc.document_id = $2
  
        ORDER BY final_score ASC
        LIMIT 5;
        `,
        [vectorString, documentId, `%${question}%`]
      );
    } else {
      result = await pool.query(
        `
        SELECT 
          dc.id,
          dc.content,
          d.name AS document_name,
  
          dc.embedding <-> $1::vector AS semantic_distance,
  
          CASE
            WHEN LOWER(dc.content) LIKE LOWER($2)
            THEN 0.05
            ELSE 0
          END AS keyword_boost,
  
          (
            (dc.embedding <-> $1::vector)
            -
            CASE
              WHEN LOWER(dc.content) LIKE LOWER($2)
              THEN 0.05
              ELSE 0
            END
          ) AS final_score
  
        FROM document_chunks dc
        JOIN documents d
          ON dc.document_id = d.id
  
        ORDER BY final_score ASC
        LIMIT 5;
        `,
        [vectorString, `%${question}%`]
      );
    }
  
    return result.rows
      .filter((chunk) => Number(chunk.final_score) < threshold)
      .map((chunk) => ({
        id: chunk.id,
        content: chunk.content,
        document_name: chunk.document_name,
        distance: chunk.final_score,
      }));
  };

const inputGuardrailNode = async (
    state: typeof SupportGraphState.State
): Promise<Partial<typeof SupportGraphState.State>> => {
    const inputGuardrail = checkInputGuardrails(state.question);

    if (!inputGuardrail.allowed) {
        return {
            blocked: true,
            blockReason: inputGuardrail.reason,
            answer: "This request was blocked by input guardrails.",
            agentTrace: ["input_guardrail_blocked"],
        };
    }

    return {
        blocked: false,
        agentTrace: ["input_guardrail_passed"],
    };
};

const supervisorNode = async (
    state: typeof SupportGraphState.State
): Promise<Partial<typeof SupportGraphState.State>> => {
    const selectedTool = await routeToTool(state.question);

    return {
        selectedTool,
        agentTrace: [`supervisor_selected_tool_${selectedTool}`],
    };
};

const classifyNode = async (
    state: typeof SupportGraphState.State
): Promise<Partial<typeof SupportGraphState.State>> => {
    return {
        classification: classifyTicket(state.question),
        agentTrace: ["classification_completed"],
    };
};

const retrievalNode = async (
    state: typeof SupportGraphState.State
): Promise<Partial<typeof SupportGraphState.State>> => {
    const chunks = await retrieveChunks(state.question, state.documentId);

    return {
        chunks,
        agentTrace: ["hybrid_retrieval_completed"],
    };
};

const selfHealNode = async (
    state: typeof SupportGraphState.State
): Promise<Partial<typeof SupportGraphState.State>> => {
    if (state.chunks.length > 0) {
        return {
            selfHealingUsed: false,
            agentTrace: ["self_healing_skipped"],
        };
    }

    const healedQuery = await rewriteQueryForRetrieval(state.question);
    const chunks = await retrieveChunks(healedQuery, state.documentId);

    return {
        healedQuery,
        selfHealingUsed: true,
        chunks,
        agentTrace: ["self_healing_used"],
    };
};

const retrievalGuardrailNode = async (
    state: typeof SupportGraphState.State
): Promise<Partial<typeof SupportGraphState.State>> => {
    const retrievalGuardrail = checkRetrievalGuardrails(state.chunks);

    if (!retrievalGuardrail.allowed) {
        return {
            blocked: true,
            blockReason: retrievalGuardrail.reason,
            answer:
                "I could not find reliable enough information in the uploaded knowledge base to answer this safely.",
            agentTrace: ["retrieval_guardrail_blocked"],
        };
    }

    return {
        blocked: false,
        agentTrace: ["retrieval_guardrail_passed"],
    };
};

const contextCompressionNode = async (
    state: typeof SupportGraphState.State
): Promise<Partial<typeof SupportGraphState.State>> => {
    const rawContext = state.chunks
        .map((chunk, index) => `Source ${index + 1}: ${chunk.content}`)
        .join("\n\n");

    const compressedContext = await compressRetrievedContext(
        state.question,
        rawContext
    );

    return {
        compressedContext,
        agentTrace: ["context_compressed"],
    };
};

const summarizeDocumentNode = async (
    state: typeof SupportGraphState.State
): Promise<Partial<typeof SupportGraphState.State>> => {
    const context =
        state.compressedContext ||
        state.chunks
            .map((chunk, index) => `Source ${index + 1}: ${chunk.content}`)
            .join("\n\n");

    const answer = await generateSupportAnswer(
        `Summarize the following retrieved document content for the user question: ${state.question}`,
        context,
        state.classification.category,
        state.classification.priority,
        state.classification.sentiment
    );

    return {
        answer: answer || "",
        agentTrace: ["summarization_tool_completed"],
    };
};

const generateAnswerNode = async (
    state: typeof SupportGraphState.State
): Promise<Partial<typeof SupportGraphState.State>> => {
    const context =
        state.compressedContext ||
        state.chunks
            .map((chunk, index) => `Source ${index + 1}: ${chunk.content}`)
            .join("\n\n");

    const answer = await generateSupportAnswer(
        state.question,
        context,
        state.classification.category,
        state.classification.priority,
        state.classification.sentiment
    );

    return {
        answer: answer || "",
        agentTrace: ["answer_generated"],
    };
};

const outputGuardrailNode = async (
    state: typeof SupportGraphState.State
): Promise<Partial<typeof SupportGraphState.State>> => {
    const outputGuardrail = checkOutputGuardrails(state.answer);

    if (!outputGuardrail.allowed) {
        return {
            blocked: true,
            blockReason: outputGuardrail.reason,
            answer:
                "I generated an answer that did not meet safety requirements, so I blocked it.",
            agentTrace: ["output_guardrail_blocked"],
        };
    }

    return {
        blocked: false,
        agentTrace: ["output_guardrail_passed"],
    };
};

const shouldContinueAfterInput = (state: typeof SupportGraphState.State) => {
    return state.blocked ? END : "supervisor";
};

const shouldContinueAfterRetrievalGuardrail = (
    state: typeof SupportGraphState.State
) => {
    return state.blocked ? END : "compressContext";
};

const explainAgentTraceNode = async (
    state: typeof SupportGraphState.State
): Promise<Partial<typeof SupportGraphState.State>> => {
    return {
        answer:
            "The agent workflow includes input guardrails, tool routing, classification, retrieval, self-healing query rewriting, retrieval validation, context compression, answer generation, and output guardrails. The agent trace shows each step that was executed.",
        agentTrace: ["agent_trace_explanation_tool_completed"],
    };
};

const routeAfterCompression = (state: typeof SupportGraphState.State) => {
    if (state.selectedTool === "SUMMARIZE_DOCUMENT") {
        return "summarizeDocument";
    }

    if (state.selectedTool === "EXPLAIN_AGENT_TRACE") {
        return "explainAgentTrace";
    }

    return "generateAnswer";
};

const graph = new StateGraph(SupportGraphState)
    .addNode("inputGuardrail", inputGuardrailNode)
    .addNode("classify", classifyNode)
    .addNode("retrieve", retrievalNode)
    .addNode("selfHeal", selfHealNode)
    .addNode("retrievalGuardrail", retrievalGuardrailNode)
    .addNode("compressContext", contextCompressionNode)
    .addNode("generateAnswer", generateAnswerNode)
    .addNode("outputGuardrail", outputGuardrailNode)
    .addNode("supervisor", supervisorNode)
    .addNode("summarizeDocument", summarizeDocumentNode)
    .addNode("explainAgentTrace", explainAgentTraceNode)
    .addNode("sqlTool", sqlToolNode)
    .addEdge(START, "inputGuardrail")
    .addConditionalEdges("inputGuardrail", shouldContinueAfterInput)
    .addEdge("classify", "retrieve")
    .addEdge("retrieve", "selfHeal")
    .addEdge("selfHeal", "retrievalGuardrail")
    .addConditionalEdges(
        "retrievalGuardrail",
        shouldContinueAfterRetrievalGuardrail
    )
    .addConditionalEdges("compressContext", routeAfterCompression)
    .addEdge("summarizeDocument", "outputGuardrail")
    .addEdge("explainAgentTrace", "outputGuardrail")
    .addEdge("generateAnswer", "outputGuardrail")
    .addConditionalEdges("supervisor", routeAfterSupervisor)
    .addEdge("sqlTool", "outputGuardrail")
    .addEdge("outputGuardrail", END)
    .compile();

export const runSupportGraph = async (question: string, documentId?: number) => {
    const result = await graph.invoke({
        question,
        documentId,
    });

    return {
        success: true,
        blocked: result.blocked,
        blockReason: result.blockReason,
        classification: result.classification,
        answer: result.answer,
        healedQuery: result.healedQuery,
        selfHealingUsed: result.selfHealingUsed,
        compressedContext: result.compressedContext,
        selectedTool: result.selectedTool,
        agentTrace: result.agentTrace,
        sources: result.chunks.map((chunk) => ({
            document: chunk.document_name,
            content: chunk.content,
            distance: chunk.distance,
        })),
    };
};