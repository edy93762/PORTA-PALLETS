
// @ts-nocheck
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, Warehouse, X, ScanLine, Printer, ArrowRight, Loader2, LogOut, 
  ClipboardList, Trash2, Menu, AlertCircle, CheckCircle2, User as UserIcon, 
  Save, Search as SearchIcon, Navigation, Users, History, Clock, TrendingUp, Plus,
  SearchCode, Info, ChevronRight, FileDown, Calendar, Focus, Eraser, ListChecks,
  Filter, QrCode
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
  saveLogToDB,
  fetchLogsFromDB,
  fetchUsersFromDB,
  saveUserToDB
} from './services/neonService';
import { jsPDF } from "jspdf";
import QRCode from "qrcode";

const RACKS: RackId[] = ['A', 'B', 'C', 'D'];
const LEVEL_LABELS = ['A', 'B', 'C', 'D', 'E'];
const POSITIONS_PER_LEVEL = 66;
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; 
const FIXED_DB_STRING = "postgresql://neondb_owner:npg_JaZLTzrqMc09@ep-fragrant-cherry-ac95x95d-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require";

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    const saved = localStorage.getItem('currentUser');
    const loginTime = localStorage.getItem('loginTime');
    if (saved && loginTime) {
      if (Date.now() - parseInt(loginTime) < SESSION_DURATION_MS) return JSON.parse(saved);
    }
    return null;
  });

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [hoveredInfo, setHoveredInfo] = useState<{ item: PalletPosition, x: number, y: number } | null>(null);

  const [inventory, setInventory] = useState<PalletPosition[]>([]);
  const [masterProducts, setMasterProducts] = useState<MasterProduct[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [usersList, setUsersList] = useState<AppUser[]>([]);
  const [activeRack, setActiveRack] = useState<RackId>('A');
  const [activeLevelIndex, setActiveLevelIndex] = useState<number>(0); 

  const [selectedPosition, setSelectedPosition] = useState<PalletPosition | null>(null);
  const [scannedPosition, setScannedPosition] = useState<PalletPosition | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isMasterMenuOpen, setIsMasterMenuOpen] = useState(false);
  const [isPrintMenuOpen, setIsPrintMenuOpen] = useState(false);
  const [isReportsOpen, setIsReportsOpen] = useState(false);
  const [isInventoryReportOpen, setIsInventoryReportOpen] = useState(false);
  const [isUsersMenuOpen, setIsUsersMenuOpen] = useState(false);
  const [showQR, setShowQR] = useState<{ rack: string; level: number; pos: number } | null>(null);

  const [exitQuantity, setExitQuantity] = useState<number | string>(''); 
  const [inventorySearch, setInventorySearch] = useState('');
  const [newMaster, setNewMaster] = useState<MasterProduct>({ productId: '', productName: '', standardQuantity: 0 });
  const [newUser, setNewUser] = useState<AppUser>({ username: '', password: '', role: 'operator' });
  const [printFilter, setPrintFilter] = useState({ rack: 'A' as RackId, level: 1, startPos: 1, endPos: 66, onlyFree: false });

  useEffect(() => { if (currentUser) loadInitialData(); }, [currentUser]);

  const loadInitialData = async () => {
    try {
      await initializeDatabase(FIXED_DB_STRING);
      const [inv, masters] = await Promise.all([
        fetchInventoryFromDB(FIXED_DB_STRING),
        fetchMasterProductsFromDB(FIXED_DB_STRING)
      ]);
      setInventory(inv || []);
      setMasterProducts(masters || []);
    } catch (e) { 
      showFeedback('error', 'Falha na conexão com servidor.'); 
    }
  };

  const showFeedback = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3500);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername || !loginPassword) return;
    setIsLoggingIn(true);
    try {
      const user = await loginUserDB(FIXED_DB_STRING, loginUsername, loginPassword);
      if (user) {
        setCurrentUser(user);
        localStorage.setItem('currentUser', JSON.stringify(user));
        localStorage.setItem('loginTime', Date.now().toString());
      } else { 
        setLoginError(true); 
        setTimeout(() => setLoginError(false), 3000); 
      }
    } catch (e) { 
      showFeedback('error', 'Erro no banco de dados.'); 
    } finally { setIsLoggingIn(false); }
  };

  const handleLogout = () => { setCurrentUser(null); localStorage.clear(); };

  const logActivity = async (action: ActivityLog['action'], details: string, location?: string) => {
    if (!currentUser) return;
    const log: ActivityLog = { username: currentUser.username, action, details, location, timestamp: new Date().toISOString() };
    try { await saveLogToDB(FIXED_DB_STRING, log); } catch (e) { console.error("Erro ao salvar log", e); }
  };

  const handlePositionClick = (rack: RackId, level: number, pos: number) => {
    const existing = inventory.find(p => p.rack === rack && p.level === level && p.position === pos);
    const blocked = inventory.find(p => p.rack === rack && p.level === level && p.position === pos - 1 && p.slots === 2);
    if (blocked) { showFeedback('error', 'Espaço ocupado por palete duplo.'); return; }

    if (existing) {
      setScannedPosition(existing);
      setExitQuantity('');
    } else {
      setSelectedPosition({
        id: `${rack}${pos}${LEVEL_LABELS[level - 1]}`, 
        rack, level, position: pos, productId: '', productName: '', quantity: 0, slots: 1
      });
    }
  };

  const handleSavePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPosition?.productId?.trim() || !selectedPosition?.productName?.trim()) {
      showFeedback('error', 'Preencha SKU e Nome!'); return;
    }

    if (selectedPosition.slots === 2 && selectedPosition.position === POSITIONS_PER_LEVEL) {
      showFeedback('error', 'Impossível colocar palete duplo na última vaga.');
      return;
    }
    if (selectedPosition.slots === 2) {
      const nextOccupied = inventory.find(p => p.rack === selectedPosition.rack && p.level === selectedPosition.level && p.position === selectedPosition.position + 1);
      if (nextOccupied) {
        showFeedback('error', 'A próxima vaga está ocupada! Não cabe palete duplo.');
        return;
      }
    }

    setIsProcessingAction(true);
    const itemToSave = { 
      ...selectedPosition, 
      productId: selectedPosition.productId.toUpperCase().trim(),
      productName: selectedPosition.productName.toUpperCase().trim(),
      lastUpdated: new Date().toISOString() 
    };
    const displayAddr = `${itemToSave.rack} ${itemToSave.position} ${LEVEL_LABELS[itemToSave.level-1]}`;
    try {
      await saveItemToDB(FIXED_DB_STRING, itemToSave);
      setInventory(prev => [...prev.filter(p => p.id !== itemToSave.id), itemToSave]);
      await logActivity('ENTRADA', `Armazenado: ${itemToSave.productName}`, displayAddr);
      setShowQR({ rack: itemToSave.rack, level: itemToSave.level, pos: itemToSave.position });
      setSelectedPosition(null);
      showFeedback('success', 'Gravado com sucesso!');
    } catch (err) { showFeedback('error', 'Falha ao salvar.'); } finally { setIsProcessingAction(false); }
  };

  const handleSaveMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMaster.productId || !newMaster.productName) {
      showFeedback('error', 'Preencha SKU e Descrição!');
      return;
    }
    setIsProcessingAction(true);
    try {
      await saveMasterProductToDB(FIXED_DB_STRING, newMaster);
      const updated = await fetchMasterProductsFromDB(FIXED_DB_STRING);
      setMasterProducts(updated || []);
      setNewMaster({ productId: '', productName: '', standardQuantity: 0 });
      showFeedback('success', 'Item cadastrado na base com sucesso!');
    } catch (e) { 
      showFeedback('error', 'Erro ao cadastrar item na base.'); 
    } finally { 
      setIsProcessingAction(false); 
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.username || !newUser.password) return;
    setIsProcessingAction(true);
    try {
      await saveUserToDB(FIXED_DB_STRING, { ...newUser, role: 'operator' });
      const updated = await fetchUsersFromDB(FIXED_DB_STRING);
      setUsersList(updated || []);
      setNewUser({ username: '', password: '', role: 'operator' });
      showFeedback('success', 'Usuário cadastrado!');
    } catch (e) { showFeedback('error', 'Erro ao salvar usuário.'); } finally { setIsProcessingAction(false); }
  };

  const handleProcessExit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedPosition) return;
    const qtdToRemove = Number(exitQuantity);
    if (isNaN(qtdToRemove) || qtdToRemove <= 0 || qtdToRemove > scannedPosition.quantity) {
      showFeedback('error', 'Quantidade inválida.'); return;
    }
    setIsProcessingAction(true);
    const displayAddr = `${scannedPosition.rack} ${scannedPosition.position} ${LEVEL_LABELS[scannedPosition.level-1]}`;
    try {
      if (qtdToRemove < scannedPosition.quantity) {
        const updated = { ...scannedPosition, quantity: scannedPosition.quantity - qtdToRemove, lastUpdated: new Date().toISOString() };
        await saveItemToDB(FIXED_DB_STRING, updated);
        setInventory(prev => prev.map(p => p.id === updated.id ? updated : p));
      } else {
        await deleteItemFromDB(FIXED_DB_STRING, scannedPosition);
        setInventory(prev => prev.filter(p => p.id !== scannedPosition.id));
      }
      await logActivity('SAIDA', `Baixa: ${scannedPosition.productName} (-${qtdToRemove})`, displayAddr);
      showFeedback('success', 'Baixa concluída!');
      setScannedPosition(null);
      setExitQuantity('');
    } catch (err) { showFeedback('error', 'Falha na baixa.'); } finally { setIsProcessingAction(false); }
  };

  const handlePrintBatch = async () => {
    setIsProcessingAction(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const labelW = 50; const labelH = 50; const marginX = 5; const marginY = 10;
      const cols = 4; const rows = 5; const labelsPerPage = cols * rows;
      let currentLabel = 0;
      
      for (let p = printFilter.startPos; p <= printFilter.endPos; p++) {
        if (printFilter.onlyFree) {
           const isOccupied = inventory.find(item => item.rack === printFilter.rack && item.level === printFilter.level && item.position === p);
           const isBlocked = inventory.find(item => item.rack === printFilter.rack && item.level === printFilter.level && item.position === p - 1 && item.slots === 2);
           if (isOccupied || isBlocked) continue;
        }

        if (currentLabel > 0 && currentLabel % labelsPerPage === 0) doc.addPage();
        const labelIdx = currentLabel % labelsPerPage;
        const col = labelIdx % cols; const row = Math.floor(labelIdx / cols);
        const x = marginX + (col * labelW); const y = marginY + (row * labelH);
        const text = `${printFilter.rack} ${p} ${LEVEL_LABELS[printFilter.level-1]}`;
        const val = `PP-${printFilter.rack}-P-${p}-L-${printFilter.level}`;
        const qr = await QRCode.toDataURL(val, { width: 200, margin: 0 });
        doc.setDrawColor(220); doc.rect(x, y, labelW, labelH);
        doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(text, x + 25, y + 7, { align: "center" });
        doc.addImage(qr, 'PNG', x + 7.5, y + 9, 35, 35);
        doc.setFontSize(6); doc.text(val, x + 25, y + 47, { align: "center" });
        currentLabel++;
      }

      if (currentLabel === 0) {
        showFeedback('error', 'Nenhuma posição vazia encontrada no intervalo!');
      } else {
        doc.save(`Lote_A4_${printFilter.rack}_Nivel${LEVEL_LABELS[printFilter.level-1]}.pdf`);
        showFeedback('success', `PDF gerado com ${currentLabel} etiquetas!`);
        setIsPrintMenuOpen(false);
      }
    } catch (e) { showFeedback('error', 'Erro ao gerar PDF.'); } finally { setIsProcessingAction(false); }
  };

  const aggregatedInventory = useMemo(() => {
    const map = new Map<string, { productId: string, productName: string, totalQuantity: number, locations: string[] }>();
    inventory.forEach(item => {
      if (!item.productId) return;
      const existing = map.get(item.productId);
      const loc = `${item.rack}${item.position}${LEVEL_LABELS[item.level - 1]}`;
      if (existing) {
        existing.totalQuantity += (item.quantity || 0);
        existing.locations.push(loc);
      } else {
        map.set(item.productId, {
          productId: item.productId,
          productName: item.productName || 'N/A',
          totalQuantity: item.quantity || 0,
          locations: [loc]
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.productName.localeCompare(b.productName));
  }, [inventory]);

  const filteredAggregated = useMemo(() => {
    if (!inventorySearch) return aggregatedInventory;
    const query = inventorySearch.toUpperCase();
    return aggregatedInventory.filter(item => 
      item.productId.includes(query) || item.productName.includes(query)
    );
  }, [aggregatedInventory, inventorySearch]);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
        <Warehouse className="text-indigo-600 w-16 h-16 mb-6" />
        <h1 className="text-2xl font-black text-white italic uppercase mb-8">ALMOX PRO</h1>
        <form onSubmit={handleLogin} className="w-full max-w-xs space-y-4">
          <input type="text" placeholder="LOGIN" className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-white font-bold outline-none focus:border-indigo-500" value={loginUsername} onChange={e => setLoginUsername(e.target.value.toLowerCase())} />
          <input type="password" placeholder="SENHA" className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-white font-bold outline-none focus:border-indigo-500" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
          <button type="submit" className="w-full bg-indigo-600 text-white p-4 rounded-2xl font-black uppercase">
            {isLoggingIn ? <Loader2 className="animate-spin mx-auto"/> : 'Acessar'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row overflow-hidden relative text-slate-900">
      {feedback && (
        <div className={`fixed top-6 right-6 z-[9999] p-5 rounded-3xl shadow-2xl flex items-center gap-4 ${feedback.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
           <CheckCircle2 size={24}/> <span className="font-black text-xs uppercase">{feedback.msg}</span>
        </div>
      )}

      {hoveredInfo && (
        <div 
          className="fixed pointer-events-none z-[10000] bg-slate-900/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl border border-white/10 flex flex-col gap-1 min-w-[200px] animate-in fade-in zoom-in-95 duration-75"
          style={{ left: hoveredInfo.x + 15, top: hoveredInfo.y + 15 }}
        >
          <div className="flex justify-between items-center mb-1">
            <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">{hoveredInfo.item.rack} {hoveredInfo.item.position} {LEVEL_LABELS[hoveredInfo.item.level-1]}</p>
          </div>
          <h4 className="font-black uppercase text-xs truncate">{hoveredInfo.item.productName}</h4>
          <div className="flex justify-between items-center mt-2 pt-2 border-t border-white/10">
            <span className="text-[9px] font-bold text-slate-400 uppercase">SKU: {hoveredInfo.item.productId}</span>
            <span className="text-xs font-black text-white">{hoveredInfo.item.quantity}un</span>
            {hoveredInfo.item.slots === 2 && <span className="text-[8px] font-black bg-white text-rose-600 px-1.5 rounded ml-2 uppercase">Vaga Dupla</span>}
          </div>
        </div>
      )}

      {/* MENU LATERAL */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-slate-200 flex-col p-8 gap-8">
        <div className="flex items-center gap-3 mb-4">
          <Warehouse className="text-indigo-600 w-7 h-7" />
          <h1 className="text-lg font-black italic uppercase text-slate-800">ALMOX PRO</h1>
        </div>
        
        <div className="flex flex-col gap-6">
          <button onClick={() => setIsMasterMenuOpen(true)} className="flex items-center gap-4 text-slate-600 font-bold uppercase text-xs hover:text-indigo-600 transition-colors">
            <ClipboardList size={22} className="text-slate-400"/> ITEM
          </button>
          <button onClick={() => setIsInventoryReportOpen(true)} className="flex items-center gap-4 text-slate-600 font-bold uppercase text-xs hover:text-indigo-600 transition-colors">
            <ListChecks size={22} className="text-slate-400"/> SALDO GERAL
          </button>
          <button onClick={() => setIsPrintMenuOpen(true)} className="flex items-center gap-4 text-slate-600 font-bold uppercase text-xs hover:text-indigo-600 transition-colors">
            <Printer size={22} className="text-slate-400"/> ETIQUETAS
          </button>
          <button onClick={async () => { const logs = await fetchLogsFromDB(FIXED_DB_STRING); setActivityLogs(logs || []); setIsReportsOpen(true); }} className="flex items-center gap-4 text-slate-600 font-bold uppercase text-xs hover:text-indigo-600 transition-colors">
            <History size={22} className="text-slate-400"/> HISTÓRICO
          </button>
          {currentUser.role === 'admin' && (
            <button onClick={async () => { const users = await fetchUsersFromDB(FIXED_DB_STRING); setUsersList(users || []); setIsUsersMenuOpen(true); }} className="flex items-center gap-4 text-emerald-600 font-bold uppercase text-xs hover:text-emerald-700 transition-colors">
              <Users size={22} className="text-emerald-500"/> USUÁRIOS
            </button>
          )}
        </div>

        <div className="mt-auto flex flex-col gap-4">
           <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <UserIcon size={18} className="text-indigo-600" />
              <span className="font-black text-[10px] text-slate-700 uppercase">{currentUser.username}</span>
           </div>
           <button onClick={handleLogout} className="flex items-center gap-4 text-slate-400 font-bold uppercase text-xs p-4 hover:text-rose-600 transition-colors">
             <LogOut size={20}/> SAIR
           </button>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center lg:hidden">
          <div className="flex items-center gap-2"><Warehouse className="text-indigo-600 w-6 h-6"/><h1 className="font-black italic uppercase text-slate-800">ALMOX</h1></div>
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 bg-slate-100 rounded-xl"><Menu/></button>
        </header>

        <main className="flex-1 p-6 lg:p-10 space-y-8 overflow-y-auto no-scrollbar relative">
          <div className="max-w-md">
            <button onClick={() => setIsScannerOpen(true)} className="w-full flex items-center justify-center gap-3 p-5 bg-indigo-600 text-white rounded-[2rem] font-black uppercase text-xs shadow-lg hover:scale-[1.02] transition-all"><ScanLine size={20}/> Scanner QR Code</button>
          </div>

          <div className="bg-white rounded-[3rem] p-8 border border-slate-200 shadow-sm relative">
            <div className="flex flex-wrap gap-4 mb-8 justify-between items-center">
              <div className="flex gap-2 p-1 bg-slate-50 rounded-2xl border border-slate-100">
                {RACKS.map(r => (
                  <button key={r} onClick={() => setActiveRack(r)} className={`px-6 py-2 rounded-xl font-black text-xs uppercase transition-all ${activeRack === r ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>{r}</button>
                ))}
              </div>
              <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
                {LEVEL_LABELS.map((l, i) => (
                  <button key={l} onClick={() => setActiveLevelIndex(i)} className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm transition-all ${activeLevelIndex === i ? 'bg-slate-800 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>{l}</button>
                ))}
              </div>
            </div>

            {/* LEGENDA RÁPIDA */}
            <div className="flex gap-6 mb-6 px-2">
              <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-md bg-emerald-500 shadow-sm"></div><span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Livre</span></div>
              <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-md bg-rose-600 shadow-sm"></div><span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Ocupado</span></div>
            </div>

            {/* GRID PRINCIPAL: gap-x-0 para fundir os slots duplos */}
            <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-11 gap-x-0 gap-y-3">
              {Array.from({ length: POSITIONS_PER_LEVEL }).map((_, i) => {
                const pos = i + 1;
                const directOcc = inventory.find(p => p.rack === activeRack && p.level === (activeLevelIndex + 1) && p.position === pos);
                const isFirstSlotOfDouble = directOcc?.slots === 2;
                const blockedByLeft = inventory.find(p => p.rack === activeRack && p.level === (activeLevelIndex + 1) && p.position === pos - 1 && p.slots === 2);
                
                const activeItem = directOcc || blockedByLeft;
                const isOccupied = !!activeItem;
                const isSecondSlot = !!blockedByLeft;

                // Estilo para fusão visual agressiva
                let roundingClass = "rounded-xl";
                let borderClass = "border-2 border-white/20";
                let marginClass = "mx-0.5"; 
                
                if (isFirstSlotOfDouble) {
                  roundingClass = "rounded-l-2xl rounded-r-none";
                  borderClass = "border-2 border-r-0 border-white/30";
                  marginClass = "ml-1 mr-0"; 
                } else if (isSecondSlot) {
                  roundingClass = "rounded-r-2xl rounded-l-none";
                  borderClass = "border-2 border-l-0 border-white/10";
                  marginClass = "mr-1 ml-0"; 
                }

                return (
                  <button 
                    key={pos} 
                    onClick={() => handlePositionClick(activeRack, activeLevelIndex+1, pos)}
                    onMouseEnter={(e) => { if (activeItem) setHoveredInfo({ item: activeItem, x: e.clientX, y: e.clientY }); }}
                    onMouseMove={(e) => { if (activeItem) setHoveredInfo({ item: activeItem, x: e.clientX, y: e.clientY }); }}
                    onMouseLeave={() => setHoveredInfo(null)}
                    className={`aspect-square flex flex-col items-center justify-center transition-all hover:scale-[1.03] active:scale-95 relative overflow-hidden text-white shadow-md ${roundingClass} ${borderClass} ${marginClass} ${isOccupied ? 'bg-rose-600' : 'bg-emerald-500'}`}
                  >
                    <span className="text-[10px] font-black z-10 absolute top-1">{pos}</span>
                    
                    {isOccupied && !isSecondSlot && (
                      <div className="mt-2 flex flex-col items-center">
                        <Package size={22} strokeWidth={2.5} className="text-white drop-shadow-md" />
                        {isFirstSlotOfDouble && <span className="text-[7px] font-black uppercase mt-1 bg-white/20 px-1 rounded">Double</span>}
                      </div>
                    )}
                    
                    {isSecondSlot && (
                       <div className="absolute inset-0 bg-black/5 flex items-center justify-center">
                          <ArrowRight size={32} strokeWidth={4} className="text-white opacity-60 animate-pulse" />
                       </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </main>
      </div>

      {/* MODAIS (INV, SCANNER, BAIXA, ENTRADA, MASTER, PRINT, HISTORY, USERS, DRAWER) CONTINUAM IGUAIS... */}
      {isInventoryReportOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[9000] flex items-center justify-center p-6" onClick={() => setIsInventoryReportOpen(false)}>
           <div className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl p-8 h-[85vh] flex flex-col animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <header className="flex justify-between items-center mb-8">
                 <div><h3 className="font-black text-2xl uppercase italic text-indigo-600">Saldo Geral de Estoque</h3><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Consolidado por ID de Produto</p></div>
                 <button onClick={() => setIsInventoryReportOpen(false)} className="p-3 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-colors"><X/></button>
              </header>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                 <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100"><span className="text-[9px] font-black uppercase text-indigo-400 tracking-widest">SKUs Únicos</span><p className="text-3xl font-black text-indigo-600 italic leading-none mt-1">{aggregatedInventory.length}</p></div>
                 <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 flex items-center gap-4 relative"><SearchIcon size={20} className="text-slate-300"/><input type="text" placeholder="FILTRAR POR ID OU NOME..." className="flex-1 bg-transparent font-black uppercase text-sm outline-none placeholder:text-slate-300" value={inventorySearch} onChange={e => setInventorySearch(e.target.value)} /></div>
              </div>
              <div className="flex-1 overflow-y-auto no-scrollbar border rounded-[2rem] border-slate-100 bg-white">
                 <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-white border-b border-slate-100 z-10">
                       <tr><th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">ID (SKU)</th><th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Produto</th><th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Qtd Total</th><th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Endereços Ocupados</th></tr>
                    </thead>
                    <tbody>
                       {filteredAggregated.length > 0 ? filteredAggregated.map(item => (
                          <tr key={item.productId} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                             <td className="px-6 py-5 font-black text-indigo-600 text-xs">{item.productId}</td>
                             <td className="px-6 py-5 font-bold text-slate-700 text-xs uppercase">{item.productName}</td>
                             <td className="px-6 py-5 font-black text-slate-900 text-sm text-right">{item.totalQuantity} <span className="text-[9px] text-slate-400">UN</span></td>
                             <td className="px-6 py-5"><div className="flex flex-wrap gap-1">{item.locations.map((loc, idx) => <span key={idx} className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[9px] font-black text-slate-500 uppercase">{loc}</span>)}</div></td>
                          </tr>
                       )) : <tr><td colSpan={4} className="px-6 py-20 text-center font-black text-slate-300 uppercase italic">Nenhum item localizado</td></tr>}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      )}

      {/* SCANNER MODAL */}
      {isScannerOpen && (
        <ScannerModal onScan={(code) => {
          let item = null;
          if (code.startsWith('PP-')) {
            const parts = code.split('-');
            const rack = parts[1]; const pos = parseInt(parts[3]); const level = parseInt(parts[5]);
            item = inventory.find(p => p.rack === rack && p.level === level && p.position === pos);
          } else {
            item = inventory.find(p => p.id === code || p.id === code.replace(/-/g, ''));
          }
          if (item?.productId) { setScannedPosition(item); setIsScannerOpen(false); }
          else if (item) { setSelectedPosition(item); setIsScannerOpen(false); showFeedback('error', 'Local Vazio! Abrindo para entrada.'); }
          else { showFeedback('error', 'Local não identificado!'); setIsScannerOpen(false); }
        }} onClose={() => setIsScannerOpen(false)} />
      )}

      {/* EXIT MODAL */}
      {scannedPosition && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[8000] flex items-center justify-center p-6" onClick={() => setScannedPosition(null)}>
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 animate-in zoom-in-95 shadow-2xl" onClick={e => e.stopPropagation()}>
            <header className="flex justify-between items-center mb-6">
               <h3 className="font-black text-xl text-rose-600 uppercase italic">Saída Manual</h3>
               <div className="flex gap-2">
                 <button onClick={() => setShowQR({ rack: scannedPosition.rack, level: scannedPosition.level, pos: scannedPosition.position })} className="p-2 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors text-slate-600" title="Ver QR Code">
                    <QrCode size={20} />
                 </button>
                 <button onClick={() => setScannedPosition(null)} className="p-2 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"><X size={20}/></button>
               </div>
            </header>
            <div className="bg-rose-50 p-6 rounded-[2.5rem] text-center mb-6 border border-rose-100">
               <span className="text-[10px] font-black uppercase tracking-widest text-rose-700 block mb-1">LOCAL: {scannedPosition.rack} {scannedPosition.position} {LEVEL_LABELS[scannedPosition.level-1]}</span>
               <h4 className="text-lg font-black uppercase leading-tight mb-2">{scannedPosition.productName}</h4>
               <div className="inline-block px-4 py-1 bg-white rounded-full border border-rose-200"><p className="text-xs font-black text-rose-600 uppercase">Saldo: {scannedPosition.quantity} UN</p></div>
               {scannedPosition.slots === 2 && <div className="mt-2 text-[8px] font-black text-rose-400 uppercase tracking-widest">Ocupa 2 Vagas</div>}
            </div>
            <div className="space-y-2 mb-6"><p className="text-[10px] font-black text-slate-400 uppercase text-center">Quantidade de Baixa</p><input type="number" autoFocus placeholder="0" className="w-full p-6 bg-slate-50 rounded-[2rem] font-black text-5xl text-center border-4 border-transparent focus:border-rose-500 outline-none shadow-inner" value={exitQuantity} onChange={e => setExitQuantity(e.target.value)} /></div>
            <button onClick={handleProcessExit} className="w-full bg-rose-600 text-white p-6 rounded-[2rem] font-black text-lg uppercase shadow-xl hover:bg-rose-700 active:scale-95 transition-all">Confirmar Saída</button>
          </div>
        </div>
      )}

      {/* ENTRY MODAL */}
      {selectedPosition && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[6000] flex items-center justify-center p-6" onClick={() => setSelectedPosition(null)}>
           <div className="bg-white rounded-[3rem] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
             <header className="p-6 bg-indigo-600 text-white flex justify-between items-center">
                <h3 className="font-black text-lg uppercase italic">Armazenar Palete</h3>
                <div className="flex gap-2">
                  <button onClick={() => setShowQR({ rack: selectedPosition.rack, level: selectedPosition.level, pos: selectedPosition.position })} className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-all" title="Ver QR Code">
                    <QrCode size={20}/>
                  </button>
                  <button onClick={() => setSelectedPosition(null)} className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-all"><X size={20}/></button>
                </div>
             </header>
             <form onSubmit={handleSavePosition} className="p-6 space-y-4">
                <input list="master-items-list" type="text" placeholder="ID SKU" className="w-full p-4 bg-slate-50 rounded-xl font-black uppercase outline-none focus:ring-2 ring-indigo-300" value={selectedPosition.productId || ''} onChange={e => {
                  const val = e.target.value.toUpperCase();
                  const master = masterProducts.find(m => m.productId.trim() === val.trim());
                  setSelectedPosition(prev => master ? {...prev, productId: val, productName: master.productName, quantity: master.standardQuantity} : {...prev, productId: val});
                }} />
                <datalist id="master-items-list">{masterProducts.map(m => <option key={m.productId} value={m.productId}>{m.productName}</option>)}</datalist>
                <input type="text" placeholder="DESCRIÇÃO" className="w-full p-4 bg-slate-50 rounded-xl font-black uppercase outline-none focus:ring-2 ring-indigo-300" value={selectedPosition.productName || ''} onChange={e => setSelectedPosition(prev => ({...prev, productName: e.target.value.toUpperCase()}))} />
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" placeholder="QTD" className="w-full p-4 bg-slate-50 rounded-xl font-black outline-none focus:ring-2 ring-indigo-300" value={selectedPosition.quantity || ''} onChange={e => setSelectedPosition(prev => ({...prev, quantity: parseInt(e.target.value) || 0}))} />
                  <select className="w-full p-4 bg-slate-50 rounded-xl font-black uppercase text-[10px]" value={selectedPosition.slots || 1} onChange={e => setSelectedPosition(prev => ({...prev, slots: parseInt(e.target.value)}))}><option value={1}>Vaga Única</option><option value={2}>Vaga Dupla</option></select>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border-2 border-indigo-100 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Endereço</p>
                  <p className="text-3xl font-black text-indigo-600 tracking-wider">
                    {selectedPosition.rack} {selectedPosition.position} {LEVEL_LABELS[selectedPosition.level-1]}
                    {selectedPosition.slots === 2 && <span className="text-sm align-middle ml-2 text-indigo-400">+ {selectedPosition.position + 1}</span>}
                  </p>
                </div>
                <button type="submit" className="w-full bg-indigo-600 text-white p-5 rounded-2xl font-black uppercase text-xs shadow-lg active:scale-95 transition-all">ARMAZENAR</button>
             </form>
           </div>
        </div>
      )}

      {/* MASTER DATA MODAL */}
      {isMasterMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[6000] flex items-center justify-center p-6" onClick={() => setIsMasterMenuOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-[3rem] p-8 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
             <header className="flex justify-between items-center mb-6"><h3 className="font-black text-xl uppercase italic text-indigo-600">Base de Itens</h3><button onClick={() => setIsMasterMenuOpen(false)} className="p-2 bg-slate-100 rounded-xl"><X size={20}/></button></header>
             <form onSubmit={handleSaveMaster} className="space-y-4 mb-6">
                <input type="text" placeholder="ID SKU" className="w-full p-4 bg-slate-50 rounded-xl font-black uppercase text-xs outline-none" value={newMaster.productId} onChange={e => setNewMaster({...newMaster, productId: e.target.value.toUpperCase()})} />
                <input type="text" placeholder="DESCRIÇÃO" className="w-full p-4 bg-slate-50 rounded-xl font-black uppercase text-xs outline-none" value={newMaster.productName} onChange={e => setNewMaster({...newMaster, productName: e.target.value.toUpperCase()})} />
                <input type="number" placeholder="QTD PADRÃO" className="w-full p-4 bg-slate-50 rounded-xl font-black text-xs outline-none" value={newMaster.standardQuantity || ''} onChange={e => setNewMaster({...newMaster, standardQuantity: parseInt(e.target.value) || 0})} />
                <button type="submit" className="w-full bg-indigo-600 text-white p-4 rounded-xl font-black uppercase text-xs shadow-lg">Salvar na Base</button>
             </form>
             <div className="max-h-48 overflow-y-auto no-scrollbar space-y-2 border-t pt-4">
                {masterProducts.map(m => (
                  <div key={m.productId} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl text-[10px] border">
                    <div>{m.productId} - {m.productName}</div>
                    <button onClick={() => deleteMasterProductFromDB(FIXED_DB_STRING, m.productId).then(() => setMasterProducts(prev => prev.filter(x => x.productId !== m.productId)))} className="text-rose-500"><Trash2 size={16}/></button>
                  </div>
                ))}
             </div>
          </div>
        </div>
      )}

      {/* PRINT MODAL */}
      {isPrintMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[6000] flex items-center justify-center p-6" onClick={() => setIsPrintMenuOpen(false)}>
           <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <header className="flex justify-between items-center mb-6"><h3 className="font-black text-xl uppercase italic text-indigo-600">Gerar Lote A4</h3><button onClick={() => setIsPrintMenuOpen(false)} className="p-2 bg-slate-100 rounded-xl"><X size={20}/></button></header>
              <div className="space-y-6">
                 <div className="grid grid-cols-4 gap-1">{RACKS.map(r => (<button key={r} onClick={() => setPrintFilter({...printFilter, rack: r})} className={`p-3 rounded-xl font-black text-[10px] border-2 ${printFilter.rack === r ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-slate-50'}`}>{r}</button>))}</div>
                 <select className="w-full p-4 bg-slate-50 rounded-xl font-black text-xs uppercase" value={printFilter.level} onChange={e => setPrintFilter({...printFilter, level: parseInt(e.target.value)})}>{LEVEL_LABELS.map((l, i) => <option key={l} value={i+1}>NÍVEL {l}</option>)}</select>
                 <div className="grid grid-cols-2 gap-4"><input type="number" min="1" max="66" className="w-full p-4 bg-slate-50 rounded-xl font-black text-sm" value={printFilter.startPos} onChange={e => setPrintFilter({...printFilter, startPos: parseInt(e.target.value) || 1})} /><input type="number" min="1" max="66" className="w-full p-4 bg-slate-50 rounded-xl font-black text-sm" value={printFilter.endPos} onChange={e => setPrintFilter({...printFilter, endPos: parseInt(e.target.value) || 66})} /></div>
                 <button onClick={() => setPrintFilter({...printFilter, onlyFree: !printFilter.onlyFree})} className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 ${printFilter.onlyFree ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-slate-50'}`}><span>Apenas Livres</span>{printFilter.onlyFree && <CheckCircle2 size={14}/>}</button>
                 <button onClick={handlePrintBatch} className="w-full bg-indigo-600 text-white p-5 rounded-[2rem] font-black uppercase text-xs shadow-xl"><Printer size={18}/> GERAR PDF A4</button>
              </div>
           </div>
        </div>
      )}

      {/* HISTORY MODAL */}
      {isReportsOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[6000] flex items-center justify-center p-6" onClick={() => setIsReportsOpen(false)}>
           <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl p-8 h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <header className="flex justify-between items-center mb-6"><h3 className="font-black text-xl uppercase italic text-amber-600">Histórico</h3><button onClick={() => setIsReportsOpen(false)} className="p-2 bg-slate-100 rounded-xl"><X size={20}/></button></header>
              <div className="flex-1 overflow-y-auto no-scrollbar space-y-4">
                 {activityLogs.length > 0 ? activityLogs.map(log => (
                    <div key={log.id} className="p-5 bg-white rounded-3xl border-2 border-slate-100 shadow-sm relative overflow-hidden">
                       <div className="absolute top-0 left-0 w-1 h-full bg-slate-200"></div>
                       <div className="flex justify-between items-start mb-3">
                          <div className="flex flex-wrap items-center gap-2">
                             <div className={`px-4 py-1.5 rounded-2xl text-[10px] font-black text-white uppercase shadow-sm ${log.action === 'SAIDA' ? 'bg-rose-500' : 'bg-indigo-500'}`}>{log.action}</div>
                             <div className="bg-slate-900 text-white px-4 py-1.5 rounded-2xl border border-slate-800 shadow-md flex items-center gap-2">
                               <UserIcon size={12} className="text-indigo-400" />
                               <span className="text-[11px] font-black uppercase tracking-tight">{log.username}</span>
                             </div>
                          </div>
                          <p className="text-[10px] font-black text-slate-400 uppercase">{new Date(log.timestamp).toLocaleTimeString()}</p>
                       </div>
                       <div className="bg-slate-50 p-4 rounded-2xl">
                         <p className="font-black text-slate-800 uppercase text-sm mb-1 leading-tight">{log.details}</p>
                         <div className="flex items-center gap-2 mt-2">
                           <Navigation size={12} className="text-indigo-600"/>
                           <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest italic">{log.location || 'N/A'}</p>
                         </div>
                       </div>
                    </div>
                 )) : <div className="h-full flex flex-col items-center justify-center opacity-30 italic font-black uppercase">Vazio</div>}
              </div>
           </div>
        </div>
      )}

      {/* USERS MODAL */}
      {isUsersMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[6000] flex items-center justify-center p-6" onClick={() => setIsUsersMenuOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-[3rem] p-8 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
             <header className="flex justify-between items-center mb-6"><h3 className="font-black text-xl uppercase italic text-emerald-600">Usuários</h3><button onClick={() => setIsUsersMenuOpen(false)} className="p-2 bg-slate-100 rounded-xl"><X size={20}/></button></header>
             <form onSubmit={handleSaveUser} className="space-y-3 mb-6 bg-emerald-50 p-6 rounded-[2.5rem] border border-emerald-100">
                <input type="text" placeholder="LOGIN" className="w-full p-4 bg-white rounded-2xl font-black uppercase text-xs outline-none" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value.toLowerCase().trim()})} />
                <input type="password" placeholder="SENHA" className="w-full p-4 bg-white rounded-2xl font-black text-xs outline-none" value={newUser.password || ''} onChange={e => setNewUser({...newUser, password: e.target.value})} />
                <button type="submit" className="w-full bg-emerald-600 text-white font-black p-5 rounded-2xl uppercase text-xs shadow-lg"><Plus size={18}/> ADICIONAR</button>
             </form>
             <div className="max-h-56 overflow-y-auto no-scrollbar space-y-2">
                {usersList.map(u => (
                  <div key={u.username} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                     <div className="flex items-center gap-3">
                        <UserIcon size={16} className="text-emerald-500"/>
                        <span className="text-xs font-black text-slate-800 uppercase">{u.username}</span>
                     </div>
                  </div>
                ))}
             </div>
          </div>
        </div>
      )}

      {/* MOBILE DRAWER */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[7000] flex justify-end" onClick={() => setIsMobileMenuOpen(false)}>
           <div className="w-[80%] max-w-xs h-full bg-white p-10 flex flex-col gap-8 animate-in slide-in-from-right" onClick={e => e.stopPropagation()}>
              <h3 className="font-black text-xl italic uppercase text-slate-800">MENU</h3>
              <div className="flex flex-col gap-8">
                 <button onClick={() => {setIsMobileMenuOpen(false); setIsMasterMenuOpen(true);}} className="flex items-center gap-4 text-slate-600 font-bold uppercase text-sm"><ClipboardList size={24}/> ITEM</button>
                 <button onClick={() => {setIsMobileMenuOpen(false); setIsInventoryReportOpen(true);}} className="flex items-center gap-4 text-slate-600 font-bold uppercase text-sm"><ListChecks size={24}/> SALDO</button>
                 <button onClick={() => {setIsMobileMenuOpen(false); setIsPrintMenuOpen(true);}} className="flex items-center gap-4 text-slate-600 font-bold uppercase text-sm"><Printer size={24}/> ETIQUETAS</button>
                 <button onClick={async () => { setIsMobileMenuOpen(false); const logs = await fetchLogsFromDB(FIXED_DB_STRING); setActivityLogs(logs || []); setIsReportsOpen(true); }} className="flex items-center gap-4 text-slate-600 font-bold uppercase text-sm"><History size={24}/> HISTÓRICO</button>
                 {currentUser.role === 'admin' && (
                    <button onClick={async () => { setIsMobileMenuOpen(false); const users = await fetchUsersFromDB(FIXED_DB_STRING); setUsersList(users || []); setIsUsersMenuOpen(true); }} className="flex items-center gap-4 text-emerald-600 font-bold uppercase text-sm"><Users size={24}/> USUÁRIOS</button>
                 )}
              </div>
              <div className="mt-auto border-t pt-4">
                 <button onClick={handleLogout} className="flex items-center gap-4 text-rose-500 font-bold uppercase text-sm"><LogOut size={24}/> SAIR</button>
              </div>
           </div>
        </div>
      )}

      {showQR && <QRCodeModal position={showQR} onClose={() => setShowQR(null)} />}
    </div>
  );
};

export default App;
