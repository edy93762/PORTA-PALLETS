
// @ts-nocheck
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Package, Warehouse, X, ScanLine, Printer, Loader2, 
  ClipboardList, Trash2, Menu, AlertCircle, CheckCircle2, Search as SearchIcon, 
  QrCode, ArrowDownRight, ListChecks, History, LogOut, ArrowRightCircle, UserPlus, ShieldCheck, MapPin, Info, 
  FileDown, PlusCircle, Filter
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
  
  const [activeRack, setActiveRack] = useState<RackId>('A');
  const [activeLevelIndex, setActiveLevelIndex] = useState<number>(0); 
  const [selectedPosition, setSelectedPosition] = useState<PalletPosition | null>(null);
  const [palletDetails, setPalletDetails] = useState<PalletPosition | null>(null);

  const [showQR, setShowQR] = useState<{ rack: string; level: number; pos: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
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

  const renderPalletGrid = () => {
    const gridElements = [];
    for (let p = 1; p <= POSITIONS_PER_LEVEL; p++) {
      const pos = p;
      const occ = inventory.find(item => item.rack === activeRack && item.level === (activeLevelIndex + 1) && item.position === pos);
      const isTail = inventory.find(item => item.rack === activeRack && item.level === (activeLevelIndex + 1) && item.position === (pos - 1) && item.slots === 2);
      
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
    const occ = inventory.find(p => p.rack === rack && p.level === level && p.position === pos);
    const isTail = inventory.find(p => p.rack === rack && p.level === level && p.position === (pos - 1) && p.slots === 2);
    const target = occ || isTail;
    if (target) { 
      setPalletDetails(target); 
    } 
    else { 
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
    }
  };

  const generateBatchPDF = async () => {
    setIsPrintingBatch(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [50, 50] });
      const currentLevel = activeLevelIndex + 1;
      
      let pagesAdded = 0;
      for (let p = 1; p <= POSITIONS_PER_LEVEL; p++) {
        const isOccupied = inventory.some(item => item.rack === activeRack && item.level === currentLevel && item.position === p);
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
            <button onClick={() => { setIsLogsOpen(true); setIsMobileMenuOpen(false); }} className="flex items-center gap-4 p-4 text-slate-600 font-black uppercase text-[11px] hover:bg-indigo-50 hover:text-indigo-600 rounded-2xl transition-all text-left w-full"><History size={20}/> HISTÓRICO</button>
          </nav>
          <div className="pt-6 border-t border-slate-100">
            <div className="mb-4 px-4 py-3 bg-slate-50 rounded-xl border">
              <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">Operador</span>
              <span className="text-xs font-black text-indigo-600 uppercase">{currentUser?.username || 'Sistema'}</span>
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
                   {isPrintingBatch ? <Loader2 className="animate-spin" /> : <><QrCode size={18}/> GERAR LOTE ({printFilter === 'all' ? 66 : Array.from({length: 66}).filter((_,i)=>!inventory.some(it=>it.rack===activeRack && it.level===(activeLevelIndex+1) && it.position===(i+1))).length})</>}
                 </button>
              </div>

              <div className="flex-1 overflow-y-auto p-10 bg-slate-50/50 no-scrollbar">
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-10 gap-4">
                  {Array.from({ length: 66 }).map((_, i) => {
                    const pos = i + 1;
                    const level = activeLevelIndex + 1;
                    const label = `${activeRack}${pos}${LEVEL_LABELS[activeLevelIndex]}`;
                    const isOccupied = inventory.some(item => item.rack === activeRack && item.level === level && item.position === pos);
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

      {/* OUTROS MODAIS */}
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
              <div className="p-8 bg-slate-50 border-b flex flex-col md:flex-row gap-4 shrink-0">
                <div className="relative flex-1">
                  <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20}/>
                  <input type="text" placeholder="BUSCAR POR SKU OU NOME..." className="w-full pl-12 p-4 bg-white border-2 border-slate-100 rounded-2xl font-black uppercase outline-none focus:border-indigo-600" value={masterSearchQuery} onChange={e => setMasterSearchQuery(e.target.value)} />
                </div>
                <button onClick={() => {
                  const id = prompt("Digite o ID do Produto (SKU):")?.toUpperCase();
                  const name = prompt("Digite o Nome/Descrição:")?.toUpperCase();
                  const qty = parseInt(prompt("Digite a Quantidade Padrão:") || "0");
                  if(id && name) {
                    saveMasterProductToDB(FIXED_DB_STRING, {productId: id, productName: name, standardQuantity: qty})
                      .then(() => { loadInitialData(); showFeedback('success', 'SKU Cadastrado!'); });
                  }
                }} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black uppercase flex items-center gap-3 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all">
                  <PlusCircle size={20}/> Novo Item
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 space-y-3 no-scrollbar">
                 {filteredMasterProducts.map(item => (
                   <div key={item.productId} className="bg-white p-6 rounded-[2rem] border-2 border-slate-50 shadow-sm flex items-center justify-between hover:border-indigo-100 transition-all group">
                     <div>
                       <span className="text-[10px] font-black text-indigo-500 uppercase block mb-1">SKU: {item.productId}</span>
                       <h4 className="font-black text-slate-800 text-lg uppercase leading-tight">{item.productName}</h4>
                       <span className="text-[9px] font-bold text-slate-400 uppercase mt-2 block">Padrão: {item.standardQuantity} UN</span>
                     </div>
                     <button onClick={() => {
                       if(confirm(`Excluir SKU ${item.productId}?`)) {
                         deleteMasterProductFromDB(FIXED_DB_STRING, item.productId).then(() => loadInitialData());
                       }
                     }} className="p-4 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all opacity-0 group-hover:opacity-100"><Trash2 size={24}/></button>
                   </div>
                 ))}
              </div>
           </div>
        </div>
      )}

      {isLogsOpen && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[8000] flex items-center justify-center p-0 lg:p-10" onClick={() => setIsLogsOpen(false)}>
           <div className="bg-white rounded-none lg:rounded-[3rem] w-full max-w-4xl h-full lg:h-[85vh] flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
              <header className="p-8 border-b flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg"><History size={24}/></div>
                  <h3 className="font-black text-2xl italic uppercase text-slate-800">Histórico de Movimentações</h3>
                </div>
                <button onClick={() => setIsLogsOpen(false)} className="p-4 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-all"><X /></button>
              </header>
              <div className="flex-1 overflow-y-auto p-8 space-y-4 no-scrollbar">
                 {logs.map(log => (
                   <div key={log.id} className="p-6 bg-slate-50 rounded-[2rem] border-2 border-transparent flex flex-col md:flex-row md:items-center justify-between gap-4">
                     <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white shadow-md ${log.action === 'ENTRADA' ? 'bg-emerald-500' : log.action === 'SAIDA' ? 'bg-rose-500' : 'bg-slate-400'}`}>
                           {log.action.charAt(0)}
                        </div>
                        <div>
                          <h4 className="font-black text-slate-800 uppercase text-xs leading-tight mb-1">{log.details}</h4>
                          <div className="flex gap-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                            <span className="flex items-center gap-1"><UserPlus size={10}/> {log.username}</span>
                            <span className="flex items-center gap-1"><MapPin size={10}/> {log.location || 'N/A'}</span>
                          </div>
                        </div>
                     </div>
                     <div className="text-left md:text-right">
                       <span className="text-[10px] font-black text-indigo-600 uppercase block">{new Date(log.timestamp).toLocaleDateString()}</span>
                       <span className="text-[10px] font-bold text-slate-300 uppercase block">{new Date(log.timestamp).toLocaleTimeString()}</span>
                     </div>
                   </div>
                 ))}
              </div>
           </div>
        </div>
      )}

      {isInventoryReportOpen && (
        <div className="fixed inset-0 bg-white lg:bg-slate-900/95 lg:backdrop-blur-xl z-[8000] flex flex-col" onClick={() => setIsInventoryReportOpen(false)}>
          <div className="bg-white lg:rounded-[3rem] w-full lg:max-w-4xl lg:h-[85vh] flex flex-col overflow-hidden lg:m-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <header className="p-8 border-b flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg"><ListChecks size={24}/></div>
                <h3 className="font-black text-2xl italic uppercase text-slate-800">Saldo Geral de Itens</h3>
              </div>
              <button onClick={() => setIsInventoryReportOpen(false)} className="p-3 bg-slate-100 rounded-2xl"><X /></button>
            </header>
            <div className="p-6 bg-slate-50 border-b flex items-center gap-4 shrink-0">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20}/>
                <input type="text" placeholder="BUSCAR SALDO..." className="w-full pl-12 p-4 bg-white border-2 border-slate-100 rounded-2xl font-black uppercase outline-none focus:border-indigo-600" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-4 no-scrollbar">
                {aggregatedInventory.length > 0 ? aggregatedInventory.map(item => (
                  <div key={item.id} className="p-8 bg-white border-2 border-slate-50 rounded-[2.5rem] shadow-sm flex items-center justify-between hover:border-indigo-100 transition-all">
                    <div className="max-w-[70%]">
                      <span className="font-black text-indigo-600 text-xs uppercase block mb-1">SKU: {item.id}</span>
                      <h4 className="font-black text-slate-800 text-xl uppercase leading-tight mb-4">{item.name}</h4>
                      <div className="flex flex-wrap gap-2">
                        {item.locs.map((loc, i) => (
                          <span key={i} className="px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-xl text-[9px] font-black text-indigo-600 shadow-sm uppercase italic">
                            {loc}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-4xl font-black text-slate-800 italic">{item.total}</span>
                      <span className="text-[10px] font-bold text-slate-400 ml-2 uppercase">Total UN</span>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-20 opacity-20 flex flex-col items-center">
                    <Package size={64} className="mb-4" />
                    <span className="font-black uppercase tracking-widest italic">Nenhum item em estoque</span>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL ENTRADA */}
      {selectedPosition && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[9000] flex items-center justify-center p-6" onClick={() => setSelectedPosition(null)}>
           <div className="bg-white rounded-[3rem] w-full max-w-md p-10 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
             <h3 className="font-black uppercase mb-8 text-indigo-600 italic text-xl tracking-tighter">Entrada de Item</h3>
             <form onSubmit={(e) => {
               e.preventDefault();
               if (isProcessingAction) return;
               setIsProcessingAction(true);
               const opName = currentUser?.username || 'Sistema';
               const idVaga = `${selectedPosition.rack}${selectedPosition.position}${LEVEL_LABELS[selectedPosition.level-1]}`;
               
               saveItemToDB(FIXED_DB_STRING, {...selectedPosition, id: idVaga, lastUpdated: new Date().toISOString()})
                 .then(() => {
                    saveLogToDB(FIXED_DB_STRING, {
                      username: opName,
                      action: 'ENTRADA',
                      details: `ENTRADA: ${selectedPosition.productId} (${selectedPosition.quantity} UN)`,
                      location: idVaga,
                      timestamp: new Date().toISOString()
                    });
                    loadInitialData().then(() => {
                      setSelectedPosition(null); 
                      showFeedback('success', 'Entrada concluída!');
                      setIsProcessingAction(false);
                    });
                 }).catch(() => {
                   showFeedback('error', 'Falha ao salvar entrada.');
                   setIsProcessingAction(false);
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
                <button type="submit" disabled={isProcessingAction} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-6 rounded-[2rem] font-black uppercase shadow-2xl active:scale-95 transition-all text-lg flex items-center justify-center gap-2">
                  {isProcessingAction ? <Loader2 className="animate-spin" /> : 'Confirmar Entrada'}
                </button>
             </form>
           </div>
        </div>
      )}
      
      {/* SCANNER E MODAIS DE QR */}
      {isScannerOpen && <ScannerModal onScan={(text) => {
        if (isProcessingAction) return;
        const regex = /PP-([A-D])-P-(\d+)-L-(\d+)/;
        const match = text.match(regex);
        if (match) { 
          setIsScannerOpen(false); 
          handlePositionClick(match[1], parseInt(match[3]), parseInt(match[2])); 
        }
      }} onClose={() => setIsScannerOpen(false)} />}
      
      {showQR && <QRCodeModal position={showQR} onClose={() => setShowQR(null)} isOccupied={inventory.some(p => p.rack === showQR.rack && p.level === showQR.level && p.position === showQR.pos)} onManage={() => { handlePositionClick(showQR.rack, showQR.level, showQR.pos); setShowQR(null); }} />}

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
                  {palletDetails.rack} {palletDetails.position} {palletDetails.slots === 2 ? `e ${palletDetails.position + 1}` : ''} {LEVEL_LABELS[palletDetails.level-1]}
                </span>
                <span className="text-[10px] font-black text-indigo-400 block mb-4 uppercase">Vaga {palletDetails.slots === 2 ? 'Dupla' : 'Simples'}</span>
                <h4 className="font-black text-slate-800 uppercase text-lg mb-4 leading-tight">{palletDetails.productName}</h4>
                <div className="flex justify-center gap-3">
                  <span className="px-5 py-2 bg-white rounded-xl text-xs font-black shadow-sm">SKU: {palletDetails.productId}</span>
                  <span className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-md">{palletDetails.quantity} UN</span>
                </div>
              </div>
              <button 
                disabled={isProcessingAction}
                onClick={() => {
                if(confirm("Confirmar BAIXA TOTAL deste item?")) {
                  setIsProcessingAction(true);
                  const opName = currentUser?.username || 'Sistema';
                  deleteItemFromDB(FIXED_DB_STRING, palletDetails).then(() => {
                    saveLogToDB(FIXED_DB_STRING, {
                      username: opName,
                      action: 'SAIDA',
                      details: `BAIXA TOTAL: ${palletDetails.productId} (${palletDetails.quantity} UN)`,
                      location: `${palletDetails.rack}${palletDetails.position}${LEVEL_LABELS[palletDetails.level-1]}`,
                      timestamp: new Date().toISOString()
                    });
                    loadInitialData().then(() => {
                      setPalletDetails(null); 
                      showFeedback('success', 'Baixa realizada com sucesso!');
                      setIsProcessingAction(false);
                    });
                  }).catch(() => {
                    showFeedback('error', 'Falha ao realizar baixa.');
                    setIsProcessingAction(false);
                  });
                }
              }} className="w-full bg-rose-600 hover:bg-rose-700 text-white p-6 rounded-[2rem] font-black uppercase shadow-2xl active:scale-95 transition-all text-lg flex items-center justify-center gap-2">
                {isProcessingAction ? <Loader2 className="animate-spin" /> : 'Realizar Baixa Total'}
              </button>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
