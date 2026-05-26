import express from "express";
import multer from "multer";
import fs from "fs";
import pdfParse from "pdf-parse";
import pool from "../db";
import { getEmbedding } from "../services/embeddingService";
import { upsertChunkToQdrant } from "../services/vector/qdrantService";

const router = express.Router();

const upload = multer({
  dest: "uploads/",
});

const chunkText = (text: string, chunkSize = 800, overlap = 100) => {
  const chunks: string[] = [];

  let start = 0;

  while (start < text.length) {
    const end = start + chunkSize;
    const chunk = text.slice(start, end).trim();

    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    start += chunkSize - overlap;
  }

  return chunks;
};

router.post("/upload-pdf", upload.single("file"), async (req, res) => {
  let uploadedFilePath: string | null = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "PDF file is required",
      });
    }

    uploadedFilePath = req.file.path;

    const fileBuffer = fs.readFileSync(req.file.path);
    const parsedPdf = await pdfParse(fileBuffer);

    const fullText = parsedPdf.text;

    if (!fullText || !fullText.trim()) {
      return res.status(400).json({
        success: false,
        error: "Could not extract text from PDF",
      });
    }

    const documentResult = await pool.query(
      "INSERT INTO documents (name) VALUES ($1) RETURNING id, name",
      [req.file.originalname]
    );

    const documentId = documentResult.rows[0].id;
    const documentName = documentResult.rows[0].name;

    const chunks = chunkText(fullText);

    let chunksStored = 0;

    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk);
      const vectorString = `[${embedding.join(",")}]`;

      const chunkResult = await pool.query(
        `
        INSERT INTO document_chunks (document_id, content, embedding)
        VALUES ($1, $2, $3::vector)
        RETURNING id
        `,
        [documentId, chunk, vectorString]
      );

      const chunkId = chunkResult.rows[0].id;

      await upsertChunkToQdrant({
        chunkId,
        documentId,
        documentName,
        content: chunk,
        embedding,
      });

      chunksStored++;
    }

    res.json({
      success: true,
      message: "PDF uploaded and stored with embeddings",
      documentId,
      chunksStored,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: "Upload failed",
    });
  } finally {
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      fs.unlinkSync(uploadedFilePath);
    }
  }
});

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

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const documentResult = await pool.query(
      "SELECT * FROM documents WHERE id = $1",
      [id]
    );

    if (documentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Document not found",
      });
    }

    const chunksResult = await pool.query(
      `
      SELECT id, content, created_at
      FROM document_chunks
      WHERE document_id = $1
      ORDER BY id ASC
      `,
      [id]
    );

    res.json({
      success: true,
      document: documentResult.rows[0],
      chunks: chunksResult.rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: "Failed to fetch document",
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

export default router;