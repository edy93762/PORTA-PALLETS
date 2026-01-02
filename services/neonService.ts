
import { Pool } from '@neondatabase/serverless';
import { PalletPosition } from "../types";

// Nome da tabela no banco de dados
const TABLE_NAME = 'inventory_positions';

// Inicializa a conexão
const getPool = (connectionString: string) => {
  return new Pool({ connectionString });
};

// Cria a tabela se não existir
export const initializeDatabase = async (connectionString: string) => {
  const pool = getPool(connectionString);
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        id TEXT PRIMARY KEY,
        rack TEXT NOT NULL,
        level INTEGER NOT NULL,
        position INTEGER NOT NULL,
        product_id TEXT,
        product_name TEXT,
        quantity INTEGER DEFAULT 0,
        last_updated TEXT
      );
    `);
    return true;
  } catch (err) {
    console.error("Erro ao inicializar DB:", err);
    throw err;
  } finally {
    await pool.end();
  }
};

// Busca todo o inventário
export const fetchInventoryFromDB = async (connectionString: string): Promise<PalletPosition[]> => {
  const pool = getPool(connectionString);
  try {
    const { rows } = await pool.query(`SELECT * FROM ${TABLE_NAME}`);
    
    return rows.map((row: any) => ({
      id: row.id,
      rack: row.rack,
      level: row.level,
      position: row.position,
      productId: row.product_id,
      productName: row.product_name,
      quantity: row.quantity,
      lastUpdated: row.last_updated
    }));
  } catch (err) {
    console.error("Erro ao buscar inventário:", err);
    throw err;
  } finally {
    await pool.end();
  }
};

// Salva ou Atualiza (Upsert) um item
export const saveItemToDB = async (connectionString: string, item: PalletPosition) => {
  const pool = getPool(connectionString);
  try {
    const query = `
      INSERT INTO ${TABLE_NAME} (id, rack, level, position, product_id, product_name, quantity, last_updated)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) 
      DO UPDATE SET 
        product_id = EXCLUDED.product_id,
        product_name = EXCLUDED.product_name,
        quantity = EXCLUDED.quantity,
        last_updated = EXCLUDED.last_updated;
    `;
    const values = [
      item.id.trim(),
      item.rack,
      item.level,
      item.position,
      item.productId,
      item.productName,
      item.quantity,
      item.lastUpdated
    ];
    await pool.query(query, values);
  } catch (err) {
    console.error("Erro ao salvar item:", err);
    throw err;
  } finally {
    await pool.end();
  }
};

// Deleta um item de forma robusta (Por ID ou Coordenada)
export const deleteItemFromDB = async (connectionString: string, item: PalletPosition) => {
  const pool = getPool(connectionString);
  try {
    // Modificado para apagar onde o ID bate OU as coordenadas batem.
    // Isso resolve problemas onde o ID string pode ter sido gerado com formato diferente
    const query = `
      DELETE FROM ${TABLE_NAME} 
      WHERE id = $1 
      OR (rack = $2 AND level = $3 AND position = $4)
    `;
    const values = [
      item.id.trim(), 
      item.rack, 
      item.level, 
      item.position
    ];
    await pool.query(query, values);
  } catch (err) {
    console.error("Erro ao deletar item:", err);
    throw err;
  } finally {
    await pool.end();
  }
};
