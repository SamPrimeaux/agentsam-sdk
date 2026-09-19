/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, Modality } from "@google/genai";
import { Asset, PlacedLayer, ChatMessage, ChatRole } from "../types";

/**
 * Helper to strip the data URL prefix (e.g. "data:image/png;base64,")
 */
const getBase64Data = (dataUrl: string): string => {
  if (!dataUrl) return "";
  const parts = dataUrl.split(',');
  return parts.length > 1 ? parts[1] : parts[0];
};

/**
 * Generates a product mockup by compositing multiple logos onto a product image.
 */
export const generateMockup = async (
  product: Asset,
  layers: { asset: Asset; placement: PlacedLayer }[],
  instruction: string
): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY });
    const model = 'gemini-3.1-flash-image';

    // 1. Add Product Base
    const parts: any[] = [
      {
        inlineData: {
          mimeType: product.mimeType || 'image/png',
          data: getBase64Data(product.data),
        },
      },
    ];

    // 2. Add All Logos
    let layoutHints = "";
    layers.forEach((layer, index) => {
      parts.push({
        inlineData: {
          mimeType: layer.asset.mimeType || 'image/png',
          data: getBase64Data(layer.asset.data),
        },
      });

      const vPos = layer.placement.y < 33 ? "upper chest / collar" : layer.placement.y > 66 ? "lower hem / stomach" : "center chest";
      const hPos = layer.placement.x < 33 ? "left side" : layer.placement.x > 66 ? "right side" : "center aligned";
      
      layoutHints += `\n- Artwork Layer ${index + 1} (${layer.placement.printLocation || 'placement'}): Position at ${vPos}, ${hPos} (coordinates: ${Math.round(layer.placement.x)}% X, ${Math.round(layer.placement.y)}% Y). Scale multiplier: ${layer.placement.scale.toFixed(2)}, Rotation: ${layer.placement.rotation}deg.`;
    });

    // 3. Add FuelnFreeTime Apparel Specific Instructions
    const finalPrompt = `
You are the AI Visualization Engine for FuelnFreeTime Apparel (F&FT), a premium motorsport, adventure, and streetwear lifestyle brand.

User Art Direction: ${instruction || "Render a photorealistic retail apparel mockup with exact fabric texture embedding."}

Layout Guidance:
${layoutHints}

Task:
Composite the brand artwork (images 2 to ${layers.length + 1}) realistically onto the primary apparel blank (first image).
Adhere strictly to:
1. High-fidelity fabric displacement (DTG screenprint ink texture or embroidery stitches following the creases, wrinkles, and folds of the garment).
2. True-to-life environmental lighting, highlights, ambient occlusion, and subtle shading matching the apparel contours.
3. Accurate scale, alignment, and realistic perspective warping according to the placement coordinates.
4. Output ONLY the clean high-resolution mockup image.
`;

    parts.push({ text: finalPrompt });

    const response = await ai.models.generateContent({
      model,
      contents: { parts },
    });

    const candidates = response.candidates;
    if (candidates && candidates[0]?.content?.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }
    throw new Error("No image data found in response");
  } catch (error) {
    console.error("Mockup generation failed:", error);
    throw error;
  }
};

/**
 * Generates a new logo or product base from scratch using text.
 */
export const generateAsset = async (prompt: string, type: 'logo' | 'product'): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY });
    const model = 'gemini-3.1-flash-image';
    
    const enhancedPrompt = type === 'logo' 
      ? `A clean vector graphic artwork for FuelnFreeTime Apparel merchandise: ${prompt}. Pure white/isolated background, high contrast, crisp edges, streetwear and motorsport aesthetic, ready for DTG print and embroidery.`
      : `Studio commercial product photography of a premium blank apparel garment: ${prompt}. Ghost mannequin or flat lay presentation, perfectly lit studio lighting, neutral clean background, 4K texture detail, photorealistic.`;

    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [{ text: enhancedPrompt }]
      },
    });

    const candidates = response.candidates;
    if (candidates && candidates[0]?.content?.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }
    throw new Error("No image generated");
  } catch (error) {
    console.error("Asset generation failed:", error);
    throw error;
  }
};

/**
 * Takes a raw AR composite and makes it photorealistic.
 */
export const generateRealtimeComposite = async (
  compositeImageBase64: string,
  prompt: string = "Make this look like a photorealistic FuelnFreeTime Apparel catalogue shot"
): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY });
    const model = 'gemini-3.1-flash-image';

    const parts = [
      {
        inlineData: {
          mimeType: 'image/png',
          data: getBase64Data(compositeImageBase64),
        },
      },
      {
        text: `Input is an apparel composite. Task: ${prompt}. 
Render the overlaid graphic naturally onto the garment. Match lighting, shadows, reflections, fabric draping, and perspective. Output ONLY the resulting image.`,
      },
    ];

    const response = await ai.models.generateContent({
      model,
      contents: { parts },
    });

    const candidates = response.candidates;
    if (candidates && candidates[0]?.content?.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }
    throw new Error("No image data found in response");
  } catch (error) {
    console.error("AR Composite generation failed:", error);
    throw error;
  }
};

/**
 * Role-specific system instructions for FuelnFreeTime AI Chatbot
 */
const ROLE_SYSTEM_INSTRUCTIONS: Record<ChatRole, string> = {
  designer: `You are the Lead Apparel Graphic Designer for "FuelnFreeTime Apparel" (F&FT), a modern lifestyle brand blending motorsport grit, off-road overland culture, freedom/leisure aesthetic, and high-performance streetwear.
Your role:
- Brainstorm bold graphic concepts, typography badges, retro race patches, minimal chest hits, and full-back apparel prints.
- Advise on print locations (front chest, back oversized print, left sleeve stamp, woven hem tag).
- Give prompt formulas and art direction that can be used directly in the Mockup Studio.
- Keep responses sharp, modern, and inspiring. Provide concrete suggested action prompts when relevant.`,

  fulfillment: `You are the Completeful Print-on-Demand (POD) & Operations Specialist for FuelnFreeTime Apparel.
You understand the Completeful POD integration inside and out:
- API endpoint architecture: Shop-scoped paths (/v1/shops/{shopId}/orders, /v1/shops/{shopId}/products, /v1/shops/{shopId}/webhooks).
- Completeful order lifecycle: F&FT Order -> Stripe Paid -> completeful_order_links -> Completeful Fulfillment Order -> Webhooks (order:sent-to-production, order:shipment:created).
- Pricing & Quotes: Completeful fulfillment quotes are authoritative for cost; retail prices are determined by F&FT storefront markups.
- Webhook verification: HMAC-SHA256 over <timestamp>.<rawBody> with X-Capp-Signature (t=<unix>,v1=<hex>).
- Test Mode vs Live Mode: CAPP_KEY capp_test_... flags dry-run mode via X-Capp-Mode: test and X-Capp-Dry-Run: true. Kill switch COMPLETEFUL_ALLOW_LIVE_WRITES prevents accidental live writes.
- Help the user configure webhooks, calculate profit margins, diagnose failed orders, and format payloads.`,

  architect: `You are the Lead System Architect for the FuelnFreeTime Apparel Commerce & D1 Database Engine.
You have in-depth knowledge of:
- The 7 D1 link tables: completeful_shops, completeful_product_links, completeful_variant_links, completeful_order_links, completeful_operations, completeful_webhook_subscriptions, completeful_webhook_events.
- Idempotency-Key replay safety (reusing key/body replays safely; different body returns 409).
- Secret rotation and webhook subscriptions without exposing raw secrets.
- Provide clean technical answers, SQL schema snippets, and integration flow diagrams.`
};

/**
 * Multi-turn Gemini AI Chat Assistant
 */
export const sendChatMessage = async (
  messages: ChatMessage[],
  role: ChatRole = 'designer',
  modelName: string = 'gemini-3.5-flash'
): Promise<{ text: string; suggestedPrompts?: string[]; actionPayload?: any }> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY });
    
    // Choose model based on request
    // Options: 'gemini-3.5-flash' (standard), 'gemini-3.1-pro-preview' (deep reasoning), 'gemini-3.1-flash-lite' (fast)
    let selectedModel = modelName;
    if (modelName.includes('3.1-pro') || modelName.includes('pro')) {
      selectedModel = 'gemini-3.1-pro-preview';
    } else if (modelName.includes('lite')) {
      selectedModel = 'gemini-3.1-flash-lite';
    } else {
      selectedModel = 'gemini-3.5-flash';
    }

    const systemInstruction = ROLE_SYSTEM_INSTRUCTIONS[role] + `
    Always maintain a friendly, knowledgeable persona. Format your output with clear markdown headings, bullet points, and code blocks where helpful.
    When proposing a design prompt or a Completeful action, highlight actionable next steps.`;

    // Build contents for multi-turn history
    const contents: any[] = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    const response = await ai.models.generateContent({
      model: selectedModel,
      contents,
      config: {
        systemInstruction,
        temperature: 0.7,
      }
    });

    const responseText = response.text || "I was unable to generate a response. Please check your prompt and try again.";

    // Generate contextual suggestions based on role
    const suggestions = getContextualSuggestions(role, responseText);

    return {
      text: responseText,
      suggestedPrompts: suggestions
    };
  } catch (error) {
    console.error("Gemini Chat failed:", error);
    throw error;
  }
};

const getContextualSuggestions = (role: ChatRole, _reply: string): string[] => {
  if (role === 'designer') {
    return [
      "Create a vintage off-road piston badge for heavy hoodie",
      "Suggest a minimal sleeve graphic for FuelnFreeTime",
      "Draft a 90s rally racing typography lockup"
    ];
  } else if (role === 'fulfillment') {
    return [
      "Simulate an order:shipment:created webhook event",
      "Calculate 55% margin quote for $16.20 fleece hoodie",
      "Verify HMAC signature format for Completeful"
    ];
  } else {
    return [
      "Show schema for completeful_variant_links",
      "Explain Idempotency-Key retry handling",
      "View active Completeful webhook topics"
    ];
  }
};
