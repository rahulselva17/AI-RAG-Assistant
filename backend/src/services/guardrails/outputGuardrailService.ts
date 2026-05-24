export const checkOutputGuardrails = (answer: string) => {
    const lower = answer.toLowerCase();
  
    const riskyPhrases = [
      "i made this up",
      "without any source",
      "i don't have context but",
    ];
  
    const matchedPhrase = riskyPhrases.find((phrase) =>
      lower.includes(phrase)
    );
  
    if (matchedPhrase) {
      return {
        allowed: false,
        reason: `Risky output phrase detected: ${matchedPhrase}`,
      };
    }
  
    return {
      allowed: true,
      reason: null,
    };
  };