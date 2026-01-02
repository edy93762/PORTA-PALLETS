
import { PalletPosition, RackId } from "../types";

// Gera o conteúdo CSV a partir do inventário atual
export const generateCSV = (inventory: PalletPosition[]): string => {
  const header = "ENDERECO_FISICO,RACK,NIVEL,POSICAO,ID_PRODUTO,NOME_DESCRICAO,QUANTIDADE,ULTIMA_ATUALIZACAO\n";
  const rows = inventory.map(p => {
    return `"${p.id}","${p.rack}","${p.level}","${p.position}","${p.productId?.replace(/"/g, '""') || ''}","${p.productName?.replace(/"/g, '""') || ''}",${p.quantity || 0},"${p.lastUpdated || ''}"`;
  }).join("\n");
  return header + rows;
};

// Processa um arquivo CSV carregado pelo usuário
export const parseCSV = (csvText: string): PalletPosition[] => {
  try {
    const lines = csvText.split("\n").filter(line => line.trim().length > 0);
    if (lines.length <= 1) return [];

    return lines.slice(1).map(line => {
      const v = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      return {
        id: v[0]?.replace(/"/g, '') || '',
        rack: v[1]?.replace(/"/g, '') as RackId,
        level: parseInt(v[2]?.replace(/"/g, '') || '1'),
        position: parseInt(v[3]?.replace(/"/g, '') || '1'),
        productId: v[4]?.replace(/"/g, '') || '',
        productName: v[5]?.replace(/"/g, '') || '',
        quantity: parseInt(v[6]?.replace(/"/g, '') || '0'),
        lastUpdated: v[7]?.replace(/"/g, '')
      };
    }).filter(p => p.id && (p.productName || p.productId));
  } catch (error) {
    console.error("Erro ao processar CSV", error);
    return [];
  }
};
