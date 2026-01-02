
import { GoogleGenAI } from "@google/genai";
import { PalletPosition } from "../types";

export const getInventoryInsights = async (inventory: PalletPosition[], query: string) => {
  // Always use the direct process.env.API_KEY with the correct named parameter
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  // Using gemini-3-pro-preview for complex reasoning and technical logistics tasks
  const model = 'gemini-3-pro-preview';
  const occupiedItems = inventory.filter(p => p.productId || p.productName);
  
  const systemInstruction = `
    Você é um especialista em logística e gestão de armazéns do sistema RackMaster.
    Configuração Atual: 4 Porta-Paletes (identificados como A, B, C e D).
    Capacidade: Cada porta-pallet possui 5 níveis (A a E) e 66 posições por nível.
    Inventário Atual (somente posições ocupadas): ${JSON.stringify(occupiedItems)}
    
    Sua tarefa é ajudar o usuário a localizar itens, sugerir espaços livres ou otimizar a distribuição de carga para reduzir o tempo de movimentação.
    Responda em Português do Brasil de forma concisa, técnica e útil.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: query,
      config: { systemInstruction, temperature: 0.7 },
    });
    // response.text is a property that returns the generated string output
    return response.text;
  } catch (error) {
    return "Ocorreu um erro ao processar os dados do inventário com a IA.";
  }
};

export const optimizeInventoryLayout = async (inventory: PalletPosition[]) => {
  // Always use the direct process.env.API_KEY with the correct named parameter
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  // Using gemini-3-pro-preview for advanced optimization logic
  const model = 'gemini-3-pro-preview';
  const systemInstruction = "Você é um consultor de logística. Sugira um plano de otimização de espaço para um armazém de 4 porta-paletes (A, B, C, D). Foque em agrupamento por categoria de produto ou ID para facilitar a separação.";
  try {
    const response = await ai.models.generateContent({
      model,
      contents: "Analise o inventário e gere um plano de otimização.",
      config: { systemInstruction, temperature: 0.4 },
    });
    // Access the text property directly from the response
    return response.text;
  } catch (error) {
    return "Erro ao gerar plano de otimização.";
  }
};
