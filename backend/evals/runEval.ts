type TestCase = {
    name: string;
    question: string;
    documentId?: number;
    expectedKeywords: string[];
    minSources?: number;
  };
  
  const API_BASE = process.env.API_BASE || "http://127.0.0.1:5050";
  
  const testCases: TestCase[] = [
    {
      name: "Cosine similarity explanation",
      question: "Explain cosine similarity in simple words.",
      expectedKeywords: ["vector", "similarity", "dot product"],
      minSources: 1,
    },
    {
      name: "Multicast ordering explanation",
      question: "How does multicast ordering work?",
      expectedKeywords: ["sequence", "buffer", "order"],
      minSources: 1,
    },
  ];
  
  const runEval = async () => {
    let passed = 0;
    let failed = 0;
  
    for (const testCase of testCases) {
      const start = Date.now();
  
      const res = await fetch(`${API_BASE}/api/support/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: testCase.question,
          documentId: testCase.documentId,
        }),
      });
  
      const data = await res.json();
      const latencyMs = Date.now() - start;
  
      const answer = String(data.answer || "").toLowerCase();
      const sources = data.sources || [];
  
      const keywordPass = testCase.expectedKeywords.every((keyword) =>
        answer.includes(keyword.toLowerCase())
      );
  
      const sourcePass = sources.length >= (testCase.minSources || 1);
  
      const testPassed = data.success && keywordPass && sourcePass;
  
      if (testPassed) {
        passed++;
        console.log(`PASS: ${testCase.name}`);
      } else {
        failed++;
        console.log(`FAIL: ${testCase.name}`);
        console.log({
          answer: data.answer,
          sourcesFound: sources.length,
          expectedKeywords: testCase.expectedKeywords,
          keywordPass,
          sourcePass,
        });
      }
  
      console.log(`Latency: ${latencyMs}ms`);
      console.log("--------------------------------");
    }
  
    console.log(`Eval Summary: ${passed} passed, ${failed} failed`);
  
    if (failed > 0) {
      process.exit(1);
    }
  };
  
  runEval();