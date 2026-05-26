import { QdrantClient } from "@qdrant/js-client-rest";

const client = new QdrantClient({
  url: process.env.QDRANT_URL || "http://127.0.0.1:6333",
});

const COLLECTION_NAME =
  process.env.QDRANT_COLLECTION || "rag_documents";

export const ensureQdrantCollection = async () => {
  const collections = await client.getCollections();

  const exists = collections.collections.some(
    (collection) => collection.name === COLLECTION_NAME
  );

  if (!exists) {
    await client.createCollection(COLLECTION_NAME, {
      vectors: {
        size: 1536,
        distance: "Cosine",
      },
    });

    console.log("Qdrant collection created:", COLLECTION_NAME);
  }
};

export const upsertChunkToQdrant = async ({
  chunkId,
  documentId,
  documentName,
  content,
  embedding,
}: {
  chunkId: number;
  documentId: number;
  documentName: string;
  content: string;
  embedding: number[];
}) => {
  await ensureQdrantCollection();

  await client.upsert(COLLECTION_NAME, {
    points: [
      {
        id: chunkId,
        vector: embedding,
        payload: {
          documentId,
          documentName,
          content,
        },
      },
    ],
  });
};

export const searchQdrantChunks = async (
  embedding: number[],
  documentId?: number,
  limit = 5
) => {
  await ensureQdrantCollection();

  const filter = documentId
    ? {
        must: [
          {
            key: "documentId",
            match: {
              value: documentId,
            },
          },
        ],
      }
    : undefined;

  const result = await client.search(COLLECTION_NAME, {
    vector: embedding,
    limit,
    filter,
  });

  return result.map((point) => ({
    id: point.id,
    content: String(point.payload?.content || ""),
    document_name: String(point.payload?.documentName || ""),
    distance: 1 - Number(point.score),
  }));
};