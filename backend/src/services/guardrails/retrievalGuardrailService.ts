type RetrievedChunk = {
    content: string;
    distance: number;
  };
  
  export const checkRetrievalGuardrails = (chunks: RetrievedChunk[]) => {
    if (chunks.length === 0) {
      return {
        allowed: false,
        reason: "No relevant sources were retrieved.",
      };
    }
  
    const bestDistance = Math.min(...chunks.map((chunk) => Number(chunk.distance)));
  
    if (bestDistance > 1.5) {
      return {
        allowed: false,
        reason: "Retrieved sources are not relevant enough.",
      };
    }
  
    return {
      allowed: true,
      reason: null,
    };
  };