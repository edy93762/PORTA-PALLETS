
// @ts-nocheck
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, Warehouse, X, ScanLine, Printer, ArrowRight, Loader2, LogOut, 
  ClipboardList, Trash2, Menu, AlertCircle, CheckCircle2, User, 
  Save, Search as SearchIcon, Navigation, Users, History, Clock, TrendingUp, Plus,
  SearchCode, Info, ChevronRight, FileDown, Calendar, Focus, Eraser
} from 'lucide-react';
import { PalletPosition, RackId, MasterProduct, AppUser, ActivityLog } from './types';
import { QRCodeModal } from './components/QRCodeModal';
import { ScannerModal } from './components/ScannerModal';
import { Warehouse3D } from './components/Warehouse3D';
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

// Configuração para 4 porta-paletes
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
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [highlightProductId, setHighlightProductId] = useState<string | null>(null);

  const [inventory, setInventory] = useState<PalletPosition[]>([]);
  const [masterProducts, setMasterProducts] = useState<MasterProduct[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [usersList, setUsersList] = useState<AppUser[]>([]);
  const [activeRack, setActiveRack] = useState<RackId>('A');
  const [activeLevelIndex, setActiveLevelIndex] = useState<number>(0); 

  const [selectedPosition, setSelectedPosition] = useState<PalletPosition | null>(null);
  const [scannedPosition, setScannedPosition] = useState<PalletPosition | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isManualExitModalOpen, setIsManualExitModalOpen] = useState(false);
  const [isMasterMenuOpen, setIsMasterMenuOpen] = useState(false);
  const [isPrintMenuOpen, setIsPrintMenuOpen] = useState(false);
  const [isUsersMenuOpen, setIsUsersMenuOpen] = useState(false);
  const [isReportsOpen, setIsReportsOpen] = useState(false);
  const [isSKUSearchOpen, setIsSKUSearchOpen] = useState(false);
  const [showQR, setShowQR] = useState<{ rack: string; level: number; pos: number } | null>(null);

  const [exitQuantity, setExitQuantity] = useState<number | string>(''); 
  const [skuSearchQuery, setSkuSearchQuery] = useState('');
  const [manualAddress, setManualAddress] = useState({ rack: 'A' as RackId, level: 1, pos: '' });
  const [newMaster, setNewMaster] = useState<MasterProduct>({ productId: '', productName: '', standardQuantity: 0 });
  const [newUser, setNewUser] = useState<AppUser>({ username: '', password: '', role: 'operator' });
  const [printFilter, setPrintFilter] = useState({ rack: 'A' as RackId, level: 1, startPos: 1, endPos: 66 });

  useEffect(() => { 
    if (currentUser) {
      loadInitialData();
    } 
  }, [currentUser]);

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
      console.error(e);
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
        showFeedback('success', `Bem-vindo, ${user.username}!`);
      } else { 
        setLoginError(true); 
        setTimeout(() => setLoginError(false), 3000); 
      }
    } catch (e) { 
      showFeedback('error', 'Erro no banco de dados.'); 
    } finally { 
      setIsLoggingIn(false); 
    }
  };

  const handleLogout = () => { 
    setCurrentUser(null); 
    localStorage.clear(); 
  };

  const logActivity = async (action: ActivityLog['action'], details: string, location?: string) => {
    if (!currentUser) return;
    const log: ActivityLog = {
      username: currentUser.username,
      action,
      details,
      location,
      timestamp: new Date().toISOString()
    };
    try { await saveLogToDB(FIXED_DB_STRING, log); } catch (e) { console.error(e); }
  };

  const handlePositionClick = (rack: RackId, level: number, pos: number) => {
    const existing = inventory.find(p => p.rack === rack && p.level === level && p.position === pos);
    const blocked = inventory.find(p => p.rack === rack && p.level === level && p.position === pos - 1 && p.slots === 2);
    if (blocked) { 
      showFeedback('error', 'Espaço ocupado por palete duplo adjacente.'); 
      return; 
    }

    if (existing) {
      setSelectedPosition(existing);
    } else {
      setSelectedPosition({
        id: `${rack}${LEVEL_LABELS[level - 1]}${pos}`,
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

  const handleSavePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPosition) return;
    if (!selectedPosition.productId?.trim() || !selectedPosition.productName?.trim()) {
      showFeedback('error', 'Preencha SKU e Nome!'); return;
    }
    setIsProcessingAction(true);
    const itemToSave = { 
      ...selectedPosition, 
      productId: selectedPosition.productId.toUpperCase().trim(),
      productName: selectedPosition.productName.toUpperCase().trim(),
      lastUpdated: new Date().toISOString() 
    };
    try {
      await saveItemToDB(FIXED_DB_STRING, itemToSave);
      setInventory(prev => [...prev.filter(p => p.id !== itemToSave.id), itemToSave]);
      await logActivity('ENTRADA', `Armazenado: ${itemToSave.productName}`, `${itemToSave.rack}${LEVEL_LABELS[itemToSave.level-1]}${itemToSave.position}`);
      setShowQR({ rack: itemToSave.rack, level: itemToSave.level, pos: itemToSave.position });
      setSelectedPosition(null);
      showFeedback('success', 'Gravado com sucesso!');
    } catch (err) { 
      showFeedback('error', 'Falha ao salvar no banco.'); 
    } finally { 
      setIsProcessingAction(false); 
    }
  };

  const handleProcessExit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedPosition) return;
    const qtdToRemove = Number(exitQuantity);
    const currentQty = scannedPosition.quantity || 0;
    if (isNaN(qtdToRemove) || qtdToRemove <= 0 || qtdToRemove > currentQty) {
      showFeedback('error', 'Quantidade inválida.'); return;
    }
    setIsProcessingAction(true);
    try {
      if (qtdToRemove < currentQty) {
        const updated = { ...scannedPosition, quantity: currentQty - qtdToRemove, lastUpdated: new Date().toISOString() };
        await saveItemToDB(FIXED_DB_STRING, updated);
        setInventory(prev => prev.map(p => p.id === updated.id ? updated : p));
      } else {
        await deleteItemFromDB(FIXED_DB_STRING, scannedPosition);
        setInventory(prev => prev.filter(p => p.id !== scannedPosition.id));
      }
      await logActivity('SAIDA', `Baixa: ${scannedPosition.productName} (-${qtdToRemove})`, `${scannedPosition.rack}${LEVEL_LABELS[scannedPosition.level-1]}${scannedPosition.position}`);
      showFeedback('success', 'Baixa concluída!');
      setScannedPosition(null);
      setExitQuantity('');
    } catch (err) { 
      showFeedback('error', 'Falha ao processar baixa.'); 
    } finally { 
      setIsProcessingAction(false); 
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.username || !newUser.password) return;
    setIsProcessingAction(true);
    try {
      await saveUserToDB(FIXED_DB_STRING, newUser);
      const updated = await fetchUsersFromDB(FIXED_DB_STRING);
      setUsersList(updated || []);
      setNewUser({ username: '', password: '', role: 'operator' });
      showFeedback('success', 'Usuário cadastrado!');
    } catch (e) { 
      showFeedback('error', 'Erro ao salvar usuário.'); 
    } finally { 
      setIsProcessingAction(false); 
    }
  };

  const handleSaveMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMaster.productId || !newMaster.productName) return;
    setIsProcessingAction(true);
    try {
      await saveMasterProductToDB(FIXED_DB_STRING, newMaster);
      const updated = await fetchMasterProductsFromDB(FIXED_DB_STRING);
      setMasterProducts(updated || []);
      setNewMaster({ productId: '', productName: '', standardQuantity: 0 });
      showFeedback('success', 'Item cadastrado com sucesso!');
    } catch (e) { 
      showFeedback('error', 'Erro ao cadastrar item.'); 
    } finally { 
      setIsProcessingAction(false); 
    }
  };

  const handlePrintBatch = async () => {
    setIsProcessingAction(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [50, 50] });
      let first = true;
      for (let p = printFilter.startPos; p <= printFilter.endPos; p++) {
        if (!first) doc.addPage([50, 50]);
        first = false;
        const codeValue = `PP-${printFilter.rack}-L-${printFilter.level}-P-${p}`;
        const label = `PP ${printFilter.rack} ${LEVEL_LABELS[printFilter.level-1]}${p}`;
        const qrDataUrl = await QRCode.toDataURL(codeValue, { width: 200, margin: 0, errorCorrectionLevel: 'H' });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(label, 25, 6, { align: "center" });
        doc.addImage(qrDataUrl, 'PNG', 7.5, 8, 35, 35);
        doc.setFontSize(6);
        doc.text(codeValue, 25, 47, { align: "center" });
      }
      doc.save(`Etiquetas_PP_${printFilter.rack}_L${printFilter.level}.pdf`);
      showFeedback('success', 'Arquivo PDF gerado!');
      setIsPrintMenuOpen(false);
    } catch (e) { 
      showFeedback('error', 'Erro ao gerar PDF.'); 
    } finally { 
      setIsProcessingAction(false); 
    }
  };

  const stats = useMemo(() => {
    const totalVagas = RACKS.length * LEVEL_LABELS.length * POSITIONS_PER_LEVEL;
    const vagasOcupadas = inventory.reduce((acc, curr) => acc + (curr.slots || 1), 0);
    return { 
      total: totalVagas, 
      occupied: vagasOcupadas, 
      free: Math.max(0, totalVagas - vagasOcupadas), 
      rate: totalVagas > 0 ? Math.round((vagasOcupadas / totalVagas) * 100) : 0 
    };
  }, [inventory]);

  const skuSearchResults = useMemo(() => {
    if (!skuSearchQuery.trim()) return [];
    return inventory.filter(item => 
      item.productId?.toUpperCase().includes(skuSearchQuery.toUpperCase()) ||
      item.productName?.toUpperCase().includes(skuSearchQuery.toUpperCase())
    );
  }, [inventory, skuSearchQuery]);

  const skuTotalQuantity = useMemo(() => {
    return skuSearchResults.reduce((acc, curr) => acc + (curr.quantity || 0), 0);
  }, [skuSearchResults]);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <Warehouse className="text-indigo-600 w-20 h-20 mx-auto mb-6" />
          <h1 className="text-3xl font-black text-white italic uppercase mb-8">ALMOX PRO</h1>
          <form onSubmit={handleLogin} className="bg-white/5 border border-white/10 p-8 rounded-[3rem] space-y-4">
            <input type="text" placeholder="LOGIN" className="w-full bg-white/5 border-2 border-white/10 p-4 rounded-2xl text-white font-bold uppercase outline-none focus:border-indigo-500" value={loginUsername} onChange={e => setLoginUsername(e.target.value.toLowerCase())} />
            <input type="password" placeholder="SENHA" className="w-full bg-white/5 border-2 border-white/10 p-4 rounded-2xl text-white font-bold outline-none focus:border-indigo-500" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
            <button disabled={isLoggingIn} type="submit" className="w-full bg-indigo-600 text-white p-5 rounded-2xl font-black uppercase shadow-lg active:scale-95 transition-all">
              {isLoggingIn ? 'Aguarde...' : 'Acessar Sistema'}
            </button>
            {loginError && <p className="text-rose-500 font-black text-xs uppercase animate-bounce">Dados incorretos</p>}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-20 lg:pb-0 overflow-hidden relative">
      {feedback && (
        <div className={`fixed top-6 right-6 z-[9999] p-5 rounded-[2rem] shadow-2xl flex items-center gap-4 animate-in slide-in-from-right-full ${feedback.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
          <CheckCircle2 size={24}/> <span className="font-black text-sm uppercase">{feedback.msg}</span>
        </div>
      )}

      <header className="bg-white border-b border-slate-200 sticky top-0 z-[1000] px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <Warehouse className="text-indigo-600 w-7 h-7" />
          <h1 className="text-base font-black italic tracking-tighter uppercase leading-none hidden sm:block text-slate-800">ALMOX PRO</h1>
        </div>
        <div className="flex items-center gap-2">
          {highlightProductId && (
            <button onClick={() => setHighlightProductId(null)} className="p-3 bg-amber-50 text-amber-600 rounded-xl flex items-center gap-2 text-[10px] font-black uppercase shadow-inner border border-amber-100">
              <Eraser size={16}/> Limpar Destaque
            </button>
          )}
          <button onClick={() => setIsSKUSearchOpen(true)} className="p-3 bg-indigo-50 text-indigo-600 rounded-xl flex items-center gap-2 text-[10px] font-black uppercase border border-indigo-100">
             <SearchCode size={18}/> Soma por ID
          </button>
          <button onClick={() => setViewMode(viewMode === '2d' ? '3d' : '2d')} className="p-3 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase border border-slate-200">
             {viewMode === '2d' ? 'Visão 3D' : 'Visão 2D'}
          </button>
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-3 bg-slate-100 text-slate-600 rounded-xl lg:hidden">
             <Menu size={18}/>
          </button>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        <aside className="hidden lg:flex w-72 bg-white border-r border-slate-200 p-6 flex-col gap-3 h-[calc(100vh-65px)] overflow-y-auto no-scrollbar">
           <button onClick={() => setIsScannerOpen(true)} className="flex items-center gap-3 p-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[11px] shadow-lg hover:bg-indigo-700 transition-all"><ScanLine size={18}/> Scanner Baixa</button>
           <button onClick={() => setIsManualExitModalOpen(true)} className="flex items-center gap-3 p-4 bg-rose-50 text-rose-600 rounded-2xl font-black uppercase text-[11px] border border-rose-100 hover:bg-rose-100"><Navigation size={18}/> Saída Manual</button>
           <div className="h-px bg-slate-100 my-2"></div>
           <button onClick={() => setIsMasterMenuOpen(true)} className="flex items-center gap-3 p-4 hover:bg-slate-50 text-slate-600 rounded-2xl font-black uppercase text-[11px]"><ClipboardList size={18}/> Item</button>
           <button onClick={() => setIsPrintMenuOpen(true)} className="flex items-center gap-3 p-4 hover:bg-slate-50 text-slate-600 rounded-2xl font-black uppercase text-[11px]"><Printer size={18}/> Etiquetas</button>
           <button onClick={async () => { try { const logs = await fetchLogsFromDB(FIXED_DB_STRING); setActivityLogs(logs || []); setIsReportsOpen(true); } catch(e){} }} className="flex items-center gap-3 p-4 hover:bg-slate-50 text-slate-600 rounded-2xl font-black uppercase text-[11px]"><History size={18}/> Histórico</button>
           {currentUser.role === 'admin' && (
             <button onClick={async () => { const users = await fetchUsersFromDB(FIXED_DB_STRING); setUsersList(users || []); setIsUsersMenuOpen(true); }} className="flex items-center gap-3 p-4 bg-emerald-50 text-emerald-600 rounded-2xl font-black uppercase text-[11px] border border-emerald-100 hover:bg-emerald-100"><Users size={18}/> Usuários</button>
           )}
        </aside>

        <main className="flex-1 p-4 lg:p-8 space-y-6 overflow-y-auto no-scrollbar relative">
          {viewMode === '2d' ? (
            <div className="bg-white rounded-[2.5rem] p-6 border border-slate-200 shadow-sm min-h-full">
              <div className="flex flex-col sm:flex-row gap-4 mb-6 justify-between items-center">
                <div className="flex gap-1 p-1 bg-slate-50 rounded-2xl border border-slate-100 overflow-x-auto no-scrollbar">
                  {RACKS.map(r => (
                    <button key={r} onClick={() => setActiveRack(r)} className={`px-5 py-2 rounded-xl font-black text-[10px] uppercase transition-all ${activeRack === r ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>{r}</button>
                  ))}
                </div>
                <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
                  {LEVEL_LABELS.map((l, i) => (
                    <button key={l} onClick={() => setActiveLevelIndex(i)} className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs transition-all ${activeLevelIndex === i ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-100 text-slate-400'}`}>{l}</button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-11 gap-2">
                {Array.from({ length: POSITIONS_PER_LEVEL }).map((_, i) => {
                  const pos = i + 1;
                  const occ = inventory.find(p => p.rack === activeRack && p.level === (activeLevelIndex + 1) && p.position === pos);
                  const isHighlighted = occ && highlightProductId && (occ.productId === highlightProductId);
                  
                  return (
                    <button 
                      key={pos} onClick={() => handlePositionClick(activeRack, activeLevelIndex + 1, pos)}
                      className={`aspect-square rounded-xl flex flex-col items-center justify-center border-2 transition-all relative ${occ ? (isHighlighted ? 'bg-amber-500 border-amber-300 text-white shadow-[0_0_15px_rgba(245,158,11,0.5)] z-10' : 'bg-indigo-600 border-indigo-700 text-white') : 'bg-slate-50 border-transparent text-slate-300 hover:border-slate-200'}`}
                    >
                      <span className="text-[9px] font-black">{LEVEL_LABELS[activeLevelIndex]}{pos}</span>
                      {occ && <Package size={12} className="mt-0.5" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="w-full h-full min-h-[450px]">
               <Warehouse3D inventory={inventory} onPositionClick={handlePositionClick} stats={stats} highlightProductId={highlightProductId} />
            </div>
          )}
        </main>
      </div>

      {/* MODAL USUÁRIOS */}
      {isUsersMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[6000] flex items-center justify-center p-6" onClick={() => setIsUsersMenuOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-[3rem] p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
             <header className="flex justify-between items-center mb-6">
                <h3 className="font-black text-xl uppercase italic text-emerald-600">Usuários Ativos</h3>
                <button onClick={() => setIsUsersMenuOpen(false)} className="p-2 bg-slate-100 rounded-xl"><X size={20}/></button>
             </header>
             <form onSubmit={handleSaveUser} className="space-y-3 mb-6 bg-emerald-50 p-6 rounded-3xl">
                <input type="text" placeholder="NOME DE USUÁRIO" className="w-full p-4 bg-white rounded-xl font-black uppercase text-xs outline-none focus:ring-2 ring-emerald-300" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value.toLowerCase()})} />
                <input type="password" placeholder="SENHA" className="w-full p-4 bg-white rounded-xl font-black text-xs outline-none focus:ring-2 ring-emerald-300" value={newUser.password || ''} onChange={e => setNewUser({...newUser, password: e.target.value})} />
                <button type="submit" className="w-full bg-emerald-600 text-white font-black p-4 rounded-xl uppercase text-[10px] shadow-lg active:scale-95 transition-all">Cadastrar Operador</button>
             </form>
             <div className="max-h-56 overflow-y-auto no-scrollbar space-y-2">
                {usersList.length > 0 ? usersList.map(u => (
                  <div key={u.username} className="flex justify-between items-center p-5 bg-slate-50 rounded-2xl text-[12px] font-bold uppercase group hover:bg-emerald-50 border border-transparent hover:border-emerald-100 transition-all">
                     <div className="flex items-center gap-3">
                        <User size={18} className="text-emerald-500"/>
                        <span className="text-slate-700">{u.username}</span>
                     </div>
                  </div>
                )) : <p className="text-center py-4 text-[10px] font-black uppercase opacity-30">Nenhum usuário cadastrado</p>}
             </div>
          </div>
        </div>
      )}

      {/* MODAL HISTÓRICO */}
      {isReportsOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[6000] flex items-center justify-center p-6" onClick={() => setIsReportsOpen(false)}>
           <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl p-8 h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <header className="flex justify-between items-center mb-6">
                 <h3 className="font-black text-xl uppercase italic text-amber-600">Histórico de Movimentação</h3>
                 <button onClick={() => setIsReportsOpen(false)} className="p-2 bg-slate-100 rounded-xl"><X size={20}/></button>
              </header>
              <div className="flex-1 overflow-y-auto no-scrollbar space-y-3">
                 {activityLogs.length > 0 ? activityLogs.map(log => (
                    <div key={log.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-[11px] flex justify-between items-start">
                       <div>
                          <p className={`font-black uppercase italic mb-1 ${log.action === 'SAIDA' ? 'text-rose-600' : 'text-indigo-600'}`}>{log.action}</p>
                          <p className="font-bold text-slate-800">{log.details}</p>
                          <p className="text-[9px] text-slate-400 mt-1 uppercase">Local: {log.location || 'N/A'} • Operador: {log.username}</p>
                       </div>
                       <p className="text-[9px] font-black text-slate-400">{new Date(log.timestamp).toLocaleTimeString()}</p>
                    </div>
                 )) : <div className="py-20 text-center opacity-30 uppercase font-black italic">Sem registros recentes</div>}
              </div>
           </div>
        </div>
      )}

      {/* MODAL GESTÃO DE ITEM (BASE) */}
      {isMasterMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[6000] flex items-center justify-center p-6" onClick={() => setIsMasterMenuOpen(false)}>
           <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl p-8 animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <header className="flex justify-between items-center mb-6">
                 <h3 className="font-black text-xl uppercase italic text-indigo-600">Base de Itens</h3>
                 <button onClick={() => setIsMasterMenuOpen(false)} className="p-2 bg-slate-100 rounded-xl"><X size={20}/></button>
              </header>
              <form onSubmit={handleSaveMaster} className="space-y-4">
                 <input type="text" placeholder="CÓDIGO SKU / ID" className="w-full p-4 bg-slate-50 rounded-xl font-black uppercase text-xs" value={newMaster.productId} onChange={e => setNewMaster({...newMaster, productId: e.target.value.toUpperCase()})} />
                 <input type="text" placeholder="DESCRIÇÃO DO ITEM" className="w-full p-4 bg-slate-50 rounded-xl font-black uppercase text-xs" value={newMaster.productName} onChange={e => setNewMaster({...newMaster, productName: e.target.value.toUpperCase()})} />
                 <input type="number" placeholder="QUANTIDADE PADRÃO" className="w-full p-4 bg-slate-50 rounded-xl font-black text-xs" value={newMaster.standardQuantity || ''} onChange={e => setNewMaster({...newMaster, standardQuantity: parseInt(e.target.value) || 0})} />
                 <button type="submit" className="w-full bg-indigo-600 text-white p-4 rounded-xl font-black uppercase text-xs shadow-lg">Salvar na Base</button>
              </form>
              <div className="mt-6 border-t pt-4 max-h-48 overflow-y-auto no-scrollbar space-y-2">
                 {masterProducts.map(m => (
                    <div key={m.productId} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl text-[10px]">
                       <div><span className="font-black">{m.productId}</span> - {m.productName} ({m.standardQuantity}un)</div>
                       <button onClick={async () => { await deleteMasterProductFromDB(FIXED_DB_STRING, m.productId); setMasterProducts(prev => prev.filter(x => x.productId !== m.productId)); }} className="text-rose-500"><Trash2 size={14}/></button>
                    </div>
                 ))}
              </div>
           </div>
        </div>
      )}

      {/* SOMA POR ID SKU */}
      {isSKUSearchOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[6000] flex items-center justify-center p-4" onClick={() => setIsSKUSearchOpen(false)}>
           <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl flex flex-col overflow-hidden h-[85vh]" onClick={e => e.stopPropagation()}>
             <header className="p-6 bg-indigo-600 text-white flex justify-between items-center">
                <h3 className="font-black text-lg uppercase italic">Estoque por ID</h3>
                <button onClick={() => { setIsSKUSearchOpen(false); setSkuSearchQuery(''); }} className="p-2 bg-white/10 rounded-xl"><X size={20}/></button>
             </header>
             <div className="p-6 border-b border-slate-100">
                <input type="text" placeholder="DIGITE O SKU..." className="w-full p-5 bg-slate-50 rounded-2xl font-black outline-none border-4 border-transparent focus:border-indigo-500 shadow-inner uppercase text-center" value={skuSearchQuery} onChange={e => setSkuSearchQuery(e.target.value)} autoFocus />
             </div>
             <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
                {skuSearchQuery.trim() !== '' ? (
                  <>
                    <div className="bg-amber-500 p-8 rounded-[2.5rem] text-white flex justify-between items-center shadow-lg">
                       <div>
                          <p className="text-[10px] font-black uppercase opacity-80 mb-1">Total em Estoque</p>
                          <h4 className="text-4xl font-black italic">{skuTotalQuantity} UN</h4>
                       </div>
                       <TrendingUp size={40} className="opacity-40" />
                    </div>
                    <div className="grid gap-3">
                       {skuSearchResults.map(item => (
                          <div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between shadow-sm">
                             <div className="flex items-center gap-3">
                                <div className="bg-slate-900 text-white w-10 h-10 rounded-xl flex flex-col items-center justify-center font-black">
                                   <span className="text-[7px]">{item.rack}</span>
                                   <span className="text-base leading-none">{LEVEL_LABELS[item.level-1]}{item.position}</span>
                                </div>
                                <div>
                                   <p className="font-black text-[11px] uppercase text-slate-800 leading-none mb-1">{item.productName}</p>
                                   <p className="text-[9px] font-bold text-slate-400">SKU: {item.productId}</p>
                                </div>
                             </div>
                             <div className="flex items-center gap-2">
                                <button onClick={() => { setHighlightProductId(item.productId!); setIsSKUSearchOpen(false); showFeedback('success', `Destaque: ${item.productId}`); }} className="p-2 bg-amber-100 text-amber-600 rounded-lg"><Focus size={16}/></button>
                                <span className="font-black text-indigo-600 text-sm ml-2">{item.quantity}un</span>
                             </div>
                          </div>
                       ))}
                    </div>
                  </>
                ) : <div className="py-20 text-center opacity-20 font-black italic uppercase">Insira um SKU para consultar</div>}
             </div>
           </div>
        </div>
      )}

      {/* MOBILE NAV */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-3 flex justify-around items-center lg:hidden z-[2000] shadow-xl">
        <button onClick={() => setIsScannerOpen(true)} className="bg-indigo-600 text-white w-14 h-14 rounded-full flex items-center justify-center -translate-y-6 shadow-xl border-4 border-slate-50"><ScanLine size={24}/></button>
        <button onClick={() => setIsMobileMenuOpen(true)} className="flex flex-col items-center gap-1 text-slate-400"><Menu size={22}/><span className="text-[8px] font-black uppercase">Menu</span></button>
      </nav>

      {/* DRAWER MOBILE */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[7000] flex justify-end" onClick={() => setIsMobileMenuOpen(false)}>
           <div className="w-[80%] max-w-xs h-full bg-white shadow-2xl flex flex-col p-8 animate-in slide-in-from-right" onClick={e => e.stopPropagation()}>
              <h3 className="font-black text-xl italic uppercase text-slate-800 mb-8">ALMOX PRO</h3>
              <div className="space-y-3">
                 <button onClick={() => {setIsMobileMenuOpen(false); setIsScannerOpen(true);}} className="w-full flex items-center gap-4 p-4 rounded-2xl bg-indigo-50 text-indigo-600 font-black uppercase text-xs"><ScanLine size={18}/> Scanner</button>
                 <button onClick={() => {setIsMobileMenuOpen(false); setIsManualExitModalOpen(true);}} className="w-full flex items-center gap-4 p-4 rounded-2xl bg-rose-50 text-rose-600 font-black uppercase text-xs"><Navigation size={18}/> Saída Manual</button>
                 <button onClick={() => {setIsMobileMenuOpen(false); setIsMasterMenuOpen(true);}} className="w-full flex items-center gap-4 p-4 rounded-2xl bg-slate-50 text-slate-700 font-black uppercase text-xs"><ClipboardList size={18}/> Item</button>
                 <button onClick={() => {setIsMobileMenuOpen(false); setIsPrintMenuOpen(true);}} className="w-full flex items-center gap-4 p-4 rounded-2xl bg-slate-50 text-slate-700 font-black uppercase text-xs"><Printer size={18}/> Etiquetas</button>
                 <button onClick={async () => { setIsMobileMenuOpen(false); try { const logs = await fetchLogsFromDB(FIXED_DB_STRING); setActivityLogs(logs || []); setIsReportsOpen(true); } catch(e){} }} className="w-full flex items-center gap-4 p-4 rounded-2xl bg-slate-50 text-slate-700 font-black uppercase text-xs"><History size={18}/> Histórico</button>
                 {currentUser.role === 'admin' && (
                    <button onClick={async () => { setIsMobileMenuOpen(false); const users = await fetchUsersFromDB(FIXED_DB_STRING); setUsersList(users || []); setIsUsersMenuOpen(true); }} className="w-full flex items-center gap-4 p-4 rounded-2xl bg-emerald-50 text-emerald-600 font-black uppercase text-xs"><Users size={18}/> Usuários</button>
                 )}
                 <div className="pt-6 border-t mt-4">
                    <button onClick={handleLogout} className="w-full flex items-center gap-4 p-4 rounded-2xl bg-slate-900 text-white font-black uppercase text-xs"><LogOut size={18}/> Sair</button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* MODAL BAIXA */}
      {scannedPosition && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[8000] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 animate-in zoom-in-95 shadow-2xl">
            <header className="flex justify-between items-center mb-6"><h3 className="font-black text-xl text-rose-600 uppercase">Retirar Item</h3><button onClick={() => setScannedPosition(null)} className="p-2 text-slate-400"><X/></button></header>
            <div className="bg-rose-50 p-6 rounded-2xl text-center mb-6 border border-rose-100">
               <span className="text-[10px] font-black uppercase tracking-widest text-rose-700">{scannedPosition.rack}{LEVEL_LABELS[scannedPosition.level-1]}{scannedPosition.position}</span>
               <h4 className="text-lg font-black uppercase mt-1 leading-tight">{scannedPosition.productName}</h4>
               <p className="text-xs font-bold text-rose-600 mt-1">Saldo: {scannedPosition.quantity} un</p>
            </div>
            <input type="number" autoFocus placeholder="QTD" className="w-full p-6 bg-slate-50 rounded-2xl font-black text-3xl text-center mb-6 border-2 border-rose-100 focus:border-rose-500 outline-none" value={exitQuantity} onChange={e => setExitQuantity(e.target.value)} />
            <button onClick={handleProcessExit} className="w-full bg-rose-600 text-white p-6 rounded-2xl font-black text-lg uppercase shadow-xl hover:bg-rose-700 transition-all">Confirmar Saída</button>
          </div>
        </div>
      )}

      {/* MODAL ETIQUETAS */}
      {isPrintMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[6000] flex items-center justify-center p-6" onClick={() => setIsPrintMenuOpen(false)}>
           <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
              <header className="flex justify-between items-center mb-6">
                 <h3 className="font-black text-xl uppercase italic text-indigo-600">Lote de Etiquetas</h3>
                 <button onClick={() => setIsPrintMenuOpen(false)} className="p-2 bg-slate-100 rounded-xl"><X size={20}/></button>
              </header>
              <div className="space-y-4">
                 <div className="grid grid-cols-4 gap-2">
                    {RACKS.map(r => (
                       <button key={r} onClick={() => setPrintFilter({...printFilter, rack: r})} className={`p-3 rounded-xl font-black text-xs transition-all ${printFilter.rack === r ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-50'}`}>{r}</button>
                    ))}
                 </div>
                 <select className="w-full p-4 bg-slate-50 rounded-xl font-black text-xs uppercase" value={printFilter.level} onChange={e => setPrintFilter({...printFilter, level: parseInt(e.target.value)})}>
                    {LEVEL_LABELS.map((l, i) => <option key={l} value={i+1}>NÍVEL {l}</option>)}
                 </select>
                 <div className="grid grid-cols-2 gap-3">
                    <input type="number" placeholder="DE" min="1" max="66" className="w-full p-4 bg-slate-50 rounded-xl font-black text-xs" value={printFilter.startPos} onChange={e => setPrintFilter({...printFilter, startPos: parseInt(e.target.value) || 1})} />
                    <input type="number" placeholder="ATÉ" min="1" max="66" className="w-full p-4 bg-slate-50 rounded-xl font-black text-xs" value={printFilter.endPos} onChange={e => setPrintFilter({...printFilter, endPos: parseInt(e.target.value) || 66})} />
                 </div>
                 <button onClick={handlePrintBatch} disabled={isProcessingAction} className="w-full bg-indigo-600 text-white p-5 rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-all">
                    {isProcessingAction ? <Loader2 className="animate-spin" /> : <><Printer size={18}/> GERAR PDF</>}
                 </button>
              </div>
           </div>
        </div>
      )}

      {isScannerOpen && (
        <ScannerModal 
          onScan={(code) => {
            const parts = code.split('-'); 
            const item = inventory.find(p => p.rack === parts[1] && p.level === parseInt(parts[3]) && p.position === parseInt(parts[5]));
            if (item && item.productId) { setScannedPosition(item); setIsScannerOpen(false); } else { showFeedback('error', 'Posição Vazia!'); setIsScannerOpen(false); }
          }} onClose={() => setIsScannerOpen(false)} 
        />
      )}

      {isManualExitModalOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[6000] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl">
             <header className="flex justify-between items-center mb-6"><h3 className="font-black text-xl text-rose-600 uppercase">Localizar Local</h3><button onClick={() => setIsManualExitModalOpen(false)} className="p-2"><X/></button></header>
             <div className="grid grid-cols-4 gap-2 mb-4">{RACKS.map(r => (<button key={r} onClick={() => setManualAddress({...manualAddress, rack: r})} className={`p-3 rounded-xl font-black text-xs transition-all ${manualAddress.rack === r ? 'bg-rose-600 text-white' : 'bg-slate-50'}`}>{r}</button>))}</div>
             <div className="grid grid-cols-2 gap-3 mb-6"><select className="p-4 bg-slate-50 rounded-xl font-black text-xs uppercase" value={manualAddress.level} onChange={e => setManualAddress({...manualAddress, level: parseInt(e.target.value)})}>{LEVEL_LABELS.map((l, i) => <option key={l} value={i+1}>NÍVEL {l}</option>)}</select><input type="number" placeholder="POS" className="p-4 bg-slate-50 rounded-xl font-black text-xs" value={manualAddress.pos} onChange={e => setManualAddress({...manualAddress, pos: e.target.value})} /></div>
             <button onClick={() => { const item = inventory.find(p => p.rack === manualAddress.rack && p.level === manualAddress.level && p.position === parseInt(manualAddress.pos)); if (item && item.productId) { setScannedPosition(item); setIsManualExitModalOpen(false); } else showFeedback('error', 'Posição Vazia!'); }} className="w-full bg-rose-600 text-white p-5 rounded-2xl font-black uppercase text-sm shadow-xl active:scale-95 transition-all">Buscar</button>
          </div>
        </div>
      )}

      {/* MODAL ENTRADA/DETALHES - BUSCA AUTOMÁTICA OTIMIZADA */}
      {selectedPosition && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[6000] flex items-center justify-center p-6" onClick={() => setSelectedPosition(null)}>
           <div className="bg-white rounded-[3rem] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
             <header className="p-6 bg-indigo-600 text-white flex justify-between items-center">
                <h3 className="font-black text-lg uppercase italic">{selectedPosition.productId ? 'Gerenciar Palete' : 'Novo Recebimento'}</h3>
                <button onClick={() => setSelectedPosition(null)} className="p-2 bg-white/10 rounded-xl"><X size={20}/></button>
             </header>
             <form onSubmit={handleSavePosition} className="p-6 space-y-4">
                <div className="relative">
                  <input 
                    list="master-items-list"
                    type="text" 
                    placeholder="ID SKU / ITEM" 
                    className="w-full p-4 bg-slate-50 rounded-xl font-black uppercase outline-none focus:ring-2 ring-indigo-300 pr-12" 
                    value={selectedPosition.productId || ''} 
                    onChange={e => {
                      const val = e.target.value.toUpperCase();
                      // Busca automática com trim para evitar falhas por espaços
                      const master = masterProducts.find(m => m.productId.trim() === val.trim());
                      
                      setSelectedPosition(prev => {
                        if (master) {
                          showFeedback('success', 'Dados do item carregados!');
                          return {
                            ...prev, 
                            productId: val, 
                            productName: master.productName, 
                            quantity: master.standardQuantity
                          };
                        }
                        return {...prev, productId: val};
                      });
                    }} 
                  />
                  <datalist id="master-items-list">
                    {masterProducts.map(m => (
                      <option key={m.productId} value={m.productId}>{m.productName}</option>
                    ))}
                  </datalist>
                  <div className="absolute right-4 top-4 text-slate-300">
                    <SearchIcon size={20}/>
                  </div>
                </div>
                
                <input type="text" placeholder="NOME DO ITEM" className="w-full p-4 bg-slate-50 rounded-xl font-black uppercase outline-none focus:ring-2 ring-indigo-300" value={selectedPosition.productName || ''} onChange={e => setSelectedPosition(prev => ({...prev, productName: e.target.value.toUpperCase()}))} />
                
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" placeholder="QUANTIDADE" className="w-full p-4 bg-slate-50 rounded-xl font-black outline-none focus:ring-2 ring-indigo-300" value={selectedPosition.quantity || ''} onChange={e => setSelectedPosition(prev => ({...prev, quantity: parseInt(e.target.value) || 0}))} />
                  <select className="w-full p-4 bg-slate-50 rounded-xl font-black uppercase text-[10px]" value={selectedPosition.slots || 1} onChange={e => setSelectedPosition(prev => ({...prev, slots: parseInt(e.target.value)}))}>
                    <option value={1}>Vaga Única</option>
                    <option value={2}>Vaga Dupla</option>
                  </select>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-dashed border-slate-200">
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Endereço de Armazenagem</p>
                   <p className="text-xl font-black text-indigo-600 text-center">{selectedPosition.rack}{LEVEL_LABELS[selectedPosition.level-1]}{selectedPosition.position}</p>
                </div>

                <div className="flex gap-2 pt-2">
                  <button type="submit" className="flex-1 bg-indigo-600 text-white p-4 rounded-2xl font-black uppercase text-xs shadow-lg active:scale-95 transition-all">{isProcessingAction ? 'Salvando...' : 'Armazenar'}</button>
                  {selectedPosition.productId && (
                    <button type="button" onClick={() => { setScannedPosition(selectedPosition); setSelectedPosition(null); }} className="bg-rose-50 text-rose-600 p-4 rounded-2xl font-black uppercase text-xs px-6 border border-rose-100">Baixa</button>
                  )}
                </div>
             </form>
           </div>
        </div>
      )}

      {showQR && <QRCodeModal position={showQR} onClose={() => setShowQR(null)} />}
    </div>
  );
};

export default App;
