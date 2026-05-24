export const chunkText = (text: string, chunkSize = 500, overlap = 100) => {
    const chunks: string[] = [];
  
    let start = 0;
  
    while (start < text.length) {
      const end = start + chunkSize;
      chunks.push(text.slice(start, end));
      start += chunkSize - overlap;
    }
  
    return chunks;
  };