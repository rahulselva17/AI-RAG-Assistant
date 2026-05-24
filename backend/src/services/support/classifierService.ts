export type TicketClassification = {
    category: "Billing" | "Technical" | "Account" | "Product" | "General";
    priority: "Low" | "Medium" | "High";
    sentiment: "Positive" | "Neutral" | "Negative";
  };
  
  export const classifyTicket = (message: string): TicketClassification => {
    const text = message.toLowerCase();
  
    let category: TicketClassification["category"] = "General";
    let priority: TicketClassification["priority"] = "Medium";
    let sentiment: TicketClassification["sentiment"] = "Neutral";
  
    if (text.includes("payment") || text.includes("billing") || text.includes("refund")) {
      category = "Billing";
    } else if (text.includes("error") || text.includes("bug") || text.includes("not working")) {
      category = "Technical";
    } else if (text.includes("login") || text.includes("password") || text.includes("account")) {
      category = "Account";
    } else if (text.includes("feature") || text.includes("product")) {
      category = "Product";
    }
  
    if (text.includes("urgent") || text.includes("angry") || text.includes("cancel")) {
      priority = "High";
    } else if (text.includes("thanks") || text.includes("just asking")) {
      priority = "Low";
    }
  
    if (text.includes("bad") || text.includes("angry") || text.includes("frustrated")) {
      sentiment = "Negative";
    } else if (text.includes("great") || text.includes("thanks") || text.includes("helpful")) {
      sentiment = "Positive";
    }
  
    return { category, priority, sentiment };
  };