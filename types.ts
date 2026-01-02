
export type RackId = 'A' | 'B' | 'C' | 'D';

export interface PalletPosition {
  id: string; // Endereço físico: rack-level-pos (ex: AA1)
  rack: RackId;
  level: number;
  position: number;
  productId?: string;    // ID do Produto
  productName?: string;  // Descrição/Nome
  quantity?: number;
  slots?: number;        // Quantidade de vagas ocupadas (1 ou 2)
  lastUpdated?: string;
}

export interface MasterProduct {
  productId: string;
  productName: string;
  standardQuantity: number;
}

export interface AppUser {
  username: string;
  password?: string;
  role: 'admin' | 'operator';
  createdAt?: string;
}

export interface ActivityLog {
  id?: number;
  username: string;
  action: 'ENTRADA' | 'SAIDA' | 'CADASTRO' | 'EXCLUSAO';
  details: string;
  timestamp: string;
  location?: string;
}

export interface InventoryStats {
  totalPositions: number;
  occupiedPositions: number;
  occupancyRate: number;
}
