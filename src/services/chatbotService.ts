import { supabase } from "@/integrations/supabase/client";

// OpenRouter API configuration
// OpenRouter API configuration
const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || "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";
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

// Free models with fallback - Updated list
const FREE_MODELS = [
  "google/gemini-2.0-flash-exp:free",
  "google/gemini-2.0-flash-thinking-exp:free",
  "google/gemma-2-9b-it:free",
  "meta-llama/llama-3.2-1b-instruct:free",
  "microsoft/phi-3-mini-128k-instruct:free"
];

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface UserContext {
  userId: string;
  userRole: "admin" | "staff" | "technician" | "student";
  userName: string;
  userEmail: string;
}

// Cache for database context
let cachedContext: { data: string; timestamp: number } | null = null;
const CACHE_DURATION = 30000; // 30 seconds

// Fetch real-time database context
async function fetchDatabaseContext(userContext: UserContext): Promise<string> {
  if (cachedContext && Date.now() - cachedContext.timestamp < CACHE_DURATION) {
    return cachedContext.data;
  }

  try {
    const [itemsResult, categoriesResult, departmentsResult, chemicalsResult] = await Promise.all([
      supabase.from("items").select("name, item_code, current_quantity, status, is_borrowable, storage_location, category:categories(name), department:departments(name)").limit(50),
      supabase.from("categories").select("name, description"),
      supabase.from("departments").select("name"),
      supabase.from("chemicals").select("name, cas_number, current_quantity, unit, storage_location, expiry_date, is_active, department:departments(name)").eq("is_active", true).limit(30)
    ]);

    const items = itemsResult.data || [];
    const categories = categoriesResult.data || [];
    const departments = departmentsResult.data || [];
    const chemicals = chemicalsResult.data || [];

    let context = `
## DATABASE INFORMATION

### Departments (${departments.length} total)
${departments.map(d => `- ${d.name}`).join('\n')}

### Categories (${categories.length} total)
${categories.map(c => `- ${c.name}${c.description ? `: ${c.description}` : ''}`).join('\n')}

### Items in Inventory (${items.length} total)
| Item Name | Code | Qty | Status | Department | Location |
|-----------|------|-----|--------|------------|----------|
${items.map(item => 
  `| ${item.name} | ${item.item_code || 'N/A'} | ${item.current_quantity} | ${item.status} | ${item.department?.name || 'N/A'} | ${item.storage_location || 'Not specified'} |`
).join('\n')}

### Chemicals in Lab (${chemicals.length} total)
| Chemical Name | CAS Number | Qty | Unit | Location | Expiry |
|---------------|------------|-----|------|----------|--------|
${chemicals.map(chem => 
  `| ${chem.name} | ${chem.cas_number || 'N/A'} | ${chem.current_quantity} | ${chem.unit} | ${chem.storage_location || 'Not specified'} | ${chem.expiry_date ? new Date(chem.expiry_date).toLocaleDateString() : 'N/A'} |`
).join('\n')}
`;

    // Fetch student's history if applicable
    if (userContext.userRole === 'student') {
      const { data: history } = await supabase
        .from("borrow_requests")
        .select("status, created_at, item:items(name)")
        .eq("student_id", userContext.userId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (history?.length) {
        context += `\n### Your Recent Borrow History\n`;
        history.forEach(h => {
          context += `- ${h.item?.name}: ${h.status} (${new Date(h.created_at).toLocaleDateString()})\n`;
        });
      }
    }

    cachedContext = { data: context, timestamp: Date.now() };
    return context;
  } catch (error) {
    console.error("DB error:", error);
    return "Database temporarily unavailable.";
  }
}

// Professional system prompt
function buildSystemPrompt(dbContext: string): string {
  return `You are **LabLink Assistant**, a professional lab inventory chatbot. Follow these rules strictly:

## YOUR ROLE
- Answer questions about lab items, equipment, borrowing, and inventory
- Provide accurate information from the database
- Give clear, structured, and complete responses

## RESPONSE FORMAT RULES
Always format your responses professionally:
- Use **bold** for important terms and headings
- Use numbered lists (1, 2, 3) for steps and procedures
- Use bullet points (•) for lists of items
- Keep paragraphs short and clear
- Always give COMPLETE answers - never stop mid-sentence

## SCOPE - ONLY ANSWER ABOUT:
✅ Lab items, equipment, tools, chemicals
✅ Item details (name, code, quantity, location, availability)
✅ How to borrow and return items
✅ Categories and departments
✅ Lab rules and safety

## DO NOT ANSWER ABOUT:
❌ Movies, music, entertainment
❌ Coding or programming help
❌ News, politics, general knowledge
❌ Personal information about users

If asked off-topic, respond: "I can only help with lab inventory questions."

## HOW TO BORROW AN ITEM
When asked about borrowing, provide these steps:

**Step 1:** Go to the **Inventory** page
**Step 2:** Find and click on the item you need
**Step 3:** Click the **"Borrow"** button
**Step 4:** Select your borrow dates and quantity
**Step 5:** Enter your purpose for borrowing
**Step 6:** Submit the request
**Step 7:** Wait for staff/admin approval
**Step 8:** Collect the item from the pickup location
**Step 9:** Return by the due date

## PRIVACY
- Never reveal personal details (names, emails, phone numbers)
- Only share item and inventory information

${dbContext}

Remember: Give complete, well-formatted responses. Never cut off mid-sentence.`;
}

// Main chat function
export async function sendChatMessage(
  messages: ChatMessage[],
  userContext: UserContext
): Promise<string> {
  const dbContext = await fetchDatabaseContext(userContext);
  const systemPrompt = buildSystemPrompt(dbContext);

  const recentMessages = messages.slice(-5);
  const apiMessages = [
    { role: "system", content: systemPrompt },
    ...recentMessages.map(m => ({ role: m.role, content: m.content }))
  ];

  console.log("Sending request to OpenRouter with models:", FREE_MODELS);
  
  // Check if key is configured
  if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY.includes("placeholder")) {
    console.error("OpenRouter API Key is missing or invalid");
    return "Configuration Error: OpenRouter API Key is missing. Please add VITE_OPENROUTER_API_KEY to your environment variables.";
  }

  let lastError = "";

  for (const model of FREE_MODELS) {
    try {
      console.log(`Trying model: ${model}`);
      const response = await fetch(OPENROUTER_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": window.location.origin,
          "X-Title": "LabLink"
        },
        body: JSON.stringify({
          model: model,
          messages: apiMessages,
          max_tokens: 1200,
          temperature: 0.4,
          top_p: 0.9,
        })
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content && content.length > 5) {
          console.log(`Success with model: ${model}`);
          return content;
        }
      } else {
        const errorText = await response.text();
        console.warn(`Model ${model} failed with status ${response.status}: ${errorText}`);
        
        // Capture specific errors to report to user if all fail
        if (response.status === 401) {
          lastError = "Authentication failed. Please check your VITE_OPENROUTER_API_KEY.";
        } else if (response.status === 429) {
          lastError = "Rate limit exceeded. Please try again later.";
        } else if (response.status === 402) {
          lastError = "Insufficient credits in OpenRouter account.";
        }
      }
    } catch (err) {
      console.warn(`Model ${model} error:`, err);
      if (!lastError) lastError = "Network connection error.";
    }
  }

  console.error("All models failed to respond.");
  return lastError || "I'm temporarily unable to respond due to high traffic or configuration issues. Please check the browser console for details.";
}

// Off-topic detection
export function isOffTopicRequest(message: string): boolean {
  const offTopicKeywords = ['movie', 'cinema', 'song', 'music', 'weather', 'news', 'sport', 'game', 'recipe', 'food', 'politics', 'crypto', 'bitcoin', 'joke', 'poem'];
  const lower = message.toLowerCase();
  return offTopicKeywords.some(k => lower.includes(k));
}

export function getOffTopicResponse(): string {
  return "I can only help with **lab inventory questions**. Please ask about items, borrowing, categories, or departments.";
}
