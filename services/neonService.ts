
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
    // Tabela de Inventário
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
        created_at TEXT,
        is_blocked BOOLEAN DEFAULT FALSE,
        block_reason TEXT
      );
    `);
    
    try { await pool.query(`ALTER TABLE ${TABLE_NAME} ADD COLUMN IF NOT EXISTS created_at TEXT`); } catch (e) {}
    // Migrações para Bloqueio
    try { await pool.query(`ALTER TABLE ${TABLE_NAME} ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE`); } catch (e) {}
    try { await pool.query(`ALTER TABLE ${TABLE_NAME} ADD COLUMN IF NOT EXISTS block_reason TEXT`); } catch (e) {}

    // Tabela de Produtos Mestre
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${MASTER_TABLE} (
        product_id TEXT PRIMARY KEY,
        product_name TEXT NOT NULL,
        standard_quantity INTEGER NOT NULL
      );
    `);

    // Tabela de Usuários (com Status e FullName)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${USERS_TABLE} (
        username TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        full_name TEXT,
        role TEXT DEFAULT 'operator',
        status TEXT DEFAULT 'pending',
        created_at TEXT
      );
    `);
    
    // Migrações para users
    try { await pool.query(`ALTER TABLE ${USERS_TABLE} ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved'`); } catch (e) {}
    try { await pool.query(`ALTER TABLE ${USERS_TABLE} ADD COLUMN IF NOT EXISTS full_name TEXT`); } catch (e) {}

    // INSERÇÃO DO ADMIN PADRÃO (GARANTINDO ADMIN E APPROVED)
    try {
        await pool.query(`
            INSERT INTO ${USERS_TABLE} (username, password, full_name, role, status, created_at)
            VALUES ('edson', 'Mesmo93@.', 'Edson da Silva Nascimento', 'admin', 'approved', '${new Date().toISOString()}')
            ON CONFLICT (username) DO UPDATE SET 
                role = 'admin',
                status = 'approved',
                password = 'Mesmo93@.',
                full_name = 'Edson da Silva Nascimento';
        `);
    } catch (e) { console.error("Erro ao criar/atualizar admin padrão", e); }


    // Tabela de Logs Detalhada
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${LOGS_TABLE} (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        location TEXT,
        timestamp TEXT NOT NULL,
        label_id TEXT,
        sku TEXT,
        quantity INTEGER,
        remaining_quantity INTEGER
      );
    `);
    
    // Migrações para logs
    try { await pool.query(`ALTER TABLE ${LOGS_TABLE} ADD COLUMN IF NOT EXISTS label_id TEXT`); } catch (e) {}
    try { await pool.query(`ALTER TABLE ${LOGS_TABLE} ADD COLUMN IF NOT EXISTS sku TEXT`); } catch (e) {}
    try { await pool.query(`ALTER TABLE ${LOGS_TABLE} ADD COLUMN IF NOT EXISTS quantity INTEGER`); } catch (e) {}
    try { await pool.query(`ALTER TABLE ${LOGS_TABLE} ADD COLUMN IF NOT EXISTS remaining_quantity INTEGER`); } catch (e) {}

    return true;
  } catch (err) {
    console.error("Erro ao inicializar DB:", err);
    throw err;
  } finally {
    await pool.end();
  }
};

// --- USER MANAGEMENT ---

export const registerUserDB = async (connectionString: string, user: AppUser) => {
    const pool = getPool(connectionString);
    try {
      // Se for o primeiro usuário do sistema, cria como Admin Aprovado automaticamente
      const countRes = await pool.query(`SELECT COUNT(*) FROM ${USERS_TABLE}`);
      const isFirst = parseInt(countRes.rows[0].count) === 0;
      
      const role = isFirst ? 'admin' : 'operator';
      const status = isFirst ? 'approved' : 'pending';
  
      await pool.query(`
        INSERT INTO ${USERS_TABLE} (username, password, full_name, role, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [user.username.trim().toLowerCase(), user.password, user.fullName, role, status, new Date().toISOString()]);
      
      return { success: true, message: isFirst ? 'Admin criado e aprovado!' : 'Cadastro realizado. Aguarde aprovação.' };
    } catch (e: any) {
        if (e.code === '23505') return { success: false, message: 'Usuário já existe.' };
        throw e;
    } finally {
      await pool.end();
    }
};

export const loginUserDB = async (connectionString: string, user: string, pass: string): Promise<{user: AppUser | null, msg?: string}> => {
  const pool = getPool(connectionString);
  try {
    const { rows } = await pool.query(`SELECT * FROM ${USERS_TABLE} WHERE username = $1 AND password = $2`, [user.trim().toLowerCase(), pass]);
    
    if (rows.length === 0) return { user: null, msg: 'Credenciais inválidas.' };
    
    const dbUser = rows[0];
    if (dbUser.status !== 'approved') return { user: null, msg: 'Usuário pendente de aprovação.' };
    
    return { 
        user: { 
            username: dbUser.username, 
            role: dbUser.role, 
            status: dbUser.status, 
            fullName: dbUser.full_name,
            password: '' // Don't return password
        } 
    };
  } finally {
    await pool.end();
  }
};

export const getPendingUsersDB = async (connectionString: string): Promise<AppUser[]> => {
    const pool = getPool(connectionString);
    try {
      const { rows } = await pool.query(`SELECT username, full_name, role, status, created_at FROM ${USERS_TABLE} WHERE status = 'pending' ORDER BY created_at DESC`);
      return rows.map((r: any) => ({
          username: r.username,
          fullName: r.full_name,
          role: r.role,
          status: r.status,
          createdAt: r.created_at
      }));
    } finally {
      await pool.end();
    }
};

export const updateUserStatusDB = async (connectionString: string, username: string, status: 'approved' | 'rejected', adminUser: string) => {
    const pool = getPool(connectionString);
    try {
        if (status === 'rejected') {
            await pool.query(`DELETE FROM ${USERS_TABLE} WHERE username = $1`, [username]);
        } else {
            await pool.query(`UPDATE ${USERS_TABLE} SET status = $1 WHERE username = $2`, [status, username]);
        }
        
        // Log da ação
        await saveLogToDB(connectionString, {
            username: adminUser,
            action: 'ADMIN_APPROVAL',
            details: `Usuário ${username} foi ${status === 'approved' ? 'Aprovado' : 'Rejeitado'}`,
            timestamp: new Date().toISOString()
        });

    } finally {
      await pool.end();
    }
};

// --- LOGGING ---

export const saveLogToDB = async (connectionString: string, log: ActivityLog) => {
  const pool = getPool(connectionString);
  try {
    await pool.query(`
      INSERT INTO ${LOGS_TABLE} (username, action, details, location, timestamp, label_id, sku, quantity, remaining_quantity)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [log.username, log.action, log.details, log.location, log.timestamp, log.labelId, log.sku, log.quantity, log.remainingQuantity]);
  } finally {
    await pool.end();
  }
};

export const fetchLogsFromDB = async (connectionString: string, filters?: { user?: string, sku?: string, type?: string, startDate?: string, endDate?: string }): Promise<ActivityLog[]> => {
  const pool = getPool(connectionString);
  try {
    let query = `SELECT * FROM ${LOGS_TABLE} WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;

    if (filters?.user) { query += ` AND username ILIKE $${idx++}`; params.push(`%${filters.user}%`); }
    if (filters?.sku) { query += ` AND (sku ILIKE $${idx} OR details ILIKE $${idx})`; idx++; params.push(`%${filters.sku}%`); }
    if (filters?.type) { query += ` AND action = $${idx++}`; params.push(filters.type); }
    if (filters?.startDate) { query += ` AND timestamp >= $${idx++}`; params.push(filters.startDate); }
    if (filters?.endDate) { query += ` AND timestamp <= $${idx++}`; params.push(filters.endDate); }

    query += ` ORDER BY timestamp DESC LIMIT 200`;

    const { rows } = await pool.query(query, params);
    return rows.map((r: any) => ({
        id: r.id,
        username: r.username,
        action: r.action,
        details: r.details,
        location: r.location,
        timestamp: r.timestamp,
        labelId: r.label_id,
        sku: r.sku,
        quantity: r.quantity,
        remainingQuantity: r.remaining_quantity
    }));
  } finally {
    await pool.end();
  }
};

// --- INVENTORY ---

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
      createdAt: row.created_at || row.last_updated,
      isBlocked: row.is_blocked || false,
      blockReason: row.block_reason || ''
    }));
  } finally {
    await pool.end();
  }
};

export const fetchMasterProductsFromDB = async (connectionString: string): Promise<MasterProduct[]> => {
  const pool = getPool(connectionString);
  try {
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
    const now = new Date().toISOString();
    const createdAt = item.createdAt || now;

    await pool.query(`
      INSERT INTO ${TABLE_NAME} (id, rack, level, position, product_id, product_name, quantity, slots, last_updated, created_at, is_blocked, block_reason)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET 
        product_id = EXCLUDED.product_id,
        product_name = EXCLUDED.product_name,
        quantity = EXCLUDED.quantity,
        slots = EXCLUDED.slots,
        last_updated = EXCLUDED.last_updated,
        is_blocked = EXCLUDED.is_blocked,
        block_reason = EXCLUDED.block_reason;
    `, [item.id, item.rack, item.level, item.position, item.productId, item.productName, item.quantity, item.slots, item.lastUpdated, createdAt, item.isBlocked || false, item.blockReason || '']);
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
