import pool from "../../db";

export const runSqlTool = async (question: string) => {
  const lower = question.toLowerCase();

  if (
    lower.includes("how many documents") ||
    lower.includes("number of documents") ||
    lower.includes("count documents")
  ) {
    const result = await pool.query("SELECT COUNT(*) FROM documents");

    return `There are ${result.rows[0].count} documents uploaded.`;
  }

  if (
    lower.includes("list documents") ||
    lower.includes("show documents") ||
    lower.includes("uploaded documents")
  ) {
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

    if (result.rows.length === 0) {
      return "No documents are currently uploaded.";
    }

    return result.rows
      .map(
        (doc) =>
          `ID: ${doc.id}, Name: ${doc.name}, Chunks: ${doc.chunk_count}, Uploaded: ${doc.created_at}`
      )
      .join("\n");
  }

  if (
    lower.includes("how many chunks") ||
    lower.includes("number of chunks") ||
    lower.includes("count chunks")
  ) {
    const result = await pool.query("SELECT COUNT(*) FROM document_chunks");

    return `There are ${result.rows[0].count} document chunks stored.`;
  }

  if (
    lower.includes("latest document") ||
    lower.includes("recent document") ||
    lower.includes("last uploaded")
  ) {
    const result = await pool.query(`
      SELECT id, name, created_at
      FROM documents
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return "No documents have been uploaded yet.";
    }

    const doc = result.rows[0];

    return `The latest uploaded document is "${doc.name}" with ID ${doc.id}, uploaded at ${doc.created_at}.`;
  }

  return "I could not find a matching SQL tool action for this question.";
};