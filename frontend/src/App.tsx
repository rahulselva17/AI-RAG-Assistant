import { useEffect, useState } from "react";
import axios from "axios";
import "./App.css";

const API_BASE = "http://127.0.0.1:5050";

type Source = {
  document: string;
  content: string;
  distance: number;
};

type Classification = {
  category: string;
  priority: string;
  sentiment: string;
};

type RetrieveResponse = {
  success: boolean;
  classification?: Classification;
  sources?: Source[];
  error?: string;
};

type DocumentItem = {
  id: number;
  name: string;
  created_at: string;
  chunk_count: string;
};

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(
    null
  );

  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [retrieveResult, setRetrieveResult] = useState<RetrieveResponse | null>(
    null
  );

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/docs`);
      setDocuments(res.data.documents);
    } catch (error) {
      console.error(error);
    }
  };

  const uploadPDF = async () => {
    if (!file) {
      setUploadStatus("Please select a PDF first.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      setUploadStatus("Uploading and indexing PDF...");
      const res = await axios.post(`${API_BASE}/api/docs/upload-pdf`, formData);

      setUploadStatus(
        `Uploaded successfully. Chunks stored: ${res.data.chunksStored}`
      );

      setFile(null);
      await fetchDocuments();
    } catch (error) {
      console.error(error);
      setUploadStatus("Upload failed.");
    }
  };

  const deleteDocument = async (id: number) => {
    try {
      await axios.delete(`${API_BASE}/api/docs/${id}`);

      if (selectedDocumentId === id) {
        setSelectedDocumentId(null);
      }

      await fetchDocuments();
    } catch (error) {
      console.error(error);
      alert("Failed to delete document.");
    }
  };

  const askQuestionStream = async () => {
    if (!question.trim()) return;

    setLoading(true);
    setStreamingAnswer("");
    setRetrieveResult(null);

    try {
      const retrieveRes = await axios.post(`${API_BASE}/api/support/retrieve`, {
        question,
        documentId: selectedDocumentId,
      });

      setRetrieveResult(retrieveRes.data);

      const response = await fetch(`${API_BASE}/api/support/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question,
          documentId: selectedDocumentId,
        }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response stream");
      }

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        setStreamingAnswer((prev) => prev + chunk);
      }
    } catch (error) {
      console.error(error);
      setStreamingAnswer("Streaming failed.");
    } finally {
      setLoading(false);
    }
  };

  const selectedDocument = documents.find(
    (doc) => doc.id === selectedDocumentId
  );

  return (
    <div className="page">
      <header className="hero">
        <div className="badge">RAG • Streaming • pgvector • OpenAI</div>
        <h1>Agentic AI Customer Support Assistant</h1>
        <p>
          Upload support documents, ask questions, retrieve grounded sources, and
          stream AI responses in real time.
        </p>
      </header>

      <main className="layout">
        <aside className="sidebar">
          <section className="card">
            <h2>Upload Knowledge Base</h2>
            <p className="muted">
              Upload policies, FAQs, manuals, or troubleshooting PDFs.
            </p>

            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />

            <button onClick={uploadPDF}>Upload PDF</button>

            {uploadStatus && <p className="status">{uploadStatus}</p>}
          </section>

          <section className="card">
            <div className="section-title">
              <h2>Knowledge Base</h2>
              <span>{documents.length} docs</span>
            </div>

            <button
              className={
                selectedDocumentId === null ? "doc-button active" : "doc-button"
              }
              onClick={() => setSelectedDocumentId(null)}
            >
              Search All Documents
            </button>

            <div className="doc-list">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className={
                    selectedDocumentId === doc.id ? "doc-card active" : "doc-card"
                  }
                >
                  <button
                    className="doc-main"
                    onClick={() => setSelectedDocumentId(doc.id)}
                  >
                    <strong>{doc.name}</strong>
                    <small>{doc.chunk_count} chunks</small>
                  </button>

                  <button
                    className="delete"
                    onClick={() => deleteDocument(doc.id)}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </section>
        </aside>

        <section className="chat card">
          <div className="chat-header">
            <div>
              <h2>Ask Support Agent</h2>
              <p className="muted">
                Scope:{" "}
                <strong>
                  {selectedDocument ? selectedDocument.name : "All documents"}
                </strong>
              </p>
            </div>
          </div>

          <textarea
            placeholder="Example: Explain cosine similarity in simple words."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />

          <button onClick={askQuestionStream} disabled={loading}>
            {loading ? "Thinking..." : "Ask AI Agent"}
          </button>

          {retrieveResult?.classification && (
            <div className="chips">
              <span>Category: {retrieveResult.classification.category}</span>
              <span>Priority: {retrieveResult.classification.priority}</span>
              <span>Sentiment: {retrieveResult.classification.sentiment}</span>
            </div>
          )}

          {streamingAnswer && (
            <div className="response">
              <h3>AI Answer</h3>
              <p className="answer">{streamingAnswer}</p>
            </div>
          )}

          {retrieveResult?.sources && (
            <div className="response">
              <h3>Retrieved Sources</h3>

              {retrieveResult.sources.length === 0 ? (
                <p className="empty">
                  No relevant sources found. Try selecting the correct document
                  or uploading a more relevant PDF.
                </p>
              ) : (
                retrieveResult.sources.map((source, index) => (
                  <div className="source" key={index}>
                    <div className="source-header">
                      <strong>{source.document}</strong>
                      <small>Distance: {source.distance.toFixed(4)}</small>
                    </div>
                    <p>{source.content}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {retrieveResult?.error && <p className="error">{retrieveResult.error}</p>}
        </section>
      </main>
    </div>
  );
}

export default App;