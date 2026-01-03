
// @ts-nocheck
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Package, Warehouse, X, ScanLine, Printer, Loader2, 
  ClipboardList, Trash2, Menu, AlertCircle, CheckCircle2, Search as SearchIcon, 
  QrCode, ArrowDownRight, ListChecks, History, LogOut, ArrowRightCircle, UserPlus, ShieldCheck
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
  cleanupOldLogs
} from './services/neonService';
import { jsPDF } from "jspdf";
import QRCode from "qrcode";

const RACKS: RackId[] = ['A', 'B', 'C', 'D'];
const LEVEL_LABELS = ['A', 'B', 'C', 'D', 'E'];
const POSITIONS_PER_LEVEL = 66;
const FIXED_DB_STRING = "postgresql://neondb_owner:npg_JaZLTzrqMc09@ep-fragrant-cherry-ac95x95d-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require";
const SECRET_REGISTRATION_KEY = "Shopee@2026";
const STORAGE_KEY = "almox_pro_user_session";

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [loginData, setLoginData] = useState({ user: '', pass: '', secret: '' });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
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
  
  const [activeRack, setActiveRack] = useState<RackId>('A');
  const [activeLevelIndex, setActiveLevelIndex] = useState<number>(0); 
  const [selectedPosition, setSelectedPosition] = useState<PalletPosition | null>(null);
  const [palletDetails, setPalletDetails] = useState<PalletPosition | null>(null);

  const [printFilterStatus, setPrintFilterStatus] = useState<'all' | 'free'>('all');
  const [showQR, setShowQR] = useState<{ rack: string; level: number; pos: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [masterSearchQuery, setMasterSearchQuery] = useState('');
  const [newMaster, setNewMaster] = useState<MasterProduct>({ productId: '', productName: '', standardQuantity: 0 });
  const [isPrintingBatch, setIsPrintingBatch] = useState(false);

  // Recupera sessão ao carregar
  useEffect(() => {
    const savedUser = localStorage.getItem(STORAGE_KEY);
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

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

  useEffect(() => {
    const init = async () => {
      try {
        await initializeDatabase(FIXED_DB_STRING);
        await cleanupOldLogs(FIXED_DB_STRING);
        await loadInitialData();
      } catch (e) { 
        console.error("Erro inicial"); 
      }
    };
    init();
    const interval = setInterval(loadInitialData, 10000);
    return () => clearInterval(interval);
  }, [loadInitialData]);

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
        role: 'operator'
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

  const handleSaveMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMaster.productId || !newMaster.productName) return;
    try {
      await saveMasterProductToDB(FIXED_DB_STRING, newMaster);
      await loadInitialData();
      setNewMaster({ productId: '', productName: '', standardQuantity: 0 });
      showFeedback('success', 'Salvo na Base!');
    } catch (e) { showFeedback('error', 'Erro ao salvar.'); }
  };

  const handleDeleteMaster = async (productId: string) => {
    if (!confirm(`Excluir SKU ${productId}?`)) return;
    try {
      await deleteMasterProductFromDB(FIXED_DB_STRING, productId);
      await loadInitialData();
      showFeedback('success', 'Removido.');
    } catch (e) { showFeedback('error', 'Erro ao excluir.'); }
  };

  const stats = useMemo(() => {
    const total = RACKS.length * LEVEL_LABELS.length * POSITIONS_PER_LEVEL;
    const occupied = inventory.length;
    const free = total - occupied;
    const rate = total > 0 ? ((occupied / total) * 100).toFixed(1) : 0;
    return { total, occupied, free, rate };
  }, [inventory]);

  const aggregatedInventory = useMemo(() => {
    const map = new Map<string, any>();
    inventory.forEach(item => {
      if (!item.productId) return;
      const ex = map.get(item.productId);
      const loc = `${item.rack}${item.position}${LEVEL_LABELS[item.level - 1]}`;
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

  const filteredMasterProducts = useMemo(() => {
    if (!masterSearchQuery) return masterProducts;
    const q = masterSearchQuery.toUpperCase();
    return masterProducts.filter(m => 
      (m.productId && m.productId.toUpperCase().includes(q)) || 
      (m.productName && m.productName.toUpperCase().includes(q))
    );
  }, [masterProducts, masterSearchQuery]);

  const filteredPrintPositions = useMemo(() => {
    const list = [];
    RACKS.forEach(rack => {
      for (let l = 1; l <= LEVEL_LABELS.length; l++) {
        for (let p = 1; p <= POSITIONS_PER_LEVEL; p++) {
          const occ = inventory.find(inv => inv.rack === rack && inv.level === l && inv.position === p);
          const isTail = inventory.find(inv => inv.rack === rack && inv.level === l && inv.position === (p - 1) && inv.slots === 2);
          list.push({ rack, level: l, position: p, label: `${rack}${p}${LEVEL_LABELS[l-1]}`, occupied: !!(occ || isTail) });
        }
      }
    });
    return list.filter(f => f.rack === activeRack && f.level === (activeLevelIndex + 1) && (printFilterStatus === 'all' || !f.occupied));
  }, [inventory, activeRack, activeLevelIndex, printFilterStatus]);

  const generateLabelBatchPDF = async (list: any[]) => {
    if (!list || list.length === 0) return;
    setIsPrintingBatch(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [50, 50] });
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const labelText = `${item.rack} ${item.position} ${LEVEL_LABELS[item.level - 1]}`;
        const codeValue = `PP-${item.rack}-P-${item.position}-L-${item.level}`;
        if (i > 0) doc.addPage([50, 50], 'portrait');
        doc.setLineWidth(0.1); doc.rect(1, 1, 48, 48);
        const qrDataUrl = await QRCode.toDataURL(codeValue, { errorCorrectionLevel: 'H', width: 300, margin: 0 });
        doc.addImage(qrDataUrl, 'PNG', 7.5, 8, 35, 35);
        doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text(labelText, 25, 6, { align: "center" });
        doc.setFontSize(6); doc.text(codeValue, 25, 47, { align: "center" });
      }
      doc.save(`Lote_${activeRack}_Nivel_${LEVEL_LABELS[activeLevelIndex]}.pdf`);
      showFeedback('success', 'Lote gerado!');
    } catch (e) { showFeedback('error', 'Falha ao gerar PDF'); } finally { setIsPrintingBatch(false); }
  };

  const handlePositionClick = (rack: RackId, level: number, pos: number) => {
    const occ = inventory.find(p => p.rack === rack && p.level === level && p.position === pos);
    const isTail = inventory.find(p => p.rack === rack && p.level === level && p.position === (pos - 1) && p.slots === 2);
    const target = occ || isTail;
    if (target) { setPalletDetails(target); } 
    else { setSelectedPosition({ id: `${rack}${pos}${LEVEL_LABELS[level - 1]}`, rack, level, position: pos, productId: '', productName: '', quantity: 0, slots: 1 }); }
  };

  const printSingleLabel = async (rack, level, pos) => {
    const levelLetter = LEVEL_LABELS[level - 1];
    const codeValue = `PP-${rack}-P-${pos}-L-${level}`;
    const labelText = `${rack} ${pos} ${levelLetter}`;
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [50, 50] });
      const qrDataUrl = await QRCode.toDataURL(codeValue, { errorCorrectionLevel: 'H', width: 300, margin: 0 });
      doc.rect(1, 1, 48, 48);
      doc.addImage(qrDataUrl, 'PNG', 7.5, 8, 35, 35);
      doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text(labelText, 25, 6, { align: "center" });
      doc.setFontSize(6); doc.text(codeValue, 25, 47, { align: "center" });
      doc.save(`Etiqueta_${rack}${pos}${levelLetter}.pdf`);
    } catch (e) { showFeedback('error', 'Erro ao imprimir'); }
  };

  if (!currentUser) {
    return (
      <div className="fixed inset-0 bg-slate-900 flex items-center justify-center p-6 z-[9999]">
        <div className="w-full max-w-sm bg-white/5 backdrop-blur-xl border border-white/10 rounded-[3rem] p-10 flex flex-col items-center shadow-2xl">
           <Warehouse className="text-indigo-600 w-16 h-16 mb-6" />
           <h1 className="text-3xl font-black italic text-white uppercase tracking-tighter mb-8">ALMOX <span className="text-indigo-500">PRO</span></h1>
           
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

  // Lógica para renderizar o grid lidando com spans de 2 colunas para vagas duplas
  const renderPalletGrid = () => {
    const gridElements = [];
    for (let p = 1; p <= POSITIONS_PER_LEVEL; p++) {
      const pos = p;
      const occ = inventory.find(item => item.rack === activeRack && item.level === (activeLevelIndex + 1) && item.position === pos);
      
      // Se houver um item ocupando pos-1 que seja vaga dupla, pulamos esta posição
      const isTail = inventory.find(item => item.rack === activeRack && item.level === (activeLevelIndex + 1) && item.position === (pos - 1) && item.slots === 2);
      if (isTail) continue;

      const isDouble = occ?.slots === 2;
      
      gridElements.push(
        <button 
          key={pos} 
          onClick={() => setShowQR({ rack: activeRack, level: activeLevelIndex + 1, pos: pos })} 
          className={`aspect-square rounded-2xl font-black text-[11px] flex flex-col items-center justify-center transition-all border shadow-sm relative
            ${occ ? 'bg-rose-500 text-white border-rose-600' : 'bg-emerald-500 text-white border-emerald-600 hover:scale-105'}
            ${isDouble ? 'col-span-2 !aspect-auto h-full' : ''}`}
        >
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

  return (
    <div className="h-screen w-screen bg-slate-50 flex flex-col lg:flex-row overflow-hidden relative">
      {feedback && (
        <div className={`fixed top-4 right-4 z-[9999] p-4 rounded-2xl shadow-2xl flex items-center gap-3 border-2 animate-in slide-in-from-top ${feedback.type === 'success' ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-rose-600 border-rose-400 text-white'}`}>
           {feedback.type === 'success' ? <CheckCircle2 size={20}/> : <AlertCircle size={20}/>}
           <span className="font-black text-[10px] uppercase tracking-tighter">{feedback.msg}</span>
        </div>
      )}

      {/* MOBILE HEADER */}
      <header className="lg:hidden flex justify-between items-center p-4 bg-white border-b sticky top-0 z-[100] h-16 shadow-sm shrink-0">
        <div className="flex items-center gap-2">
          <Warehouse className="text-indigo-600 w-6 h-6" />
          <h1 className="text-lg font-black italic uppercase">ALMOX <span className="text-indigo-600">PRO</span></h1>
        </div>
        <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 bg-slate-50 rounded-xl"><Menu size={24} /></button>
      </header>

      {/* SIDEBAR */}
      <aside className={`fixed lg:static inset-0 z-[5000] lg:z-auto transition-all ${isMobileMenuOpen ? 'visible' : 'invisible lg:visible'} flex-shrink-0`}>
        <div className="absolute inset-0 bg-slate-900/60 lg:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>
        <div className={`absolute lg:static top-0 left-0 bottom-0 w-72 bg-white border-r p-6 transition-transform lg:translate-x-0 shadow-xl h-full flex flex-col z-[5001] ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex items-center gap-3 mb-12">
            <Warehouse className="text-indigo-600 w-8 h-8" />
            <h1 className="text-xl font-black italic uppercase tracking-tighter">ALMOX <span className="text-indigo-600">PRO</span></h1>
          </div>
          <nav className="flex flex-col gap-2 flex-1 overflow-y-auto no-scrollbar">
            <button onClick={() => { setIsPrintMenuOpen(true); setIsMobileMenuOpen(false); }} className="flex items-center gap-4 p-4 text-slate-600 font-black uppercase text-[11px] hover:bg-indigo-50 hover:text-indigo-600 rounded-2xl transition-all text-left w-full"><Printer size={20}/> ETIQUETAS</button>
            <button onClick={() => { setIsMasterMenuOpen(true); setIsMobileMenuOpen(false); }} className="flex items-center gap-4 p-4 text-slate-600 font-black uppercase text-[11px] hover:bg-indigo-50 hover:text-indigo-600 rounded-2xl transition-all text-left w-full"><ClipboardList size={20}/> BASE ITENS</button>
            <button onClick={() => { setIsInventoryReportOpen(true); setIsMobileMenuOpen(false); }} className="flex items-center gap-4 p-4 text-slate-600 font-black uppercase text-[11px] hover:bg-indigo-50 hover:text-indigo-600 rounded-2xl transition-all text-left w-full"><ListChecks size={20}/> SALDO GERAL</button>
            <button onClick={() => { setIsLogsOpen(true); setIsMobileMenuOpen(false); }} className="flex items-center gap-4 p-4 text-slate-600 font-black uppercase text-[11px] hover:bg-indigo-50 hover:text-indigo-600 rounded-2xl transition-all text-left w-full"><History size={20}/> HISTÓRICO</button>
          </nav>
          <div className="pt-6 border-t border-slate-100">
            <div className="mb-4 px-4 py-3 bg-slate-50 rounded-xl border">
              <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">Operador</span>
              <span className="text-xs font-black text-indigo-600 uppercase">{currentUser.username}</span>
            </div>
            <button onClick={handleLogout} className="flex items-center gap-4 p-4 text-rose-500 font-black uppercase text-[11px] hover:bg-rose-50 rounded-2xl transition-all w-full"><LogOut size={20}/> SAIR</button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-8 no-scrollbar">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex-shrink-0">
              <button onClick={() => setIsScannerOpen(true)} className="bg-indigo-600 text-white px-10 py-5 rounded-full font-black uppercase shadow-xl flex items-center gap-4 active:scale-95 transition-all">
                <ScanLine size={28}/> SCANNER RÁPIDO
              </button>
            </div>
            
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 flex-1 max-w-4xl">
               <div className="bg-white p-6 rounded-[2rem] border shadow-sm flex flex-col justify-center"><span className="text-2xl font-black block leading-none">{stats.total}</span><span className="text-[9px] font-bold text-slate-400 uppercase mt-1">Capacidade</span></div>
               <div className="bg-white p-6 rounded-[2rem] border shadow-sm flex flex-col justify-center"><span className="text-2xl font-black block text-rose-600 leading-none">{stats.occupied}</span><span className="text-[9px] font-bold text-slate-400 uppercase mt-1">Ocupado</span></div>
               <div className="bg-white p-6 rounded-[2rem] border shadow-sm flex flex-col justify-center"><span className="text-2xl font-black block text-emerald-600 leading-none">{stats.free}</span><span className="text-[9px] font-bold text-slate-400 uppercase mt-1">Livre</span></div>
               <div className="bg-indigo-600 p-6 rounded-[2rem] text-white shadow-xl flex flex-col justify-center"><span className="text-2xl font-black block leading-none">{stats.rate}%</span><span className="text-[9px] font-bold text-white/60 uppercase mt-1">Uso</span></div>
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

      {/* MODAL ENTRADA */}
      {selectedPosition && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[9000] flex items-center justify-center p-6" onClick={() => setSelectedPosition(null)}>
           <div className="bg-white rounded-[3rem] w-full max-w-md p-10 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
             <h3 className="font-black uppercase mb-8 text-indigo-600 italic text-xl tracking-tighter">Entrada de Item</h3>
             <form onSubmit={(e) => {
               e.preventDefault();
               saveItemToDB(FIXED_DB_STRING, {...selectedPosition, lastUpdated: new Date().toISOString()})
                 .then(() => {
                    saveLogToDB(FIXED_DB_STRING, {
                      username: currentUser.username,
                      action: 'ENTRADA',
                      details: `ENTRADA: ${selectedPosition.productId} (${selectedPosition.quantity} UN) - VAGA ${selectedPosition.slots === 2 ? 'DUPLA' : 'SIMPLES'}`,
                      location: `${selectedPosition.rack}${selectedPosition.position}${LEVEL_LABELS[selectedPosition.level-1]}`,
                      timestamp: new Date().toISOString()
                    });
                    loadInitialData(); setSelectedPosition(null); showFeedback('success', 'Entrada concluída!');
                 });
             }} className="space-y-4">
                <input list="sku-list" type="text" placeholder="ID SKU" className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl font-black uppercase outline-none transition-all" value={selectedPosition.productId} onChange={e => {
                  const val = e.target.value.toUpperCase(); const m = masterProducts.find(x => x.productId === val);
                  setSelectedPosition({...selectedPosition, productId: val, productName: m?.productName || '', quantity: m?.standardQuantity || 0});
                }} required />
                <datalist id="sku-list">{masterProducts.map(m => <option key={m.productId} value={m.productId}>{m.productName}</option>)}</datalist>
                
                <input type="text" placeholder="DESCRIÇÃO DO PRODUTO" className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase outline-none" value={selectedPosition.productName} onChange={e => setSelectedPosition({...selectedPosition, productName: e.target.value.toUpperCase()})} required />
                <input type="number" placeholder="QUANTIDADE" className="w-full p-5 bg-slate-50 rounded-2xl font-black text-center text-4xl outline-none" value={selectedPosition.quantity || ''} onChange={e => setSelectedPosition({...selectedPosition, quantity: parseInt(e.target.value) || 0})} required />
                
                <div className="grid grid-cols-2 gap-3 pt-2">
                   <button type="button" onClick={() => setSelectedPosition({...selectedPosition, slots: 1})} className={`p-4 rounded-2xl font-black uppercase text-[10px] border-2 transition-all ${selectedPosition.slots === 1 ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-slate-50 text-slate-400 border-transparent'}`}>Vaga Simples</button>
                   <button type="button" onClick={() => setSelectedPosition({...selectedPosition, slots: 2})} className={`p-4 rounded-2xl font-black uppercase text-[10px] border-2 transition-all ${selectedPosition.slots === 2 ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-slate-50 text-slate-400 border-transparent'}`}>Vaga Dupla</button>
                </div>

                <div className="bg-indigo-50 p-6 rounded-3xl text-center border border-indigo-100 shadow-inner">
                  <span className="text-3xl font-black italic text-indigo-600 uppercase">
                    {selectedPosition.rack} {selectedPosition.position} {selectedPosition.slots === 2 ? `e ${selectedPosition.position + 1}` : ''} {LEVEL_LABELS[selectedPosition.level-1]}
                  </span>
                </div>
                
                <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-6 rounded-[2rem] font-black uppercase shadow-2xl active:scale-95 transition-all text-lg">Confirmar Entrada</button>
             </form>
           </div>
        </div>
      )}

      {isMasterMenuOpen && (
        <div className="fixed inset-0 bg-white lg:bg-slate-900/90 lg:backdrop-blur-md z-[8000] flex flex-col" onClick={() => setIsMasterMenuOpen(false)}>
          <div className="bg-white lg:rounded-[3rem] w-full lg:max-w-2xl lg:h-[85vh] flex flex-col overflow-hidden lg:m-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <header className="p-8 border-b flex justify-between items-center shrink-0">
              <h3 className="font-black text-2xl uppercase italic text-slate-800">Base de Itens</h3>
              <button onClick={() => setIsMasterMenuOpen(false)} className="p-3 bg-slate-100 rounded-2xl"><X /></button>
            </header>
            <div className="p-8 space-y-6 bg-slate-50 shrink-0 border-b">
              <form onSubmit={handleSaveMaster} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input type="text" placeholder="ID SKU" className="w-full p-5 border-2 rounded-2xl font-black uppercase text-sm outline-none focus:border-indigo-600" value={newMaster.productId} onChange={e => setNewMaster({...newMaster, productId: e.target.value.toUpperCase()})} />
                <input type="text" placeholder="NOME PRODUTO" className="w-full p-5 border-2 rounded-2xl font-black uppercase text-sm outline-none focus:border-indigo-600" value={newMaster.productName} onChange={e => setNewMaster({...newMaster, productName: e.target.value.toUpperCase()})} />
                <input type="number" placeholder="QTD PADRÃO" className="w-full p-5 border-2 rounded-2xl font-black text-sm outline-none focus:border-indigo-600" value={newMaster.standardQuantity || ''} onChange={e => setNewMaster({...newMaster, standardQuantity: parseInt(e.target.value) || 0})} />
                <button type="submit" className="bg-indigo-600 text-white p-5 rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 transition-all">ADICIONAR ITEM</button>
              </form>
              <div className="relative">
                <SearchIcon className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20}/>
                <input type="text" placeholder="FILTRAR NA BASE..." className="w-full p-5 pl-14 bg-white border-2 rounded-2xl font-black text-xs uppercase shadow-inner" value={masterSearchQuery} onChange={e => setMasterSearchQuery(e.target.value)} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-4 no-scrollbar">
              {filteredMasterProducts.map(m => (
                <div key={m.productId} className="p-6 border-2 border-slate-50 rounded-3xl flex justify-between items-center bg-white shadow-sm hover:border-indigo-100 transition-all">
                  <div>
                    <span className="text-xs font-black text-indigo-600 block mb-1">{m.productId}</span>
                    <h4 className="font-black text-slate-800 uppercase text-sm truncate max-w-[200px]">{m.productName}</h4>
                    <span className="text-[10px] font-bold text-slate-400 mt-1 block">PADRÃO: {m.standardQuantity} UN</span>
                  </div>
                  <button onClick={() => handleDeleteMaster(m.productId)} className="p-3 text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={22}/></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isScannerOpen && <ScannerModal onScan={(text) => {
        const regex = /PP-([A-D])-P-(\d+)-L-(\d+)/;
        const match = text.match(regex);
        if (match) { handlePositionClick(match[1], parseInt(match[3]), parseInt(match[2])); setIsScannerOpen(false); }
      }} onClose={() => setIsScannerOpen(false)} />}
      
      {showQR && <QRCodeModal position={showQR} onClose={() => setShowQR(null)} isOccupied={inventory.some(p => p.rack === showQR.rack && p.level === showQR.level && p.position === showQR.pos)} onManage={() => { handlePositionClick(showQR.rack, showQR.level, showQR.pos); setShowQR(null); }} />}

      {palletDetails && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[9000] flex items-center justify-center p-6" onClick={() => setPalletDetails(null)}>
           <div className="bg-white rounded-[3rem] w-full max-w-md p-10 shadow-2xl animate-in zoom-in-95 text-center" onClick={e => e.stopPropagation()}>
              <header className="flex justify-between items-center mb-8 shrink-0">
                <h3 className="font-black uppercase text-indigo-600 italic">Detalhes</h3>
                <button onClick={() => setPalletDetails(null)} className="p-3 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-all"><X /></button>
              </header>
              <div className="bg-indigo-50 p-10 rounded-[2.5rem] mb-8 border border-indigo-100 shadow-inner">
                <span className="text-4xl font-black italic text-indigo-600 block mb-4 uppercase">
                  {palletDetails.rack} {palletDetails.position} {palletDetails.slots === 2 ? `e ${palletDetails.position + 1}` : ''} {LEVEL_LABELS[palletDetails.level-1]}
                </span>
                <span className="text-[10px] font-black text-indigo-400 block mb-4 uppercase">Vaga {palletDetails.slots === 2 ? 'Dupla' : 'Simples'}</span>
                <h4 className="font-black text-slate-800 uppercase text-lg mb-4 leading-tight">{palletDetails.productName}</h4>
                <div className="flex justify-center gap-3">
                  <span className="px-5 py-2 bg-white rounded-xl text-xs font-black shadow-sm">SKU: {palletDetails.productId}</span>
                  <span className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-md">{palletDetails.quantity} UN</span>
                </div>
              </div>
              <button onClick={() => {
                if(confirm("Confirmar BAIXA TOTAL?")) {
                  deleteItemFromDB(FIXED_DB_STRING, palletDetails).then(() => {
                    saveLogToDB(FIXED_DB_STRING, {
                      username: currentUser.username,
                      action: 'SAIDA',
                      details: `BAIXA TOTAL: ${palletDetails.productId} (${palletDetails.quantity} UN)`,
                      location: `${palletDetails.rack}${palletDetails.position}${LEVEL_LABELS[palletDetails.level-1]}`,
                      timestamp: new Date().toISOString()
                    });
                    loadInitialData(); setPalletDetails(null); showFeedback('success', 'Baixa realizada!');
                  });
                }
              }} className="w-full bg-rose-600 hover:bg-rose-700 text-white p-6 rounded-[2rem] font-black uppercase shadow-2xl active:scale-95 transition-all text-lg">Realizar Baixa Total</button>
           </div>
        </div>
      )}

      {isInventoryReportOpen && (
        <div className="fixed inset-0 bg-white lg:bg-slate-900/95 lg:backdrop-blur-xl z-[8000] flex flex-col" onClick={() => setIsInventoryReportOpen(false)}>
          <div className="bg-white lg:rounded-[3rem] w-full lg:max-w-4xl lg:h-[85vh] flex flex-col overflow-hidden lg:m-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <header className="p-8 border-b flex justify-between items-center sticky top-0 bg-white z-10 shrink-0">
              <h3 className="font-black text-2xl italic uppercase text-slate-800">Saldo Geral</h3>
              <button onClick={() => setIsInventoryReportOpen(false)} className="p-3 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-all"><X /></button>
            </header>
            <div className="p-8 bg-slate-50 shrink-0 border-b">
              <div className="bg-white p-5 rounded-3xl border-2 flex items-center gap-4 shadow-sm">
                <SearchIcon className="text-slate-300" size={24} />
                <input type="text" placeholder="BUSCAR SALDO..." className="bg-transparent w-full text-lg font-black uppercase outline-none" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-4 no-scrollbar">
                {aggregatedInventory.map(item => (
                  <div key={item.id} className="p-8 bg-white border-2 border-slate-50 rounded-[2.5rem] shadow-sm hover:border-indigo-100 transition-all">
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex-1">
                        <span className="font-black text-indigo-600 text-xs uppercase block mb-1">{item.id}</span>
                        <h4 className="font-black text-slate-800 text-xl uppercase leading-tight">{item.name}</h4>
                      </div>
                      <div className="text-right">
                        <span className="text-4xl font-black text-slate-800 italic">{item.total}</span>
                        <span className="text-[10px] font-bold text-slate-400 ml-2 uppercase">Total UN</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.locs.map(loc => <span key={loc} className="px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-xl text-xs font-black text-indigo-600 shadow-sm uppercase italic">{loc}</span>)}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {isPrintMenuOpen && (
        <div className="fixed inset-0 bg-white lg:bg-slate-900/95 lg:backdrop-blur-lg z-[8000] flex flex-col" onClick={() => setIsPrintMenuOpen(false)}>
          <div className="bg-white lg:rounded-[3rem] w-full lg:max-w-7xl lg:h-[90vh] flex flex-col overflow-hidden lg:m-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <header className="p-8 border-b flex justify-between items-center sticky top-0 bg-white z-10 shrink-0">
              <h3 className="font-black text-2xl italic uppercase text-slate-800">Central de Etiquetas</h3>
              <button onClick={() => setIsPrintMenuOpen(false)} className="p-3 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-all"><X /></button>
            </header>
            <div className="p-8 bg-slate-50 flex flex-wrap gap-6 items-center border-b shrink-0">
               <div className="flex gap-2 bg-white p-2 rounded-2xl shadow-inner border border-slate-100 overflow-x-auto no-scrollbar">
                  {RACKS.map(r => <button key={r} onClick={() => setActiveRack(r)} className={`px-8 py-3 rounded-xl font-black text-xs transition-all ${activeRack === r ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>{r}</button>)}
               </div>
               <div className="flex gap-1.5 bg-white p-2 rounded-2xl shadow-inner border border-slate-100 overflow-x-auto no-scrollbar">
                  {LEVEL_LABELS.map((l, i) => <button key={l} onClick={() => setActiveLevelIndex(i)} className={`w-12 h-12 rounded-xl font-black text-sm flex items-center justify-center transition-all ${activeLevelIndex === i ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-50 text-slate-300'}`}>{l}</button>)}
               </div>
               <button onClick={() => generateLabelBatchPDF(filteredPrintPositions)} disabled={isPrintingBatch || filteredPrintPositions.length === 0} className="sm:ml-auto bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-5 rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 transition-all flex items-center gap-3 disabled:opacity-50">
                 {isPrintingBatch ? <Loader2 className="animate-spin" size={20}/> : <QrCode size={20}/>} GERAR LOTE ({filteredPrintPositions.length})
               </button>
            </div>
            <div className="flex-1 overflow-y-auto p-10 bg-slate-100/30 no-scrollbar">
               <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-4">
                 {filteredPrintPositions.map(f => (
                   <div key={f.label} className="bg-white p-6 border-2 border-white rounded-[2rem] flex flex-col items-center gap-6 group shadow-sm hover:shadow-xl hover:border-indigo-100 transition-all">
                     <span className="font-black italic text-2xl text-slate-800">{f.label}</span>
                     <button onClick={() => printSingleLabel(f.rack, f.level, f.position)} className="w-full bg-slate-100 text-[10px] font-black uppercase py-3 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm">IMPRIMIR</button>
                   </div>
                 ))}
               </div>
            </div>
          </div>
        </div>
      )}

      {isLogsOpen && (
        <div className="fixed inset-0 bg-white lg:bg-slate-900/95 lg:backdrop-blur-lg z-[8000] flex flex-col" onClick={() => setIsLogsOpen(false)}>
          <div className="bg-white lg:rounded-[3rem] w-full lg:max-w-3xl lg:h-[80vh] flex flex-col overflow-hidden lg:m-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <header className="p-8 border-b flex justify-between items-center sticky top-0 bg-white z-10 shrink-0">
              <h3 className="font-black text-2xl text-slate-800 italic uppercase">Log de Atividades</h3>
              <button onClick={() => setIsLogsOpen(false)} className="p-3 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-all"><X /></button>
            </header>
            <div className="flex-1 overflow-y-auto p-8 space-y-4 no-scrollbar">
              {logs.map((log, idx) => (
                <div key={idx} className="p-6 bg-slate-50 border rounded-3xl flex items-center gap-6">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${log.action === 'ENTRADA' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                    {log.action === 'ENTRADA' ? <ArrowRightCircle size={28}/> : <ArrowDownRight size={28}/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between mb-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{log.username}</span>
                      <span className="text-[9px] font-bold text-slate-300">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="text-xs font-black text-slate-700 uppercase truncate">{log.details}</p>
                    {log.location && <span className="text-[10px] font-black text-indigo-500 uppercase mt-1 block">LOCAL: {log.location}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
