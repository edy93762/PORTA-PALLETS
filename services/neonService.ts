
import { Pool } from '@neondatabase/serverless';
import { PalletPosition, MasterProduct } from "../types";

const TABLE_NAME = 'inventory_positions';
const MASTER_TABLE = 'master_products';

const getPool = (connectionString: string) => {
  return new Pool({ connectionString });
};

export const initializeDatabase = async (connectionString: string) => {
  const pool = getPool(connectionString);
  try {
    // Tabela de estoque
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        id TEXT PRIMARY KEY,
        rack TEXT NOT NULL,
        level INTEGER NOT NULL,
        position INTEGER NOT NULL,
        product_id TEXT,
        product_name TEXT,
        quantity INTEGER DEFAULT 0,
        slots INTEGER DEFAULT 1,
        last_updated TEXT
      );
    `);

    // Tenta adicionar a coluna slots se não existir
    try {
        await pool.query(`ALTER TABLE ${TABLE_NAME} ADD COLUMN IF NOT EXISTS slots INTEGER DEFAULT 1;`);
    } catch (e) { /* Coluna pode já existir */ }

    // Tabela de cadastro de produtos
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${MASTER_TABLE} (
        product_id TEXT PRIMARY KEY,
        product_name TEXT NOT NULL,
        standard_quantity INTEGER NOT NULL
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
      slots: row.slots || 1,
      lastUpdated: row.last_updated
    }));
  } finally {
    await pool.end();
  }
};

export const fetchMasterProductsFromDB = async (connectionString: string): Promise<MasterProduct[]> => {
  const pool = getPool(connectionString);
  try {
    const { rows } = await pool.query(`SELECT * FROM ${MASTER_TABLE}`);
    return rows.map((row: any) => ({
      productId: row.product_id,
      productName: row.product_name,
      standardQuantity: row.standard_quantity
    }));
  } finally {
    await pool.end();
  }
};

export const saveMasterProductToDB = async (connectionString: string, item: MasterProduct) => {
  const pool = getPool(connectionString);
  try {
    await pool.query(`
      INSERT INTO ${MASTER_TABLE} (product_id, product_name, standard_quantity)
      VALUES ($1, $2, $3)
      ON CONFLICT (product_id) 
      DO UPDATE SET 
        product_name = EXCLUDED.product_name,
        standard_quantity = EXCLUDED.standard_quantity;
    `, [item.productId, item.productName, item.standardQuantity]);
  } finally {
    await pool.end();
  }
};

export const deleteMasterProductFromDB = async (connectionString: string, productId: string) => {
  const pool = getPool(connectionString);
  try {
    await pool.query(`DELETE FROM ${MASTER_TABLE} WHERE product_id = $1`, [productId]);
  } finally {
    await pool.end();
  }
};

export const saveItemToDB = async (connectionString: string, item: PalletPosition) => {
  const pool = getPool(connectionString);
  try {
    await pool.query(`
      INSERT INTO ${TABLE_NAME} (id, rack, level, position, product_id, product_name, quantity, slots, last_updated)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) 
      DO UPDATE SET 
        product_id = EXCLUDED.product_id,
        product_name = EXCLUDED.product_name,
        quantity = EXCLUDED.quantity,
        slots = EXCLUDED.slots,
        last_updated = EXCLUDED.last_updated;
    `, [item.id.trim(), item.rack, item.level, item.position, item.productId, item.productName, item.quantity, item.slots || 1, item.lastUpdated]);
  } finally {
    await pool.end();
  }
};

export const deleteItemFromDB = async (connectionString: string, item: PalletPosition) => {
  const pool = getPool(connectionString);
  try {
    await pool.query(`
      DELETE FROM ${TABLE_NAME} 
      WHERE id = $1 
      OR (rack = $2 AND level = $3 AND position = $4)
    `, [item.id.trim(), item.rack, item.level, item.position]);
  } finally {
    await pool.end();
  }
};
