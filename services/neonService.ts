
import { Pool } from '@neondatabase/serverless';
import { PalletPosition, MasterProduct, AppUser, ActivityLog, RackId } from "../types";

const TABLE_NAME = 'inventory_positions';
const MASTER_TABLE = 'master_products';
const USERS_TABLE = 'app_users';
const LOGS_TABLE = 'activity_logs';

const getPool = (connectionString: string) => {
  return new Pool({ connectionString });
};

export const initializeDatabase = async (connectionString: string) => {
  const pool = getPool(connectionString);
  try {
    // Adiciona a coluna created_at se não existir (para migração suave)
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
        last_updated TEXT,
        created_at TEXT
      );
    `);
    
    // Tenta adicionar a coluna created_at caso a tabela já exista sem ela
    try {
        await pool.query(`ALTER TABLE ${TABLE_NAME} ADD COLUMN IF NOT EXISTS created_at TEXT`);
    } catch (e) {
        // Ignora erro se coluna já existe
    }

    // Tabela master_products com nomes exatos da imagem (product_id, product_name, standard_quantity)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${MASTER_TABLE} (
        product_id TEXT PRIMARY KEY,
        product_name TEXT NOT NULL,
        standard_quantity INTEGER NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${USERS_TABLE} (
        username TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'operator',
        created_at TEXT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${LOGS_TABLE} (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        location TEXT,
        timestamp TEXT NOT NULL
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

export const cleanupOldLogs = async (connectionString: string) => {
  const pool = getPool(connectionString);
  try {
    await pool.query(`DELETE FROM ${LOGS_TABLE} WHERE CAST(timestamp AS TIMESTAMP) < (CURRENT_TIMESTAMP - INTERVAL '30 days')`);
  } catch (err) {
    console.warn("Falha ao limpar logs:", err);
  } finally {
    await pool.end();
  }
};

export const loginUserDB = async (connectionString: string, user: string, pass: string): Promise<AppUser | null> => {
  const pool = getPool(connectionString);
  try {
    const { rows } = await pool.query(`SELECT * FROM ${USERS_TABLE} WHERE username = $1 AND password = $2`, [user.trim().toLowerCase(), pass]);
    return rows.length > 0 ? rows[0] : null;
  } finally {
    await pool.end();
  }
};

export const fetchAllUsersFromDB = async (connectionString: string): Promise<AppUser[]> => {
  const pool = getPool(connectionString);
  try {
    const { rows } = await pool.query(`SELECT username, role, created_at FROM ${USERS_TABLE} ORDER BY username ASC`);
    return rows;
  } finally {
    await pool.end();
  }
};

export const updateUserRoleInDB = async (connectionString: string, username: string, newRole: 'admin' | 'operator') => {
  const pool = getPool(connectionString);
  try {
    await pool.query(`UPDATE ${USERS_TABLE} SET role = $1 WHERE username = $2`, [newRole, username]);
  } finally {
    await pool.end();
  }
};

export const saveUserToDB = async (connectionString: string, user: AppUser) => {
  const pool = getPool(connectionString);
  try {
    await pool.query(`
      INSERT INTO ${USERS_TABLE} (username, password, role, created_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password;
    `, [user.username.trim().toLowerCase(), user.password, user.role, new Date().toISOString()]);
  } finally {
    await pool.end();
  }
};

export const saveLogToDB = async (connectionString: string, log: ActivityLog) => {
  const pool = getPool(connectionString);
  try {
    await pool.query(`
      INSERT INTO ${LOGS_TABLE} (username, action, details, location, timestamp)
      VALUES ($1, $2, $3, $4, $5)
    `, [log.username, log.action, log.details, log.location, log.timestamp]);
  } finally {
    await pool.end();
  }
};

export const fetchLogsFromDB = async (connectionString: string): Promise<ActivityLog[]> => {
  const pool = getPool(connectionString);
  try {
    const { rows } = await pool.query(`SELECT * FROM ${LOGS_TABLE} ORDER BY timestamp DESC LIMIT 100`);
    return rows;
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
      rack: row.rack as RackId,
      level: Number(row.level),
      position: Number(row.position),
      productId: row.product_id || '',
      productName: row.product_name || '',
      quantity: Number(row.quantity || 0),
      slots: Number(row.slots || 1),
      lastUpdated: row.last_updated,
      createdAt: row.created_at || row.last_updated // Fallback se não tiver created_at
    }));
  } finally {
    await pool.end();
  }
};

export const fetchMasterProductsFromDB = async (connectionString: string): Promise<MasterProduct[]> => {
  const pool = getPool(connectionString);
  try {
    // Busca usando as colunas corretas (product_id, product_name, standard_quantity)
    const { rows } = await pool.query(`SELECT * FROM ${MASTER_TABLE} ORDER BY product_name ASC`);
    return rows.map((row: any) => ({
      productId: String(row.product_id || '').trim(),
      productName: String(row.product_name || '').trim(),
      standardQuantity: Number(row.standard_quantity || 0)
    }));
  } catch (err) {
    console.error("Erro ao buscar produtos mestres:", err);
    return [];
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
      ON CONFLICT (product_id) DO UPDATE SET product_name = EXCLUDED.product_name, standard_quantity = EXCLUDED.standard_quantity;
    `, [item.productId.trim().toUpperCase(), item.productName.trim().toUpperCase(), item.standardQuantity]);
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
    // created_at deve ser preservado se já existir. Se for novo insert, usa o valor passado ou data atual.
    // Usamos uma lógica de ON CONFLICT que preserva o created_at original se ele existir na tabela
    
    const now = new Date().toISOString();
    const createdAt = item.createdAt || now;

    await pool.query(`
      INSERT INTO ${TABLE_NAME} (id, rack, level, position, product_id, product_name, quantity, slots, last_updated, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET 
        product_id = EXCLUDED.product_id,
        product_name = EXCLUDED.product_name,
        quantity = EXCLUDED.quantity,
        slots = EXCLUDED.slots,
        last_updated = EXCLUDED.last_updated;
        -- NÃO atualizamos created_at no conflito para manter o FIFO
    `, [item.id, item.rack, item.level, item.position, item.productId, item.productName, item.quantity, item.slots, item.lastUpdated, createdAt]);
  } finally {
    await pool.end();
  }
};

export const deleteItemFromDB = async (connectionString: string, item: PalletPosition) => {
  const pool = getPool(connectionString);
  try {
    await pool.query(`DELETE FROM ${TABLE_NAME} WHERE id = $1`, [item.id]);
  } finally {
    await pool.end();
  }
};
