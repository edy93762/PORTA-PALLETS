
export type RackId = 'A' | 'B' | 'C' | 'D';

export interface PalletPosition {
  id: string; // Endereço físico: rack-level-pos (ex: AA1)
  rack: RackId;
  level: number;
  position: number;
  productId?: string;    // ID do Produto
  productName?: string;  // Descrição/Nome
  quantity?: number;
  lastUpdated?: string;
}

export interface InventoryStats {
  totalPositions: number;
  occupiedPositions: number;
  occupancyRate: number;
}
