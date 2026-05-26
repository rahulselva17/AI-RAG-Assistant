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

type GraphResponse = {
  success: boolean;
  blocked?: boolean;
  blockReason?: string | null;
  classification?: Classification;
  answer?: string;
  healedQuery?: string | null;
  selfHealingUsed?: boolean;
  compressedContext?: string;
  agentTrace?: string[];
  selectedTool?: string;
  cacheHit?: boolean;
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

  const [graphResult, setGraphResult] = useState<GraphResponse | null>(null);

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

  const askAdvancedAgent = async () => {
    if (!question.trim()) return;

    setLoading(true);
    setGraphResult(null);

    try {
      const res = await axios.post(`${API_BASE}/api/support/graph/ask`, {
        question,
        documentId: selectedDocumentId,
      });

      setGraphResult(res.data);
    } catch (error) {
      console.error(error);
      setGraphResult({
        success: false,
        error: "Failed to get response from LangGraph agent.",
      });
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
        <div className="badge">
          LangGraph • RAG • Guardrails • Agent Observability
        </div>
        <h1>Enterprise Agentic RAG AI Platform</h1>
        <p>
          Upload enterprise documents, ask questions, retrieve grounded sources,
          and inspect the full AI agent execution workflow.
        </p>
      </header>

      <main className="layout">
        <aside className="sidebar">
          <section className="card">
            <h2>Upload Knowledge Base</h2>
            <p className="muted">
              Upload policies, FAQs, manuals, research papers, or support PDFs.
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
              <h2>Ask LangGraph Agent</h2>
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

          <button onClick={askAdvancedAgent} disabled={loading}>
            {loading ? "Running Agent..." : "Ask Advanced Agent"}
          </button>

          {graphResult?.classification && (
            <div className="chips">
              <span>Category: {graphResult.classification.category}</span>
              <span>Priority: {graphResult.classification.priority}</span>
              <span>Sentiment: {graphResult.classification.sentiment}</span>

              {graphResult.selectedTool && (
                <span>Tool: {graphResult.selectedTool}</span>
              )}
              {graphResult.cacheHit !== undefined && (
                <span>Cache: {graphResult.cacheHit ? "HIT" : "MISS"}</span>
              )}
            </div>
          )}

          {graphResult?.blocked && (
            <div className="blocked-box">
              <h3>Guardrail Blocked</h3>
              <p>{graphResult.blockReason}</p>
            </div>
          )}

          {graphResult?.answer && (
            <div className="response">
              <h3>AI Answer</h3>
              <p className="answer">{graphResult.answer}</p>
            </div>
          )}

          {graphResult?.selfHealingUsed !== undefined && (
            <div className="trace-box">
              <h3>Self-Healing Retrieval</h3>
              <p>
                {graphResult.selfHealingUsed
                  ? "Self-healing query rewrite was used."
                  : "Self-healing was not required."}
              </p>

              {graphResult.healedQuery && (
                <p>
                  <strong>Healed Query:</strong> {graphResult.healedQuery}
                </p>
              )}
            </div>
          )}

          {graphResult?.agentTrace && (
            <div className="trace-box">
              <h3>Agent Trace</h3>

              {graphResult.agentTrace.map((step, index) => (
                <div key={index} className="trace-step">
                  {index + 1}. {step}
                </div>
              ))}
            </div>
          )}

          {graphResult?.compressedContext && (
            <div className="trace-box">
              <h3>Compressed Context</h3>
              <pre>{graphResult.compressedContext}</pre>
            </div>
          )}

          {graphResult?.sources && (
            <div className="response">
              <h3>Retrieved Sources</h3>

              {graphResult.sources.length === 0 ? (
                <p className="empty">
                  No relevant sources found. Try selecting the correct document
                  or uploading a more relevant PDF.
                </p>
              ) : (
                graphResult.sources.map((source, index) => (
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

          {graphResult?.error && <p className="error">{graphResult.error}</p>}
        </section>
      </main>
    </div>
  );
}

export default App;