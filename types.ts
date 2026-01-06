
export type RackId = '1' | '2' | '3' | '4' | 'A' | 'B' | 'C' | 'D' | 'G1' | 'G2' | 'G3' | 'FLOOR';

export interface PalletPosition {
  id: string; // Endereço físico: rack-level-pos (ex: A-1-1) ou FLOOR-UUID
  rack: RackId;
  level: number;
  position: number;
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
  action: 'ENTRADA' | 'SAIDA' | 'SAIDA_PARCIAL' | 'CADASTRO' | 'EXCLUSAO' | 'ADMIN_APPROVAL' | 'BLOQUEIO' | 'DESBLOQUEIO';
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
