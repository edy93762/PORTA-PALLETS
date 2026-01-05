// @ts-nocheck
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Package, Warehouse, X, ScanLine, Printer, Loader2, 
  ClipboardList, Trash2, Menu, AlertCircle, CheckCircle2, Search as SearchIcon, 
  QrCode, ArrowDownRight, ListChecks, History, LogOut, ArrowRightCircle, UserPlus, ShieldCheck, MapPin, Info, 
  FileDown, PlusCircle, Filter, Save, PackageMinus, PackageX, Ban, Calculator, Plus, ArrowRight, Minus, Calendar, User, Users, ShieldAlert, PackagePlus, Pencil, LayoutGrid, Clock, AlertTriangle, ArrowUpAZ, ArrowRightToLine, PackageCheck, ArrowUp, Layers, RefreshCcw, Eye, MousePointerClick, Download, Container, ChevronRight, CopyPlus
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

// --- CONFIGURAÇÃO ATUALIZADA DO ARMAZÉM ---
const PP_RACKS: RackId[] = ['A', 'B', 'C', 'D']; 
const VERTICAL_RACKS: RackId[] = ['1', '2', '3', '4']; 
const ALL_RACKS = [...VERTICAL_RACKS, ...PP_RACKS];

// Configuração de Níveis Distinta
const LEVELS_PP = ['A', 'B', 'C', 'D', 'E']; // Porta Pallets: 5 Níveis
const LEVELS_RACK = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']; // Racks Verticais: 8 Níveis

const getPositionsForRack = (rack: string) => 66;

// Helper para pegar os níveis corretos baseado no Rack selecionado
const getLevelsForRack = (rack: RackId | string) => {
  return VERTICAL_RACKS.includes(rack as RackId) ? LEVELS_RACK : LEVELS_PP;
};

const FIXED_DB_STRING = "postgresql://neondb_owner:npg_JaZLTzrqMc09@ep-fragrant-cherry-ac95x95d-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require";
const SECRET_REGISTRATION_KEY = "Shopee@2026";
const STORAGE_KEY = "almox_pro_user_session";

const BLOCKED_LOCATIONS = [
  { rack: 'A', level: 2, positions: [35, 36] } 
];

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) { console.error("Erro sessão", e); }
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  
  // Menus
  const [isMasterMenuOpen, setIsMasterMenuOpen] = useState(false);
  const [isInventoryReportOpen, setIsInventoryReportOpen] = useState(false);
  const [isPrintMenuOpen, setIsPrintMenuOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isExternalMenuOpen, setIsExternalMenuOpen] = useState(false);
  const [isFIFOMenuOpen, setIsFIFOMenuOpen] = useState(false);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);

  // SKU Management
  const [isAddingNewSKU, setIsAddingNewSKU] = useState(false);
  const [newSKUData, setNewSKUData] = useState({ id: '', name: '', qty: 0 });
  const [editingProduct, setEditingProduct] = useState<MasterProduct | null>(null);
  const [isEditingMode, setIsEditingMode] = useState(false); 
  
  // Calculator Data
  const [calcData, setCalcData] = useState({ sku: '', totalItems: '', qtyPerPallet: '' });

  // Navigation
  const [activeRack, setActiveRack] = useState<RackId>('1');
  const [activeLevelIndex, setActiveLevelIndex] = useState<number>(0); 
  
  // Manual Entry
  const [selectedPosition, setSelectedPosition] = useState<PalletPosition | null>(null);
  const [manualEntryData, setManualEntryData] = useState({ sku: '', qty: '', slots: 1 });

  // Details & Scanner
  const [activeLocationItems, setActiveLocationItems] = useState<PalletPosition[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [palletDetailsQrUrl, setPalletDetailsQrUrl] = useState<string | null>(null);
  const [isAccessViaScanner, setIsAccessViaScanner] = useState(false);
  
  // Entrada Rápida
  const [isBulkEntryOpen, setIsBulkEntryOpen] = useState(false);
  const [rapidEntryData, setRapidEntryData] = useState({
    productId: '',
    qtyPerPallet: 0,
    targetRack: 'A' as RackId,
    targetLevel: 1,
    selectedPositions: [] as number[],
    slots: 1
  });

  // Saída Rápida
  const [isBulkExitOpen, setIsBulkExitOpen] = useState(false);
  const [rapidExitData, setRapidExitData] = useState({
    targetRack: 'A' as RackId,
    targetLevel: 1,
    selectedPositions: [] as number[]
  });
  
  // Etiquetas Seleção
  const [printSelectionData, setPrintSelectionData] = useState({
    targetRack: 'A' as RackId,
    targetLevel: 1,
    selectedPositions: [] as number[]
  });

  // Partial Exit (Specific Item)
  const [itemToExit, setItemToExit] = useState<PalletPosition | null>(null);
  const [partialQuantity, setPartialQuantity] = useState<string>('');

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [fifoSearchQuery, setFifoSearchQuery] = useState('');
  const [masterSearchQuery, setMasterSearchQuery] = useState('');
  const [isPrintingBatch, setIsPrintingBatch] = useState(false);
  const [floorBatchQty, setFloorBatchQty] = useState<string>('1');

  // GLOBAL TOOLTIP STATE
  const [hoveredInfo, setHoveredInfo] = useState<{ items: PalletPosition[], x: number, y: number } | null>(null);

  // Computed Levels for Current View
  const currentLevels = useMemo(() => getLevelsForRack(activeRack), [activeRack]);

  // Check Occupancy Helper
  const checkOccupancy = useCallback((rack: RackId, level: number, pos: number) => {
    return inventory.some(i => 
      (i.rack === rack && i.level === level && i.position === pos)
    );
  }, [inventory]);

  const loadInitialData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const invPromise = fetchInventoryFromDB(FIXED_DB_STRING).catch(e => { console.error("Inv Error", e); return []; });
      const masterPromise = fetchMasterProductsFromDB(FIXED_DB_STRING).catch(e => { console.error("Master Error", e); return []; });
      const [inv, masters] = await Promise.all([invPromise, masterPromise]);
      setInventory(inv);
      setMasterProducts(masters);
    } catch (e) { 
      console.error("Critical Data load error", e);
    } finally {
      setIsLoadingData(false);
      setIsRefreshing(false);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setIsLoadingLogs(true);
    try {
      const history = await fetchLogsFromDB(FIXED_DB_STRING);
      setLogs(history);
    } catch (e) {
      console.error("Logs Error", e);
    } finally {
      setIsLoadingLogs(false);
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
      } catch (e) { console.error("Erro inicial no banco"); }
    };
    init();
    const interval = setInterval(loadInitialData, 30000);
    return () => clearInterval(interval);
  }, [loadInitialData]);

  useEffect(() => {
    if (isUserManagementOpen) loadUsersData();
  }, [isUserManagementOpen, loadUsersData]);

  useEffect(() => {
    if (isLogsOpen) loadLogs();
  }, [isLogsOpen, loadLogs]);

  useEffect(() => {
    if (isInventoryReportOpen || isMasterMenuOpen || isPrintMenuOpen) loadInitialData();
  }, [isInventoryReportOpen, isMasterMenuOpen, isPrintMenuOpen, loadInitialData]);

  useEffect(() => {
    if (activeLocationItems.length > 0) {
      const item = activeLocationItems[0];
      const codeValue = item.rack === 'FLOOR' 
        ? `PP-FLOOR-ID-${item.id}` 
        : `PP-${item.rack}-P-${item.position}-L-${item.level}`;
      QRCode.toDataURL(codeValue, { width: 200, margin: 1 }, (err, url) => {
        if (!err) setPalletDetailsQrUrl(url);
      });
    } else {
      setPalletDetailsQrUrl(null);
    }
  }, [activeLocationItems]);

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
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
        showFeedback('success', `Bem-vindo, ${user.username}!`);
      } else {
        showFeedback('error', 'Login ou senha incorretos.');
      }
    } catch (e) { showFeedback('error', 'Erro de conexão.'); } finally { setIsLoggingIn(false); }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    sessionStorage.removeItem(STORAGE_KEY);
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
      const newUser = { username: loginData.user.trim().toLowerCase(), password: loginData.pass, role: 'operator' };
      await saveUserToDB(FIXED_DB_STRING, newUser);
      showFeedback('success', 'Usuário cadastrado! Já pode entrar.');
      setIsRegisterMode(false);
      setLoginData({ user: '', pass: '', secret: '' });
    } catch (e) { showFeedback('error', 'Erro ao cadastrar usuário.'); } finally { setIsLoggingIn(false); }
  };

  const handleUpdateRole = async (targetUser: AppUser) => {
    if (currentUser?.role !== 'admin' || targetUser.username === currentUser.username) return;
    const newRole = targetUser.role === 'admin' ? 'operator' : 'admin';
    if (confirm(`Alterar cargo de ${targetUser.username} para ${newRole}?`)) {
        try {
            await updateUserRoleInDB(FIXED_DB_STRING, targetUser.username, newRole);
            await loadUsersData(); 
            showFeedback('success', 'Cargo atualizado.');
        } catch (e) { showFeedback('error', 'Erro ao atualizar.'); }
    }
  };

  const handleRackChange = (rack: RackId) => {
    setActiveRack(rack);
    // Reset active level if it exceeds the new rack's max levels
    const levels = getLevelsForRack(rack);
    if (activeLevelIndex >= levels.length) {
      setActiveLevelIndex(0);
    }
  };

  const handleQrScan = (decodedText: string) => {
    const rackMatch = decodedText.match(/PP-([1-4A-D])-P-(\d+)-L-(\d+)/);
    const floorMatch = decodedText.match(/PP-FLOOR-ID-(.+)/);

    if (rackMatch) {
      const rack = rackMatch[1] as RackId;
      const pos = parseInt(rackMatch[2]);
      const level = parseInt(rackMatch[3]);
      const levelsLabels = getLevelsForRack(rack);
      
      const items = inventory.filter(i => i.rack === rack && i.position === pos && i.level === level);
      
      setIsScannerOpen(false); 
      
      if (items.length > 0) {
        setIsAccessViaScanner(true);
        setActiveLocationItems(items);
        setIsSidebarOpen(true);
        showFeedback('success', 'Código reconhecido! Acesso liberado.');
      } else {
        setSelectedPosition({ id: `${rack}${pos}${levelsLabels[level - 1]}`, rack, level, position: pos, productId: '', productName: '', quantity: 0, slots: 1 });
        showFeedback('success', 'Etiqueta Livre. Iniciando entrada.');
      }
    } else if (floorMatch) {
      const uniqueId = floorMatch[1];
      const item = inventory.find(i => i.id === uniqueId);
      setIsScannerOpen(false);
      if (item) {
         setIsAccessViaScanner(true);
         setActiveLocationItems([item]);
         setIsSidebarOpen(true);
      } else {
         setSelectedPosition({ id: uniqueId, rack: 'FLOOR', level: 0, position: 0, productId: '', productName: '', quantity: 0, slots: 1 });
         showFeedback('success', 'Etiqueta de Chão Livre.');
      }
    } else {
      showFeedback('error', 'Código Inválido.');
    }
  };

  const handleAddItemToLocation = () => {
    if (activeLocationItems.length === 0) return;
    const baseItem = activeLocationItems[0];
    const levels = getLevelsForRack(baseItem.rack);
    const levelLabel = levels[baseItem.level - 1] || baseItem.level;
    const cleanId = baseItem.rack === 'FLOOR' 
        ? `F-${Date.now()}` 
        : `${baseItem.rack}${baseItem.position}${levelLabel}`;
    
    setSelectedPosition({
        id: cleanId, // This ID is the base for manual entry, which will append timestamp
        rack: baseItem.rack,
        level: baseItem.level,
        position: baseItem.position,
        productId: '',
        productName: '',
        quantity: 0,
        slots: 1
    });
    setManualEntryData({ sku: '', qty: '', slots: 1 });
    setIsSidebarOpen(false);
  };

  const handleManualEntrySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPosition || !manualEntryData.sku || !manualEntryData.qty) return;
    setIsProcessingAction(true);
    const opName = currentUser?.username || 'Sistema';
    const masterItem = masterProducts.find(m => m.productId === manualEntryData.sku);
    const productName = masterItem?.productName || 'PRODUTO NÃO CADASTRADO';
    
    // Sempre gera um ID único para permitir múltiplos itens na mesma posição
    const timestampId = `${selectedPosition.id}-${Date.now()}`;

    try {
        const newItem = {
            ...selectedPosition, 
            id: selectedPosition.rack === 'FLOOR' ? selectedPosition.id : timestampId,
            productId: manualEntryData.sku, 
            productName: productName,
            quantity: parseInt(manualEntryData.qty), 
            slots: manualEntryData.slots, // Usa o valor do estado
            lastUpdated: new Date().toISOString(), 
            createdAt: new Date().toISOString()
        };
        await saveItemToDB(FIXED_DB_STRING, newItem);
        await saveLogToDB(FIXED_DB_STRING, {
            username: opName, action: 'ENTRADA', details: `ENTRADA: ${newItem.productId} (${newItem.quantity})`, location: newItem.rack === 'FLOOR' ? 'EXTERNO' : `${newItem.rack}-${newItem.position}`, timestamp: new Date().toISOString()
        });
        await loadInitialData();
        showFeedback('success', 'Entrada realizada!');
        setSelectedPosition(null);
        setManualEntryData({ sku: '', qty: '', slots: 1 });
    } catch (e) { showFeedback('error', 'Erro ao salvar.'); } finally { setIsProcessingAction(false); }
  };

  const handleRapidEntrySubmit = async () => {
    if (!rapidEntryData.productId || rapidEntryData.qtyPerPallet <= 0 || rapidEntryData.selectedPositions.length === 0) {
       showFeedback('error', 'Dados inválidos ou nenhuma posição selecionada.');
       return;
    }
    setIsProcessingAction(true);
    const opName = currentUser?.username || 'Sistema';
    const masterItem = masterProducts.find(m => m.productId === rapidEntryData.productId);
    const productName = masterItem?.productName || 'DESCONHECIDO';
    const levelsLabels = getLevelsForRack(rapidEntryData.targetRack);

    try {
      for (const pos of rapidEntryData.selectedPositions) {
        const locationBase = `${rapidEntryData.targetRack}${pos}${levelsLabels[rapidEntryData.targetLevel-1]}`;
        const uniqueId = `${locationBase}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

        await saveItemToDB(FIXED_DB_STRING, {
          id: uniqueId, 
          rack: rapidEntryData.targetRack, 
          level: rapidEntryData.targetLevel, 
          position: pos,
          productId: rapidEntryData.productId, 
          productName: productName, 
          quantity: rapidEntryData.qtyPerPallet,
          slots: rapidEntryData.slots || 1, // Usa a configuração de slots
          lastUpdated: new Date().toISOString(), 
          createdAt: new Date().toISOString()
        });
        await saveLogToDB(FIXED_DB_STRING, {
          username: opName, action: 'ENTRADA', details: `ENTRADA RÁPIDA: ${rapidEntryData.productId}`, location: locationBase, timestamp: new Date().toISOString()
        });
      }
      await loadInitialData();
      showFeedback('success', `Entrada realizada em ${rapidEntryData.selectedPositions.length} posições!`);
      setIsBulkEntryOpen(false);
      setRapidEntryData({ ...rapidEntryData, selectedPositions: [], slots: 1 });
    } catch (e) { showFeedback('error', 'Erro ao salvar entrada.'); } finally { setIsProcessingAction(false); }
  };

  const handleDeleteItem = async (item: PalletPosition) => {
    if(!confirm(`Confirma remover ${item.productId} (${item.quantity} UN)?`)) return;
    
    setIsProcessingAction(true);
    const opName = currentUser?.username || 'Sistema';
    try {
      await deleteItemFromDB(FIXED_DB_STRING, item);
      await saveLogToDB(FIXED_DB_STRING, {
        username: opName, action: 'SAIDA', details: `BAIXA TOTAL: ${item.productId}`, location: item.rack === 'FLOOR' ? 'EXTERNO' : `${item.rack}-${item.position}`, timestamp: new Date().toISOString()
      });
      
      const updatedList = activeLocationItems.filter(i => i.id !== item.id);
      setActiveLocationItems(updatedList);
      if (updatedList.length === 0) setIsSidebarOpen(false);

      await loadInitialData();
      showFeedback('success', 'Item removido!');
    } catch (e) { showFeedback('error', 'Falha ao remover.'); } finally { setIsProcessingAction(false); }
  };

  const handlePartialExit = async () => {
    if (!itemToExit) return;
    const qtd = parseInt(partialQuantity);
    if (isNaN(qtd) || qtd <= 0 || qtd > (itemToExit.quantity || 0)) { showFeedback('error', 'Quantidade inválida'); return; }
    if (qtd === itemToExit.quantity) { handleDeleteItem(itemToExit); setItemToExit(null); return; }

    setIsProcessingAction(true);
    const opName = currentUser?.username || 'Sistema';
    const newQuantity = (itemToExit.quantity || 0) - qtd;
    try {
        const updated = { ...itemToExit, quantity: newQuantity, lastUpdated: new Date().toISOString() };
        await saveItemToDB(FIXED_DB_STRING, updated);
        await saveLogToDB(FIXED_DB_STRING, {
          username: opName, action: 'SAIDA', details: `SAIDA PARCIAL (-${qtd}): ${itemToExit.productId}`, location: itemToExit.rack === 'FLOOR' ? 'EXTERNO' : `${itemToExit.rack}-${itemToExit.position}`, timestamp: new Date().toISOString()
        });
        
        const updatedList = activeLocationItems.map(i => i.id === itemToExit.id ? updated : i);
        setActiveLocationItems(updatedList);
        
        await loadInitialData();
        setItemToExit(null);
        setPartialQuantity('');
        showFeedback('success', 'Saída parcial registrada!');
    } catch (e) { showFeedback('error', 'Erro na saída parcial.'); } finally { setIsProcessingAction(false); }
  };

  const stats = useMemo(() => {
    let blockedCount = 0;
    BLOCKED_LOCATIONS.forEach(b => {
        if (!VERTICAL_RACKS.includes(b.rack as RackId)) blockedCount += b.positions.length;
    });
    
    let totalRaw = 0;
    // Calculate PP Capacity (Levels A-E = 5)
    PP_RACKS.forEach(r => { totalRaw += (getPositionsForRack(r) * LEVELS_PP.length); });
    
    // NOT counting Vertical Racks in capacity as per previous instructions ("racks nao conta aki")
    
    const total = totalRaw - blockedCount; 
    
    const relevantInventory = inventory.filter(i => 
        i.rack !== 'FLOOR' && !VERTICAL_RACKS.includes(i.rack)
    );
    
    const occupiedSet = new Set();
    relevantInventory.forEach(i => occupiedSet.add(`${i.rack}-${i.level}-${i.position}`));
    const occupiedCount = occupiedSet.size;

    const free = Math.max(0, total - occupiedCount);
    const rate = total > 0 ? ((occupiedCount / total) * 100).toFixed(1) : 0;
    return { total, occupied: occupiedCount, free, rate };
  }, [inventory]);

  const getItemsAt = (rack: RackId, level: number, pos: number) => {
      return inventory.filter(i => i.rack === rack && i.level === level && i.position === pos);
  };

  const renderPalletGrid = () => {
    const gridElements = [];
    const maxPositions = getPositionsForRack(activeRack); 

    for (let p = 1; p <= maxPositions; p++) {
      const currentLevel = activeLevelIndex + 1;
      const isBlocked = BLOCKED_LOCATIONS.some(b => b.rack === activeRack && b.level === currentLevel && b.positions.includes(p));

      if (isBlocked) {
        gridElements.push(<div key={p} className="aspect-square rounded-2xl bg-red-900 border-red-800 opacity-50 flex items-center justify-center"><Ban size={14} className="text-white"/></div>);
        continue;
      }

      const items = getItemsAt(activeRack, currentLevel, p);
      const isOccupied = items.length > 0;
      const isMultiple = items.length > 1;
      
      gridElements.push(
        <button 
          key={p} 
          onClick={() => {
            if(isBlocked) return;
            setIsAccessViaScanner(false);
            if(isOccupied) { 
                setActiveLocationItems(items); 
                setIsSidebarOpen(true); 
            } else {
                if(currentUser?.role !== 'admin') { showFeedback('error', 'Apenas ADMIN faz entrada manual.'); return; }
                const cleanId = `${activeRack}${p}${LEVELS_PP[activeLevelIndex]}`;
                setSelectedPosition({ id: cleanId, rack: activeRack, level: currentLevel, position: p, productId: '', productName: '', quantity: 0, slots: 1 }); 
                setManualEntryData({ sku: '', qty: '', slots: 1 });
            }
          }} 
          onMouseEnter={(e) => {
             if (isOccupied) {
                 const rect = e.currentTarget.getBoundingClientRect();
                 setHoveredInfo({ items: items, x: rect.left + rect.width / 2, y: rect.top });
             }
          }}
          onMouseLeave={() => setHoveredInfo(null)}
          className={`aspect-square rounded-2xl font-black flex flex-col items-center justify-center transition-all border shadow-sm relative
            ${isOccupied ? 'bg-rose-500 text-white border-rose-600' : 'bg-emerald-500 text-white border-emerald-600 hover:scale-105 active:scale-95'}`}
        >
          <div className="flex flex-col items-center justify-center leading-none pointer-events-none">
            <span className="text-[13px] md:text-[15px] font-black drop-shadow-sm whitespace-nowrap">{activeRack} {p} {LEVELS_PP[activeLevelIndex]}</span>
            {isOccupied && (
                <div className="mt-1 flex items-center gap-1">
                    <Package size={16} strokeWidth={3} className="opacity-90"/>
                    {isMultiple && <span className="text-[10px] bg-white text-rose-600 rounded-full px-1.5 font-bold shadow-sm">+{items.length-1}</span>}
                </div>
            )}
          </div>
        </button>
      );
    }
    return gridElements;
  };

  const renderVerticalRack = () => {
    const elements = [];
    // Racks Verticais vão até H (8 níveis)
    for (let l = LEVELS_RACK.length; l >= 1; l--) {
      const pos = 1;
      const items = getItemsAt(activeRack, l, pos);
      const isOccupied = items.length > 0;
      const isMultiple = items.length > 1;
      
      elements.push(
        <button
          key={l}
          onClick={() => {
            setIsAccessViaScanner(false);
            if(isOccupied) { 
                setActiveLocationItems(items); 
                setIsSidebarOpen(true);
            } else {
                if(currentUser?.role !== 'admin') { showFeedback('error', 'Apenas ADMIN faz entrada manual.'); return; }
                const cleanId = `${activeRack}1${LEVELS_RACK[l - 1]}`;
                setSelectedPosition({ id: cleanId, rack: activeRack, level: l, position: 1, productId: '', productName: '', quantity: 0, slots: 1 });
                setManualEntryData({ sku: '', qty: '', slots: 1 });
            }
          }}
           onMouseEnter={(e) => {
             if (isOccupied) {
                 const rect = e.currentTarget.getBoundingClientRect();
                 setHoveredInfo({ items: items, x: rect.left + rect.width / 2, y: rect.top });
             }
          }}
          onMouseLeave={() => setHoveredInfo(null)}
          className={`w-full h-24 rounded-3xl flex items-center justify-between px-8 border-b-4 transition-all mb-3 shadow-sm
            ${isOccupied 
              ? 'bg-rose-500 text-white border-rose-700' 
              : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}`}
        >
          <div className="flex flex-col text-left">
            <span className="text-sm font-black uppercase opacity-60">NÍVEL</span>
            <span className="text-4xl font-black">{LEVELS_RACK[l-1]}</span>
          </div>
          
          <div className="flex items-center gap-4">
             {isOccupied ? (
               <div className="text-right">
                  <span className="text-[10px] font-black uppercase bg-rose-700/30 px-2 py-1 rounded block mb-1">
                      {isMultiple ? 'VÁRIOS ITENS' : items[0].productId}
                  </span>
                  <span className="text-lg font-black leading-none block">
                      {isMultiple ? `${items.length} SKUs` : `${items[0].quantity} UN`}
                  </span>
               </div>
             ) : (
               <span className="text-xs font-black uppercase tracking-widest opacity-40">Vazio</span>
             )}
             <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isOccupied ? 'bg-white/20' : 'bg-slate-100'}`}>
                {isOccupied ? (isMultiple ? <Layers size={24} className="text-white"/> : <Package size={24} className="text-white"/>) : <Container size={24} className="text-slate-300"/>}
             </div>
          </div>
        </button>
      );
    }
    return elements;
  }

  // Modais helpers...
  const toggleRapidPosition = (pos: number) => { const currentSelected = [...rapidEntryData.selectedPositions]; const index = currentSelected.indexOf(pos); if (index > -1) { currentSelected.splice(index, 1); } else { currentSelected.push(pos); } setRapidEntryData({ ...rapidEntryData, selectedPositions: currentSelected }); };
  const toggleRapidExitPosition = (pos: number) => { const currentSelected = [...rapidExitData.selectedPositions]; const index = currentSelected.indexOf(pos); if (index > -1) { currentSelected.splice(index, 1); } else { if (checkOccupancy(rapidExitData.targetRack, rapidExitData.targetLevel, pos)) { currentSelected.push(pos); } } setRapidExitData({ ...rapidExitData, selectedPositions: currentSelected }); };
  const handleRapidExitSubmit = async () => { if (rapidExitData.selectedPositions.length === 0) { showFeedback('error', 'Selecione ao menos um endereço.'); return; } if(!confirm(`Confirma BAIXA TOTAL dos endereços selecionados?`)) return; setIsProcessingAction(true); const opName = currentUser?.username || 'Sistema'; try { for (const pos of rapidExitData.selectedPositions) { const itemsAtPos = getItemsAt(rapidExitData.targetRack, rapidExitData.targetLevel, pos); for(const item of itemsAtPos) { await deleteItemFromDB(FIXED_DB_STRING, item); await saveLogToDB(FIXED_DB_STRING, { username: opName, action: 'SAIDA', details: `SAÍDA RÁPIDA: ${item.productId}`, location: item.id, timestamp: new Date().toISOString() }); } } await loadInitialData(); showFeedback('success', `Saída realizada!`); setIsBulkExitOpen(false); setRapidExitData({ ...rapidExitData, selectedPositions: [] }); } catch (e) { showFeedback('error', 'Erro ao processar saída.'); } finally { setIsProcessingAction(false); } };
  const togglePrintPosition = (pos: number) => { const currentSelected = [...printSelectionData.selectedPositions]; const index = currentSelected.indexOf(pos); if (index > -1) { currentSelected.splice(index, 1); } else { currentSelected.push(pos); } setPrintSelectionData({ ...printSelectionData, selectedPositions: currentSelected }); };
  const handlePrintSelected = async () => { 
    setIsPrintingBatch(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [50, 50] });
      let pagesAdded = 0;
      const positionsToPrint = printSelectionData.selectedPositions.sort((a,b)=>a-b);
      // Determine correct labels for printing based on rack
      const labels = getLevelsForRack(printSelectionData.targetRack);
      for (const pos of positionsToPrint) {
        if (pagesAdded > 0) doc.addPage([50, 50], 'portrait');
        const codeValue = `PP-${printSelectionData.targetRack}-P-${pos}-L-${printSelectionData.targetLevel}`;
        const labelText = `${printSelectionData.targetRack} ${pos} ${labels[printSelectionData.targetLevel-1]}`;
        const qrDataUrl = await QRCode.toDataURL(codeValue, { errorCorrectionLevel: 'H', width: 200, margin: 0 });
        doc.setLineWidth(0.1); doc.rect(1, 1, 48, 48); doc.addImage(qrDataUrl, 'PNG', 7.5, 8, 35, 35);
        doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text(labelText, 25, 6, { align: "center" });
        doc.setFontSize(6); doc.text(codeValue, 25, 47, { align: "center" });
        pagesAdded++;
      }
      if (pagesAdded > 0) { doc.save(`Etiquetas.pdf`); showFeedback('success', 'PDF Gerado!'); }
      setIsPrintMenuOpen(false); setPrintSelectionData({ ...printSelectionData, selectedPositions: [] });
    } catch (e) { showFeedback('error', 'Erro PDF'); } finally { setIsPrintingBatch(false); }
  };
  const handleGenerateFloorBatch = async () => { const qty = parseInt(floorBatchQty); if (isNaN(qty) || qty <= 0) return; setIsPrintingBatch(true); try { const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [50, 50] }); for (let i = 0; i < qty; i++) { if (i > 0) doc.addPage([50, 50], 'portrait'); const tempId = `LOTE-${Date.now().toString().slice(-6)}-${i+1}`; const codeValue = `PP-FLOOR-ID-${tempId}`; await new Promise<void>((resolve, reject) => { QRCode.toDataURL(codeValue, { width: 200, margin: 0 }, (err, url) => { if(err) reject(err); else { doc.setLineWidth(0.1); doc.rect(1, 1, 48, 48); doc.addImage(url, 'PNG', 7.5, 8, 35, 35); doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.text("LOTE EXTERNO", 25, 6, { align: "center" }); doc.setFontSize(6); doc.text(codeValue, 25, 47, { align: "center" }); resolve(); } }); }); } doc.save(`Lote_Chao.pdf`); showFeedback('success', 'Gerado!'); } catch(e) { showFeedback('error', 'Erro'); } finally { setIsPrintingBatch(false); } };
  const handlePrintFloorLabel = async (item: PalletPosition) => { try { const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [50, 50] }); const codeValue = `PP-FLOOR-ID-${item.id}`; const qrDataUrl = await QRCode.toDataURL(codeValue, { errorCorrectionLevel: 'H', width: 200, margin: 0 }); doc.setLineWidth(0.1); doc.rect(1, 1, 48, 48); doc.addImage(qrDataUrl, 'PNG', 7.5, 8, 35, 35); doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.text("PALLET EXTERNO", 25, 6, { align: "center" }); doc.setFontSize(10); doc.text(item.productName?.substring(0, 15) || "ITEM", 25, 12, { align: "center" }); doc.setFontSize(6); doc.text(codeValue, 25, 47, { align: "center" }); doc.save(`Floor.pdf`); } catch (e) { showFeedback('error', 'Erro'); } };
  const handleAddFloorItem = () => { const uniqueId = `F-${Date.now()}`; setSelectedPosition({ id: uniqueId, rack: 'FLOOR', level: 0, position: 0, productId: '', productName: '', quantity: 0, slots: 1 }); setIsExternalMenuOpen(false); };
  const handleAddNewMasterProduct = async (e: React.FormEvent) => { e.preventDefault(); if (!newSKUData.id || !newSKUData.name) return; setIsProcessingAction(true); try { await saveMasterProductToDB(FIXED_DB_STRING, { productId: newSKUData.id.toUpperCase(), productName: newSKUData.name.toUpperCase(), standardQuantity: newSKUData.qty }); await loadInitialData(); showFeedback('success', 'Salvo!'); setIsAddingNewSKU(false); setIsEditingMode(false); setNewSKUData({ id: '', name: '', qty: 0 }); } catch (e) { showFeedback('error', 'Erro'); } finally { setIsProcessingAction(false); } };
  const handleEditMasterProduct = (product: MasterProduct) => { setNewSKUData({ id: product.productId, name: product.productName, qty: product.standardQuantity }); setIsEditingMode(true); setIsAddingNewSKU(true); };
  const deleteMasterProduct = async (id: string) => { if(confirm("Excluir?")) { try { await deleteMasterProductFromDB(FIXED_DB_STRING, id); await loadInitialData(); } catch(e) { showFeedback('error', 'Erro'); } } };
  const handleDownloadReport = () => { const doc = new jsPDF(); doc.text("Relatório", 15, 20); doc.save("Relatorio.pdf"); };
  
  const aggregatedInventory = useMemo(() => {
    const map = new Map();
    inventory.forEach(item => {
      if (!item.productId) return;
      const ex = map.get(item.productId);
      const loc = item.rack === 'FLOOR' ? 'EXTERNO' : `${item.rack}${item.position}${getLevelsForRack(item.rack)[item.level - 1] || item.level}`;
      if (ex) { ex.total += (item.quantity || 0); ex.locs.push(loc); } 
      else { map.set(item.productId, { id: item.productId, name: item.productName, total: item.quantity || 0, locs: [loc] }); }
    });
    const result = Array.from(map.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (searchQuery) { const q = searchQuery.toLowerCase(); return result.filter(r => r.name?.toLowerCase().includes(q) || r.id?.toLowerCase().includes(q)); }
    return result;
  }, [inventory, searchQuery]);

  const filteredMasterProducts = useMemo(() => { if (!masterSearchQuery) return masterProducts; const q = masterSearchQuery.toUpperCase(); return masterProducts.filter(m => (m.productId && m.productId.toUpperCase().includes(q)) || (m.productName && m.productName.toUpperCase().includes(q))); }, [masterProducts, masterSearchQuery]);
  const fifoFilteredInventory = useMemo(() => { if (!fifoSearchQuery) return []; const q = fifoSearchQuery.toUpperCase(); return inventory.filter(i => (i.productId && i.productId.toUpperCase().includes(q)) || (i.productName && i.productName.toUpperCase().includes(q))).sort((a, b) => new Date(a.createdAt||0).getTime() - new Date(b.createdAt||0).getTime()); }, [inventory, fifoSearchQuery]);
  const floorInventory = useMemo(() => { return inventory.filter(i => i.rack === 'FLOOR'); }, [inventory]);

  if (!currentUser) {
    return (
      <div className="fixed inset-0 bg-slate-900 flex items-center justify-center p-6 z-[9999]">
         <div className="w-full max-w-sm bg-white/5 backdrop-blur-xl border border-white/10 rounded-[3rem] p-10 flex flex-col items-center">
            <h1 className="text-3xl font-black text-white italic mb-6">ALMOX</h1>
            <form onSubmit={isRegisterMode ? handleRegister : handleLogin} className="w-full space-y-4">
                <input className="w-full p-4 rounded-xl" placeholder="USUÁRIO" value={loginData.user} onChange={e=>setLoginData({...loginData, user: e.target.value})}/>
                <input className="w-full p-4 rounded-xl" type="password" placeholder="SENHA" value={loginData.pass} onChange={e=>setLoginData({...loginData, pass: e.target.value})}/>
                {isRegisterMode && <input className="w-full p-4 rounded-xl" placeholder="CÓDIGO SECRETO" value={loginData.secret} onChange={e=>setLoginData({...loginData, secret: e.target.value})}/>}
                <button type="submit" disabled={isLoggingIn} className="w-full bg-indigo-600 text-white p-4 rounded-xl font-bold">{isLoggingIn ? '...' : (isRegisterMode ? 'CADASTRAR' : 'ENTRAR')}</button>
            </form>
            <button onClick={()=>setIsRegisterMode(!isRegisterMode)} className="text-white/50 text-xs mt-4 font-bold">{isRegisterMode ? 'VOLTAR' : 'CRIAR CONTA'}</button>
         </div>
      </div>
    );
  }

  const isVerticalRack = VERTICAL_RACKS.includes(activeRack);

  return (
    <div className="h-screen w-screen bg-slate-50 flex flex-col lg:flex-row overflow-hidden relative">
      {/* GLOBAL TOOLTIP */}
      {hoveredInfo && (
        <div 
          className="fixed z-[9999] pointer-events-none animate-in zoom-in-95 duration-75"
          style={{ left: hoveredInfo.x, top: hoveredInfo.y - 12, transform: 'translate(-50%, -100%)' }}
        >
          <div className="bg-slate-900/95 backdrop-blur-xl text-white p-5 rounded-[2rem] shadow-2xl flex flex-col items-start border border-slate-700 min-w-[280px]">
             <div className="flex justify-between items-center w-full mb-3 pb-3 border-b border-white/10">
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{hoveredInfo.items[0].rack === 'FLOOR' ? 'ARMAZENAGEM EXTERNA' : `POSIÇÃO ${hoveredInfo.items[0].rack}-${hoveredInfo.items[0].position}`}</span>
                <span className="text-[9px] font-bold bg-indigo-600 px-2 rounded-full">{hoveredInfo.items.length} ITEM(S)</span>
             </div>
             <div className="flex flex-col gap-2 w-full max-h-[300px] overflow-y-auto no-scrollbar">
                {hoveredInfo.items.map((item, idx) => (
                    <div key={item.id} className="flex items-center gap-3 border-b border-white/5 last:border-0 pb-2 last:pb-0">
                       <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center font-black text-[10px] shrink-0">{item.quantity}</div>
                       <div className="flex flex-col leading-tight overflow-hidden flex-1">
                         <span className="text-xs font-bold text-white uppercase truncate">{item.productName}</span>
                         <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1">
                           {item.productId}
                           {item.slots === 2 && <span className="bg-rose-500/50 px-1 rounded text-white font-bold text-[8px]">CHEIO</span>}
                         </span>
                       </div>
                    </div>
                ))}
             </div>
             <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-900/95"></div>
          </div>
        </div>
      )}

      {feedback && (<div className={`fixed top-4 right-4 z-[9999] p-4 rounded-2xl shadow-2xl flex items-center gap-3 border-2 animate-in slide-in-from-top ${feedback.type === 'success' ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-rose-600 border-rose-400 text-white'}`}><span className="font-black text-[10px] uppercase tracking-tighter">{feedback.msg}</span></div>)}

      {isScannerOpen && <ScannerModal onScan={handleQrScan} onClose={() => setIsScannerOpen(false)} />}

      <aside className={`fixed lg:static inset-0 z-[5000] lg:z-auto transition-all ${isMobileMenuOpen ? 'visible' : 'invisible lg:visible'} flex-shrink-0`}>
        {/* Sidebar Content (Keep existing sidebar code) */}
        <div className="absolute inset-0 bg-slate-900/60 lg:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>
        <div className={`absolute lg:static top-0 left-0 bottom-0 w-72 bg-white border-r p-6 transition-transform lg:translate-x-0 shadow-xl h-full flex flex-col z-[5001] ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex items-center gap-3 mb-12"><Warehouse className="text-indigo-600 w-8 h-8" /><h1 className="text-xl font-black italic uppercase tracking-tighter">ALMOX</h1></div>
          <nav className="flex flex-col gap-2 flex-1 overflow-y-auto no-scrollbar">
            <button onClick={() => { setIsPrintMenuOpen(true); setIsMobileMenuOpen(false); }} className="flex items-center gap-4 p-4 text-slate-600 font-black uppercase text-[11px] hover:bg-indigo-50 hover:text-indigo-600 rounded-2xl transition-all text-left w-full"><Printer size={20}/> ETIQUETAS</button>
            <button onClick={() => { setIsMasterMenuOpen(true); setIsMobileMenuOpen(false); }} className="flex items-center gap-4 p-4 text-slate-600 font-black uppercase text-[11px] hover:bg-indigo-50 hover:text-indigo-600 rounded-2xl transition-all text-left w-full"><ClipboardList size={20}/> BASE ITENS</button>
            <button onClick={() => { setIsInventoryReportOpen(true); setIsMobileMenuOpen(false); }} className="flex items-center gap-4 p-4 text-slate-600 font-black uppercase text-[11px] hover:bg-indigo-50 hover:text-indigo-600 rounded-2xl transition-all text-left w-full"><ListChecks size={20}/> SALDO GERAL</button>
            <button onClick={() => { setIsExternalMenuOpen(true); setIsMobileMenuOpen(false); }} className="flex items-center gap-4 p-4 text-slate-600 font-black uppercase text-[11px] hover:bg-indigo-50 hover:text-indigo-600 rounded-2xl transition-all text-left w-full"><LayoutGrid size={20}/> PALLETS EXTERNOS</button>
            <button onClick={() => { setIsFIFOMenuOpen(true); setIsMobileMenuOpen(false); }} className="flex items-center gap-4 p-4 text-slate-600 font-black uppercase text-[11px] hover:bg-indigo-50 hover:text-indigo-600 rounded-2xl transition-all text-left w-full"><Clock size={20}/> EXPEDIÇÃO (FIFO)</button>
            <button onClick={() => { setIsLogsOpen(true); setIsMobileMenuOpen(false); }} className="flex items-center gap-4 p-4 text-slate-600 font-black uppercase text-[11px] hover:bg-indigo-50 hover:text-indigo-600 rounded-2xl transition-all text-left w-full"><History size={20}/> HISTÓRICO</button>
            <button onClick={() => { setIsCalculatorOpen(true); setIsMobileMenuOpen(false); }} className="flex items-center gap-4 p-4 text-slate-600 font-black uppercase text-[11px] hover:bg-indigo-50 hover:text-indigo-600 rounded-2xl transition-all text-left w-full"><Calculator size={20}/> CALCULADORA</button>
            {currentUser?.role === 'admin' && (<button onClick={() => { setIsUserManagementOpen(true); setIsMobileMenuOpen(false); }} className="flex items-center gap-4 p-4 text-indigo-600 bg-indigo-50 border border-indigo-100 font-black uppercase text-[11px] hover:bg-indigo-100 rounded-2xl transition-all text-left w-full mt-4"><Users size={20}/> GESTÃO USUÁRIOS</button>)}
          </nav>
          <div className="pt-6 border-t border-slate-100"><div className="mb-2 text-xs font-bold text-slate-400">{currentUser.username} ({currentUser.role})</div><button onClick={handleLogout} className="flex items-center gap-2 text-rose-500 font-black uppercase text-xs"><LogOut size={16}/> Sair</button></div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0 relative">
        {/* Mobile Header */}
        <header className="lg:hidden flex justify-between items-center p-4 bg-white border-b h-16 shrink-0 z-[100]"><h1 className="text-lg font-black italic uppercase text-indigo-600">ALMOX</h1><button onClick={() => setIsMobileMenuOpen(true)} className="p-2 bg-slate-50 rounded-xl"><Menu size={24} /></button></header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 no-scrollbar">
          {/* Top Actions & Stats */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex-shrink-0 flex flex-col sm:flex-row gap-3 md:gap-4 w-full md:w-auto">
              <button onClick={() => setIsScannerOpen(true)} className="bg-indigo-600 text-white px-6 py-4 md:px-10 md:py-5 rounded-full font-black uppercase shadow-xl flex items-center justify-center gap-4 active:scale-95 transition-all w-full sm:w-auto"><ScanLine size={28}/> SCANNER</button>
              {currentUser?.role === 'admin' && (<><button onClick={() => setIsBulkEntryOpen(true)} className="bg-emerald-600 text-white px-6 py-4 md:px-10 md:py-5 rounded-full font-black uppercase shadow-xl flex items-center justify-center gap-4 active:scale-95 transition-all w-full sm:w-auto"><PackagePlus size={28}/> ENTRADA RÁPIDA</button><button onClick={() => setIsBulkExitOpen(true)} className="bg-rose-600 text-white px-6 py-4 md:px-10 md:py-5 rounded-full font-black uppercase shadow-xl flex items-center justify-center gap-4 active:scale-95 transition-all w-full sm:w-auto"><PackageMinus size={28}/> SAÍDA RÁPIDA</button></>)}
            </div>
            
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 flex-1 max-w-4xl">
               <div className="bg-white p-4 rounded-[2rem] border shadow-sm"><span className="text-2xl font-black block">{stats.total}</span><span className="text-[9px] font-bold text-slate-400 uppercase">Capacidade (PP)</span></div>
               <div className="bg-white p-4 rounded-[2rem] border shadow-sm"><span className="text-2xl font-black block text-rose-600">{stats.occupied}</span><span className="text-[9px] font-bold text-slate-400 uppercase">Ocupado (PP)</span></div>
               <div className="bg-white p-4 rounded-[2rem] border shadow-sm"><span className="text-2xl font-black block text-emerald-600">{stats.free}</span><span className="text-[9px] font-bold text-slate-400 uppercase">Livre (PP)</span></div>
               <div className="bg-indigo-600 p-4 rounded-[2rem] text-white shadow-xl"><span className="text-2xl font-black block">{stats.rate}%</span><span className="text-[9px] font-bold text-white/60 uppercase">Uso (PP)</span></div>
            </div>
          </div>

          <div className="bg-white p-4 md:p-6 lg:p-10 rounded-[2rem] md:rounded-[3rem] border shadow-sm h-full flex flex-col">
             <div className="flex flex-col xl:flex-row gap-8 mb-8 items-start xl:items-end justify-between border-b border-slate-100 pb-8 shrink-0">
               <div className="w-full xl:w-auto">
                 <div className="flex items-center gap-2 mb-3 px-2"><Warehouse className="text-indigo-600" size={18} /><span className="text-xs font-black uppercase text-slate-400 tracking-widest">Selecione o Local</span></div>
                 {/* Visual Selector for Racks */}
                 <div className="flex flex-col sm:flex-row gap-6 bg-white p-1 overflow-x-auto no-scrollbar">
                   {/* Vertical Racks Group */}
                   <div className="flex flex-col gap-2 shrink-0">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Racks Verticais (8 Níveis)</span>
                      <div className="flex gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                        {VERTICAL_RACKS.map(r => (
                          <button 
                            key={r} 
                            onClick={() => handleRackChange(r)} 
                            className={`
                              relative h-20 w-20 rounded-xl flex flex-col items-center justify-center transition-all duration-200 border-2
                              ${activeRack === r 
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200 scale-105 z-10' 
                                : 'bg-white border-slate-100 text-slate-400 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-500'
                              }
                            `}
                          >
                            <span className="text-[10px] font-bold opacity-70 mb-1">RACK</span>
                            <span className="text-3xl font-black leading-none">{r}</span>
                            {activeRack === r && <div className="absolute -bottom-1 w-1.5 h-1.5 bg-white rounded-full opacity-50"></div>}
                          </button>
                        ))}
                      </div>
                   </div>

                   {/* Separator / Spacer for visual distinction */}
                   <div className="hidden sm:block w-px bg-slate-100 mx-2 self-stretch my-8"></div>

                   {/* Porta Pallets Group */}
                   <div className="flex flex-col gap-2 shrink-0">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Porta Pallets (5 Níveis)</span>
                      <div className="flex gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                        {PP_RACKS.map(r => (
                          <button 
                            key={r} 
                            onClick={() => handleRackChange(r)} 
                            className={`
                              relative h-20 w-20 rounded-xl flex flex-col items-center justify-center transition-all duration-200 border-2
                              ${activeRack === r 
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200 scale-105 z-10' 
                                : 'bg-white border-slate-100 text-slate-400 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-500'
                              }
                            `}
                          >
                            <span className="text-[10px] font-bold opacity-70 mb-1">RUA</span>
                            <span className="text-3xl font-black leading-none">{r}</span>
                            {activeRack === r && <div className="absolute -bottom-1 w-1.5 h-1.5 bg-white rounded-full opacity-50"></div>}
                          </button>
                        ))}
                      </div>
                   </div>
                 </div>
               </div>
               
               {!isVerticalRack && (
                 <div className="w-full xl:w-auto">
                   <div className="flex items-center gap-2 mb-3 px-2"><ArrowUp className="text-indigo-600" size={18} /><span className="text-xs font-black uppercase text-slate-400 tracking-widest">Nível</span></div>
                   <div className="flex gap-2 overflow-x-auto no-scrollbar bg-slate-50 p-2 rounded-2xl border border-slate-100 shadow-inner items-end h-[100px]">
                     {currentLevels.map((l, i) => (<button key={l} onClick={() => setActiveLevelIndex(i)} className={`relative w-14 rounded-xl flex flex-col items-center justify-end pb-3 transition-all flex-shrink-0 border ${activeLevelIndex === i ? 'bg-slate-800 text-white shadow-lg h-full' : 'bg-white text-slate-300 h-full'}`}><span className="text-xl font-black">{l}</span></button>))}
                   </div>
                 </div>
               )}
             </div>
             
             <div className="flex-1 overflow-y-auto min-h-0">
                {isVerticalRack ? (
                   <div className="max-w-2xl mx-auto py-4">
                     {renderVerticalRack()}
                   </div>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-11 gap-2 md:gap-3">
                      {renderPalletGrid()}
                  </div>
                )}
             </div>
          </div>
        </div>

        {/* SIDEBAR / DRAWER */}
        <div className={`fixed inset-y-0 right-0 w-full sm:w-[450px] bg-white shadow-2xl z-[5000] transform transition-transform duration-300 ease-in-out border-l flex flex-col ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
           {isSidebarOpen && activeLocationItems.length > 0 && (
             <>
               <header className="p-6 border-b flex justify-between items-start bg-indigo-600 text-white shrink-0">
                  <div><span className="text-[10px] font-bold uppercase tracking-widest opacity-80 block mb-1">LOCALIZAÇÃO</span><h2 className="text-2xl font-black italic uppercase">{activeLocationItems[0].rack === 'FLOOR' ? 'ARMAZENAGEM EXTERNA' : (VERTICAL_RACKS.includes(activeLocationItems[0].rack) ? `${activeLocationItems[0].rack} - NÍVEL ${getLevelsForRack(activeLocationItems[0].rack)[activeLocationItems[0].level-1]}` : `${activeLocationItems[0].rack} ${activeLocationItems[0].position} ${getLevelsForRack(activeLocationItems[0].rack)[activeLocationItems[0].level-1]}`)}</h2></div><button onClick={() => setIsSidebarOpen(false)} className="p-2 bg-white/20 rounded-xl hover:bg-white/30 transition-colors"><X size={20}/></button>
               </header>
               <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
                  {palletDetailsQrUrl && (<div className="flex justify-center p-4 bg-white rounded-2xl border border-slate-200 shadow-sm"><img src={palletDetailsQrUrl} alt="QR" className="w-32 h-32 mix-blend-multiply opacity-90"/></div>)}
                  
                  {/* Action to Add Another Item */}
                  <div className="flex justify-center">
                    <button onClick={handleAddItemToLocation} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white p-4 rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95">
                      <CopyPlus size={18}/> ADICIONAR MAIS UM ITEM AQUI
                    </button>
                  </div>

                  <div><h3 className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-2 mb-4"><Layers size={16}/> {activeLocationItems.length} Item(s) Empilhado(s)</h3><div className="space-y-3">{activeLocationItems.map((item, idx) => (<div key={item.id} className="bg-white border-2 border-slate-100 rounded-2xl p-4 shadow-sm hover:border-indigo-200 transition-colors relative group"><div className="flex justify-between items-start mb-2"><div className="flex flex-col"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">ID do Registro</span><span className="font-mono text-xs text-slate-500 break-all">{item.id}</span></div><span className="bg-slate-100 text-slate-500 px-2 py-1 rounded text-[9px] font-bold uppercase">{new Date(item.createdAt || Date.now()).toLocaleDateString()}</span></div><h4 className="font-black text-slate-800 text-lg uppercase leading-tight mb-2">{item.productName}</h4>
                  {item.slots === 2 && <div className="mb-2"><span className="bg-rose-50 text-rose-600 text-[9px] font-black px-2 py-1 rounded uppercase border border-rose-100">Ocupa 2 Vagas (Cheio)</span></div>}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-50"><div className="flex items-center gap-2"><div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg font-black text-sm uppercase">{item.productId}</div><div className="text-2xl font-black text-slate-800">{item.quantity} <span className="text-[10px] text-slate-400">UN</span></div></div>{currentUser?.role === 'admin' && (<div className="flex gap-2"><button onClick={() => { setItemToExit(item); setPartialQuantity(''); }} className="p-2 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100" title="Saída Parcial deste item"><Minus size={16} strokeWidth={3}/></button><button onClick={() => handleDeleteItem(item)} className="p-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100" title="Remover este item completo"><Trash2 size={16} strokeWidth={3}/></button></div>)}</div></div>))}</div></div>
               </div>
               {itemToExit && (<div className="p-6 bg-amber-50 border-t-4 border-amber-200 animate-in slide-in-from-bottom duration-200"><div className="flex items-center justify-between mb-3"><div className="flex flex-col"><span className="text-[10px] font-black uppercase text-amber-600 tracking-widest">Saída Parcial</span><span className="text-xs font-bold text-slate-700">De: {itemToExit.productName}</span></div><button onClick={() => setItemToExit(null)} className="p-1 bg-amber-100 rounded text-amber-700"><X size={14}/></button></div><div className="flex gap-2"><input type="number" autoFocus className="flex-1 p-4 bg-white border-2 border-amber-200 rounded-xl font-black text-center text-xl outline-none focus:border-amber-500 text-slate-800" placeholder="QTD" value={partialQuantity} onChange={(e) => setPartialQuantity(e.target.value)} /><button onClick={handlePartialExit} disabled={isProcessingAction} className="bg-amber-500 hover:bg-amber-600 text-white px-6 rounded-xl font-black shadow-lg transition-colors">{isProcessingAction ? <Loader2 className="animate-spin"/> : <CheckCircle2/>}</button></div></div>)}
               {!itemToExit && (<div className="p-6 border-t bg-white shrink-0 flex gap-2"><button onClick={() => setIsSidebarOpen(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 p-4 rounded-xl font-black uppercase text-xs">Fechar</button></div>)}
             </>
           )}
        </div>
      </main>

      {/* ... Modais ... */}
      {/* Selected Position Modal (Manual Entry) */}
      {selectedPosition && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[9000] flex items-center justify-center p-6">
           <div className="bg-white rounded-[3rem] w-full max-w-md p-8 md:p-10 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <header className="flex justify-between items-center mb-6"><div className="flex items-center gap-2"><PackagePlus className="text-indigo-600" size={24}/><h3 className="font-black uppercase text-indigo-600 italic text-xl">Nova Entrada</h3></div><button onClick={() => setSelectedPosition(null)} className="p-3 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-all"><X /></button></header>
              <div className="mb-6 bg-slate-50 p-6 rounded-[2rem] border border-slate-100"><span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Localização Alvo</span><span className="text-2xl font-black text-slate-800 uppercase block">{selectedPosition.rack === 'FLOOR' ? 'ARMAZENAGEM EXTERNA' : (VERTICAL_RACKS.includes(selectedPosition.rack) ? `${selectedPosition.rack} - NÍVEL ${getLevelsForRack(selectedPosition.rack)[selectedPosition.level - 1]}` : `${selectedPosition.rack} ${selectedPosition.position} ${getLevelsForRack(selectedPosition.rack)[selectedPosition.level - 1]}`)}</span></div>
              <form onSubmit={handleManualEntrySubmit} className="space-y-6">
                 <div><label className="text-[10px] font-black uppercase text-slate-400 ml-2 block mb-2">Selecione o Item (SKU)</label><input list="sku-options" className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl font-black uppercase outline-none transition-all" value={manualEntryData.sku} onChange={e => { const val = e.target.value.toUpperCase(); const found = masterProducts.find(p => p.productId === val); setManualEntryData(prev => ({ ...prev, sku: val, qty: found ? found.standardQuantity.toString() : prev.qty })); }} placeholder="DIGITE OU SELECIONE..." autoFocus /><datalist id="sku-options">{masterProducts.map(m => <option key={m.productId} value={m.productId}>{m.productName}</option>)}</datalist></div>
                 
                 <div className="flex gap-4">
                    <div className="flex-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-2 block mb-2">Quantidade</label><input type="number" className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl font-black outline-none transition-all" value={manualEntryData.qty} onChange={e => setManualEntryData({...manualEntryData, qty: e.target.value})} placeholder="QTD" /></div>
                    <div className="w-1/2"><label className="text-[10px] font-black uppercase text-slate-400 ml-2 block mb-2">Espaço (Slots)</label>
                      <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 h-[64px]">
                        <button type="button" onClick={() => setManualEntryData({...manualEntryData, slots: 1})} className={`flex-1 rounded-xl font-black text-sm transition-all ${manualEntryData.slots === 1 ? 'bg-white shadow text-indigo-600' : 'text-slate-400 hover:bg-white/50'}`}>1</button>
                        <button type="button" onClick={() => setManualEntryData({...manualEntryData, slots: 2})} className={`flex-1 rounded-xl font-black text-sm transition-all ${manualEntryData.slots === 2 ? 'bg-white shadow text-rose-500' : 'text-slate-400 hover:bg-white/50'}`}>2</button>
                      </div>
                    </div>
                 </div>

                 <button type="submit" disabled={isProcessingAction} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white p-6 rounded-[2rem] font-black uppercase shadow-xl active:scale-95 transition-all text-lg flex items-center justify-center gap-2">{isProcessingAction ? <Loader2 className="animate-spin"/> : 'Confirmar Entrada'}</button>
              </form>
           </div>
        </div>
      )}

      {isBulkEntryOpen && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[9000] flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[2rem] p-6 flex flex-col shadow-2xl overflow-hidden">
              <header className="flex justify-between items-center mb-4 shrink-0"><h3 className="font-black text-2xl italic uppercase text-indigo-600 flex items-center gap-2"><MousePointerClick/> Entrada Rápida</h3><button onClick={() => setIsBulkEntryOpen(false)} className="p-2 bg-slate-100 rounded-xl"><X /></button></header>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 shrink-0">
                <div className="md:col-span-2"><label className="text-xs font-black uppercase text-slate-400">SKU</label><input list="sku-rapid" className="w-full p-3 border-2 rounded-xl font-black uppercase" value={rapidEntryData.productId} onChange={e=>{ const v=e.target.value.toUpperCase(); const m=masterProducts.find(x=>x.productId===v); setRapidEntryData({...rapidEntryData, productId:v, qtyPerPallet: m?m.standardQuantity:rapidEntryData.qtyPerPallet}); }}/><datalist id="sku-rapid">{masterProducts.map(m=><option key={m.productId} value={m.productId}>{m.productName}</option>)}</datalist></div>
                <div><label className="text-xs font-black uppercase text-slate-400">Qtd/Pallet</label><input type="number" className="w-full p-3 border-2 rounded-xl font-black" value={rapidEntryData.qtyPerPallet} onChange={e=>setRapidEntryData({...rapidEntryData, qtyPerPallet:parseInt(e.target.value)||0})}/></div>
                <div>
                  <label className="text-xs font-black uppercase text-slate-400">Vagas (Slots)</label>
                  <div className="flex bg-slate-100 p-1 rounded-xl h-[50px] border border-slate-200">
                    <button onClick={() => setRapidEntryData({...rapidEntryData, slots: 1})} className={`flex-1 rounded-lg font-black text-xs transition-all ${rapidEntryData.slots !== 2 ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>1</button>
                    <button onClick={() => setRapidEntryData({...rapidEntryData, slots: 2})} className={`flex-1 rounded-lg font-black text-xs transition-all ${rapidEntryData.slots === 2 ? 'bg-white shadow text-rose-500' : 'text-slate-400'}`}>2</button>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mb-4 shrink-0">{PP_RACKS.map(r => <button key={r} onClick={()=>setRapidEntryData({...rapidEntryData, targetRack:r, selectedPositions:[]})} className={`px-4 py-2 rounded-lg font-black ${rapidEntryData.targetRack===r?'bg-indigo-600 text-white':'bg-slate-100'}`}>{r}</button>)}<div className="w-px bg-slate-300 mx-2"></div>{getLevelsForRack(rapidEntryData.targetRack).map((l,i) => <button key={l} onClick={()=>setRapidEntryData({...rapidEntryData, targetLevel:i+1, selectedPositions:[]})} className={`px-4 py-2 rounded-lg font-black ${rapidEntryData.targetLevel===i+1?'bg-slate-800 text-white':'bg-slate-100'}`}>{l}</button>)}</div>
              <div className="flex-1 overflow-y-auto bg-slate-50 rounded-2xl p-4 border grid grid-cols-8 md:grid-cols-11 gap-2 content-start">{Array.from({length: getPositionsForRack(rapidEntryData.targetRack)}).map((_,i)=>{ const pos=i+1; const isOcc=checkOccupancy(rapidEntryData.targetRack, rapidEntryData.targetLevel, pos); const isSel=rapidEntryData.selectedPositions.includes(pos); const isBlocked = BLOCKED_LOCATIONS.some(b => b.rack === rapidEntryData.targetRack && b.level === rapidEntryData.targetLevel && b.positions.includes(pos)); if(isBlocked) return <div key={pos} className="aspect-square bg-slate-200 opacity-20 rounded-lg flex items-center justify-center"><Ban size={10}/></div>; return <button key={pos} disabled={isOcc} onClick={()=>toggleRapidPosition(pos)} className={`aspect-square rounded-lg font-black text-xs flex items-center justify-center border-2 ${isOcc?'bg-rose-100 border-rose-200 text-rose-300':(isSel?'bg-emerald-500 text-white border-emerald-600 scale-105 shadow':'bg-white border-slate-200 text-slate-400')}`}>{pos}</button> })}</div>
              <div className="mt-4 pt-4 border-t flex justify-between items-center shrink-0"><span className="font-black text-slate-800 text-lg">{rapidEntryData.selectedPositions.length} Pallets • Total: {rapidEntryData.selectedPositions.length * rapidEntryData.qtyPerPallet}</span><button onClick={handleRapidEntrySubmit} disabled={isProcessingAction || rapidEntryData.selectedPositions.length===0} className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-black uppercase flex items-center gap-2">{isProcessingAction?<Loader2 className="animate-spin"/>:'Confirmar'}</button></div>
           </div>
        </div>
      )}

      {isBulkExitOpen && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[9000] flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[2rem] p-6 flex flex-col shadow-2xl overflow-hidden border-4 border-rose-100">
              <header className="flex justify-between items-center mb-4 shrink-0"><h3 className="font-black text-2xl italic uppercase text-rose-600 flex items-center gap-2"><PackageMinus/> Saída Rápida (Baixa Total)</h3><button onClick={() => setIsBulkExitOpen(false)} className="p-2 bg-slate-100 rounded-xl"><X /></button></header>
              <div className="bg-rose-50 p-3 rounded-xl mb-4 border border-rose-100 text-rose-700 text-xs font-bold shrink-0 flex items-center gap-2"><AlertTriangle size={16}/> SELECIONE OS PALLETS PARA REMOVER (APENAS OCUPADOS)</div>
              <div className="flex gap-2 mb-4 shrink-0">{PP_RACKS.map(r => <button key={r} onClick={()=>setRapidExitData({...rapidExitData, targetRack:r, selectedPositions:[]})} className={`px-4 py-2 rounded-lg font-black ${rapidExitData.targetRack===r?'bg-rose-600 text-white':'bg-slate-100'}`}>{r}</button>)}<div className="w-px bg-slate-300 mx-2"></div>{getLevelsForRack(rapidExitData.targetRack).map((l,i) => <button key={l} onClick={()=>setRapidExitData({...rapidExitData, targetLevel:i+1, selectedPositions:[]})} className={`px-4 py-2 rounded-lg font-black ${rapidExitData.targetLevel===i+1?'bg-slate-800 text-white':'bg-slate-100'}`}>{l}</button>)}</div>
              <div className="flex-1 overflow-y-auto bg-slate-50 rounded-2xl p-4 border grid grid-cols-8 md:grid-cols-11 gap-2 content-start">{Array.from({length: getPositionsForRack(rapidExitData.targetRack)}).map((_,i)=>{ const pos=i+1; const isOcc=checkOccupancy(rapidExitData.targetRack, rapidExitData.targetLevel, pos); const isSel=rapidExitData.selectedPositions.includes(pos); return <button key={pos} disabled={!isOcc} onClick={()=>toggleRapidExitPosition(pos)} className={`aspect-square rounded-lg font-black text-xs flex items-center justify-center border-2 ${!isOcc?'bg-slate-100 border-slate-200 text-slate-300':(isSel?'bg-rose-500 text-white border-rose-600 scale-105 shadow ring-2 ring-rose-300':'bg-white border-rose-200 text-rose-500 hover:bg-rose-50')}`}>{pos}</button> })}</div>
              <div className="mt-4 pt-4 border-t flex justify-between items-center shrink-0"><span className="font-black text-rose-800 text-lg">{rapidExitData.selectedPositions.length} Pallets Selecionados</span><button onClick={handleRapidExitSubmit} disabled={isProcessingAction || rapidExitData.selectedPositions.length===0} className="bg-rose-600 text-white px-8 py-3 rounded-xl font-black uppercase flex items-center gap-2">{isProcessingAction?<Loader2 className="animate-spin"/>:'Confirmar Baixa'}</button></div>
           </div>
        </div>
      )}

      {isPrintMenuOpen && (
         <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[9000] flex items-end sm:items-center justify-center sm:p-6">
            <div className="bg-white w-full sm:max-w-4xl h-[90vh] sm:h-auto sm:max-h-[90vh] rounded-t-[2.5rem] sm:rounded-[2rem] p-5 sm:p-8 flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300">
               
               {/* Header */}
               <header className="flex justify-between items-center mb-4 shrink-0">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Impressão em Lote</span>
                    <h3 className="font-black text-xl sm:text-2xl uppercase italic text-indigo-600 flex items-center gap-2">
                      <Printer className="w-5 h-5 sm:w-6 sm:h-6"/> Seleção de Etiquetas
                    </h3>
                  </div>
                  <button onClick={()=>setIsPrintMenuOpen(false)} className="p-3 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
                    <X size={20}/>
                  </button>
               </header>

               {/* Instruction Banner */}
               <div className="bg-indigo-50 p-3 sm:p-4 rounded-xl mb-4 border border-indigo-100 text-indigo-700 text-[10px] sm:text-xs font-bold shrink-0 flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg shadow-sm text-indigo-600"><MousePointerClick size={16}/></div>
                  <span>TOQUE NOS ENDEREÇOS PARA SELECIONAR E IMPRIMIR.</span>
               </div>

               {/* Selectors (Scrollable horizontally on mobile) */}
               <div className="flex flex-col gap-3 mb-4 shrink-0">
                  {/* Rack Selector */}
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    {PP_RACKS.map(r => (
                      <button 
                        key={r} 
                        onClick={()=>setPrintSelectionData(prev => ({...prev, targetRack:r, selectedPositions:[]}))} 
                        className={`
                          flex-shrink-0 w-12 h-12 rounded-xl font-black text-lg flex items-center justify-center transition-all
                          ${printSelectionData.targetRack===r 
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
                            : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}
                        `}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  
                  {/* Level Selector */}
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    {getLevelsForRack(printSelectionData.targetRack).map((l,i) => (
                      <button 
                        key={l} 
                        onClick={()=>setPrintSelectionData(prev => ({...prev, targetLevel:i+1, selectedPositions:[]}))} 
                        className={`
                          flex-shrink-0 px-4 h-10 rounded-lg font-black text-sm flex items-center justify-center transition-all
                          ${printSelectionData.targetLevel===i+1 
                            ? 'bg-slate-800 text-white shadow-lg' 
                            : 'bg-white border-2 border-slate-100 text-slate-400'}
                        `}
                      >
                        NÍVEL {l}
                      </button>
                    ))}
                  </div>
               </div>

               {/* Grid */}
               <div className="flex-1 overflow-y-auto bg-slate-50/50 rounded-2xl p-2 sm:p-4 border border-slate-100">
                 <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-11 gap-2 content-start pb-10">
                    {Array.from({length: getPositionsForRack(printSelectionData.targetRack)}).map((_,i)=>{ 
                      const pos=i+1; 
                      const isOcc = checkOccupancy(printSelectionData.targetRack, printSelectionData.targetLevel, pos); 
                      const isSel = printSelectionData.selectedPositions.includes(pos); 
                      
                      let bgClass = "bg-white border-slate-200 text-slate-400"; 
                      if (isOcc) bgClass = "bg-rose-50 border-rose-200 text-rose-400"; 
                      if (isSel) bgClass = "bg-indigo-600 border-indigo-600 text-white shadow-md transform scale-105 z-10"; 

                      return (
                        <button 
                          key={pos} 
                          onClick={()=>togglePrintPosition(pos)} 
                          className={`
                            aspect-square rounded-xl font-black text-xs sm:text-sm flex flex-col items-center justify-center border-2 transition-all active:scale-95
                            ${bgClass}
                          `}
                        >
                          <span>{pos}</span>
                          {isOcc && !isSel && <div className="w-1.5 h-1.5 bg-rose-400 rounded-full mt-1"></div>}
                        </button>
                      ) 
                    })}
                 </div>
               </div>

               {/* Footer / Action */}
               <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0 bg-white">
                  <div className="flex flex-col items-center sm:items-start">
                    <span className="font-black text-slate-800 text-xl">{printSelectionData.selectedPositions.length}</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Etiquetas Selecionadas</span>
                  </div>
                  <button 
                    onClick={handlePrintSelected} 
                    disabled={isPrintingBatch || printSelectionData.selectedPositions.length===0} 
                    className="w-full sm:w-auto bg-indigo-600 text-white px-8 py-4 rounded-xl font-black uppercase text-xs flex items-center justify-center gap-3 hover:bg-indigo-700 active:scale-95 transition-all shadow-xl shadow-indigo-200 disabled:opacity-50 disabled:shadow-none"
                  >
                    {isPrintingBatch ? <Loader2 className="animate-spin"/> : <><Printer size={18}/> GERAR PDF AGORA</>}
                  </button>
               </div>
            </div>
         </div>
      )}

      {/* Rest of modals (Master, Calculator, External, FIFO, Logs, UserMgmt, SelectedPos, InvReport) - Keeping as is for brevity, assume they follow same structure */}
      {isMasterMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[9000] flex items-center justify-center p-6">
           <div className="bg-white w-full max-w-4xl max-h-[85vh] rounded-[3rem] p-8 flex flex-col shadow-2xl">
              <header className="flex justify-between items-center mb-6 shrink-0"><h3 className="font-black text-2xl uppercase italic text-indigo-600">Base de Produtos</h3><button onClick={()=>setIsMasterMenuOpen(false)} className="p-2 bg-slate-100 rounded-xl"><X/></button></header>
              <div className="flex gap-4 mb-6 shrink-0"><button onClick={()=>setIsAddingNewSKU(true)} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs flex items-center gap-2"><PlusCircle size={16}/> Novo SKU</button><input className="flex-1 p-3 bg-slate-50 border-2 rounded-xl font-bold uppercase" placeholder="Buscar..." value={masterSearchQuery} onChange={e=>setMasterSearchQuery(e.target.value)}/></div>
              {isAddingNewSKU && (<form onSubmit={handleAddNewMasterProduct} className="mb-6 p-4 bg-indigo-50 rounded-2xl border border-indigo-100 grid grid-cols-1 md:grid-cols-4 gap-4 items-end shrink-0"><div><label className="text-[10px] font-black uppercase text-indigo-400">SKU</label><input className={`w-full p-2 rounded-lg font-black uppercase ${isEditingMode ? 'bg-slate-200 text-slate-500' : ''}`} value={newSKUData.id} onChange={e=>setNewSKUData({...newSKUData, id:e.target.value})} autoFocus={!isEditingMode} disabled={isEditingMode}/></div><div className="md:col-span-2"><label className="text-[10px] font-black uppercase text-indigo-400">Nome</label><input className="w-full p-2 rounded-lg font-black uppercase" value={newSKUData.name} onChange={e=>setNewSKUData({...newSKUData, name:e.target.value})} autoFocus={isEditingMode}/></div><div><label className="text-[10px] font-black uppercase text-indigo-400">Qtd/Pallet</label><input type="number" className="w-full p-2 rounded-lg font-black" value={newSKUData.qty} onChange={e=>setNewSKUData({...newSKUData, qty:parseInt(e.target.value)||0})}/></div><button type="submit" disabled={isProcessingAction} className="bg-indigo-600 text-white p-2 rounded-lg font-black uppercase text-xs h-10">{isProcessingAction?'...':'Salvar'}</button><button type="button" onClick={()=>{setIsAddingNewSKU(false); setIsEditingMode(false); setNewSKUData({id:'',name:'',qty:0});}} className="bg-slate-200 text-slate-600 p-2 rounded-lg font-black uppercase text-xs h-10">Cancelar</button></form>)}
              <div className="flex-1 overflow-y-auto space-y-2 pr-2">{filteredMasterProducts.map(p=>(<div key={p.productId} className="flex justify-between items-center p-4 bg-white border rounded-xl shadow-sm hover:border-indigo-300"><div><span className="text-xs font-black text-slate-400 block">SKU: {p.productId}</span><span className="font-bold text-slate-800">{p.productName}</span></div><div className="flex items-center gap-4"><span className="bg-slate-100 px-3 py-1 rounded-lg text-xs font-black text-slate-500">{p.standardQuantity} UN/PAL</span>{currentUser?.role==='admin' && (<div className="flex gap-2"><button onClick={()=>handleEditMasterProduct(p)} className="text-indigo-400 hover:text-indigo-600"><Pencil size={18}/></button><button onClick={()=>deleteMasterProduct(p.productId)} className="text-rose-400 hover:text-rose-600"><Trash2 size={18}/></button></div>)}</div></div>))}</div>
           </div>
        </div>
      )}

      {isCalculatorOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[9000] flex items-center justify-center p-6">
           <div className="bg-white w-full max-w-lg rounded-[3rem] p-8 flex flex-col shadow-2xl">
              <header className="flex justify-between items-center mb-6 shrink-0"><h3 className="font-black text-2xl uppercase italic text-indigo-600 flex items-center gap-2"><Calculator/> Calculadora</h3><button onClick={()=>{setIsCalculatorOpen(false); setCalcData({sku:'', totalItems:'',qtyPerPallet:''});}} className="p-2 bg-slate-100 rounded-xl"><X/></button></header>
              <div className="space-y-4 mb-6"><div><label className="text-[10px] font-black uppercase text-slate-400 ml-2">SKU</label><input list="calc-sku-options" className="w-full p-4 bg-slate-50 border-2 rounded-2xl font-black text-lg uppercase" placeholder="Buscar..." value={calcData.sku} onChange={e=>{ const v = e.target.value.toUpperCase(); const found = masterProducts.find(p=>p.productId === v || p.productName === v); setCalcData(prev => ({ ...prev, sku: v, qtyPerPallet: found ? found.standardQuantity.toString() : prev.qtyPerPallet })); }} /><datalist id="calc-sku-options">{masterProducts.map(m => <option key={m.productId} value={m.productId}>{m.productName}</option>)}</datalist></div><div><label className="text-[10px] font-black uppercase text-slate-400 ml-2">Total Itens</label><input type="number" className="w-full p-4 bg-slate-50 border-2 rounded-2xl font-black text-xl" placeholder="EX: 4000" value={calcData.totalItems} onChange={e=>setCalcData({...calcData, totalItems:e.target.value})}/></div><div><label className="text-[10px] font-black uppercase text-slate-400 ml-2">Padrão</label><input type="number" className="w-full p-4 bg-slate-50 border-2 rounded-2xl font-black text-xl" placeholder="EX: 3900" value={calcData.qtyPerPallet} onChange={e=>setCalcData({...calcData, qtyPerPallet:e.target.value})}/></div></div>
              {calcData.totalItems && calcData.qtyPerPallet && (<div className="bg-indigo-50 p-6 rounded-[2rem] border border-indigo-100 space-y-4"><div className="flex justify-between items-center border-b border-indigo-100 pb-2"><span className="text-xs font-black uppercase text-indigo-400">Fechados</span><span className="text-2xl font-black text-indigo-600">{Math.floor(parseInt(calcData.totalItems)/parseInt(calcData.qtyPerPallet))}</span></div><div className="flex justify-between items-center border-b border-indigo-100 pb-2"><span className="text-xs font-black uppercase text-indigo-400">Quebra</span><span className="text-2xl font-black text-rose-500">{parseInt(calcData.totalItems)%parseInt(calcData.qtyPerPallet)} UN</span></div><div className="flex justify-between items-center pt-2"><span className="text-xs font-black uppercase text-indigo-400">Total</span><span className="text-4xl font-black text-slate-800">{Math.ceil(parseInt(calcData.totalItems)/parseInt(calcData.qtyPerPallet))}</span></div></div>)}
           </div>
        </div>
      )}

      {isExternalMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[9000] flex items-center justify-center p-6">
            <div className="bg-white w-full max-w-6xl max-h-[90vh] rounded-[2rem] flex flex-col shadow-2xl overflow-hidden">
                <header className="bg-[#FFFBEB] px-8 py-6 flex flex-col md:flex-row justify-between items-center gap-6 shrink-0 border-b border-orange-100">
                    <div className="flex items-center gap-4"><div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-orange-500/20"><LayoutGrid size={24} /></div><div><h3 className="font-black text-2xl uppercase italic text-slate-800">PALLETS EXTERNOS</h3><span className="text-xs font-bold text-slate-400 uppercase tracking-widest">(CHÃO)</span></div></div>
                    <div className="flex items-center gap-3 bg-white/50 p-2 rounded-2xl border border-orange-100/50">
                        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-100 shadow-sm"><span className="text-[10px] font-black uppercase text-slate-400">QTD<br/>ETIQUETAS:</span><input type="number" value={floorBatchQty} onChange={(e) => setFloorBatchQty(e.target.value)} className="w-12 text-center font-black text-lg text-slate-800 outline-none"/></div>
                        <button onClick={handleGenerateFloorBatch} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-black uppercase text-[10px] flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20"><Printer size={16} /> GERAR<br/>LOTE</button>
                        {currentUser?.role === 'admin' && (<button onClick={handleAddFloorItem} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-black uppercase text-[10px] flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20"><PackagePlus size={16} /> ENTRADA<br/>MANUAL</button>)}
                        <div className="w-px h-10 bg-slate-200 mx-2"></div>
                        <button onClick={()=>setIsExternalMenuOpen(false)} className="w-12 h-12 bg-white rounded-xl hover:bg-slate-50 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all shadow-sm"><X size={24}/></button>
                    </div>
                </header>
                <div className="flex-1 bg-white p-8 overflow-y-auto">
                    {floorInventory.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {floorInventory.map(item => (
                                <div key={item.id} className="border border-slate-100 rounded-2xl p-4 flex justify-between items-center hover:shadow-lg transition-all group">
                                    <div><span className="font-black text-slate-800 block text-lg">{item.productName}</span><span className="text-xs text-slate-400 font-mono bg-slate-100 px-2 py-1 rounded">ID: {item.id}</span></div>
                                    <div className="flex items-center gap-4"><span className="font-black text-indigo-600 text-xl">{item.quantity} UN</span><button onClick={()=>handlePrintFloorLabel(item)} className="p-3 bg-slate-100 rounded-xl hover:bg-slate-200 text-indigo-600"><Printer size={20}/></button></div>
                                </div>
                            ))}
                        </div>
                    ) : (<div className="h-full flex flex-col items-center justify-center text-slate-300 gap-4"><LayoutGrid size={64} strokeWidth={1} /><span className="font-black uppercase tracking-widest text-sm">Nenhum pallet armazenado no chão.</span></div>)}
                </div>
            </div>
        </div>
      )}

      {isFIFOMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[9000] flex items-center justify-center p-6">
           <div className="bg-white w-full max-w-5xl max-h-[85vh] rounded-[3rem] p-8 flex flex-col shadow-2xl">
              <header className="flex justify-between items-center mb-6 shrink-0"><h3 className="font-black text-2xl uppercase italic text-indigo-600">Expedição (FIFO)</h3><button onClick={()=>setIsFIFOMenuOpen(false)} className="p-2 bg-slate-100 rounded-xl"><X/></button></header>
              <input className="p-3 border-2 rounded-xl mb-4 font-bold uppercase" placeholder="Filtrar por SKU/Nome..." value={fifoSearchQuery} onChange={e=>setFifoSearchQuery(e.target.value)}/>
              <div className="flex-1 overflow-y-auto space-y-2 pr-2">{fifoFilteredInventory.map((item, idx)=>(<div key={item.id} className="bg-white p-4 border rounded-xl flex justify-between items-center hover:border-indigo-300"><div><span className={`text-[10px] font-black uppercase px-2 py-1 rounded ${idx===0?'bg-emerald-100 text-emerald-600':'bg-slate-100 text-slate-500'}`}>#{idx+1} Prioridade</span><span className="block font-black text-slate-800 text-lg">{item.productName}</span><span className="text-xs text-slate-400">{item.rack==='FLOOR'?'EXTERNO':`${item.rack} ${item.position} ${getLevelsForRack(item.rack)[item.level-1]}`} • {new Date(item.createdAt||item.lastUpdated).toLocaleDateString()}</span></div><div className="font-black text-indigo-600 text-xl">{item.quantity} UN</div></div>))}</div>
           </div>
        </div>
      )}

      {isLogsOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[9000] flex items-center justify-center p-6">
           <div className="bg-white w-full max-w-4xl max-h-[85vh] rounded-[3rem] p-8 flex flex-col shadow-2xl">
              <header className="flex justify-between items-center mb-6 shrink-0"><h3 className="font-black text-2xl uppercase italic text-indigo-600">Histórico de Atividades</h3><div className="flex gap-2"><button onClick={loadLogs} className="p-2 bg-slate-100 rounded-xl hover:bg-slate-200"><RefreshCcw size={20} className={isLoadingLogs ? "animate-spin" : ""}/></button><button onClick={()=>setIsLogsOpen(false)} className="p-2 bg-slate-100 rounded-xl"><X/></button></div></header>
              <div className="flex-1 overflow-y-auto space-y-2 pr-2">{isLoadingLogs ? (<div className="flex flex-col items-center justify-center py-20 opacity-50"><Loader2 size={48} className="animate-spin mb-4"/><span className="text-xs font-black uppercase">Carregando registros...</span></div>) : logs.length > 0 ? (logs.map((log, i)=>(<div key={i} className="flex justify-between items-center p-4 border-b hover:bg-slate-50 transition-colors"><div><span className={`font-black uppercase text-[10px] px-2 py-1 rounded mr-2 ${log.action==='ENTRADA'?'bg-emerald-100 text-emerald-600': (log.action==='SAIDA' ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500')}`}>{log.action}</span> <span className="text-slate-800 font-bold text-sm">{log.details}</span></div><div className="text-right"><span className="block text-xs font-bold text-slate-400">{log.timestamp ? new Date(log.timestamp).toLocaleString('pt-BR') : '-'}</span><span className="text-[10px] text-indigo-400 font-black uppercase">{log.username}</span></div></div>))) : (<div className="text-center py-10 text-slate-400 font-bold">Nenhum registro encontrado.</div>)}</div>
           </div>
        </div>
      )}

      {isUserManagementOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[9000] flex items-center justify-center p-6">
           <div className="bg-white w-full max-w-2xl max-h-[85vh] rounded-[3rem] p-8 flex flex-col shadow-2xl">
              <header className="flex justify-between items-center mb-6 shrink-0"><h3 className="font-black text-2xl uppercase italic text-indigo-600">Gestão de Usuários</h3><button onClick={()=>setIsUserManagementOpen(false)} className="p-2 bg-slate-100 rounded-xl"><X/></button></header>
              <div className="flex-1 overflow-y-auto space-y-3 pr-2">{allUsers.map(user => (<div key={user.username} className="bg-slate-50 p-4 rounded-xl border flex items-center justify-between"><div className="flex items-center gap-3"><div className={`p-2 rounded-lg ${user.role === 'admin' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500'}`}>{user.role === 'admin' ? <ShieldCheck size={20}/> : <User size={20}/>}</div><div><span className="block font-black uppercase text-sm text-slate-700">{user.username}</span><span className="text-[10px] font-bold uppercase text-slate-400">{user.role}</span></div></div>{user.username !== currentUser.username && (<button onClick={() => handleUpdateRole(user)} className="text-xs font-black uppercase text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg transition-colors border border-indigo-100">Trocar Cargo</button>)}{user.username === currentUser.username && <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2 py-1 rounded">VOCÊ</span>}</div>))}</div>
           </div>
        </div>
      )}

      {isInventoryReportOpen && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[9000] flex items-end sm:items-center justify-center p-0 sm:p-4 lg:p-10" onClick={() => setIsInventoryReportOpen(false)}>
           <div className="bg-white w-full max-w-5xl max-h-[90vh] sm:h-full lg:h-[85vh] rounded-t-[2rem] sm:rounded-[3rem] flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
              <header className="p-6 md:p-8 border-b flex justify-between items-center shrink-0"><div className="flex items-center gap-4"><div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-lg"><ListChecks size={24}/></div><h3 className="font-black text-xl md:text-2xl italic uppercase text-slate-800">Saldo Geral Consolidado</h3></div><div className="flex gap-2"><button onClick={loadInitialData} disabled={isRefreshing} className="p-3 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-all"><RefreshCcw size={20} className={isRefreshing ? "animate-spin" : ""} /></button><button onClick={handleDownloadReport} className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-black uppercase text-[10px] hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg"><FileDown size={14}/> Baixar PDF</button><button onClick={() => setIsInventoryReportOpen(false)} className="p-4 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-all"><X /></button></div></header>
              <div className="p-4 md:p-6 bg-slate-50 border-b flex items-center gap-4 shrink-0"><div className="relative flex-1"><SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20}/><input type="text" placeholder="FILTRAR RELATÓRIO..." className="w-full pl-12 p-4 bg-white border-2 border-slate-200 rounded-2xl font-black uppercase outline-none focus:border-emerald-600 transition-all shadow-sm" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></div></div>
              <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4 no-scrollbar bg-slate-50/50">{!isRefreshing && aggregatedInventory.length > 0 ? aggregatedInventory.map((item, idx) => (<div key={idx} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col sm:flex-row items-start justify-between gap-6 hover:border-emerald-200 transition-all"><div className="flex-1"><span className="text-xs font-black uppercase text-slate-400 block mb-1">SKU: {item.id}</span><h4 className="font-black text-slate-800 text-lg uppercase leading-tight mb-3">{item.name}</h4><div className="flex flex-wrap gap-2">{item.locs.map((loc, i) => (<span key={i} className="px-2 py-1 bg-slate-100 text-slate-600 text-[9px] font-bold rounded-md uppercase border border-slate-200">{loc}</span>))}</div></div><div className="bg-emerald-50 px-6 py-4 rounded-2xl flex flex-col items-center justify-center min-w-[120px] border border-emerald-100"><span className="text-3xl font-black text-emerald-600 block leading-none">{item.total}</span><span className="text-[9px] font-bold uppercase text-emerald-800 mt-1">Total Unidades</span></div></div>)) : <div className="flex flex-col items-center justify-center py-20 opacity-40"><ListChecks size={48} className="mb-4"/><p className="font-black uppercase text-xs">Inventário vazio.</p></div>}</div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;