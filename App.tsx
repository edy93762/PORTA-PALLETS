
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Package, Warehouse, Search, LayoutGrid, QrCode, TrendingUp, Box, 
  X, ScanLine, Printer, Check, ArrowRight, Loader2, LogOut, 
  ClipboardList, Trash2, Edit2, List, Link as LinkIcon, Menu,
  AlertCircle, CheckCircle2, User, Lock, Eye, EyeOff, Layers, SearchCode,
  Save, Plus, Minus, Trash, Search as SearchIcon, ChevronRight, ChevronDown
} from 'lucide-react';
import { PalletPosition, RackId, MasterProduct } from './types';
import { QRCodeModal } from './components/QRCodeModal';
import { ScannerModal } from './components/ScannerModal';
import { 
  initializeDatabase, 
  fetchInventoryFromDB, 
  saveItemToDB, 
  deleteItemFromDB,
  fetchMasterProductsFromDB,
  saveMasterProductToDB,
  deleteMasterProductFromDB
} from './services/neonService';
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { QRCodeSVG } from 'qrcode.react';

// Configuração solicitada: 4 Porta Palletes
const RACKS: RackId[] = ['A', 'B', 'C', 'D'];
const LEVEL_LABELS = ['A', 'B', 'C', 'D', 'E'];
const POSITIONS_PER_LEVEL = 66;
const APP_USERNAME = "almox";
const APP_PASSWORD = "Shopee@2026";
const SESSION_DURATION_MS = 60 * 60 * 1000; 
const FIXED_DB_STRING = "postgresql://neondb_owner:npg_JaZLTzrqMc09@ep-fragrant-cherry-ac95x95d-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require";

const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    const loggedIn = localStorage.getItem('isLoggedIn') === 'true';
    const loginTime = localStorage.getItem('loginTime');
    if (loggedIn && loginTime) {
      const now = Date.now();
      if (now - parseInt(loginTime) < SESSION_DURATION_MS) return true;
    }
    return false;
  });

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isRackSelectorOpen, setIsRackSelectorOpen] = useState(false);

  const [inventory, setInventory] = useState<PalletPosition[]>([]);
  const [masterProducts, setMasterProducts] = useState<MasterProduct[]>([]);
  const [activeRack, setActiveRack] = useState<RackId>('A');
  const [activeLevelIndex, setActiveLevelIndex] = useState<number>(0); 
  const [selectedPosition, setSelectedPosition] = useState<PalletPosition | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  const [isDbConnected, setIsDbConnected] = useState(false);
  const [isLoadingDb, setIsLoadingDb] = useState(false);

  const [scannedPosition, setScannedPosition] = useState<PalletPosition | null>(null);
  const [exitQuantity, setExitQuantity] = useState<number | string>(''); 
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  
  const [showQR, setShowQR] = useState<{ rack: string; level: number; pos: number } | null>(null);
  const [isPrintMenuOpen, setIsPrintMenuOpen] = useState(false);
  const [isMasterMenuOpen, setIsMasterMenuOpen] = useState(false);
  const [printMenuTab, setPrintMenuTab] = useState<'single' | 'batch'>('single');
  const [isSearchOpen, setIsSearchOpen] = useState(false); 
  const [searchQuery, setSearchQuery] = useState(''); 
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  
  const [newMaster, setNewMaster] = useState<MasterProduct>({ productId: '', productName: '', standardQuantity: 0 });

  const [singlePrintData, setSinglePrintData] = useState({ rack: 'A' as RackId, level: 1, pos: 1 });
  const [printFilter, setPrintFilter] = useState({
    rack: 'A' as RackId,
    level: 1,
    startPos: 1,
    endPos: 66
  });

  useEffect(() => {
    if (isLoggedIn) {
      loadFromNeon(FIXED_DB_STRING);
    }
  }, [isLoggedIn]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginUsername === APP_USERNAME && loginPassword === APP_PASSWORD) {
      setIsLoggedIn(true);
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('loginTime', Date.now().toString());
    } else {
      setLoginError(true);
      setTimeout(() => setLoginError(false), 2000);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.clear();
  };

  const loadFromNeon = async (str: string) => {
    setIsLoadingDb(true);
    try {
      await initializeDatabase(str);
      const [invData, masterData] = await Promise.all([
        fetchInventoryFromDB(str),
        fetchMasterProductsFromDB(str)
      ]);
      setInventory(invData);
      setMasterProducts(masterData);
      setIsDbConnected(true);
      showFeedback('success', 'Dados Sincronizados');
    } catch (error) {
      showFeedback('error', 'Falha na conexão com servidor.');
    } finally {
      setIsLoadingDb(false);
    }
  };

  const showFeedback = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handlePositionClick = (rack: RackId, level: number, pos: number) => {
    const existing = inventory.find(p => p.rack === rack && p.level === level && p.position === pos);
    const blocked = inventory.find(p => p.rack === rack && p.level === level && p.position === pos - 1 && p.slots === 2);
    
    if (blocked) {
      showFeedback('error', 'Posição ocupada por palete duplo anterior.');
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

  const handleScanCode = (code: string) => {
    // Formato esperado: PP-A-L-1-P-10
    const parts = code.split('-');
    if (parts.length < 6) {
      showFeedback('error', 'Código QR inválido');
      return;
    }

    const rack = parts[1] as RackId;
    const level = parseInt(parts[3]);
    const pos = parseInt(parts[5]);

    const item = inventory.find(p => p.rack === rack && p.level === level && p.position === pos);
    
    if (item && (item.productId || item.productName)) {
      setScannedPosition(item);
      setExitQuantity('');
      setIsScannerOpen(false);
      showFeedback('success', 'Local identificado!');
    } else {
      showFeedback('error', 'Nenhum produto neste local');
      setIsScannerOpen(false);
    }
  };

  const handleProductIdInput = (val: string) => {
    const upperVal = val.toUpperCase().trim();
    const foundMaster = masterProducts.find(m => m.productId === upperVal);
    
    if (foundMaster) {
      setSelectedPosition(prev => prev ? ({
        ...prev,
        productId: upperVal,
        productName: foundMaster.productName,
        quantity: foundMaster.standardQuantity
      }) : null);
      showFeedback('success', 'Produto identificado!');
    } else {
      setSelectedPosition(prev => prev ? ({ ...prev, productId: val }) : null);
    }
  };

  const handleSavePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPosition?.productId || !selectedPosition?.productName || !selectedPosition?.quantity) {
      showFeedback('error', 'Preencha todos os campos!');
      return;
    }

    if (selectedPosition.slots === 2) {
      const nextOccupied = inventory.find(p => p.rack === selectedPosition.rack && p.level === selectedPosition.level && p.position === selectedPosition.position + 1);
      if (nextOccupied || selectedPosition.position >= POSITIONS_PER_LEVEL) {
        showFeedback('error', 'Sem espaço para palete duplo.');
        return;
      }
    }

    const itemToSave = { 
      ...selectedPosition, 
      productId: selectedPosition.productId.toUpperCase().trim(),
      productName: selectedPosition.productName.toUpperCase().trim(),
      lastUpdated: new Date().toISOString() 
    };
    try {
      await saveItemToDB(FIXED_DB_STRING, itemToSave);
      setInventory(prev => [...prev.filter(p => p.id !== itemToSave.id), itemToSave]);
      setShowQR({ rack: itemToSave.rack, level: itemToSave.level, pos: itemToSave.position });
      setSelectedPosition(null);
      showFeedback('success', 'Palete Armazenado!');
    } catch (err) { showFeedback('error', 'Erro ao salvar.'); }
  };

  const generatePDF = async () => {
    setIsGeneratingPDF(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const itemsToPrint: { code: string, label: string }[] = [];

      if (printMenuTab === 'single') {
        const lvl = LEVEL_LABELS[singlePrintData.level - 1];
        itemsToPrint.push({ 
          code: `PP-${singlePrintData.rack}-L-${singlePrintData.level}-P-${singlePrintData.pos}`, 
          label: `PP ${singlePrintData.rack} ${lvl}${singlePrintData.pos}` 
        });
      } else if (printMenuTab === 'batch') {
        const lvlLabel = LEVEL_LABELS[printFilter.level - 1];
        for (let p = printFilter.startPos; p <= printFilter.endPos; p++) {
          itemsToPrint.push({ 
            code: `PP-${printFilter.rack}-L-${printFilter.level}-P-${p}`, 
            label: `PP ${printFilter.rack} ${lvlLabel}${p}` 
          });
        }
      }

      if (itemsToPrint.length === 0) {
        showFeedback('error', 'Nada para imprimir');
        setIsGeneratingPDF(false);
        return;
      }

      for (let i = 0; i < itemsToPrint.length; i++) {
        const item = itemsToPrint[i];
        if (i > 0 && i % 15 === 0) doc.addPage();
        
        const idxOnPage = i % 15;
        const col = idxOnPage % 3;
        const row = Math.floor(idxOnPage / 3);
        const x = 15 + (col * 60);
        const y = 15 + (row * 55);

        doc.setDrawColor(230);
        doc.rect(x, y, 50, 50);

        const qrDataUrl = await QRCode.toDataURL(item.code, { margin: 1, errorCorrectionLevel: 'H' });
        doc.addImage(qrDataUrl, 'PNG', x + 5, y + 8, 40, 40);

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(item.label, x + 25, y + 6, { align: "center" });

        doc.setFontSize(6);
        doc.setFont("courier", "normal");
        doc.text(item.code, x + 25, y + 48, { align: "center" });
      }

      doc.save(`etiquetas_shopee_${Date.now()}.pdf`);
      showFeedback('success', 'PDF Gerado!');
      setIsPrintMenuOpen(false);
    } catch (err) {
      showFeedback('error', 'Erro ao gerar etiquetas.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const stats = useMemo(() => {
    const total = RACKS.length * LEVEL_LABELS.length * POSITIONS_PER_LEVEL;
    const occupiedSlots = inventory.reduce((acc, curr) => acc + (curr.slots || 1), 0);
    return { totalPositions: total, occupiedPositions: occupiedSlots, occupancyRate: total > 0 ? Math.round((occupiedSlots / total) * 100) : 0 };
  }, [inventory]);

  const handleSaveMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMaster.productId || !newMaster.productName || !newMaster.standardQuantity) {
      showFeedback('error', 'Preencha todos os dados do SKU.');
      return;
    }
    try {
      await saveMasterProductToDB(FIXED_DB_STRING, newMaster);
      setMasterProducts(prev => [...prev.filter(p => p.productId !== newMaster.productId), newMaster]);
      setNewMaster({ productId: '', productName: '', standardQuantity: 0 });
      showFeedback('success', 'SKU Cadastrado!');
    } catch (err) { showFeedback('error', 'Erro ao salvar cadastro.'); }
  };

  const handleProcessExit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedPosition) return;
    const qtdToRemove = Number(exitQuantity);
    const currentQty = scannedPosition.quantity || 0;
    if (isNaN(qtdToRemove) || qtdToRemove <= 0 || qtdToRemove > currentQty) {
      showFeedback('error', 'Qtd inválida.');
      return;
    }
    try {
      if (qtdToRemove < currentQty) {
        const updated = { ...scannedPosition, quantity: currentQty - qtdToRemove, lastUpdated: new Date().toISOString() };
        await saveItemToDB(FIXED_DB_STRING, updated);
        setInventory(prev => prev.map(p => p.id === updated.id ? updated : p));
      } else {
        await deleteItemFromDB(FIXED_DB_STRING, scannedPosition);
        setInventory(prev => prev.filter(p => p.id !== scannedPosition.id));
      }
      showFeedback('success', 'Baixa Concluída');
      setScannedPosition(null);
    } catch (err) { showFeedback('error', 'Erro na baixa.'); }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/20 blur-[150px] rounded-full"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-rose-600/10 blur-[150px] rounded-full"></div>
        <div className="w-full max-w-sm z-10 animate-in fade-in slide-in-from-bottom-8">
          <div className="text-center mb-10">
            <div className="bg-indigo-600 w-24 h-24 rounded-[3.5rem] flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-indigo-500/20">
              <Warehouse className="text-white w-12 h-12" />
            </div>
            <h1 className="text-4xl font-black text-white italic tracking-tighter uppercase leading-none">Porta Pallets</h1>
            <p className="text-indigo-400 font-bold uppercase text-[10px] tracking-[0.5em] mt-3">Logística Shopee</p>
          </div>
          <form onSubmit={handleLogin} className="bg-white/5 backdrop-blur-2xl border border-white/10 p-10 rounded-[3.5rem] space-y-5 shadow-2xl">
            <input type="text" placeholder="USUÁRIO" className="w-full bg-white/5 border-2 border-white/10 p-5 rounded-2xl text-white font-bold outline-none focus:border-indigo-500 transition-all placeholder:text-white/20" value={loginUsername} onChange={e => setLoginUsername(e.target.value)} />
            <div className="relative">
              <input type={showPassword ? "text" : "password"} placeholder="SENHA" className="w-full bg-white/5 border-2 border-white/10 p-5 rounded-2xl text-white font-bold outline-none focus:border-indigo-500 transition-all placeholder:text-white/20" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white">
                {showPassword ? <EyeOff size={20}/> : <Eye size={20}/>}
              </button>
            </div>
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white p-6 rounded-3xl font-black uppercase tracking-widest shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3">ACESSAR <ArrowRight size={20}/></button>
            {loginError && <p className="text-rose-500 text-center font-black text-xs uppercase animate-pulse">Falha na Autenticação</p>}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 pb-20 lg:pb-0 overflow-hidden">
      {isGeneratingPDF && (
        <div className="fixed inset-0 z-[3000] bg-slate-900/80 backdrop-blur-md flex flex-col items-center justify-center text-white p-6 text-center">
          <Loader2 className="w-16 h-16 animate-spin mb-6 text-indigo-400" />
          <h2 className="text-3xl font-black uppercase italic tracking-tighter">Gerando Etiquetas</h2>
          <p className="text-slate-400 font-bold uppercase text-xs tracking-[0.2em] mt-3">Organizando Layout</p>
        </div>
      )}

      {feedback && (
        <div className={`fixed top-6 right-6 z-[2500] p-5 rounded-[2rem] shadow-2xl flex items-center gap-4 animate-in slide-in-from-right-full ${feedback.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
          {feedback.type === 'success' ? <CheckCircle2 size={24}/> : <AlertCircle size={24}/>}
          <span className="font-black text-sm uppercase">{feedback.msg}</span>
        </div>
      )}

      <header className="bg-white border-b border-slate-200 sticky top-0 z-[500] px-6 py-4 flex justify-between items-center lg:px-12">
        <div className="flex items-center gap-4">
          <Warehouse className="text-indigo-600 w-8 h-8 lg:w-10 lg:h-10" />
          <div>
            <h1 className="text-xl lg:text-2xl font-black italic tracking-tighter leading-none">Almox Digital</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.3em] mt-1">4 Porta Palletes Ativos</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setIsSearchOpen(true)} className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl hover:bg-indigo-100 transition-all flex items-center gap-2 group">
            <SearchIcon size={20}/><span className="hidden lg:inline font-black text-xs uppercase">Consultar</span>
          </button>
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-4 bg-slate-100 text-slate-600 rounded-2xl lg:hidden"><Menu size={20}/></button>
          <button onClick={handleLogout} className="hidden lg:flex p-4 text-rose-500 hover:bg-rose-50 rounded-2xl transition-all font-black text-xs uppercase">Sair</button>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        {/* ASIDE DESKTOP */}
        <aside className="hidden lg:flex w-80 bg-white border-r border-slate-200 p-8 flex-col gap-5 h-[calc(100vh-80px)]">
           <button onClick={() => setIsMasterMenuOpen(true)} className="flex items-center gap-4 p-5 text-slate-600 hover:bg-slate-50 rounded-3xl font-black uppercase text-xs tracking-widest border-2 border-transparent transition-all"><ClipboardList size={20}/> Cadastro SKU</button>
           <button onClick={() => setIsScannerOpen(true)} className="flex items-center gap-4 p-5 text-slate-600 hover:bg-slate-50 rounded-3xl font-black uppercase text-xs tracking-widest border-2 border-transparent transition-all"><ScanLine size={20}/> Saída / Baixa</button>
           <button onClick={() => setIsPrintMenuOpen(true)} className="flex items-center gap-4 p-5 text-indigo-600 bg-indigo-50 rounded-3xl font-black uppercase text-xs tracking-widest border-2 border-indigo-100 transition-all hover:bg-indigo-100 shadow-sm"><Printer size={20}/> Impressão Etiqueta</button>
           <button onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} className={`flex items-center gap-4 p-5 rounded-3xl font-black uppercase text-xs tracking-widest border-2 transition-all ${viewMode === 'list' ? 'bg-indigo-50 border-indigo-100 text-indigo-600 shadow-sm' : 'text-slate-500 border-transparent hover:bg-slate-50'}`}>
             {viewMode === 'grid' ? <List size={20}/> : <LayoutGrid size={20}/>}
             {viewMode === 'grid' ? 'Visualizar Lista' : 'Visualizar Grade'}
           </button>
           <div className="mt-auto bg-slate-50 p-6 rounded-[2.5rem] border border-slate-100 text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 italic">Logística Shopee</p>
              <div className="flex justify-around text-xs font-black">
                <div><p className="text-slate-400">Racks</p><p className="text-indigo-600">4</p></div>
                <div><p className="text-slate-400">Total</p><p className="text-indigo-600">1320</p></div>
              </div>
           </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 p-6 lg:p-12 space-y-8 overflow-y-auto no-scrollbar">
          {/* STATS */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex items-center justify-between">
              <div><p className="text-[10px] text-slate-400 font-black uppercase mb-2 tracking-widest">Ocupados</p><h2 className="text-4xl font-black">{stats.occupiedPositions}</h2></div>
              <Box className="text-indigo-100 w-12 h-12" />
            </div>
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex items-center justify-between">
              <div><p className="text-[10px] text-slate-400 font-black uppercase mb-2 tracking-widest">Disponíveis</p><h2 className="text-4xl font-black">{stats.totalPositions - stats.occupiedPositions}</h2></div>
              <LayoutGrid className="text-emerald-100 w-12 h-12" />
            </div>
            <div className="col-span-2 lg:col-span-1 bg-indigo-600 p-8 rounded-[2.5rem] shadow-2xl shadow-indigo-500/20 flex items-center justify-between text-white">
              <div><p className="text-[10px] text-indigo-200 font-black uppercase mb-2 tracking-widest">Ocupação</p><h2 className="text-4xl font-black">{stats.occupancyRate}%</h2></div>
              <TrendingUp className="text-indigo-300 w-12 h-12" />
            </div>
          </div>

          {/* VIEW RACKS */}
          <div className="bg-white rounded-[3.5rem] p-6 lg:p-10 border border-slate-200 shadow-sm overflow-hidden">
            <div className="space-y-8">
              {/* Rack Selection Group - Melhorado para Mobile */}
              <div className="flex flex-col gap-6">
                <div className="relative group/selector">
                   <button 
                    onClick={() => setIsRackSelectorOpen(!isRackSelectorOpen)}
                    className="w-full lg:hidden flex items-center justify-between p-5 bg-slate-50 border-2 border-slate-100 rounded-3xl font-black uppercase text-sm italic tracking-tighter text-slate-800"
                   >
                     <span>Porta Pallet {activeRack}</span>
                     <ChevronDown className={`transition-transform duration-300 ${isRackSelectorOpen ? 'rotate-180' : ''}`} />
                   </button>
                   
                   {/* Dropdown/Grid para Mobile */}
                   {isRackSelectorOpen && (
                     <div className="absolute top-full left-0 right-0 mt-3 z-50 bg-white border border-slate-100 rounded-3xl shadow-2xl p-4 grid grid-cols-2 gap-3 animate-in slide-in-from-top-2 lg:hidden">
                        {RACKS.map(r => (
                          <button 
                            key={r} 
                            onClick={() => { setActiveRack(r); setIsRackSelectorOpen(false); }}
                            className={`p-6 rounded-2xl font-black text-xs uppercase transition-all ${activeRack === r ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-50 text-slate-400'}`}
                          >
                            Pallet {r}
                          </button>
                        ))}
                     </div>
                   )}

                   {/* Desktop Tabs */}
                   <div className="hidden lg:flex gap-3 overflow-x-auto no-scrollbar pb-2">
                    {RACKS.map(r => (
                      <button 
                        key={r} 
                        onClick={() => setActiveRack(r)} 
                        className={`px-10 py-4 rounded-2xl font-black text-xs uppercase transition-all whitespace-nowrap ${activeRack === r ? 'bg-indigo-600 text-white shadow-lg scale-105' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                      >
                        Porta Pallet {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 px-1">
                  {LEVEL_LABELS.map((l, idx) => (
                    <button key={l} onClick={() => setActiveLevelIndex(idx)} className={`w-12 h-12 lg:w-14 lg:h-14 shrink-0 flex items-center justify-center rounded-2xl font-black text-sm transition-all ${activeLevelIndex === idx ? 'bg-slate-800 text-white shadow-xl' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>{l}</button>
                  ))}
                </div>
              </div>

              {viewMode === 'grid' ? (
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-11 gap-3 max-h-[60vh] overflow-y-auto no-scrollbar pr-3 pt-2">
                  {Array.from({ length: POSITIONS_PER_LEVEL }).map((_, i) => {
                    const pos = i + 1;
                    const occ = inventory.find(p => p.rack === activeRack && p.level === (activeLevelIndex + 1) && p.position === pos);
                    const blocked = inventory.find(p => p.rack === activeRack && p.level === (activeLevelIndex + 1) && p.position === pos - 1 && p.slots === 2);
                    
                    return (
                      <div key={pos} className="relative group">
                        <button 
                          onClick={() => handlePositionClick(activeRack, activeLevelIndex + 1, pos)}
                          className={`w-full aspect-square rounded-2xl flex flex-col items-center justify-center border-2 transition-all active:scale-90 relative ${occ ? 'bg-indigo-600 border-indigo-700 text-white z-10 shadow-lg' : blocked ? 'bg-indigo-50 border-indigo-100 text-indigo-300 opacity-60' : 'bg-slate-50 border-transparent text-slate-300 hover:border-slate-200 hover:bg-white'}`}
                        >
                          <span className="text-[10px] font-black">{LEVEL_LABELS[activeLevelIndex]}{pos}</span>
                          {occ && <Package size={16} className="mt-1"/>}
                        </button>
                      </div>
                    );
                  }) }
                </div>
              ) : (
                <div className="space-y-4 max-h-[60vh] overflow-y-auto no-scrollbar">
                  {inventory.filter(p => p.rack === activeRack && p.level === (activeLevelIndex + 1)).map(item => (
                    <div key={item.id} className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 flex justify-between items-center group hover:border-indigo-200 transition-all">
                      <div className="flex items-center gap-6">
                        <span className="bg-indigo-600 text-white w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shadow-lg">{item.position}</span>
                        <div>
                          <h4 className="font-black text-slate-800 uppercase tracking-tight">{item.productName}</h4>
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{item.productId} • {item.quantity} un</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handlePositionClick(item.rack, item.level, item.position)} className="p-4 text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all"><Edit2 size={18}/></button>
                        <button onClick={() => { setScannedPosition(item); setExitQuantity(''); }} className="p-4 text-rose-600 hover:bg-rose-50 rounded-2xl transition-all"><ScanLine size={18}/></button>
                      </div>
                    </div>
                  ))}
                  {inventory.filter(p => p.rack === activeRack && p.level === (activeLevelIndex + 1)).length === 0 && (
                    <div className="py-20 text-center opacity-30 italic font-black text-slate-400 uppercase tracking-widest">Nível Vazio</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* MODAL IMPRESSÃO MASTER */}
      {isPrintMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[2000] flex items-center justify-center p-4">
          <div className="bg-white rounded-[4rem] w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col lg:flex-row shadow-2xl animate-in zoom-in-95">
            <div className="flex-1 p-10 lg:p-14 overflow-y-auto no-scrollbar flex flex-col">
              <div className="flex justify-between items-center mb-10">
                <h3 className="text-3xl font-black uppercase italic tracking-tighter text-slate-800">Impressão Etiquetas</h3>
                <button onClick={() => setIsPrintMenuOpen(false)} className="lg:hidden p-3 bg-slate-100 rounded-2xl"><X size={24}/></button>
              </div>

              <div className="flex bg-slate-100 p-2 rounded-2xl mb-12 shadow-inner">
                <button onClick={() => setPrintMenuTab('single')} className={`flex-1 py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${printMenuTab === 'single' ? 'bg-white text-indigo-600 shadow-lg' : 'text-slate-400'}`}>Unitária</button>
                <button onClick={() => setPrintMenuTab('batch')} className={`flex-1 py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${printMenuTab === 'batch' ? 'bg-white text-indigo-600 shadow-lg' : 'text-slate-400'}`}>Em Massa</button>
              </div>

              <div className="flex-1">
                {printMenuTab === 'single' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                    <div className="grid grid-cols-4 gap-3">
                      {RACKS.map(r => (
                        <button key={r} onClick={() => setSinglePrintData({...singlePrintData, rack: r})} className={`p-6 rounded-3xl font-black border-2 transition-all ${singlePrintData.rack === r ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl' : 'bg-slate-50 border-transparent text-slate-400'}`}>{r}</button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                       <select className="w-full p-6 bg-slate-50 rounded-[2rem] font-black appearance-none outline-none border-2 border-transparent focus:border-indigo-500" value={singlePrintData.level} onChange={e => setSinglePrintData({...singlePrintData, level: parseInt(e.target.value)})}>
                         {LEVEL_LABELS.map((l, i) => <option key={l} value={i+1}>NÍVEL {l}</option>)}
                       </select>
                       <input type="number" placeholder="POS" className="w-full p-6 bg-slate-50 rounded-[2rem] font-black outline-none border-2 border-transparent focus:border-indigo-500" value={singlePrintData.pos} onChange={e => setSinglePrintData({...singlePrintData, pos: parseInt(e.target.value) || 1})} />
                    </div>
                  </div>
                )}

                {printMenuTab === 'batch' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                    <div className="grid grid-cols-4 gap-3">
                      {RACKS.map(r => (
                        <button key={r} onClick={() => setPrintFilter({...printFilter, rack: r})} className={`p-6 rounded-3xl font-black border-2 transition-all ${printFilter.rack === r ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl' : 'bg-slate-50 border-transparent text-slate-400'}`}>{r}</button>
                      ))}
                    </div>
                    <div className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 shadow-inner">
                      <div className="flex items-center gap-6 mb-8">
                        <p className="font-black text-xs uppercase tracking-widest text-slate-400 shrink-0">Definir Intervalo:</p>
                        <select className="flex-1 p-4 bg-white rounded-2xl font-black outline-none shadow-sm" value={printFilter.level} onChange={e => setPrintFilter({...printFilter, level: parseInt(e.target.value)})}>
                          {LEVEL_LABELS.map((l, i) => <option key={l} value={i+1}>NÍVEL {l}</option>)}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                         <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-slate-400 ml-6">DE</label>
                            <input type="number" className="w-full p-6 rounded-[2rem] font-black outline-none shadow-sm" value={printFilter.startPos} onChange={e => setPrintFilter({...printFilter, startPos: parseInt(e.target.value) || 1})} />
                         </div>
                         <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-slate-400 ml-6">ATÉ</label>
                            <input type="number" className="w-full p-6 rounded-[2rem] font-black outline-none shadow-sm" value={printFilter.endPos} onChange={e => setPrintFilter({...printFilter, endPos: parseInt(e.target.value) || 1})} />
                         </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <button onClick={generatePDF} className="w-full mt-10 bg-indigo-600 text-white p-8 rounded-[3rem] font-black text-2xl uppercase tracking-widest shadow-2xl hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-5">
                <Printer size={32}/> GERAR PDF
              </button>
            </div>
            
            <div className="hidden lg:flex flex-1 bg-slate-50 p-14 flex-col items-center justify-center relative border-l-2 border-slate-100">
               <button onClick={() => setIsPrintMenuOpen(false)} className="absolute top-12 right-12 p-4 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-3xl transition-all"><X size={28}/></button>
               <div className="bg-white w-[350px] h-[350px] p-10 rounded-[4rem] shadow-2xl flex flex-col items-center justify-between border-[12px] border-white ring-1 ring-slate-100">
                  <span className="font-black text-3xl text-slate-800 uppercase tracking-tighter text-center">
                    {printMenuTab === 'single' ? `PP ${singlePrintData.rack} ${LEVEL_LABELS[singlePrintData.level-1]}${singlePrintData.pos}` : 'LOTE'}
                  </span>
                  <QRCodeSVG value="PREVIEW" size={180} level="H" className="opacity-10" />
                  <span className="font-mono text-[10px] text-slate-300 font-bold uppercase tracking-[0.4em]">PADRÃO 50X50MM</span>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ARMAZENAR / ENTRADA */}
      {selectedPosition && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[2000] flex items-center justify-center p-6">
           <div className="bg-white rounded-[4rem] w-full max-w-md shadow-2xl animate-in zoom-in-95 overflow-hidden">
             <header className="p-8 bg-indigo-600 text-white flex justify-between items-center">
                <div>
                   <h3 className="font-black text-2xl uppercase italic tracking-tighter leading-none">Entrada de Palete</h3>
                   <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80 mt-2">Endereço: {selectedPosition.rack}{LEVEL_LABELS[selectedPosition.level-1]}{selectedPosition.position}</p>
                </div>
                <button onClick={() => setSelectedPosition(null)} className="p-3 bg-white/10 rounded-2xl hover:bg-white/20"><X size={24}/></button>
             </header>
             <form onSubmit={handleSavePosition} className="p-8 space-y-6">
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Código SKU (ID)</label>
                   <div className="relative">
                     <input type="text" className="w-full p-5 bg-slate-50 rounded-2xl font-black outline-none border-2 border-transparent focus:border-indigo-500 uppercase transition-all" placeholder="Puxar ID..." value={selectedPosition.productId} onChange={e => handleProductIdInput(e.target.value)} />
                     <SearchIcon size={18} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300" />
                   </div>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Nome / Descrição</label>
                   <input type="text" className="w-full p-5 bg-slate-50 rounded-2xl font-black outline-none border-2 border-transparent focus:border-indigo-500 uppercase transition-all" placeholder="Nome..." value={selectedPosition.productName} onChange={e => setSelectedPosition({...selectedPosition, productName: e.target.value.toUpperCase()})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Saldo (Editável)</label>
                      <input type="number" className="w-full p-5 bg-slate-50 rounded-2xl font-black outline-none border-2 border-transparent focus:border-indigo-500" value={selectedPosition.quantity} onChange={e => setSelectedPosition({...selectedPosition, quantity: parseInt(e.target.value) || 0})} />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Tipo Espaço</label>
                      <select className="w-full p-5 bg-slate-50 rounded-2xl font-black outline-none border-2 border-transparent focus:border-indigo-500 appearance-none" value={selectedPosition.slots} onChange={e => setSelectedPosition({...selectedPosition, slots: parseInt(e.target.value)})}>
                         <option value={1}>Simples</option>
                         <option value={2}>Duplo</option>
                      </select>
                   </div>
                </div>
                <button type="submit" className="w-full bg-indigo-600 text-white p-7 rounded-[2.5rem] font-black uppercase tracking-widest shadow-2xl active:scale-95 transition-all mt-4 flex items-center justify-center gap-3">
                  <Save size={20}/> SALVAR
                </button>
             </form>
           </div>
        </div>
      )}

      {/* MODAL CADASTRO MESTRE */}
      {isMasterMenuOpen && (
        <div className="fixed inset-0 bg-white z-[2800] flex flex-col animate-in slide-in-from-right-full lg:bg-slate-900/80 lg:backdrop-blur-md lg:items-center lg:justify-center lg:p-12">
          <div className="bg-white w-full h-full flex flex-col lg:max-w-5xl lg:h-[85vh] lg:rounded-[4rem] lg:shadow-2xl overflow-hidden">
            <header className="p-8 bg-slate-900 text-white flex justify-between items-center">
               <div className="flex items-center gap-5"><ClipboardList size={32}/><h3 className="font-black uppercase italic tracking-tighter text-2xl">Cadastro Mestre de SKU</h3></div>
               <button onClick={() => setIsMasterMenuOpen(false)} className="p-4 bg-white/10 rounded-3xl hover:bg-rose-500 transition-all"><X size={24}/></button>
            </header>
            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-slate-50">
               <div className="lg:w-80 p-8 bg-white border-r border-slate-100 overflow-y-auto no-scrollbar shadow-sm">
                  <h4 className="font-black uppercase text-[10px] text-slate-400 tracking-widest mb-8 border-l-4 border-indigo-600 pl-4 uppercase italic">Novo SKU</h4>
                  <form onSubmit={handleSaveMaster} className="space-y-5">
                    <input type="text" placeholder="ID SKU" className="w-full p-5 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 font-black uppercase outline-none shadow-sm transition-all" value={newMaster.productId} onChange={e => setNewMaster({...newMaster, productId: e.target.value.toUpperCase()})}/>
                    <input type="text" placeholder="NOME PRODUTO" className="w-full p-5 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 font-black uppercase outline-none shadow-sm transition-all" value={newMaster.productName} onChange={e => setNewMaster({...newMaster, productName: e.target.value.toUpperCase()})}/>
                    <input type="number" placeholder="QTD PADRÃO" className="w-full p-5 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 font-black outline-none shadow-sm transition-all" value={newMaster.standardQuantity || ''} onChange={e => setNewMaster({...newMaster, standardQuantity: parseInt(e.target.value) || 0})}/>
                    <button className="w-full bg-indigo-600 text-white p-6 rounded-3xl font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all">CADASTRAR</button>
                  </form>
               </div>
               <div className="flex-1 p-8 overflow-y-auto no-scrollbar bg-slate-50">
                  <h4 className="font-black uppercase text-[10px] text-slate-400 tracking-widest mb-8 border-l-4 border-slate-200 pl-4 uppercase italic">SKUs Cadastrados ({masterProducts.length})</h4>
                  <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {masterProducts.map(p => (
                      <div key={p.productId} className="flex justify-between items-center p-6 bg-white border border-slate-100 rounded-[2.5rem] shadow-sm hover:border-indigo-100">
                        <div className="overflow-hidden">
                          <p className="text-[10px] font-black text-indigo-500 uppercase">{p.productId}</p>
                          <p className="font-black uppercase text-xs truncate leading-tight mt-1">{p.productName}</p>
                        </div>
                        <button onClick={() => {
                           if(confirm('Excluir este SKU?')) {
                             deleteMasterProductFromDB(FIXED_DB_STRING, p.productId);
                             setMasterProducts(prev => prev.filter(m => m.productId !== p.productId));
                           }
                        }} className="p-3 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><Trash size={18}/></button>
                      </div>
                    ))}
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PESQUISA */}
      {isSearchOpen && (
        <div className="fixed inset-0 bg-white z-[2500] flex flex-col animate-in slide-in-from-bottom-full lg:bg-slate-900/80 lg:backdrop-blur-md lg:p-12 lg:items-center lg:justify-center">
           <div className="bg-white w-full h-full flex flex-col lg:max-w-3xl lg:h-[80vh] lg:rounded-[4rem] overflow-hidden shadow-2xl">
              <header className="p-8 bg-indigo-600 text-white flex justify-between items-center shrink-0">
                 <div className="flex items-center gap-5"><SearchCode size={32}/><h3 className="font-black text-2xl uppercase italic tracking-tighter">Consulta de Estoque</h3></div>
                 <button onClick={() => {setIsSearchOpen(false); setSearchQuery('');}} className="p-3 bg-white/10 rounded-2xl"><X size={24}/></button>
              </header>
              <div className="p-8 bg-slate-50 border-b border-slate-200">
                 <input type="text" autoFocus placeholder="SKU ou nome..." className="w-full p-6 rounded-3xl border-2 border-indigo-100 font-black uppercase text-lg shadow-inner outline-none focus:border-indigo-500 transition-all" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>
              <div className="flex-1 overflow-y-auto p-8 space-y-6 no-scrollbar bg-slate-50">
                {inventory.filter(p => (p.productName?.includes(searchQuery.toUpperCase()) || p.productId?.includes(searchQuery.toUpperCase())) && searchQuery.length > 0).map(p => (
                   <div key={p.id} className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm space-y-4">
                      <div className="flex justify-between items-start">
                         <div>
                            <span className="text-[10px] font-black bg-indigo-100 text-indigo-600 px-3 py-1.5 rounded-lg mb-2 inline-block uppercase tracking-widest">{p.productId}</span>
                            <h4 className="text-xl font-black uppercase text-slate-800 leading-tight">{p.productName}</h4>
                         </div>
                         <div className="bg-slate-900 text-white p-3 rounded-2xl text-center min-w-[60px]">
                            <p className="text-[9px] font-black opacity-50 uppercase mb-1">Local</p>
                            <p className="text-sm font-black italic">{p.rack}{LEVEL_LABELS[p.level-1]}{p.position}</p>
                         </div>
                      </div>
                      <div className="pt-4 border-t border-slate-50 flex justify-between items-center text-xs font-black">
                         <span className="text-slate-400 uppercase">Quantidade:</span>
                         <span className="text-indigo-600 text-lg">{p.quantity} UN</span>
                      </div>
                   </div>
                ))}
              </div>
           </div>
        </div>
      )}

      {/* BAIXA (MODAL DE QUANTIDADE) */}
      {scannedPosition && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[4100] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-md rounded-[4rem] shadow-2xl p-10 animate-in zoom-in-95 flex flex-col">
            <header className="flex justify-between items-center mb-10">
              <h3 className="font-black text-2xl uppercase italic text-rose-600 tracking-tighter">Retirar do Estoque</h3>
              <button onClick={() => setScannedPosition(null)} className="p-4 bg-slate-100 rounded-2xl"><X size={24}/></button>
            </header>
            <div className="bg-rose-50 p-8 rounded-[3rem] border-2 border-rose-100 mb-10 text-center">
               <span className="text-[10px] font-black bg-rose-200 text-rose-700 px-4 py-1.5 rounded-full mb-4 inline-block uppercase tracking-widest">LOCAL: {scannedPosition.rack}{LEVEL_LABELS[scannedPosition.level-1]}{scannedPosition.position}</span>
               <h4 className="text-2xl font-black uppercase text-rose-950 leading-tight">{scannedPosition.productName}</h4>
               <p className="text-sm font-bold text-rose-600 mt-2">Saldo Atual: {scannedPosition.quantity} un</p>
            </div>

            <div className="flex gap-4 mb-6">
               <button 
                 onClick={() => setExitQuantity(scannedPosition.quantity || 0)}
                 className="flex-1 p-4 bg-slate-100 hover:bg-slate-200 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-600 transition-all"
               >
                 Toda Quantidade
               </button>
               <button 
                 onClick={() => setExitQuantity('')}
                 className="flex-1 p-4 bg-slate-100 hover:bg-slate-200 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-600 transition-all"
               >
                 Limpar
               </button>
            </div>

            <div className="space-y-4 mb-10">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-6 tracking-widest">Qtd Retirada (Parcial ou Total)</label>
              <input type="number" placeholder="00" autoFocus className="w-full p-10 bg-slate-50 rounded-[3rem] font-black text-6xl text-center outline-none border-4 border-transparent focus:border-rose-500 shadow-inner" value={exitQuantity} onChange={e => setExitQuantity(e.target.value)} />
            </div>
            <button onClick={handleProcessExit} className="w-full bg-rose-600 text-white p-8 rounded-[3rem] font-black text-2xl uppercase tracking-widest shadow-2xl active:scale-95 transition-all">CONFIRMAR BAIXA</button>
          </div>
        </div>
      )}

      {/* MODAL SCANNER (BIPAR ETIQUETA) */}
      {isScannerOpen && (
        <ScannerModal 
          onScan={handleScanCode} 
          onClose={() => setIsScannerOpen(false)} 
        />
      )}

      {/* MOBILE BOTTOM NAV */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-3 flex justify-around items-center lg:hidden z-[1000]">
        <button onClick={() => setViewMode('grid')} className={`flex flex-col items-center gap-1 p-2 ${viewMode === 'grid' ? 'text-indigo-600' : 'text-slate-400'}`}>
          <LayoutGrid size={24}/>
          <span className="text-[8px] font-black uppercase">Mapa</span>
        </button>
        <button onClick={() => setIsScannerOpen(true)} className="bg-indigo-600 text-white w-16 h-16 rounded-full flex items-center justify-center -translate-y-10 shadow-2xl shadow-indigo-500/50 border-4 border-slate-50 active:scale-90 transition-all">
          <ScanLine size={28}/>
        </button>
        <button onClick={() => setIsMobileMenuOpen(true)} className="flex flex-col items-center gap-1 p-2 text-slate-400">
          <Menu size={24}/>
          <span className="text-[8px] font-black uppercase">Menu</span>
        </button>
      </nav>

      {/* MOBILE MENU OVERLAY */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[4000] flex justify-end animate-in fade-in duration-300"
          onClick={() => setIsMobileMenuOpen(false)}
        >
           <div 
             className="w-[85%] max-w-sm h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-500"
             onClick={(e) => e.stopPropagation()}
           >
              {/* Header do Menu */}
              <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                 <div>
                    <h3 className="font-black text-xl uppercase italic tracking-tighter text-slate-800">Menu Principal</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Gestão de Almoxarifado</p>
                 </div>
                 <button 
                   onClick={() => setIsMobileMenuOpen(false)} 
                   className="p-3 bg-white rounded-2xl shadow-sm border border-slate-100 text-slate-400 active:scale-90 transition-all"
                 >
                   <X size={24}/>
                 </button>
              </div>

              {/* Itens do Menu */}
              <div className="flex-1 p-6 space-y-4 overflow-y-auto no-scrollbar">
                <button 
                  onClick={() => { setIsMobileMenuOpen(false); setIsMasterMenuOpen(true); }} 
                  className="w-full group flex items-center justify-between p-5 rounded-[2rem] bg-slate-50 border border-transparent active:border-indigo-100 active:bg-indigo-50/50 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="bg-indigo-600 p-3.5 rounded-2xl shadow-lg shadow-indigo-600/20 text-white">
                      <ClipboardList size={22}/>
                    </div>
                    <span className="font-black uppercase italic tracking-tighter text-slate-700">Cadastro SKU</span>
                  </div>
                  <ChevronRight size={18} className="text-slate-300 group-active:text-indigo-400" />
                </button>

                <button 
                  onClick={() => { setIsMobileMenuOpen(false); setIsPrintMenuOpen(true); }} 
                  className="w-full group flex items-center justify-between p-5 rounded-[2rem] bg-slate-50 border border-transparent active:border-indigo-100 active:bg-indigo-50/50 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="bg-indigo-600 p-3.5 rounded-2xl shadow-lg shadow-indigo-600/20 text-white">
                      <Printer size={22}/>
                    </div>
                    <span className="font-black uppercase italic tracking-tighter text-slate-700">Impressão QR</span>
                  </div>
                  <ChevronRight size={18} className="text-slate-300 group-active:text-indigo-400" />
                </button>

                <div className="pt-6 mt-6 border-t border-slate-100">
                  <button 
                    onClick={handleLogout} 
                    className="w-full flex items-center gap-4 p-5 rounded-[2rem] text-rose-500 bg-rose-50/50 border border-rose-100 active:bg-rose-100 transition-all"
                  >
                    <div className="bg-rose-600 p-3.5 rounded-2xl shadow-lg shadow-rose-600/20 text-white">
                      <LogOut size={22}/>
                    </div>
                    <span className="font-black uppercase italic tracking-tighter">Encerrar Sessão</span>
                  </button>
                </div>
              </div>

              {/* Rodapé do Menu */}
              <div className="p-8 border-t border-slate-50 bg-slate-50/50">
                <div className="flex items-center justify-center gap-2 grayscale opacity-50 mb-4">
                  <Warehouse className="w-4 h-4 text-slate-400" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Logística Shopee</span>
                </div>
                <p className="text-center text-[9px] text-slate-300 font-bold uppercase tracking-[0.3em] italic">Versão 2026.1</p>
              </div>
           </div>
        </div>
      )}

      {/* MODAL QR SIMPLES */}
      {showQR && <QRCodeModal position={showQR} onClose={() => setShowQR(null)} />}
    </div>
  );
};

export default App;
