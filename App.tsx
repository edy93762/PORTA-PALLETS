// @ts-nocheck
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Package, Warehouse, X, ScanLine, Printer, Loader2, 
  ClipboardList, Trash2, Menu, AlertCircle, CheckCircle2, Search as SearchIcon, 
  QrCode, ArrowDownRight, ListChecks, History, LogOut, ArrowRightCircle, UserPlus, ShieldCheck, MapPin, Info, 
  FileDown, PlusCircle, Filter, Save, PackageMinus, PackageX, Ban, Calculator, Plus, ArrowRight, Minus, Calendar, User, Users, ShieldAlert, PackagePlus, Pencil, LayoutGrid, Clock, AlertTriangle, ArrowUpAZ, ArrowRightToLine
} from 'lucide-react';
import { PalletPosition, RackId, MasterProduct, AppUser, ActivityLog } from './types';
import { QRCodeModal } from './components/QRCodeModal';
import { ScannerModal } from './components/ScannerModal';
import { 
  initializeDatabase, 
  fetchInventoryFromDB, 
  saveItemToDB, 
  deleteItemFromDB,
  fetchMasterProductsFromDB,
  saveMasterProductToDB,
  deleteMasterProductFromDB,
  loginUserDB,
  saveUserToDB,
  saveLogToDB,
  fetchLogsFromDB,
  cleanupOldLogs,
  fetchAllUsersFromDB,
  updateUserRoleInDB
} from './services/neonService';
import { jsPDF } from "jspdf";
import QRCode from "qrcode";

const RACKS: RackId[] = ['A', 'B', 'C', 'D'];
const LEVEL_LABELS = ['A', 'B', 'C', 'D', 'E'];
const POSITIONS_PER_LEVEL = 66;
const FIXED_DB_STRING = "postgresql://neondb_owner:npg_JaZLTzrqMc09@ep-fragrant-cherry-ac95x95d-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require";
const SECRET_REGISTRATION_KEY = "Shopee@2026";
const STORAGE_KEY = "almox_pro_user_session";

// Definição de posições bloqueadas (Pilares/Inutilizáveis)
const BLOCKED_LOCATIONS = [
  { rack: 'A', level: 2, positions: [35, 36] } // Rack A, Nível B (índice 2 na lógica 1-based), posições 35 e 36
];

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return null; }
    }
    return null;
  });

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [loginData, setLoginData] = useState({ user: '', pass: '', secret: '' });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const [inventory, setInventory] = useState<PalletPosition[]>([]);
  const [masterProducts, setMasterProducts] = useState<MasterProduct[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  
  const [isMasterMenuOpen, setIsMasterMenuOpen] = useState(false);
  const [isInventoryReportOpen, setIsInventoryReportOpen] = useState(false);
  const [isPrintMenuOpen, setIsPrintMenuOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  
  // Novos Menus
  const [isExternalMenuOpen, setIsExternalMenuOpen] = useState(false); // Pallets Externos (FLOOR)
  const [isFIFOMenuOpen, setIsFIFOMenuOpen] = useState(false); // Consulta FIFO

  // Estado para Gestão de Usuários (Admin)
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);

  // Estado para o formulário de novo item (SKU) e Edição
  const [isAddingNewSKU, setIsAddingNewSKU] = useState(false);
  const [newSKUData, setNewSKUData] = useState({ id: '', name: '', qty: 0 });
  const [editingProduct, setEditingProduct] = useState<MasterProduct | null>(null);
  
  const [activeRack, setActiveRack] = useState<RackId>('A');
  const [activeLevelIndex, setActiveLevelIndex] = useState<number>(0); 
  
  // Estado para Entrada Manual (Vaga Vazia ou Floor)
  const [selectedPosition, setSelectedPosition] = useState<PalletPosition | null>(null);
  const [manualEntryData, setManualEntryData] = useState({ sku: '', qty: '' });

  const [palletDetails, setPalletDetails] = useState<PalletPosition | null>(null);
  
  // Estado para Entrada Automática (Bulk)
  const [isBulkEntryOpen, setIsBulkEntryOpen] = useState(false);
  const [bulkEntryPriority, setBulkEntryPriority] = useState<string>('DEFAULT'); // Prioridade: DEFAULT, RACK_A, RACK_B..., PICKING
  
  // Novo estado para prioridade de posição (Start of aisle priority)
  const [bulkPosRange, setBulkPosRange] = useState({ enabled: false, end: 26 });

  const [bulkEntryData, setBulkEntryData] = useState({ 
    productId: '', 
    totalQuantity: 0,
    calculated: false,
    results: [] as { type: 'FULL' | 'PARTIAL', qty: number, location: string, rack: string, level: number, pos: number }[]
  });

  // Estados para Saída Parcial
  const [isPartialExitMode, setIsPartialExitMode] = useState(false);
  const [partialQuantity, setPartialQuantity] = useState<string>('');

  const [showQR, setShowQR] = useState<{ rack: string; level: number; pos: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [fifoSearchQuery, setFifoSearchQuery] = useState('');
  const [masterSearchQuery, setMasterSearchQuery] = useState('');
  const [isPrintingBatch, setIsPrintingBatch] = useState(false);
  const [printFilter, setPrintFilter] = useState<'all' | 'free'>('all');

  const loadInitialData = useCallback(async () => {
    try {
      const [inv, masters, history] = await Promise.all([
        fetchInventoryFromDB(FIXED_DB_STRING),
        fetchMasterProductsFromDB(FIXED_DB_STRING),
        fetchLogsFromDB(FIXED_DB_STRING)
      ]);
      setInventory(inv || []);
      setMasterProducts(masters || []);
      setLogs(history || []);
      setIsLoadingData(false);
    } catch (e) { 
      setIsLoadingData(false);
    }
  }, []);

  const loadUsersData = useCallback(async () => {
    if (currentUser?.role === 'admin') {
      try {
        const users = await fetchAllUsersFromDB(FIXED_DB_STRING);
        setAllUsers(users);
      } catch (e) {
        showFeedback('error', 'Erro ao carregar lista de usuários');
      }
    }
  }, [currentUser]);

  useEffect(() => {
    const init = async () => {
      try {
        await initializeDatabase(FIXED_DB_STRING);
        await cleanupOldLogs(FIXED_DB_STRING);
        await loadInitialData();
      } catch (e) { 
        console.error("Erro inicial no banco"); 
      }
    };
    init();
    const interval = setInterval(loadInitialData, 15000);
    return () => clearInterval(interval);
  }, [loadInitialData]);

  useEffect(() => {
    if (isUserManagementOpen) {
      loadUsersData();
    }
  }, [isUserManagementOpen, loadUsersData]);

  const showFeedback = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      const user = await loginUserDB(FIXED_DB_STRING, loginData.user, loginData.pass);
      if (user) {
        setCurrentUser(user);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
        showFeedback('success', `Bem-vindo, ${user.username}!`);
      } else {
        showFeedback('error', 'Login ou senha incorretos.');
      }
    } catch (e) {
      showFeedback('error', 'Erro de conexão.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem(STORAGE_KEY);
    setIsMobileMenuOpen(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginData.secret !== SECRET_REGISTRATION_KEY) {
      showFeedback('error', 'Código Secreto Inválido!');
      return;
    }
    setIsLoggingIn(true);
    try {
      const newUser = {
        username: loginData.user.trim().toLowerCase(),
        password: loginData.pass,
        role: 'operator' // Por padrão, todo novo registro é operador
      };
      await saveUserToDB(FIXED_DB_STRING, newUser);
      showFeedback('success', 'Usuário cadastrado! Já pode entrar.');
      setIsRegisterMode(false);
      setLoginData({ user: '', pass: '', secret: '' });
    } catch (e) {
      showFeedback('error', 'Erro ao cadastrar usuário.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleUpdateRole = async (targetUser: AppUser) => {
    if (currentUser?.role !== 'admin') return;
    if (targetUser.username === currentUser.username) {
        showFeedback('error', 'Você não pode alterar seu próprio cargo.');
        return;
    }
    const newRole = targetUser.role === 'admin' ? 'operator' : 'admin';
    const actionText = newRole === 'admin' ? 'PROMOVER para Admin' : 'REBAIXAR para Operador';
    if (confirm(`Deseja ${actionText} o usuário ${targetUser.username}?`)) {
        try {
            await updateUserRoleInDB(FIXED_DB_STRING, targetUser.username, newRole);
            await loadUsersData(); 
            showFeedback('success', `Cargo de ${targetUser.username} alterado para ${newRole}.`);
        } catch (e) {
            showFeedback('error', 'Erro ao atualizar cargo.');
        }
    }
  };

  // Função auxiliar para verificar ocupação
  const checkOccupancy = useCallback((rack: RackId, level: number, pos: number) => {
    return inventory.some(i => 
      (i.rack === rack && i.level === level && i.position === pos) || 
      (i.rack === rack && i.level === level && i.position === pos - 1 && i.slots === 2)
    );
  }, [inventory]);

  // Encontra a próxima vaga livre em todos os Racks
  const findNextFreeSpot = useCallback(() => {
    for (const rack of RACKS) {
       for (let level = 1; level <= LEVEL_LABELS.length; level++) {
         for (let pos = 1; pos <= POSITIONS_PER_LEVEL; pos++) {
            // Pula bloqueados
            const isBlocked = BLOCKED_LOCATIONS.some(b => b.rack === rack && b.level === level && b.positions.includes(pos));
            if (isBlocked) continue;
            
            // Verifica ocupação
            if (!checkOccupancy(rack, level, pos)) {
              return { rack, level, pos };
            }
         }
       }
    }
    return null; // Nenhuma vaga encontrada
  }, [checkOccupancy]);

  // Handler para submeter entrada manual
  const handleManualEntrySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPosition) return;
    
    // Validação básica
    if (!manualEntryData.sku || !manualEntryData.qty) {
       showFeedback('error', 'Preencha SKU e Quantidade!');
       return;
    }

    const qty = parseInt(manualEntryData.qty);
    if (qty <= 0) {
        showFeedback('error', 'Quantidade inválida!');
        return;
    }

    setIsProcessingAction(true);
    const opName = currentUser?.username || 'Sistema';
    const masterItem = masterProducts.find(m => m.productId === manualEntryData.sku);

    try {
        const newItem = {
            ...selectedPosition,
            productId: manualEntryData.sku,
            productName: masterItem?.productName || 'PRODUTO NÃO CADASTRADO',
            quantity: qty,
            slots: 1, // Default to 1 slot for manual entry
            lastUpdated: new Date().toISOString(),
            createdAt: new Date().toISOString()
        };

        await saveItemToDB(FIXED_DB_STRING, newItem);
        await saveLogToDB(FIXED_DB_STRING, {
            username: opName,
            action: 'ENTRADA',
            details: `ENTRADA MANUAL: ${newItem.productId} (${qty} UN)`,
            location: newItem.rack === 'FLOOR' ? 'EXTERNO (CHÃO)' : newItem.id,
            timestamp: new Date().toISOString()
        });

        await loadInitialData();
        showFeedback('success', 'Entrada realizada com sucesso!');
        setSelectedPosition(null);
        setManualEntryData({ sku: '', qty: '' });
    } catch (e) {
        showFeedback('error', 'Erro ao salvar entrada.');
    } finally {
        setIsProcessingAction(false);
    }
  };

  // ---- LÓGICA DE CÁLCULO DE PALLETS (ENTRADA INTELIGENTE) ----
  const handleCalculateBulkEntry = () => {
     if (!bulkEntryData.productId || bulkEntryData.totalQuantity <= 0) {
       showFeedback('error', 'Selecione um SKU e uma quantidade válida.');
       return;
     }

     const masterItem = masterProducts.find(m => m.productId === bulkEntryData.productId);
     if (!masterItem || !masterItem.standardQuantity) {
       showFeedback('error', 'Item sem quantidade padrão cadastrada. Cadastre na Base de Itens primeiro.');
       return;
     }

     const stdQty = masterItem.standardQuantity;
     const total = bulkEntryData.totalQuantity;
     const fullPalletsCount = Math.floor(total / stdQty);
     const remainder = total % stdQty;

     // Sugere vagas
     let tempInventory = [...inventory]; // Cópia para simular ocupação durante o loop
     const results = [];

     // Função interna para checar ocupação simulada
     const isSpotTaken = (r, l, p) => tempInventory.some(i => 
       (i.rack === r && i.level === l && i.position === p) ||
       (i.rack === r && i.level === l && i.position === p - 1 && i.slots === 2)
     ) || BLOCKED_LOCATIONS.some(b => b.rack === r && b.level === l && b.positions.includes(p));

     // Define a ordem de busca baseada na prioridade escolhida
     const getSearchPhases = () => {
        const allRacks = ['A', 'B', 'C', 'D'];
        const allLevels = [1, 2, 3, 4, 5];

        if (bulkEntryPriority === 'PICKING') {
           // Prioridade Picking: Busca em todos os racks, níveis 1 e 2 primeiro. Depois 3 a 5.
           return [
             { racks: allRacks, levels: [1, 2] },
             { racks: allRacks, levels: [3, 4, 5] }
           ];
        }

        let orderedRacks = [...allRacks];
        if (bulkEntryPriority === 'RACK_B') orderedRacks = ['B', 'A', 'C', 'D'];
        else if (bulkEntryPriority === 'RACK_C') orderedRacks = ['C', 'A', 'B', 'D'];
        else if (bulkEntryPriority === 'RACK_D') orderedRacks = ['D', 'A', 'B', 'C'];
        // Default (A) ou Rack A
        
        return [{ racks: orderedRacks, levels: allLevels }];
     };

     const findSpot = () => {
        const phases = getSearchPhases();
        
        // Define as passadas de posição:
        // Se prioridade de posição ativada: 1ª passada = 1 até limit. 2ª passada = limit+1 até max.
        // Se desativada: 1ª passada = 1 até max.
        const positionRuns = bulkPosRange.enabled 
           ? [{ min: 1, max: bulkPosRange.end }, { min: bulkPosRange.end + 1, max: POSITIONS_PER_LEVEL }]
           : [{ min: 1, max: POSITIONS_PER_LEVEL }];

        // Itera sobre as passadas de posição (ex: Prioritário, depois Resto)
        for (const run of positionRuns) {
           // Itera sobre as fases de Rack/Nível (ex: Rack A, depois B...)
           for (const phase of phases) {
             for (const rack of phase.racks) {
                for (const level of phase.levels) {
                  for (let pos = run.min; pos <= run.max; pos++) {
                     if (!isSpotTaken(rack, level, pos)) return { rack, level, pos };
                  }
                }
             }
           }
        }
        return null;
     };

     // Aloca Pallets Cheios
     for (let i = 0; i < fullPalletsCount; i++) {
        const spot = findSpot();
        if (spot) {
           results.push({ type: 'FULL', qty: stdQty, location: `${spot.rack}${spot.pos}${LEVEL_LABELS[spot.level-1]}`, ...spot });
           tempInventory.push({ id: 'temp', ...spot, slots: 1 }); // Marca ocupado temporariamente
        } else {
           results.push({ type: 'FULL', qty: stdQty, location: 'EXTERNO (CHÃO)', rack: 'FLOOR', level: 0, pos: 0 });
        }
     }

     // Aloca Sobra
     if (remainder > 0) {
        const spot = findSpot();
        if (spot) {
           results.push({ type: 'PARTIAL', qty: remainder, location: `${spot.rack}${spot.pos}${LEVEL_LABELS[spot.level-1]}`, ...spot });
        } else {
           results.push({ type: 'PARTIAL', qty: remainder, location: 'EXTERNO (CHÃO)', rack: 'FLOOR', level: 0, pos: 0 });
        }
     }

     setBulkEntryData({ ...bulkEntryData, calculated: true, results });
  };

  const confirmBulkEntry = async () => {
    setIsProcessingAction(true);
    const opName = currentUser?.username || 'Sistema';
    const masterItem = masterProducts.find(m => m.productId === bulkEntryData.productId);
    
    try {
      for (const item of bulkEntryData.results) {
        const isFloor = item.rack === 'FLOOR';
        const id = isFloor ? `FLOOR-${Date.now()}-${Math.random().toString(36).substr(2,5)}` : `${item.rack}${item.pos}${LEVEL_LABELS[item.level-1]}`;
        
        await saveItemToDB(FIXED_DB_STRING, {
          id: id,
          rack: item.rack,
          level: item.level,
          position: item.pos || 0, // Floor usa 0 ou incrementa
          productId: bulkEntryData.productId,
          productName: masterItem?.productName || 'DESCONHECIDO',
          quantity: item.qty,
          slots: 1,
          lastUpdated: new Date().toISOString(),
          createdAt: new Date().toISOString() // IMPORTANTE: FIFO
        });

        await saveLogToDB(FIXED_DB_STRING, {
          username: opName,
          action: 'ENTRADA',
          details: `ENTRADA AUTO: ${bulkEntryData.productId} (${item.qty} UN) - ${item.type === 'FULL' ? 'PALLET CHEIO' : 'QUEBRA'}`,
          location: isFloor ? 'EXTERNO (CHÃO)' : id,
          timestamp: new Date().toISOString()
        });
      }

      await loadInitialData();
      showFeedback('success', 'Entrada em massa realizada com sucesso!');
      setIsBulkEntryOpen(false);
      setBulkEntryData({ productId: '', totalQuantity: 0, calculated: false, results: [] });
      setBulkEntryPriority('DEFAULT');

    } catch (e) {
      showFeedback('error', 'Erro ao salvar entrada em massa.');
    } finally {
      setIsProcessingAction(false);
    }
  };
  // -----------------------------------------------------------

  const stats = useMemo(() => {
    // Calcula o total de posições bloqueadas para subtrair do total
    let blockedCount = 0;
    BLOCKED_LOCATIONS.forEach(b => {
      blockedCount += b.positions.length;
    });

    const totalRaw = RACKS.length * LEVEL_LABELS.length * POSITIONS_PER_LEVEL;
    const total = totalRaw - blockedCount; 
    
    // Calcula ocupação real considerando vagas duplas ocupando 2 espaços
    // Filtra FLOOR para não contar na ocupação do rack
    const rackInventory = inventory.filter(i => i.rack !== 'FLOOR');
    const occupiedCount = rackInventory.reduce((acc, item) => acc + (item.slots || 1), 0);

    const free = Math.max(0, total - occupiedCount);
    const rate = total > 0 ? ((occupiedCount / total) * 100).toFixed(1) : 0;
    return { total, occupied: occupiedCount, free, rate };
  }, [inventory]);

  const aggregatedInventory = useMemo(() => {
    const map = new Map<string, any>();
    inventory.forEach(item => {
      if (!item.productId) return;
      const ex = map.get(item.productId);
      const loc = item.rack === 'FLOOR' ? 'EXTERNO' : `${item.rack}${item.position}${LEVEL_LABELS[item.level - 1]}`;
      if (ex) { 
        ex.total += (item.quantity || 0); 
        ex.locs.push(loc); 
      } else { 
        map.set(item.productId, { id: item.productId, name: item.productName, total: item.quantity || 0, locs: [loc] }); 
      }
    });
    const result = Array.from(map.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return result.filter(r => 
        (r.name && r.name.toLowerCase().includes(q)) || 
        (r.id && r.id.toLowerCase().includes(q))
      );
    }
    return result;
  }, [inventory, searchQuery]);

  // Lógica FIFO: Filtra e ordena inventário
  // ATUALIZAÇÃO: Prioridade Absoluta para FLOOR, depois data.
  const fifoFilteredInventory = useMemo(() => {
    if (!fifoSearchQuery) return [];
    const q = fifoSearchQuery.toUpperCase();
    
    // 1. Filtra itens
    const items = inventory.filter(i => 
      (i.productId && i.productId.toUpperCase().includes(q)) || 
      (i.productName && i.productName.toUpperCase().includes(q))
    );

    // 2. Ordena: PRIMEIRO 'FLOOR', DEPOIS DATA (FIFO)
    return items.sort((a, b) => {
       const isFloorA = a.rack === 'FLOOR';
       const isFloorB = b.rack === 'FLOOR';

       // Se um é floor e o outro não, floor ganha
       if (isFloorA && !isFloorB) return -1;
       if (!isFloorA && isFloorB) return 1;

       // Se ambos são iguais (ambos floor ou ambos rack), usa data
       const dateA = new Date(a.createdAt || a.lastUpdated || 0).getTime();
       const dateB = new Date(b.createdAt || b.lastUpdated || 0).getTime();
       return dateA - dateB;
    });
  }, [inventory, fifoSearchQuery]);

  const filteredMasterProducts = useMemo(() => {
    if (!masterSearchQuery) return masterProducts;
    const q = masterSearchQuery.toUpperCase();
    return masterProducts.filter(m => 
      (m.productId && m.productId.toUpperCase().includes(q)) || 
      (m.productName && m.productName.toUpperCase().includes(q))
    );
  }, [masterProducts, masterSearchQuery]);

  const renderPalletGrid = () => {
    const gridElements = [];
    for (let p = 1; p <= POSITIONS_PER_LEVEL; p++) {
      const pos = p;
      const currentLevel = activeLevelIndex + 1;

      const isBlocked = BLOCKED_LOCATIONS.some(b => 
        b.rack === activeRack && 
        b.level === currentLevel && 
        b.positions.includes(pos)
      );

      if (isBlocked) {
        gridElements.push(
          <div key={pos} className="aspect-square rounded-2xl font-black text-[10px] flex flex-col items-center justify-center border shadow-sm bg-red-900 border-red-800 text-white/40 cursor-not-allowed opacity-80">
             <span className="mb-1">{pos}</span>
             <Ban size={14} className="text-red-400"/>
          </div>
        );
        continue;
      }

      const occ = inventory.find(item => item.rack === activeRack && item.level === currentLevel && item.position === pos);
      const isTail = inventory.find(item => item.rack === activeRack && item.level === currentLevel && item.position === (pos - 1) && item.slots === 2);
      
      if (isTail) continue;

      const isDouble = occ?.slots === 2;
      const levelLetter = LEVEL_LABELS[activeLevelIndex];
      const addressLabel = isDouble ? `${activeRack}${pos}${levelLetter} + ${activeRack}${pos + 1}${levelLetter}` : `${activeRack}${pos}${levelLetter}`;
      
      gridElements.push(
        <button 
          key={pos} 
          onClick={() => setShowQR({ rack: activeRack, level: activeLevelIndex + 1, pos: pos })} 
          className={`aspect-square rounded-2xl font-black text-[11px] flex flex-col items-center justify-center transition-all border shadow-sm relative group
            ${occ ? 'bg-rose-500 text-white border-rose-600' : 'bg-emerald-500 text-white border-emerald-600 hover:scale-105 active:scale-95'}
            ${isDouble ? 'col-span-2 !aspect-auto h-full' : ''}`}
        >
          <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-4 py-3 rounded-2xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-[100] shadow-2xl border border-white/20 scale-90 group-hover:scale-100 flex flex-col gap-1 min-w-[140px]">
            <div className="flex items-center gap-2 border-b border-white/10 pb-1.5 mb-1">
              <MapPin size={12} className="text-indigo-400"/>
              <span className="font-black uppercase tracking-tighter">{addressLabel}</span>
            </div>
            {occ ? (
              <>
                <div className="flex items-center gap-2 text-rose-300">
                  <Package size={12} />
                  <span className="font-black uppercase truncate max-w-[120px]">{occ.productName}</span>
                </div>
                <div className="flex justify-between items-center text-[8px] text-white/50 font-bold uppercase mt-1">
                  <span>SKU: {occ.productId}</span>
                  <span className="bg-white/10 px-1.5 py-0.5 rounded-lg">{occ.quantity} UN</span>
                </div>
              </>
            ) : (
              <div className="text-emerald-400 font-bold uppercase text-[8px]">Posição Disponível</div>
            )}
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45 border-r border-b border-white/20"></div>
          </div>

          <span className="mb-1">{isDouble ? `${pos} + ${pos + 1}` : pos}</span>
          {occ && (
            <div className="flex items-center gap-2">
              <Package size={isDouble ? 24 : 16} strokeWidth={2.5}/>
              {isDouble && <ArrowRightCircle size={24} className="opacity-40 animate-pulse"/>}
            </div>
          )}
        </button>
      );
    }
    return gridElements;
  };

  const handlePositionClick = (rack: RackId, level: number, pos: number) => {
    // Verifica se é posição bloqueada
    const isBlocked = BLOCKED_LOCATIONS.some(b => 
      b.rack === rack && 
      b.level === level && 
      b.positions.includes(pos)
    );
    if (isBlocked) {
      showFeedback('error', 'Esta posição está bloqueada (Pilar/Estrutura).');
      return;
    }

    const occ = inventory.find(p => p.rack === rack && p.level === level && p.position === pos);
    const isTail = inventory.find(p => p.rack === rack && p.level === level && p.position === (pos - 1) && p.slots === 2);
    const target = occ || isTail;
    
    setIsPartialExitMode(false);
    setPartialQuantity('');

    if (target) { 
      setPalletDetails({ ...target }); 
      setSelectedPosition(null);
    } 
    else { 
      if (currentUser?.role !== 'admin') {
         showFeedback('error', 'Apenas ADMINISTRADORES podem realizar entradas manuais.');
         return;
      }
      setSelectedPosition({ 
        id: `${rack}${pos}${LEVEL_LABELS[level - 1]}`, 
        rack, 
        level, 
        position: pos, 
        productId: '', 
        productName: '', 
        quantity: 0, 
        slots: 1 
      }); 
      setPalletDetails(null);
    }
  };

  const handleAddToStock = () => {
    if (!palletDetails) return;
    if (currentUser?.role !== 'admin') {
         showFeedback('error', 'Apenas ADMINISTRADORES podem adicionar estoque.');
         return;
    }
    setSelectedPosition({
        ...palletDetails,
        quantity: 0 
    });
    setPalletDetails(null);
  };

  const generateBatchPDF = async () => {
    setIsPrintingBatch(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [50, 50] });
      const currentLevel = activeLevelIndex + 1;
      
      let pagesAdded = 0;
      for (let p = 1; p <= POSITIONS_PER_LEVEL; p++) {
        const isBlocked = BLOCKED_LOCATIONS.some(b => 
          b.rack === activeRack && 
          b.level === currentLevel && 
          b.positions.includes(p)
        );
        if (isBlocked) continue;

        const isOccupied = checkOccupancy(activeRack, currentLevel, p);
        if (printFilter === 'free' && isOccupied) continue;

        const labelText = `${activeRack} ${p} ${LEVEL_LABELS[activeLevelIndex]}`;
        const codeValue = `PP-${activeRack}-P-${p}-L-${currentLevel}`;
        
        if (pagesAdded > 0) doc.addPage([50, 50], 'portrait');
        
        doc.setLineWidth(0.1);
        doc.rect(1, 1, 48, 48);
        const qrDataUrl = await QRCode.toDataURL(codeValue, { errorCorrectionLevel: 'H', width: 250, margin: 0 });
        doc.addImage(qrDataUrl, 'PNG', 7.5, 8, 35, 35);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text(labelText, 25, 6, { align: "center" });
        doc.setFontSize(6);
        doc.text(codeValue, 25, 47, { align: "center" });
        pagesAdded++;
      }
      
      if (pagesAdded === 0) {
        showFeedback('error', 'Nenhuma etiqueta encontrada para os critérios.');
      } else {
        doc.save(`Lote_${activeRack}_Nivel_${LEVEL_LABELS[activeLevelIndex]}_${printFilter}.pdf`);
        showFeedback('success', 'PDF gerado com sucesso!');
      }
    } catch (e) {
      showFeedback('error', 'Falha ao gerar lote.');
    } finally {
      setIsPrintingBatch(false);
    }
  };

  const handlePrintSingle = async (pos: number) => {
    try {
      const levelLetter = LEVEL_LABELS[activeLevelIndex];
      const labelText = `${activeRack} ${pos} ${levelLetter}`;
      const codeValue = `PP-${activeRack}-P-${pos}-L-${activeLevelIndex + 1}`;
      
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [50, 50] });
      doc.setLineWidth(0.1);
      doc.rect(1, 1, 48, 48);
      const qrDataUrl = await QRCode.toDataURL(codeValue, { errorCorrectionLevel: 'H', width: 200, margin: 0 });
      doc.addImage(qrDataUrl, 'PNG', 7.5, 8, 35, 35);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(labelText, 25, 6, { align: "center" });
      doc.setFontSize(6);
      doc.text(codeValue, 25, 47, { align: "center" });
      doc.save(`Etiqueta_${activeRack}${pos}${levelLetter}.pdf`);
    } catch (e) {
      showFeedback('error', 'Erro ao imprimir etiqueta individual.');
    }
  };

  const handleAddNewMasterProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSKUData.id || !newSKUData.name) {
      showFeedback('error', 'Preencha ID e Nome corretamente!');
      return;
    }
    
    setIsProcessingAction(true);
    try {
      await saveMasterProductToDB(FIXED_DB_STRING, {
        productId: newSKUData.id.toUpperCase(),
        productName: newSKUData.name.toUpperCase(),
        standardQuantity: newSKUData.qty
      });
      await loadInitialData();
      showFeedback('success', 'Item cadastrado com sucesso!');
      setIsAddingNewSKU(false);
      setNewSKUData({ id: '', name: '', qty: 0 });
    } catch (error) {
      showFeedback('error', 'Erro ao cadastrar novo SKU.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleUpdateMasterProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    
    setIsProcessingAction(true);
    try {
        await saveMasterProductToDB(FIXED_DB_STRING, editingProduct);
        await loadInitialData();
        showFeedback('success', 'Produto atualizado com sucesso!');
        setEditingProduct(null);
    } catch (error) {
        showFeedback('error', 'Erro ao atualizar produto.');
    } finally {
        setIsProcessingAction(false);
    }
  };

  const handleDownloadReport = () => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Relatório de Saldo Geral - Almox", 15, 20);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleString()}`, 15, 28);
    
    let y = 40;
    doc.setFontSize(9);
    doc.text("SKU", 15, y);
    doc.text("DESCRIÇÃO", 50, y);
    doc.text("QTD TOTAL", 170, y);
    doc.line(15, y + 2, 195, y + 2);
    y += 8;

    aggregatedInventory.forEach((item) => {
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
      doc.setFont("helvetica", "normal");
      doc.text(item.id.substring(0, 15), 15, y);
      doc.text(item.name.substring(0, 45), 50, y);
      doc.setFont("helvetica", "bold");
      doc.text(`${item.total}`, 170, y);
      y += 6;
      
      // Lista posições
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7);
      doc.text(`Locais: ${item.locs.join(', ')}`, 15, y);
      y += 8;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
    });

    doc.save("Relatorio_Saldo_Geral.pdf");
  };

  // Funções de Ação de Saída
  const handleTotalExit = async () => {
    if (!palletDetails) return;
    if(confirm("Confirmar BAIXA TOTAL deste item? (Zerar posição)")) {
      setIsProcessingAction(true);
      const opName = currentUser?.username || 'Sistema';
      try {
        await deleteItemFromDB(FIXED_DB_STRING, palletDetails);
        await saveLogToDB(FIXED_DB_STRING, {
          username: opName,
          action: 'SAIDA',
          details: `BAIXA TOTAL: ${palletDetails.productId} (${palletDetails.quantity} UN)`,
          location: `${palletDetails.rack === 'FLOOR' ? 'EXTERNO' : palletDetails.rack + palletDetails.position}`,
          timestamp: new Date().toISOString()
        });
        await loadInitialData();
        setPalletDetails(null); 
        showFeedback('success', 'Baixa realizada com sucesso!');
      } catch (e) {
        showFeedback('error', 'Falha ao realizar baixa.');
      } finally {
        setIsProcessingAction(false);
      }
    }
  };

  const handlePartialExit = async () => {
    if (!palletDetails) return;
    const qtdToRemove = parseInt(partialQuantity);

    if (isNaN(qtdToRemove) || qtdToRemove <= 0) {
      showFeedback('error', 'Digite uma quantidade válida para retirada.');
      return;
    }

    if (qtdToRemove > (palletDetails.quantity || 0)) {
      showFeedback('error', 'Quantidade de saída maior que o estoque atual!');
      return;
    }

    if (qtdToRemove === palletDetails.quantity) {
      handleTotalExit(); // Se for tudo, vira baixa total
      return;
    }

    setIsProcessingAction(true);
    const opName = currentUser?.username || 'Sistema';
    const newQuantity = (palletDetails.quantity || 0) - qtdToRemove;
    const updatedPallet = { 
      ...palletDetails, 
      quantity: newQuantity,
      lastUpdated: new Date().toISOString()
    };

    try {
        await saveItemToDB(FIXED_DB_STRING, updatedPallet);
        await saveLogToDB(FIXED_DB_STRING, {
          username: opName,
          action: 'SAIDA',
          details: `SAIDA PARCIAL: ${palletDetails.productId} (-${qtdToRemove} UN). RESTAM: ${newQuantity}`,
          location: `${palletDetails.rack === 'FLOOR' ? 'EXTERNO' : palletDetails.rack + palletDetails.position}`,
          timestamp: new Date().toISOString()
        });
        await loadInitialData();
        setPalletDetails(null); 
        showFeedback('success', `Saída parcial de ${qtdToRemove} UN registrada!`);
    } catch (e) {
        showFeedback('error', 'Falha ao registrar saída parcial.');
    } finally {
        setIsProcessingAction(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="fixed inset-0 bg-slate-900 flex items-center justify-center p-6 z-[9999]">
        <div className="w-full max-w-sm bg-white/5 backdrop-blur-xl border border-white/10 rounded-[3rem] p-10 flex flex-col items-center shadow-2xl">
           <Warehouse className="text-indigo-600 w-16 h-16 mb-6" />
           <h1 className="text-3xl font-black italic text-white uppercase tracking-tighter mb-8">ALMOX</h1>
           <form onSubmit={isRegisterMode ? handleRegister : handleLogin} className="w-full space-y-4">
              <input type="text" placeholder="NOME DE USUÁRIO" className="w-full bg-white/10 border border-white/10 p-5 rounded-2xl text-white font-black uppercase outline-none focus:border-indigo-600 transition-all" value={loginData.user} onChange={e => setLoginData({...loginData, user: e.target.value})} required />
              <input type="password" placeholder="SENHA DE ACESSO" className="w-full bg-white/10 border border-white/10 p-5 rounded-2xl text-white font-black outline-none focus:border-indigo-600 transition-all" value={loginData.pass} onChange={e => setLoginData({...loginData, pass: e.target.value})} required />
              {isRegisterMode && (
                <div className="pt-2">
                  <input type="password" placeholder="CÓDIGO SECRETO REGISTRO" className="w-full bg-indigo-600/20 border border-indigo-500/30 p-5 rounded-2xl text-indigo-300 font-black outline-none focus:border-indigo-400 transition-all" value={loginData.secret} onChange={e => setLoginData({...loginData, secret: e.target.value})} required />
                </div>
              )}
              <button type="submit" disabled={isLoggingIn} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-6 rounded-2xl font-black uppercase shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-3">
                {isLoggingIn ? <Loader2 className="animate-spin"/> : (isRegisterMode ? <UserPlus size={20}/> : <LogOut size={20} className="rotate-180"/>)}
                {isRegisterMode ? 'CONFIRMAR CADASTRO' : 'ENTRAR NO SISTEMA'}
              </button>
           </form>
           <div className="mt-8 border-t border-white/10 pt-6 w-full text-center">
              <button onClick={() => { setIsRegisterMode(!isRegisterMode); setLoginData({ user: '', pass: '', secret: '' }); }} className="text-white/40 hover:text-indigo-400 text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2 mx-auto">
                {isRegisterMode ? <X size={14}/> : <ShieldCheck size={14}/>}
                {isRegisterMode ? 'VOLTAR PARA LOGIN' : 'CADASTRAR NOVO ACESSO'}
              </button>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-slate-50 flex flex-col lg:flex-row overflow-hidden relative">
      {feedback && (
        <div className={`fixed top-4 right-4 z-[9999] p-4 rounded-2xl shadow-2xl flex items-center gap-3 border-2 animate-in slide-in-from-top ${feedback.type === 'success' ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-rose-600 border-rose-400 text-white'}`}>
           {feedback.type === 'success' ? <CheckCircle2 size={20}/> : <AlertCircle size={20}/>}
           <span className="font-black text-[10px] uppercase tracking-tighter">{feedback.msg}</span>
        </div>
      )}

      {/* SIDEBAR */}
      <aside className={`fixed lg:static inset-0 z-[5000] lg:z-auto transition-all ${isMobileMenuOpen ? 'visible' : 'invisible lg:visible'} flex-shrink-0`}>
        <div className="absolute inset-0 bg-slate-900/60 lg:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>
        <div className={`absolute lg:static top-0 left-0 bottom-0 w-72 bg-white border-r p-6 transition-transform lg:translate-x-0 shadow-xl h-full flex flex-col z-[5001] ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex items-center gap-3 mb-12">
            <Warehouse className="text-indigo-600 w-8 h-8" />
            <h1 className="text-xl font-black italic uppercase tracking-tighter">ALMOX</h1>
          </div>
          <nav className="flex flex-col gap-2 flex-1 overflow-y-auto no-scrollbar">
            <button onClick={() => { setIsPrintMenuOpen(true); setIsMobileMenuOpen(false); }} className="flex items-center gap-4 p-4 text-slate-600 font-black uppercase text-[11px] hover:bg-indigo-50 hover:text-indigo-600 rounded-2xl transition-all text-left w-full"><Printer size={20}/> ETIQUETAS</button>
            <button onClick={() => { setIsMasterMenuOpen(true); setIsMobileMenuOpen(false); }} className="flex items-center gap-4 p-4 text-slate-600 font-black uppercase text-[11px] hover:bg-indigo-50 hover:text-indigo-600 rounded-2xl transition-all text-left w-full"><ClipboardList size={20}/> BASE ITENS</button>
            <button onClick={() => { setIsInventoryReportOpen(true); setIsMobileMenuOpen(false); }} className="flex items-center gap-4 p-4 text-slate-600 font-black uppercase text-[11px] hover:bg-indigo-50 hover:text-indigo-600 rounded-2xl transition-all text-left w-full"><ListChecks size={20}/> SALDO GERAL</button>
            <button onClick={() => { setIsExternalMenuOpen(true); setIsMobileMenuOpen(false); }} className="flex items-center gap-4 p-4 text-slate-600 font-black uppercase text-[11px] hover:bg-indigo-50 hover:text-indigo-600 rounded-2xl transition-all text-left w-full"><LayoutGrid size={20}/> PALLETS EXTERNOS</button>
            <button onClick={() => { setIsFIFOMenuOpen(true); setIsMobileMenuOpen(false); }} className="flex items-center gap-4 p-4 text-slate-600 font-black uppercase text-[11px] hover:bg-indigo-50 hover:text-indigo-600 rounded-2xl transition-all text-left w-full"><Clock size={20}/> EXPEDIÇÃO (FIFO)</button>
            <button onClick={() => { setIsLogsOpen(true); setIsMobileMenuOpen(false); }} className="flex items-center gap-4 p-4 text-slate-600 font-black uppercase text-[11px] hover:bg-indigo-50 hover:text-indigo-600 rounded-2xl transition-all text-left w-full"><History size={20}/> HISTÓRICO</button>
            
            {/* Menu Apenas para Admins */}
            {currentUser?.role === 'admin' && (
              <button onClick={() => { setIsUserManagementOpen(true); setIsMobileMenuOpen(false); }} className="flex items-center gap-4 p-4 text-indigo-600 bg-indigo-50 border border-indigo-100 font-black uppercase text-[11px] hover:bg-indigo-100 rounded-2xl transition-all text-left w-full mt-4">
                 <Users size={20}/> GESTÃO USUÁRIOS
              </button>
            )}
          </nav>
          <div className="pt-6 border-t border-slate-100">
            <div className="mb-4 px-4 py-3 bg-slate-50 rounded-xl border flex justify-between items-center">
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">Operador</span>
                <span className="text-xs font-black text-indigo-600 uppercase">{currentUser?.username || 'Sistema'}</span>
              </div>
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md uppercase ${currentUser?.role === 'admin' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {currentUser?.role === 'admin' ? 'ADMIN' : 'OP'}
              </span>
            </div>
            <button onClick={handleLogout} className="flex items-center gap-4 p-4 text-rose-500 font-black uppercase text-[11px] hover:bg-rose-50 rounded-2xl transition-all w-full"><LogOut size={20}/> SAIR</button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <header className="lg:hidden flex justify-between items-center p-4 bg-white border-b h-16 shrink-0 z-[100]">
          <div className="flex items-center gap-2">
            <Warehouse className="text-indigo-600 w-6 h-6" />
            <h1 className="text-lg font-black italic uppercase">ALMOX</h1>
          </div>
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 bg-slate-50 rounded-xl"><Menu size={24} /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-8 no-scrollbar">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex-shrink-0 flex gap-4">
              <button onClick={() => setIsScannerOpen(true)} className="bg-indigo-600 text-white px-10 py-5 rounded-full font-black uppercase shadow-xl flex items-center gap-4 active:scale-95 transition-all">
                <ScanLine size={28}/> SCANNER
              </button>
              {currentUser?.role === 'admin' && (
                <button onClick={() => setIsBulkEntryOpen(true)} className="bg-emerald-600 text-white px-10 py-5 rounded-full font-black uppercase shadow-xl flex items-center gap-4 active:scale-95 transition-all">
                  <PackagePlus size={28}/> ENTRADA
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 flex-1 max-w-4xl">
               <div className="bg-white p-6 rounded-[2rem] border shadow-sm flex flex-col justify-center"><span className="text-2xl font-black block leading-none">{stats.total}</span><span className="text-[9px] font-bold text-slate-400 uppercase mt-1">Capacidade</span></div>
               <div className="bg-white p-6 rounded-[2rem] border shadow-sm flex flex-col justify-center"><span className="text-2xl font-black block text-rose-600 leading-none">{stats.occupied}</span><span className="text-[9px] font-bold text-slate-400 uppercase mt-1">Ocupado Rack</span></div>
               <div className="bg-white p-6 rounded-[2rem] border shadow-sm flex flex-col justify-center"><span className="text-2xl font-black block text-emerald-600 leading-none">{stats.free}</span><span className="text-[9px] font-bold text-slate-400 uppercase mt-1">Livre Rack</span></div>
               <div className="bg-indigo-600 p-6 rounded-[2rem] text-white shadow-xl flex flex-col justify-center"><span className="text-2xl font-black block leading-none">{stats.rate}%</span><span className="text-[9px] font-bold text-white/60 uppercase mt-1">Uso Rack</span></div>
            </div>
          </div>

          <div className="bg-white p-6 lg:p-10 rounded-[3rem] border shadow-sm">
             <div className="flex flex-col sm:flex-row gap-6 mb-10 items-center justify-between border-b pb-6">
               <div className="flex gap-2 bg-slate-50 p-2 rounded-2xl shadow-inner border border-slate-100 overflow-x-auto no-scrollbar w-full sm:w-auto">
                 {RACKS.map(r => <button key={r} onClick={() => setActiveRack(r)} className={`px-10 py-3 rounded-xl font-black text-sm transition-all ${activeRack === r ? 'bg-indigo-600 text-white shadow-lg scale-105' : 'text-slate-400'}`}>{r}</button>)}
               </div>
               <div className="flex gap-1.5 overflow-x-auto no-scrollbar w-full sm:w-auto pb-2 sm:pb-0">
                 {LEVEL_LABELS.map((l, i) => <button key={l} onClick={() => setActiveLevelIndex(i)} className={`w-12 h-12 flex-shrink-0 rounded-xl font-black flex items-center justify-center text-sm transition-all ${activeLevelIndex === i ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-100 text-slate-400'}`}>{l}</button>)}
               </div>
             </div>
             
             <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-11 gap-3">
                {renderPalletGrid()}
             </div>
          </div>
        </div>
      </main>

      {/* MODAL ENTRADA AUTOMÁTICA (BULK) */}
      {isBulkEntryOpen && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[9000] flex items-center justify-center p-0 lg:p-10" onClick={() => setIsBulkEntryOpen(false)}>
           <div className="bg-white rounded-none lg:rounded-[3rem] w-full max-w-2xl p-10 shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
              <h3 className="font-black text-2xl italic uppercase text-indigo-600 mb-8">Entrada Inteligente</h3>
              
              {!bulkEntryData.calculated ? (
                <div className="space-y-6">
                   <div>
                     <label className="block text-xs font-black uppercase text-slate-400 mb-2">Selecione o Item (SKU)</label>
                     <input list="sku-list-bulk" className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase border-2 border-transparent focus:border-indigo-600 outline-none" 
                       value={bulkEntryData.productId}
                       onChange={e => setBulkEntryData({...bulkEntryData, productId: e.target.value.toUpperCase()})}
                     />
                     <datalist id="sku-list-bulk">{masterProducts.map(m => <option key={m.productId} value={m.productId}>{m.productName}</option>)}</datalist>
                   </div>
                   
                   <div>
                     <label className="block text-xs font-black uppercase text-slate-400 mb-2">Quantidade Total a Lançar</label>
                     <input type="number" className="w-full p-5 bg-slate-50 rounded-2xl font-black text-3xl outline-none"
                       value={bulkEntryData.totalQuantity || ''}
                       onChange={e => setBulkEntryData({...bulkEntryData, totalQuantity: parseInt(e.target.value) || 0})}
                     />
                   </div>

                   <div>
                     <label className="block text-xs font-black uppercase text-slate-400 mb-2 flex items-center gap-2"><ArrowUpAZ size={14}/> Prioridade de Rack / Nível</label>
                     <select 
                        className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase outline-none border-2 border-transparent focus:border-indigo-600 appearance-none"
                        value={bulkEntryPriority}
                        onChange={(e) => setBulkEntryPriority(e.target.value)}
                     >
                        <option value="DEFAULT">Sequência Padrão (Rack A → D)</option>
                        <option value="PICKING">Priorizar Níveis Baixos (Picking 1-2)</option>
                        <option value="RACK_A">Priorizar Rack A</option>
                        <option value="RACK_B">Priorizar Rack B</option>
                        <option value="RACK_C">Priorizar Rack C</option>
                        <option value="RACK_D">Priorizar Rack D</option>
                     </select>

                     {/* Nova Seção de Prioridade de Faixa (Posição) */}
                     <div className="flex items-center gap-3 mt-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <div className="flex items-center gap-3 flex-1">
                            <input 
                              type="checkbox" 
                              id="posPriority"
                              className="w-5 h-5 rounded-md accent-indigo-600"
                              checked={bulkPosRange.enabled}
                              onChange={e => setBulkPosRange({...bulkPosRange, enabled: e.target.checked})}
                            />
                            <label htmlFor="posPriority" className="font-black text-[10px] uppercase text-slate-600 cursor-pointer flex items-center gap-1">
                               <ArrowRightToLine size={14}/> Priorizar Início do Corredor (Frente)
                            </label>
                        </div>
                        
                        {bulkPosRange.enabled && (
                          <div className="flex items-center gap-2 animate-in slide-in-from-left">
                            <span className="text-[9px] font-bold uppercase text-slate-400">Até a Posição:</span>
                            <input 
                              type="number" 
                              className="w-16 p-2 bg-white border border-slate-200 rounded-lg text-center font-black text-sm outline-none focus:border-indigo-500"
                              value={bulkPosRange.end}
                              onChange={e => setBulkPosRange({...bulkPosRange, end: Math.min(POSITIONS_PER_LEVEL, Math.max(1, parseInt(e.target.value) || 1))})}
                            />
                          </div>
                        )}
                     </div>
                   </div>

                   <button onClick={handleCalculateBulkEntry} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase text-lg hover:bg-indigo-700 transition-all shadow-lg flex items-center justify-center gap-2">
                     <Calculator size={20} /> Calcular Pallets & Vagas
                   </button>
                </div>
              ) : (
                <div className="space-y-6 animate-in slide-in-from-right">
                   <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100">
                      <div className="flex justify-between items-center mb-4">
                        <span className="font-black text-indigo-600 text-lg">Resultado do Cálculo</span>
                        <button onClick={() => setBulkEntryData({...bulkEntryData, calculated: false})} className="text-xs font-bold text-slate-400 hover:text-indigo-500 uppercase">Refazer</button>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-center">
                         <div className="bg-white p-4 rounded-xl shadow-sm">
                            <span className="block text-2xl font-black text-slate-800">{bulkEntryData.results.filter(r => r.type === 'FULL').length}</span>
                            <span className="text-[10px] font-black uppercase text-slate-400">Pallets Completos</span>
                         </div>
                         <div className="bg-white p-4 rounded-xl shadow-sm">
                            <span className="block text-2xl font-black text-slate-800">{bulkEntryData.results.filter(r => r.type === 'PARTIAL').length}</span>
                            <span className="text-[10px] font-black uppercase text-slate-400">Quebra (Sobras)</span>
                         </div>
                      </div>
                   </div>

                   <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                      <h4 className="text-xs font-black uppercase text-slate-400 mb-2">Sugestão de Armazenagem</h4>
                      {bulkEntryData.results.map((res, i) => (
                        <div key={i} className={`p-4 rounded-xl border flex justify-between items-center ${res.location.includes('CHÃO') ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                           <div className="flex items-center gap-3">
                              {res.location.includes('CHÃO') ? <AlertTriangle className="text-amber-500" size={18}/> : <CheckCircle2 className="text-emerald-500" size={18}/>}
                              <span className="font-bold text-sm text-slate-700">{res.type === 'FULL' ? 'PALLET' : 'SOBRA'} - {res.qty} UN</span>
                           </div>
                           <span className="font-black text-sm uppercase bg-white px-3 py-1 rounded-lg shadow-sm">{res.location}</span>
                        </div>
                      ))}
                   </div>

                   <button onClick={confirmBulkEntry} disabled={isProcessingAction} className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase text-lg hover:bg-emerald-700 transition-all shadow-lg flex items-center justify-center gap-2">
                     {isProcessingAction ? <Loader2 className="animate-spin"/> : 'Confirmar e Gerar Etiquetas'}
                   </button>
                </div>
              )}
           </div>
        </div>
      )}

      {/* MODAL EXPEDIÇÃO (FIFO) */}
      {isFIFOMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[8000] flex items-center justify-center p-0 lg:p-10" onClick={() => setIsFIFOMenuOpen(false)}>
          <div className="bg-white rounded-none lg:rounded-[3rem] w-full max-w-5xl h-full lg:h-[85vh] flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <header className="p-8 border-b flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg"><Clock size={24}/></div>
                <h3 className="font-black text-2xl italic uppercase text-slate-800">Consulta de Expedição (FIFO)</h3>
              </div>
              <button onClick={() => setIsFIFOMenuOpen(false)} className="p-4 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-all"><X /></button>
            </header>

            <div className="p-6 bg-slate-50 border-b flex items-center gap-4 shrink-0">
               <div className="relative flex-1">
                  <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20}/>
                  <input type="text" placeholder="DIGITE O NOME OU SKU DO ITEM..." className="w-full pl-12 p-4 bg-white border-2 border-slate-200 rounded-2xl font-black uppercase outline-none focus:border-blue-600 transition-all shadow-sm" value={fifoSearchQuery} onChange={e => setFifoSearchQuery(e.target.value)} />
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-4 bg-slate-50/50">
               {fifoFilteredInventory.length > 0 ? fifoFilteredInventory.map((item, index) => {
                 const isFloor = item.rack === 'FLOOR';
                 const isFirst = index === 0;
                 return (
                   <div key={item.id} className={`p-6 rounded-[2rem] border shadow-sm flex items-center justify-between transition-all 
                     ${isFloor 
                        ? 'bg-rose-100 border-rose-300 ring-2 ring-rose-400 shadow-xl' 
                        : (isFirst ? 'bg-emerald-100 border-emerald-300 ring-2 ring-emerald-400 shadow-xl scale-[1.02]' : 'bg-white border-slate-100 opacity-80')
                     }`}>
                      <div className="flex items-center gap-6">
                         <div className={`w-12 h-12 flex items-center justify-center rounded-xl font-black text-lg ${isFloor ? 'bg-rose-600 text-white' : (isFirst ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500')}`}>
                           {index + 1}º
                         </div>
                         <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-black uppercase text-slate-400">SKU: {item.productId}</span>
                              {isFloor && <span className="bg-rose-600 text-white text-[9px] font-black px-2 py-0.5 rounded-md uppercase animate-pulse">PRIORIDADE: EXTERNO</span>}
                              {!isFloor && isFirst && <span className="bg-emerald-600 text-white text-[9px] font-black px-2 py-0.5 rounded-md uppercase animate-pulse">Primeiro a Sair (FIFO)</span>}
                            </div>
                            <h4 className="font-black text-slate-800 text-xl uppercase">{item.productName}</h4>
                            <span className="text-[10px] font-bold text-slate-500 uppercase mt-1 block">Entrada: {new Date(item.createdAt || item.lastUpdated).toLocaleString()}</span>
                         </div>
                      </div>
                      <div className="text-right flex flex-col items-end">
                         <span className="block text-3xl font-black text-slate-800">{item.rack === 'FLOOR' ? 'CHÃO' : `${item.rack}-${item.position}`}</span>
                         <span className="text-xs font-black text-slate-400 uppercase">{item.rack === 'FLOOR' ? 'EXTERNO' : `Nível ${LEVEL_LABELS[item.level-1]}`}</span>
                         <div className="mt-2 text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg inline-block mb-2">QTD: {item.quantity}</div>
                         <button 
                           onClick={(e) => {
                             e.stopPropagation();
                             setPalletDetails(item);
                             setIsFIFOMenuOpen(false);
                           }}
                           className="bg-rose-100 text-rose-600 px-4 py-2 rounded-xl font-black uppercase text-[10px] hover:bg-rose-200 transition-colors flex items-center gap-2"
                         >
                           <LogOut size={14}/> Realizar Saída
                         </button>
                      </div>
                   </div>
                 );
               }) : (
                 <div className="flex flex-col items-center justify-center py-20 opacity-40">
                   <Clock size={48} className="mb-4"/>
                   <p className="font-black uppercase text-xs">Digite para buscar itens...</p>
                 </div>
               )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL PALLETS EXTERNOS (FLOOR) */}
      {isExternalMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[8000] flex items-center justify-center p-0 lg:p-10" onClick={() => setIsExternalMenuOpen(false)}>
           <div className="bg-white rounded-none lg:rounded-[3rem] w-full max-w-5xl h-full lg:h-[85vh] flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
              <header className="p-8 border-b flex justify-between items-center shrink-0 bg-amber-50">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-amber-500 text-white rounded-2xl shadow-lg"><LayoutGrid size={24}/></div>
                  <h3 className="font-black text-2xl italic uppercase text-slate-800">Pallets Externos (Chão)</h3>
                </div>
                
                <div className="flex gap-2">
                  {currentUser?.role === 'admin' && (
                    <button 
                      onClick={() => {
                        const floorId = `FLOOR-${Date.now()}`;
                        setSelectedPosition({
                            id: floorId,
                            rack: 'FLOOR',
                            level: 0,
                            position: 0,
                            productId: '',
                            productName: '',
                            quantity: 0,
                            slots: 1
                        });
                        setIsExternalMenuOpen(false); // Fecha este menu para mostrar o de entrada
                      }}
                      className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-md"
                    >
                      <PackagePlus size={16}/> Nova Entrada Manual
                    </button>
                  )}
                  <button onClick={() => setIsExternalMenuOpen(false)} className="p-4 bg-white rounded-2xl hover:bg-amber-100 transition-all"><X /></button>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {inventory.filter(i => i.rack === 'FLOOR').map(item => (
                       <div key={item.id} className="bg-white p-6 rounded-[2rem] border border-amber-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
                          <div className="absolute top-0 right-0 bg-amber-500 text-white text-[9px] font-black px-3 py-1 rounded-bl-xl uppercase">Externo</div>
                          <h4 className="font-black text-slate-800 uppercase text-lg mb-1 pr-12">{item.productName}</h4>
                          <span className="text-xs font-bold text-slate-400 uppercase block mb-4">SKU: {item.productId}</span>
                          
                          <div className="flex justify-between items-end">
                             <span className="text-2xl font-black text-indigo-600">{item.quantity} UN</span>
                             <div className="flex gap-2">
                                <button onClick={() => {
                                   setPalletDetails(item);
                                   setIsExternalMenuOpen(false);
                                }} className="p-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all"><Info size={18}/></button>
                                <button onClick={async () => {
                                   const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [50, 50] });
                                   const codeValue = `PP-FLOOR-P-${item.position}-L-0`;
                                   doc.rect(1, 1, 48, 48);
                                   const qrDataUrl = await QRCode.toDataURL(codeValue, { errorCorrectionLevel: 'H', width: 200, margin: 0 });
                                   doc.addImage(qrDataUrl, 'PNG', 7.5, 8, 35, 35);
                                   doc.setFontSize(8);
                                   doc.text("PALLET EXTERNO", 25, 6, { align: "center" });
                                   doc.text(item.productName?.substring(0,15) || '', 25, 45, { align: "center" });
                                   doc.save(`Externo_${item.productId}.pdf`);
                                }} className="p-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-800 hover:text-white transition-all"><Printer size={18}/></button>
                             </div>
                          </div>
                       </div>
                    ))}
                    {inventory.filter(i => i.rack === 'FLOOR').length === 0 && (
                       <div className="col-span-full flex flex-col items-center justify-center py-20 opacity-40">
                          <LayoutGrid size={48} className="mb-4"/>
                          <p className="font-black uppercase text-xs">Nenhum pallet armazenado no chão.</p>
                       </div>
                    )}
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* GESTÃO DE USUÁRIOS (ADMIN) */}
      {isUserManagementOpen && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[8000] flex items-center justify-center p-0 lg:p-10" onClick={() => setIsUserManagementOpen(false)}>
           <div className="bg-white rounded-none lg:rounded-[3rem] w-full max-w-4xl h-full lg:h-[85vh] flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
              <header className="p-8 border-b flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg"><Users size={24}/></div>
                  <h3 className="font-black text-2xl italic uppercase text-slate-800">Gestão de Usuários</h3>
                </div>
                <button onClick={() => setIsUserManagementOpen(false)} className="p-4 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-all"><X /></button>
              </header>

              <div className="flex-1 overflow-y-auto p-8 space-y-4 no-scrollbar bg-slate-50/50">
                 {allUsers.length > 0 ? allUsers.map((user, idx) => (
                   <div key={idx} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center justify-between hover:border-indigo-200 transition-all">
                      <div className="flex items-center gap-4">
                         <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white shadow-md ${user.role === 'admin' ? 'bg-indigo-600' : 'bg-slate-400'}`}>
                            {user.username.substring(0,2).toUpperCase()}
                         </div>
                         <div>
                            <h4 className="font-black text-slate-800 text-lg uppercase">{user.username}</h4>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${user.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-500'}`}>
                              {user.role}
                            </span>
                         </div>
                      </div>
                      
                      {currentUser?.username !== user.username ? (
                        <button 
                          onClick={() => handleUpdateRole(user)}
                          className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase shadow-sm transition-all flex items-center gap-2 ${
                            user.role === 'admin' 
                            ? 'bg-rose-100 text-rose-600 hover:bg-rose-200' 
                            : 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'
                          }`}
                        >
                          {user.role === 'admin' ? <><ShieldAlert size={14}/> Rebaixar</> : <><ShieldCheck size={14}/> Promover Admin</>}
                        </button>
                      ) : (
                        <span className="text-[9px] text-slate-300 font-bold uppercase italic px-4">Você</span>
                      )}
                   </div>
                 )) : (
                   <div className="flex flex-col items-center justify-center py-20 opacity-40">
                     <Users size={48} className="mb-4"/>
                     <p className="font-black uppercase text-xs">Carregando usuários...</p>
                   </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {/* CENTRAL DE ETIQUETAS */}
      {isPrintMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9000] flex items-center justify-center p-4 lg:p-10" onClick={() => setIsPrintMenuOpen(false)}>
           <div className="bg-white rounded-[3rem] w-full max-w-6xl h-full lg:h-[90vh] flex flex-col overflow-hidden shadow-[0_35px_60px_-15px_rgba(0,0,0,0.3)] animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
              <header className="px-10 pt-10 pb-8 flex justify-between items-center shrink-0">
                <h2 className="text-3xl font-black italic uppercase tracking-tighter text-slate-800">CENTRAL DE ETIQUETAS</h2>
                <button onClick={() => setIsPrintMenuOpen(false)} className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all shadow-sm">
                  <X size={24} strokeWidth={3} />
                </button>
              </header>

              <div className="px-10 pb-8 flex flex-wrap items-center justify-between gap-6 shrink-0 border-b border-slate-50">
                 <div className="flex flex-wrap items-center gap-6">
                    <div className="bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100 flex gap-1">
                      {RACKS.map(r => (
                        <button key={r} onClick={() => setActiveRack(r)} className={`px-6 py-3 rounded-xl font-black text-xs transition-all ${activeRack === r ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300'}`}>
                          {r}
                        </button>
                      ))}
                    </div>

                    <div className="bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100 flex gap-1">
                      {LEVEL_LABELS.map((l, i) => (
                        <button key={l} onClick={() => setActiveLevelIndex(i)} className={`w-10 h-10 flex items-center justify-center rounded-xl font-black text-xs transition-all ${activeLevelIndex === i ? 'bg-slate-800 text-white shadow-md' : 'text-slate-300 bg-slate-50'}`}>
                          {l}
                        </button>
                      ))}
                    </div>

                    <div className="bg-slate-100 p-1.5 rounded-2xl flex gap-1 shadow-inner">
                       <button onClick={() => setPrintFilter('all')} className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase transition-all flex items-center gap-2 ${printFilter === 'all' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>
                         <Filter size={14}/> TODAS
                       </button>
                       <button onClick={() => setPrintFilter('free')} className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase transition-all flex items-center gap-2 ${printFilter === 'free' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}>
                         <Package size={14}/> LIVRES
                       </button>
                    </div>
                 </div>

                 <button 
                  onClick={generateBatchPDF}
                  disabled={isPrintingBatch}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-5 rounded-[1.5rem] font-black uppercase text-[11px] shadow-xl flex items-center gap-3 transition-all active:scale-95 disabled:opacity-50"
                 >
                   {isPrintingBatch ? <Loader2 className="animate-spin" /> : <><QrCode size={18}/> GERAR LOTE ({printFilter === 'all' ? 66 : Array.from({length: 66}).filter((_,i)=>!checkOccupancy(activeRack, activeLevelIndex + 1, i + 1)).length})</>}
                 </button>
              </div>

              <div className="flex-1 overflow-y-auto p-10 bg-slate-50/50 no-scrollbar">
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-10 gap-4">
                  {Array.from({ length: 66 }).map((_, i) => {
                    const pos = i + 1;
                    const level = activeLevelIndex + 1;
                    const label = `${activeRack}${pos}${LEVEL_LABELS[activeLevelIndex]}`;
                    
                    // Usa a função robusta checkOccupancy que considera vaga dupla
                    const isOccupied = checkOccupancy(activeRack, level, pos);

                    if (printFilter === 'free' && isOccupied) return null;
                    return (
                      <div key={pos} className={`bg-white p-6 rounded-[2.5rem] border border-white shadow-sm flex flex-col items-center justify-between gap-4 group hover:shadow-xl hover:border-indigo-100 transition-all duration-300 relative overflow-hidden`}>
                        {isOccupied && (
                          <div className="absolute top-3 right-3">
                             <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
                          </div>
                        )}
                        <span className="text-xl font-black italic text-slate-800 group-hover:text-indigo-600 transition-colors">{label}</span>
                        <button 
                          onClick={() => handlePrintSingle(pos)}
                          className="w-full py-2.5 bg-slate-50 text-slate-600 text-[8px] font-black uppercase tracking-widest rounded-full hover:bg-indigo-600 hover:text-white transition-all shadow-inner"
                        >
                          IMPRIMIR
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
           </div>
        </div>
      )}

      {/* BASE DE ITENS (REFORMULADO) */}
      {isMasterMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[8000] flex items-center justify-center p-0 lg:p-10" onClick={() => setIsMasterMenuOpen(false)}>
           <div className="bg-white rounded-none lg:rounded-[3rem] w-full max-w-4xl h-full lg:h-[85vh] flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
              <header className="p-8 border-b flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg"><ClipboardList size={24}/></div>
                  <h3 className="font-black text-2xl italic uppercase text-slate-800">Base de Itens (SKUs)</h3>
                </div>
                <button onClick={() => setIsMasterMenuOpen(false)} className="p-4 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-all"><X /></button>
              </header>

              <div className="p-8 bg-slate-50 border-b flex flex-col gap-6 shrink-0">
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                  <div className="relative flex-1 w-full">
                    <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20}/>
                    <input type="text" placeholder="BUSCAR POR SKU OU NOME..." className="w-full pl-12 p-4 bg-white border-2 border-slate-100 rounded-2xl font-black uppercase outline-none focus:border-indigo-600 transition-all shadow-sm" value={masterSearchQuery} onChange={e => setMasterSearchQuery(e.target.value)} />
                  </div>
                  <button onClick={() => setIsAddingNewSKU(!isAddingNewSKU)} className={`px-8 py-4 rounded-2xl font-black uppercase flex items-center gap-3 shadow-lg active:scale-95 transition-all w-full md:w-auto ${isAddingNewSKU ? 'bg-rose-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                    {isAddingNewSKU ? <X size={20}/> : <PlusCircle size={20}/>}
                    {isAddingNewSKU ? 'Cancelar' : 'Novo Item'}
                  </button>
                </div>

                {isAddingNewSKU && (
                  <form onSubmit={handleAddNewMasterProduct} className="bg-white p-8 rounded-[2rem] border-2 border-indigo-100 shadow-xl animate-in slide-in-from-top duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-2">ID SKU (Único)</label>
                        <input type="text" placeholder="EX: 102030" className="w-full p-4 bg-slate-50 rounded-xl font-black uppercase border border-transparent focus:border-indigo-500 outline-none" value={newSKUData.id} onChange={e => setNewSKUData({...newSKUData, id: e.target.value})} required />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Descrição Item</label>
                        <input type="text" placeholder="NOME DO PRODUTO" className="w-full p-4 bg-slate-50 rounded-xl font-black uppercase border border-transparent focus:border-indigo-500 outline-none" value={newSKUData.name} onChange={e => setNewSKUData({...newSKUData, name: e.target.value})} required />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Qtd. Padrão</label>
                        <input type="number" placeholder="EX: 50" className="w-full p-4 bg-slate-50 rounded-xl font-black border border-transparent focus:border-indigo-500 outline-none" value={newSKUData.qty || ''} onChange={e => setNewSKUData({...newSKUData, qty: parseInt(e.target.value) || 0})} />
                      </div>
                    </div>
                    <button type="submit" disabled={isProcessingAction} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-5 rounded-2xl font-black uppercase flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-all">
                      {isProcessingAction ? <Loader2 className="animate-spin" /> : <><Save size={20}/> Salvar Item na Base</>}
                    </button>
                  </form>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-3 no-scrollbar bg-slate-50/30">
                 {filteredMasterProducts.length > 0 ? filteredMasterProducts.map(item => (
                   <div key={item.productId} className="bg-white p-6 rounded-[2rem] border-2 border-slate-50 shadow-sm flex items-center justify-between hover:border-indigo-100 transition-all group">
                     <div>
                       <span className="text-[10px] font-black text-indigo-500 uppercase block mb-1">SKU: {item.productId}</span>
                       <h4 className="font-black text-slate-800 text-lg uppercase leading-tight">{item.productName}</h4>
                       <span className="text-[9px] font-bold text-slate-400 uppercase mt-2 block">Padrão: {item.standardQuantity} UN</span>
                     </div>
                     <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                       {currentUser?.role === 'admin' && (
                         <button onClick={() => setEditingProduct(item)} className="p-4 text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-2xl transition-all">
                           <Pencil size={24}/>
                         </button>
                       )}
                       <button onClick={() => {
                         if(confirm(`Excluir SKU ${item.productId} da base definitiva?`)) {
                           deleteMasterProductFromDB(FIXED_DB_STRING, item.productId).then(() => loadInitialData());
                         }
                       }} className="p-4 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all"><Trash2 size={24}/></button>
                     </div>
                   </div>
                 )) : (
                   <div className="flex flex-col items-center justify-center py-20 opacity-20">
                     <ClipboardList size={64} className="mb-4" />
                     <p className="font-black uppercase tracking-widest italic text-xs">Nenhum SKU encontrado</p>
                   </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {/* MODAL EDIÇÃO DE ITEM BASE (ADMIN) */}
      {editingProduct && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9000] flex items-center justify-center p-6" onClick={() => setEditingProduct(null)}>
           <div className="bg-white rounded-[3rem] w-full max-w-md p-10 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
             <h3 className="font-black uppercase mb-2 text-indigo-600 italic text-xl tracking-tighter">Editar Item Base</h3>
             <p className="text-xs font-bold text-slate-400 uppercase mb-8">SKU: {editingProduct.productId}</p>
             
             <form onSubmit={handleUpdateMasterProduct} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-2">ID SKU (Bloqueado)</label>
                  <input type="text" className="w-full p-5 bg-slate-100 border border-transparent rounded-2xl font-black uppercase text-slate-400 cursor-not-allowed" value={editingProduct.productId} disabled /> 
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Nome / Descrição</label>
                  <input type="text" className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl font-black uppercase outline-none transition-all" value={editingProduct.productName} onChange={e => setEditingProduct({...editingProduct, productName: e.target.value.toUpperCase()})} required />
                </div>
                
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Quantidade Padrão</label>
                  <input type="number" className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl font-black outline-none transition-all" value={editingProduct.standardQuantity} onChange={e => setEditingProduct({...editingProduct, standardQuantity: parseInt(e.target.value) || 0})} required />
                </div>

                <button type="submit" disabled={isProcessingAction} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-6 rounded-[2rem] font-black uppercase shadow-2xl active:scale-95 transition-all text-lg flex items-center justify-center gap-2 mt-4">
                  {isProcessingAction ? <Loader2 className="animate-spin" /> : 'Salvar Alterações'}
                </button>
             </form>
           </div>
        </div>
      )}

      {/* RELATÓRIO DE SALDO GERAL */}
      {isInventoryReportOpen && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[8000] flex items-center justify-center p-0 lg:p-10" onClick={() => setIsInventoryReportOpen(false)}>
           <div className="bg-white rounded-none lg:rounded-[3rem] w-full max-w-5xl h-full lg:h-[85vh] flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
              <header className="p-8 border-b flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-lg"><ListChecks size={24}/></div>
                  <h3 className="font-black text-2xl italic uppercase text-slate-800">Saldo Geral de Estoque</h3>
                </div>
                <div className="flex gap-3">
                  <button onClick={handleDownloadReport} className="px-6 py-3 bg-slate-800 text-white rounded-2xl font-black uppercase text-xs flex items-center gap-2 hover:bg-slate-700 transition-all shadow-md">
                     <FileDown size={16}/> Baixar PDF
                  </button>
                  <button onClick={() => setIsInventoryReportOpen(false)} className="p-4 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-all"><X /></button>
                </div>
              </header>

              <div className="p-6 bg-slate-50 border-b flex items-center gap-4 shrink-0">
                 <div className="relative flex-1">
                    <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20}/>
                    <input type="text" placeholder="FILTRAR POR SKU OU NOME..." className="w-full pl-12 p-4 bg-white border-2 border-slate-200 rounded-2xl font-black uppercase outline-none focus:border-emerald-600 transition-all shadow-sm" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                 </div>
                 <div className="bg-white px-6 py-4 rounded-2xl border border-slate-200 shadow-sm">
                   <span className="text-[10px] font-black uppercase text-slate-400 block">Total SKUs</span>
                   <span className="text-xl font-black text-emerald-600">{aggregatedInventory.length}</span>
                 </div>
              </div>

              <div className="flex-1 overflow-y-auto p-0 no-scrollbar">
                 <table className="w-full text-left border-collapse">
                   <thead className="bg-slate-100 sticky top-0 z-10 shadow-sm">
                     <tr>
                       <th className="p-6 text-[10px] font-black text-slate-500 uppercase tracking-widest">SKU / Produto</th>
                       <th className="p-6 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Total (UN)</th>
                       <th className="p-6 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Endereços</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                     {aggregatedInventory.length > 0 ? aggregatedInventory.map((item, idx) => (
                       <tr key={idx} className="hover:bg-slate-50 transition-colors">
                         <td className="p-6">
                           <span className="text-[10px] font-black text-emerald-600 uppercase block mb-1">SKU: {item.id}</span>
                           <span className="font-bold text-slate-800 uppercase text-sm block">{item.name}</span>
                         </td>
                         <td className="p-6 text-center">
                           <span className="bg-slate-800 text-white px-4 py-2 rounded-xl font-black text-sm shadow-sm">{item.total}</span>
                         </td>
                         <td className="p-6 text-right">
                           <div className="flex flex-wrap justify-end gap-1">
                             {item.locs.map(loc => (
                               <span key={loc} className={`px-2 py-1 border rounded-lg text-[9px] font-bold uppercase ${loc === 'EXTERNO' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-white text-slate-500 border-slate-200'}`}>{loc}</span>
                             ))}
                           </div>
                         </td>
                       </tr>
                     )) : (
                       <tr>
                         <td colSpan={3} className="p-10 text-center opacity-40">
                            <Package size={48} className="mx-auto mb-4"/>
                            <span className="text-xs font-black uppercase">Nenhum item em estoque</span>
                         </td>
                       </tr>
                     )}
                   </tbody>
                 </table>
              </div>
           </div>
        </div>
      )}

      {/* MODAL DETALHES DO PALLET */}
      {palletDetails && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[9000] flex items-center justify-center p-6" onClick={() => setPalletDetails(null)}>
           <div className="bg-white rounded-[3rem] w-full max-w-md p-10 shadow-2xl animate-in zoom-in-95 text-center" onClick={e => e.stopPropagation()}>
              <header className="flex justify-between items-center mb-8 shrink-0">
                <div className="flex items-center gap-2">
                  <Info className="text-indigo-600" size={20}/>
                  <h3 className="font-black uppercase text-indigo-600 italic">Detalhes do Pallet</h3>
                </div>
                <button onClick={() => setPalletDetails(null)} className="p-3 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-all"><X /></button>
              </header>
              <div className="bg-indigo-50 p-10 rounded-[2.5rem] mb-8 border border-indigo-100 shadow-inner">
                <span className="text-4xl font-black italic text-indigo-600 block mb-4 uppercase">
                  {palletDetails.rack === 'FLOOR' ? 'EXTERNO (CHÃO)' : `${palletDetails.rack} ${palletDetails.position} ${palletDetails.slots === 2 ? `e ${palletDetails.position + 1}` : ''} ${LEVEL_LABELS[palletDetails.level-1]}`}
                </span>
                <span className="text-[10px] font-black text-indigo-400 block mb-4 uppercase">
                   {palletDetails.rack === 'FLOOR' ? 'Armazenagem de Piso' : `Vaga ${palletDetails.slots === 2 ? 'Dupla' : 'Simples'}`}
                </span>
                <h4 className="font-black text-slate-800 uppercase text-lg mb-4 leading-tight">{palletDetails.productName}</h4>
                <div className="flex justify-center gap-3">
                  <span className="px-5 py-2 bg-white rounded-xl text-xs font-black shadow-sm">SKU: {palletDetails.productId}</span>
                  <span className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-md">{palletDetails.quantity} UN</span>
                </div>
                <div className="mt-4 pt-4 border-t border-indigo-200/50">
                   <span className="text-[9px] font-bold text-slate-400 uppercase block">Data de Entrada (FIFO):</span>
                   <span className="text-xs font-black text-slate-600 uppercase">
                     {new Date(palletDetails.createdAt || palletDetails.lastUpdated).toLocaleString()}
                   </span>
                </div>
              </div>

              {!isPartialExitMode ? (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      disabled={isProcessingAction}
                      onClick={() => setIsPartialExitMode(true)}
                      className="w-full bg-amber-500 hover:bg-amber-600 text-white p-6 rounded-[2rem] font-black uppercase shadow-xl active:scale-95 transition-all text-sm flex flex-col items-center justify-center gap-1 border-b-4 border-amber-700"
                    >
                      <PackageMinus size={24} />
                      Saída Parcial
                    </button>

                    <button 
                      disabled={isProcessingAction}
                      onClick={handleTotalExit} 
                      className="w-full bg-rose-600 hover:bg-rose-700 text-white p-6 rounded-[2rem] font-black uppercase shadow-xl active:scale-95 transition-all text-sm flex flex-col items-center justify-center gap-1 border-b-4 border-rose-800"
                    >
                      <PackageX size={24} />
                      Baixa Total
                    </button>
                  </div>
                  
                  {/* Botão de Adicionar Mais Itens (Apenas Admin) */}
                  {currentUser?.role === 'admin' && palletDetails.rack !== 'FLOOR' && (
                    <button 
                      disabled={isProcessingAction}
                      onClick={handleAddToStock}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white p-4 rounded-[1.5rem] font-black uppercase shadow-lg active:scale-95 transition-all text-[10px] flex items-center justify-center gap-2 border-b-4 border-emerald-800"
                    >
                      <PackagePlus size={18} />
                      ADICIONAR MAIS (+ ITENS NESTA POSIÇÃO)
                    </button>
                  )}
                </div>
              ) : (
                <div className="bg-amber-50 p-6 rounded-[2rem] border border-amber-200 animate-in slide-in-from-bottom duration-300">
                  <h4 className="text-amber-600 font-black uppercase text-xs mb-4">Quantidade a retirar:</h4>
                  <input 
                    type="number" 
                    autoFocus
                    placeholder="QTD" 
                    className="w-full p-4 bg-white border-2 border-amber-200 rounded-xl text-center font-black text-2xl outline-none focus:border-amber-500 text-slate-800 mb-4"
                    value={partialQuantity}
                    onChange={(e) => setPartialQuantity(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handlePartialExit();
                    }}
                  />

                  {/* Calculadora Visual de Saldo Restante */}
                  <div className="bg-white p-4 rounded-xl border border-amber-100 mb-4 flex flex-col gap-3">
                     {/* Saldo Local */}
                     <div>
                       <span className="text-[8px] font-black uppercase text-indigo-400 mb-1 block">Nesta Posição:</span>
                       <div className="flex justify-between items-center font-black text-sm bg-slate-50 p-2 rounded-lg">
                         <span className="text-slate-600">{palletDetails.quantity}</span>
                         <span className="text-rose-400">- {partialQuantity || 0}</span>
                         <span className="text-slate-300">=</span>
                         <span className={`text-lg ${(palletDetails.quantity - (parseInt(partialQuantity) || 0)) < 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                           {Math.max(0, (palletDetails.quantity || 0) - (parseInt(partialQuantity) || 0))}
                         </span>
                       </div>
                     </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => { setIsPartialExitMode(false); setPartialQuantity(''); }}
                      className="p-4 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-xl font-black uppercase text-[10px]"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handlePartialExit}
                      disabled={isProcessingAction}
                      className="p-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-black uppercase text-[10px] shadow-lg flex items-center justify-center gap-2"
                    >
                      {isProcessingAction ? <Loader2 className="animate-spin" size={14}/> : 'Confirmar'}
                    </button>
                  </div>
                </div>
              )}
           </div>
        </div>
      )}

      {/* MODAL NOVA ENTRADA MANUAL (VAGA VAZIA ou FLOOR) */}
      {selectedPosition && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[9000] flex items-center justify-center p-6" onClick={() => setSelectedPosition(null)}>
           <div className="bg-white rounded-[3rem] w-full max-w-md p-10 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <header className="flex justify-between items-center mb-8">
                 <div>
                    <h3 className="font-black uppercase text-indigo-600 italic text-xl tracking-tighter">Nova Entrada</h3>
                    <span className="text-xs font-bold text-slate-400 uppercase">
                       Local: {selectedPosition.rack === 'FLOOR' ? 'EXTERNO (CHÃO)' : `${selectedPosition.rack}-${selectedPosition.position} (Nível ${selectedPosition.level})`}
                    </span>
                 </div>
                 <button onClick={() => setSelectedPosition(null)} className="p-3 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-all"><X /></button>
              </header>

              <form onSubmit={handleManualEntrySubmit} className="space-y-6">
                 <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 ml-2">Produto (SKU)</label>
                    <input 
                       list="sku-list-manual" 
                       autoFocus
                       className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase border-2 border-transparent focus:border-indigo-600 outline-none transition-all"
                       placeholder="BUSCAR SKU..."
                       value={manualEntryData.sku}
                       onChange={e => {
                         const newSku = e.target.value.toUpperCase();
                         const masterItem = masterProducts.find(m => m.productId === newSku);
                         setManualEntryData({
                           sku: newSku,
                           // Se encontrar o item na base, preenche a quantidade, senão mantém a atual
                           qty: masterItem ? masterItem.standardQuantity.toString() : manualEntryData.qty
                         });
                       }}
                    />
                    <datalist id="sku-list-manual">
                       {masterProducts.map(m => <option key={m.productId} value={m.productId}>{m.productName}</option>)}
                    </datalist>
                 </div>

                 <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 ml-2">Quantidade</label>
                    <input 
                       type="number" 
                       className="w-full p-5 bg-slate-50 rounded-2xl font-black text-2xl outline-none border-2 border-transparent focus:border-indigo-600 transition-all"
                       placeholder="0"
                       value={manualEntryData.qty}
                       onChange={e => setManualEntryData({...manualEntryData, qty: e.target.value})}
                    />
                 </div>

                 <button type="submit" disabled={isProcessingAction} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white p-6 rounded-[2rem] font-black uppercase shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 text-lg">
                    {isProcessingAction ? <Loader2 className="animate-spin"/> : <><Save size={24}/> Confirmar Entrada</>}
                 </button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;