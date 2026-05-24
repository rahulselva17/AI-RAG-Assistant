import express from "express";
import pool from "../db";
import { chunkText } from "../utils/chunkText";
import { getEmbedding } from "../services/embeddingService";
import { generateAnswer } from "../services/answerService";
import multer from "multer";
import fs from "fs";
import pdfParse from "pdf-parse";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.get("/", async (_req, res) => {
    try {
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

        res.json({
            success: true,
            documents: result.rows,
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: "Failed to fetch documents",
        });
    }
});

router.post("/upload-pdf", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: "PDF file is required",
            });
        }

        const fileBuffer = fs.readFileSync(req.file.path);
        const pdfData = await pdfParse(fileBuffer);
        const text = pdfData.text;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: "No text found in PDF",
            });
        }

        const docResult = await pool.query(
            "INSERT INTO documents (name) VALUES ($1) RETURNING id",
            [req.file.originalname]
        );

        const documentId = docResult.rows[0].id;
        const chunks = chunkText(text);

        for (const chunk of chunks) {
            const embedding = await getEmbedding(chunk);

            await pool.query(
                `INSERT INTO document_chunks (document_id, content, embedding)
           VALUES ($1, $2, $3::vector)`,
                [documentId, chunk, `[${embedding.join(",")}]`]
            );
        }

        fs.unlinkSync(req.file.path);

        res.json({
            success: true,
            message: "PDF uploaded and stored with embeddings",
            documentId,
            chunksStored: chunks.length,
        });
    } catch (error) {
        console.error(error);

        if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            success: false,
            error: "PDF upload failed",
        });
    }
});
router.post("/upload-text", async (req, res) => {
    try {
        const { text, name } = req.body;

        // Insert document
        const docResult = await pool.query(
            "INSERT INTO documents (name) VALUES ($1) RETURNING id",
            [name]
        );

        const documentId = docResult.rows[0].id;

        // Chunk text
        const chunks = chunkText(text);

        for (const chunk of chunks) {
            const embedding = await getEmbedding(chunk);

            await pool.query(
                `INSERT INTO document_chunks (document_id, content, embedding)
         VALUES ($1, $2, $3::vector)`,
                [
                    documentId,
                    chunk,
                    `[${embedding.join(",")}]`
                ]
            );
        }

        res.json({ success: true, message: "Document stored with embeddings" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Upload failed" });
    }
});

router.post("/ask", async (req, res) => {
    try {
        const { question } = req.body;

        if (!question) {
            return res.status(400).json({
                success: false,
                error: "Question is required",
            });
        }

        const questionEmbedding = await getEmbedding(question);
        const vectorString = `[${questionEmbedding.join(",")}]`;

        const result = await pool.query(
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

        const chunks = result.rows;

        const context = chunks
            .map((chunk, index) => `Source ${index + 1}: ${chunk.content}`)
            .join("\n\n");

        const answer = await generateAnswer(question, context);

        res.json({
            success: true,
            answer,
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
            error: "Question answering failed",
        });
    }
});

export default router;