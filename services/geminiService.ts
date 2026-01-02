
import { GoogleGenAI } from "@google/genai";
import { PalletPosition } from "../types";

export const getInventoryInsights = async (inventory: PalletPosition[], query: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const model = 'gemini-3-flash-preview';
  const occupiedItems = inventory.filter(p => p.productId || p.productName);
  
  const systemInstruction = `
    Você é um especialista em logística do sistema RackMaster.
    Configuração: 3 Racks (A, B, C), 5 níveis (A-E), 66 posições por nível.
    Inventário atual (contendo productId e productName): ${JSON.stringify(occupiedItems)}
    
    Responda em Português do Brasil de forma concisa e útil.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: query,
      config: { systemInstruction, temperature: 0.7 },
    });
    return response.text;
  } catch (error) {
    return "Erro ao analisar inventário.";
  }
};

export const optimizeInventoryLayout = async (inventory: PalletPosition[]) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const model = 'gemini-3-flash-preview';
  const systemInstruction = "Sugira otimização para 3 racks de porta-paletes (A-C) focando na organização por ID de produto.";
  try {
    const response = await ai.models.generateContent({
      model,
      contents: "Gere plano de otimização.",
      config: { systemInstruction, temperature: 0.4 },
    });
    return response.text;
  } catch (error) {
    return "Erro na otimização.";
  }
};
