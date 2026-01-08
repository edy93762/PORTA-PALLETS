
// Adicionando 'D' à união de RackId para suportar o quarto porta-palete conforme configurado no App
export type RackId = 'A' | 'B' | 'C' | 'D' | '1' | '2' | '3' | '4' | 'FLOOR' | 'GAIOLA';

export interface PalletPosition {
  id: string; // Endereço físico: rack-level-pos
  rack: RackId;
  level: number; // 1=A, 2=B... para Prateleiras | 1, 2, 3... para PP
  position: number; // 1, 2, 3 (Gaiolas) ou 1..60 (PP)
  productId?: string;    // ID do Produto
  productName?: string;  // Descrição/Nome
  quantity?: number;
  slots?: number;        // Quantidade de vagas ocupadas (1 ou 2)
  lastUpdated?: string;
  createdAt?: string;    // Data de entrada original (Crucial para FIFO)
  isBlocked?: boolean;   // Vaga bloqueada manualmente
  blockReason?: string;  // Motivo do bloqueio
}

export interface MasterProduct {
  productId: string;
  productName: string;
  standardQuantity: number;
}

export interface AppUser {
  username: string;
  password?: string;
  fullName?: string;
  role: 'admin' | 'operator';
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: string;
}

export interface ActivityLog {
  id?: number;
  username: string;
  action: 'ENTRADA' | 'SAIDA' | 'SAIDA_PARCIAL' | 'CADASTRO' | 'EXCLUSAO' | 'ADMIN_APPROVAL' | 'BLOQUEIO' | 'DESBLOQUEIO' | 'MOVIMENTACAO';
  details: string; // SKU, Nome do Item, Qtd
  timestamp: string;
  location?: string; // Endereço
  labelId?: string; // ID da etiqueta
  sku?: string;
  quantity?: number;
  remainingQuantity?: number; // Para saída parcial
}

export interface InventoryStats {
  totalPositions: number;
  occupiedPositions: number;
  occupancyRate: number;
}
