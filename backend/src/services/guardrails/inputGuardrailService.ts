export const checkInputGuardrails = (question: string) => {
    const lower = question.toLowerCase();
  
    const blockedPatterns = [
      "ignore previous instructions",
      "ignore the system prompt",
      "reveal your prompt",
      "show hidden instructions",
      "bypass safety",
      "jailbreak",
    ];
  
    const matchedPattern = blockedPatterns.find((pattern) =>
      lower.includes(pattern)
    );
  
    if (matchedPattern) {
      return {
        allowed: false,
        reason: `Potential prompt injection detected: ${matchedPattern}`,
      };
    }
  
    if (question.length > 2000) {
      return {
        allowed: false,
        reason: "Question is too long.",
      };
    }
  
    return {
      allowed: true,
      reason: null,
    };
  };