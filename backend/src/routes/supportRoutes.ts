import express from "express";
import pool from "../db";
import { getEmbedding } from "../services/embeddingService";
import { classifyTicket } from "../services/support/classifierService";
import {
    generateSupportAnswer,
    streamSupportAnswer,
} from "../services/support/supportAnswerService";
import { rewriteQueryForRetrieval } from "../services/support/queryRewriteService";
import { checkInputGuardrails } from "../services/guardrails/inputGuardrailService";
import { checkRetrievalGuardrails } from "../services/guardrails/retrievalGuardrailService";
import { checkOutputGuardrails } from "../services/guardrails/outputGuardrailService";
import { runSupportGraph } from "../agents/supportGraph";

const router = express.Router();

const retrieveChunks = async (
    question: string,
    documentId?: number,
    threshold = 1.5
) => {
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
        dc.embedding <-> $1::vector AS distance
      FROM document_chunks dc
      JOIN documents d ON dc.document_id = d.id
      WHERE dc.document_id = $2
      ORDER BY dc.embedding <-> $1::vector
      LIMIT 5;
      `,
            [vectorString, documentId]
        );
    } else {
        result = await pool.query(
            `
      SELECT 
        dc.id,
        dc.content,
        d.name AS document_name,
        dc.embedding <-> $1::vector AS distance
      FROM document_chunks dc
      JOIN documents d ON dc.document_id = d.id
      ORDER BY dc.embedding <-> $1::vector
      LIMIT 5;
      `,
            [vectorString]
        );
    }

    return result.rows.filter((chunk) => Number(chunk.distance) < threshold);
};

const selfHealingRetrieve = async (
    question: string,
    documentId?: number
) => {
    let chunks = await retrieveChunks(question, documentId);
    let healedQuery: string | null = null;

    if (chunks.length === 0) {
        healedQuery = await rewriteQueryForRetrieval(question);
        chunks = await retrieveChunks(healedQuery, documentId);
    }

    return {
        chunks,
        healedQuery,
        selfHealingUsed: Boolean(healedQuery),
    };
};

router.post("/ask", async (req, res) => {
    try {
        const { question, sessionId, documentId } = req.body;

        if (!question) {
            return res.status(400).json({
                success: false,
                error: "Question is required",
            });
        }

        const inputGuardrail = checkInputGuardrails(question);

        if (!inputGuardrail.allowed) {
            return res.status(400).json({
                success: false,
                blocked: true,
                reason: inputGuardrail.reason,
            });
        }

        if (sessionId) {
            await pool.query(
                "INSERT INTO chat_messages (session_id, role, content) VALUES ($1, $2, $3)",
                [sessionId, "user", question]
            );
        }

        const classification = classifyTicket(question);

        const { chunks, healedQuery, selfHealingUsed } =
            await selfHealingRetrieve(question, documentId);

        const retrievalGuardrail = checkRetrievalGuardrails(chunks);

        if (!retrievalGuardrail.allowed) {
            const fallbackAnswer =
                "I could not find reliable enough information in the uploaded knowledge base to answer this safely.";

            return res.json({
                success: true,
                blocked: true,
                guardrail: "retrieval",
                reason: retrievalGuardrail.reason,
                classification,
                answer: fallbackAnswer,
                healedQuery,
                selfHealingUsed,
                sources: [],
            });
        }

        if (chunks.length === 0) {
            const fallbackAnswer =
                "I could not find relevant information in the uploaded knowledge base, even after improving the search query. Please upload a more relevant document or ask a more specific question.";

            if (sessionId) {
                await pool.query(
                    "INSERT INTO chat_messages (session_id, role, content) VALUES ($1, $2, $3)",
                    [sessionId, "assistant", fallbackAnswer]
                );
            }

            return res.json({
                success: true,
                classification,
                answer: fallbackAnswer,
                healedQuery,
                selfHealingUsed,
                sources: [],
            });
        }

        const context = chunks
            .map((chunk, index) => `Source ${index + 1}: ${chunk.content}`)
            .join("\n\n");

        const supportAnswer = await generateSupportAnswer(
            question,
            context,
            classification.category,
            classification.priority,
            classification.sentiment
        );

        const outputGuardrail = checkOutputGuardrails(
            supportAnswer || ""
        );

        if (!outputGuardrail.allowed) {
            return res.json({
                success: true,
                blocked: true,
                guardrail: "output",
                reason: outputGuardrail.reason,
                classification,
                answer:
                    "I generated an answer that did not meet safety requirements, so I blocked it.",
                healedQuery,
                selfHealingUsed,
                sources: chunks.map((chunk) => ({
                    document: chunk.document_name,
                    content: chunk.content,
                    distance: chunk.distance,
                })),
            });
        }

        if (sessionId) {
            await pool.query(
                "INSERT INTO chat_messages (session_id, role, content) VALUES ($1, $2, $3)",
                [sessionId, "assistant", supportAnswer]
            );
        }

        res.json({
            success: true,
            classification,
            answer: supportAnswer,
            healedQuery,
            selfHealingUsed,
            sources: chunks.map((chunk) => ({
                document: chunk.document_name,
                content: chunk.content,
                distance: chunk.distance,
            })),
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            error: "Support agent failed",
        });
    }
});

router.post("/stream", async (req, res) => {
    try {
        const { question, documentId } = req.body;

        if (!question) {
            return res.status(400).json({
                success: false,
                error: "Question is required",
            });
        }
        const inputGuardrail = checkInputGuardrails(question);

        if (!inputGuardrail.allowed) {
            return res.status(400).json({
                success: false,
                blocked: true,
                reason: inputGuardrail.reason,
            });
        }

        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Transfer-Encoding", "chunked");
        res.setHeader("Cache-Control", "no-cache");
        res.flushHeaders?.();

        const classification = classifyTicket(question);

        const { chunks } = await selfHealingRetrieve(question, documentId);

        if (chunks.length === 0) {
            res.write(
                "I could not find relevant information in the uploaded knowledge base, even after improving the search query."
            );
            return res.end();
        }

        const context = chunks
            .map((chunk, index) => `Source ${index + 1}: ${chunk.content}`)
            .join("\n\n");

        const stream = await streamSupportAnswer(
            question,
            context,
            classification.category,
            classification.priority,
            classification.sentiment
        );

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            res.write(content);
        }

        res.end();
    } catch (error) {
        console.error(error);
        res.write("Streaming failed.");
        res.end();
    }
});

router.post("/retrieve", async (req, res) => {
    try {
        const { question, documentId } = req.body;

        if (!question) {
            return res.status(400).json({
                success: false,
                error: "Question is required",
            });
        }

        const inputGuardrail = checkInputGuardrails(question);

        if (!inputGuardrail.allowed) {
            return res.status(400).json({
                success: false,
                blocked: true,
                reason: inputGuardrail.reason,
            });
        }

        const classification = classifyTicket(question);

        const { chunks, healedQuery, selfHealingUsed } =
            await selfHealingRetrieve(question, documentId);

        const retrievalGuardrail = checkRetrievalGuardrails(chunks);

        if (!retrievalGuardrail.allowed) {
            const fallbackAnswer =
                "I could not find reliable enough information in the uploaded knowledge base to answer this safely.";

            return res.json({
                success: true,
                blocked: true,
                guardrail: "retrieval",
                reason: retrievalGuardrail.reason,
                classification,
                answer: fallbackAnswer,
                healedQuery,
                selfHealingUsed,
                sources: [],
            });
        }

        res.json({
            success: true,
            classification,
            healedQuery,
            selfHealingUsed,
            sources: chunks.map((chunk) => ({
                document: chunk.document_name,
                content: chunk.content,
                distance: chunk.distance,
            })),
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: "Retrieval failed",
        });
    }
});

router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        await pool.query("DELETE FROM document_chunks WHERE document_id = $1", [id]);
        await pool.query("DELETE FROM documents WHERE id = $1", [id]);

        res.json({
            success: true,
            message: "Document deleted successfully",
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            error: "Failed to delete document",
        });
    }
});

router.post("/graph/ask", async (req, res) => {
    try {
        const { question, documentId } = req.body;

        if (!question) {
            return res.status(400).json({
                success: false,
                error: "Question is required",
            });
        }

        const result = await runSupportGraph(question, documentId);

        res.json(result);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: "LangGraph support agent failed",
        });
    }
});

export default router;