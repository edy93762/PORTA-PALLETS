
import { Pool } from '@neondatabase/serverless';
import { PalletPosition, MasterProduct, AppUser, ActivityLog } from "../types";

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
    // Tabela de estoque principal
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

    // Migração de Segurança: Garante que a coluna 'slots' exista em ambientes já criados
    try {
      await pool.query(`ALTER TABLE ${TABLE_NAME} ADD COLUMN IF NOT EXISTS slots INTEGER DEFAULT 1;`);
    } catch (e) {
      // Ignora se a coluna já existir
    }

    // Tabela de cadastro mestre de SKUs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${MASTER_TABLE} (
        product_id TEXT PRIMARY KEY,
        product_name TEXT NOT NULL,
        standard_quantity INTEGER NOT NULL
      );
    `);

    // Tabela de usuários e acesso
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${USERS_TABLE} (
        username TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'operator',
        created_at TEXT
      );
    `);

    // Inserir usuário mestre padrão (almox / Shopee@2026)
    await pool.query(`
      INSERT INTO ${USERS_TABLE} (username, password, role, created_at)
      VALUES ('almox', 'Shopee@2026', 'admin', $1)
      ON CONFLICT DO NOTHING;
    `, [new Date().toISOString()]);

    // Tabela de histórico de ações (Logs)
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
    console.error("Erro crítico na inicialização do Banco de Dados:", err);
    throw err;
  } finally {
    await pool.end();
  }
};

// --- FUNÇÕES DE USUÁRIO ---
export const fetchUsersFromDB = async (connectionString: string): Promise<AppUser[]> => {
  const pool = getPool(connectionString);
  try {
    const { rows } = await pool.query(`SELECT username, role, created_at FROM ${USERS_TABLE} ORDER BY username ASC`);
    return rows.map(r => ({ username: r.username, role: r.role, createdAt: r.created_at }));
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
      ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password, role = EXCLUDED.role;
    `, [user.username, user.password, user.role, new Date().toISOString()]);
  } finally {
    await pool.end();
  }
};

export const loginUserDB = async (connectionString: string, user: string, pass: string): Promise<AppUser | null> => {
  const pool = getPool(connectionString);
  try {
    const { rows } = await pool.query(`SELECT * FROM ${USERS_TABLE} WHERE username = $1 AND password = $2`, [user, pass]);
    return rows.length > 0 ? rows[0] : null;
  } finally {
    await pool.end();
  }
};

// --- FUNÇÕES DE LOG ---
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
    const { rows } = await pool.query(`SELECT * FROM ${LOGS_TABLE} ORDER BY timestamp DESC LIMIT 150`);
    return rows.map(r => ({
      id: r.id,
      username: r.username,
      action: r.action as ActivityLog['action'],
      details: r.details,
      location: r.location,
      timestamp: r.timestamp
    }));
  } finally {
    await pool.end();
  }
};

// --- FUNÇÕES DE ESTOQUE ---
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
      ON CONFLICT (product_id) DO UPDATE SET product_name = EXCLUDED.product_name, standard_quantity = EXCLUDED.standard_quantity;
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
    // Garantir que não existam campos nulos ou indefinidos antes de enviar ao Postgres
    const payload = [
      item.id.trim(),
      item.rack,
      item.level,
      item.position,
      item.productId || '',
      item.productName || '',
      item.quantity || 0,
      item.slots || 1,
      item.lastUpdated || new Date().toISOString()
    ];

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
    `, payload);
  } finally {
    await pool.end();
  }
};

export const deleteItemFromDB = async (connectionString: string, item: PalletPosition) => {
  const pool = getPool(connectionString);
  try {
    await pool.query(`DELETE FROM ${TABLE_NAME} WHERE id = $1`, [item.id.trim()]);
  } finally {
    await pool.end();
  }
};
