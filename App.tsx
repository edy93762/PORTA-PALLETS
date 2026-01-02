
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Package, Warehouse, Search, LayoutGrid, QrCode, TrendingUp, Box, 
  Save, X, MapPin, ScanLine, Settings, 
  HardDrive, AlertCircle, CheckCircle2,
  Printer, FileDown, Check, ArrowRight, Loader2, LogOut, Minus, Activity, Cloud, Keyboard, Camera, ChevronRight, Hash, Layers, Plus, Lock, KeyRound, User, Eye, EyeOff
} from 'lucide-react';
import { PalletPosition, RackId } from './types';
import { QRCodeModal } from './components/QRCodeModal';
import { initializeDatabase, fetchInventoryFromDB, saveItemToDB, deleteItemFromDB } from './services/neonService';
import { Html5Qrcode } from 'html5-qrcode';
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { QRCodeSVG } from 'qrcode.react';

// DEFINIÇÃO DOS RACKS: 4 Porta Paletes (A, B, C, D)
const RACKS: RackId[] = ['A', 'B', 'C', 'D'];
const LEVEL_LABELS = ['A', 'B', 'C', 'D', 'E'];
const POSITIONS_PER_LEVEL = 66;

// CREDENCIAIS DE ACESSO
const APP_USERNAME = "almox";
const APP_PASSWORD = "Shopee@2026";

// CONFIGURAÇÃO DE SESSÃO (1 HORA EM MILISSEGUNDOS)
const SESSION_DURATION_MS = 60 * 60 * 1000; 

// STRING DE CONEXÃO FIXA DO NEON DB
const FIXED_DB_STRING = "postgresql://neondb_owner:npg_JaZLTzrqMc09@ep-fragrant-cherry-ac95x95d-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require";

const App: React.FC = () => {
  // --- ESTADOS DE AUTENTICAÇÃO ---
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    const loggedIn = localStorage.getItem('isLoggedIn') === 'true';
    const loginTime = localStorage.getItem('loginTime');
    
    if (loggedIn && loginTime) {
      const now = Date.now();
      if (now - parseInt(loginTime) < SESSION_DURATION_MS) {
        return true;
      }
    }
    // Limpa se expirou ou não existe
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('loginTime');
    return false;
  });

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState(false);

  // --- ESTADOS DO APP ---
  const [inventory, setInventory] = useState<PalletPosition[]>([]);
  const [activeRack, setActiveRack] = useState<RackId>('A');
  const [activeLevelIndex, setActiveLevelIndex] = useState<number>(0); 
  const [selectedPosition, setSelectedPosition] = useState<PalletPosition | null>(null);
  
  const [isDbConnected, setIsDbConnected] = useState(false);
  const [isLoadingDb, setIsLoadingDb] = useState(false);

  const [scannedPosition, setScannedPosition] = useState<PalletPosition | null>(null);
  const [exitQuantity, setExitQuantity] = useState<number | string>(''); 
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isManualScannerMode, setIsManualScannerMode] = useState(false); 
  const [manualEntryData, setManualEntryData] = useState({ rack: 'A' as RackId, level: 1, pos: 1 });
  
  const [showQR, setShowQR] = useState<{ rack: string; level: number; pos: number } | null>(null);
  const [isPrintMenuOpen, setIsPrintMenuOpen] = useState(false);
  const [printMenuTab, setPrintMenuTab] = useState<'single' | 'batch'>('single');
  const [isSearchOpen, setIsSearchOpen] = useState(false); 
  const [searchQuery, setSearchQuery] = useState(''); 
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  
  const [singlePrintData, setSinglePrintData] = useState({ rack: 'A' as RackId, level: 1, pos: 1 });
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  const [printFilter, setPrintFilter] = useState<{
    rack: RackId | 'ALL',
    startLevel: number,
    endLevel: number,
    startPos: number,
    endPos: number
  }>({
    rack: 'A',
    startLevel: 1,
    endLevel: 5,
    startPos: 1,
    endPos: 66
  });

  const getLevelLetter = (lvlIndex: number) => LEVEL_LABELS[lvlIndex] || (lvlIndex + 1).toString();

  // Monitora expiração de sessão
  useEffect(() => {
    if (isLoggedIn) {
      const checkInterval = setInterval(() => {
        const loginTime = localStorage.getItem('loginTime');
        if (loginTime) {
          if (Date.now() - parseInt(loginTime) >= SESSION_DURATION_MS) {
            handleLogout();
            showFeedback('error', 'Sessão expirada. Entre novamente.');
          }
        }
      }, 30000); // Checa a cada 30 segundos

      return () => clearInterval(checkInterval);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn) {
      loadFromNeon(FIXED_DB_STRING);
    }
  }, [isLoggedIn]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginUsername === APP_USERNAME && loginPassword === APP_PASSWORD) {
      const now = Date.now().toString();
      setIsLoggedIn(true);
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('loginTime', now);
      setLoginError(false);
    } else {
      setLoginError(true);
      setLoginPassword('');
      setTimeout(() => setLoginError(false), 2000);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('loginTime');
    setLoginUsername('');
    setLoginPassword('');
    setShowPassword(false);
  };

  const loadFromNeon = async (str: string) => {
    setIsLoadingDb(true);
    try {
      await initializeDatabase(str);
      const data = await fetchInventoryFromDB(str);
      setInventory(data);
      setIsDbConnected(true);
      showFeedback('success', 'Sincronizado com o Banco!');
    } catch (error) {
      console.error(error);
      setIsDbConnected(false);
      showFeedback('error', 'Erro na conexão com Banco.');
      const savedInv = localStorage.getItem('rackmaster-local-data');
      if (savedInv) {
        try {
          setInventory(JSON.parse(savedInv));
          showFeedback('error', 'Usando dados offline temporários.');
        } catch (e) { console.error("Erro ao carregar dados locais"); }
      }
    } finally {
      setIsLoadingDb(false);
    }
  };

  const showFeedback = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  useEffect(() => {
    if (isScannerOpen && !isManualScannerMode) {
      const startScanner = async () => {
        try {
          const html5QrCode = new Html5Qrcode("reader");
          html5QrCodeRef.current = html5QrCode;
          
          await html5QrCode.start(
            { facingMode: "environment" }, 
            {
              fps: 10,
              qrbox: { width: 250, height: 250 },
            },
            (decodedText) => {
              const parts = decodedText.split('-');
              if (parts.length >= 6 && parts[0] === 'PP') {
                const rack = parts[1] as RackId;
                const level = parseInt(parts[3]);
                const pos = parseInt(parts[5]);

                if (RACKS.includes(rack) && !isNaN(level) && !isNaN(pos)) {
                  stopScanner();
                  handleScanSuccess(rack, level, pos);
                } else {
                  showFeedback('error', "QR Code inválido.");
                }
              } else {
                showFeedback('error', "QR Code não reconhecido.");
              }
            },
            () => {}
          );
        } catch (err) {
          console.error("Erro ao iniciar scanner:", err);
          showFeedback('error', "Não foi possível acessar a câmera traseira.");
          setIsManualScannerMode(true);
        }
      };

      startScanner();

      return () => {
        stopScanner();
      };
    }
  }, [isScannerOpen, isManualScannerMode]);

  const stopScanner = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current = null;
      } catch (e) {
        console.error("Erro ao parar scanner:", e);
      }
    }
  };

  const groupedSearchResults = useMemo(() => {
    const q = searchQuery.toUpperCase().trim();
    if (!q) return [];
    const matches = inventory.filter(p => p.productId?.includes(q) || p.productName?.includes(q));
    const groups: Record<string, { productId: string, productName: string, totalQty: number, locations: PalletPosition[] }> = {};
    matches.forEach(item => {
      const id = item.productId || 'SEM_ID';
      if (!groups[id]) {
        groups[id] = { productId: id, productName: item.productName || 'SEM NOME', totalQty: 0, locations: [] };
      }
      groups[id].totalQty += (item.quantity || 0);
      groups[id].locations.push(item);
    });
    return Object.values(groups);
  }, [searchQuery, inventory]);

  const handleScanSuccess = (rack: RackId, level: number, pos: number) => {
    setIsScannerOpen(false);
    setIsManualScannerMode(false);
    const existing = inventory.find(p => p.rack === rack && p.level === level && p.position === pos);
    if (existing && existing.productId) {
      setExitQuantity(''); 
      setScannedPosition(existing);
      showFeedback('success', 'Item localizado!');
    } else {
      showFeedback('error', 'Posição vazia no sistema.');
    }
  };

  const handleManualScanSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      handleScanSuccess(manualEntryData.rack, manualEntryData.level, manualEntryData.pos);
  };

  const handleProcessExit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedPosition) return;
    const qtdToRemove = Number(exitQuantity);
    const currentQty = scannedPosition.quantity || 0;
    if (isNaN(qtdToRemove) || qtdToRemove <= 0) {
      showFeedback('error', 'Digite uma quantidade válida.');
      return;
    }
    if (qtdToRemove > currentQty) {
      showFeedback('error', 'Quantidade superior ao saldo.');
      return;
    }
    let newInv = inventory.filter(p => p.id !== scannedPosition.id);
    let updatedItem: PalletPosition | null = null;
    if (qtdToRemove < currentQty) {
      updatedItem = { ...scannedPosition, quantity: currentQty - qtdToRemove, lastUpdated: new Date().toISOString() };
      newInv.push(updatedItem);
    }
    setInventory(newInv);
    if (isDbConnected) {
      try {
        if (updatedItem) await saveItemToDB(FIXED_DB_STRING, updatedItem);
        else await deleteItemFromDB(FIXED_DB_STRING, scannedPosition);
        showFeedback('success', 'Baixa realizada com sucesso!');
      } catch (err) { showFeedback('error', 'Erro ao sincronizar com banco.'); }
    }
    setScannedPosition(null);
  };

  const handlePositionClick = (rack: RackId, levelIdx: number, pos: number) => {
    const existing = inventory.find(p => p.rack === rack && p.level === (levelIdx + 1) && p.position === pos);
    setSelectedPosition(existing || {
      id: `${rack}${getLevelLetter(levelIdx)}${pos}`,
      rack, level: levelIdx + 1, position: pos,
      productId: '', productName: '', quantity: 0
    });
  };

  const handleSavePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPosition) return;
    if (!selectedPosition.productId?.trim() || !selectedPosition.productName?.trim() || (selectedPosition.quantity || 0) <= 0) {
      showFeedback('error', 'Preencha todos os campos obrigatórios!');
      return;
    }
    const itemToSave = { 
      ...selectedPosition, 
      productId: selectedPosition.productId.toUpperCase().trim(),
      productName: selectedPosition.productName.toUpperCase().trim(),
      lastUpdated: new Date().toISOString() 
    };
    const newInv = inventory.filter(p => p.id !== selectedPosition.id);
    newInv.push(itemToSave);
    setInventory(newInv);
    if (isDbConnected) {
      try {
        await saveItemToDB(FIXED_DB_STRING, itemToSave);
        showFeedback('success', 'Entrada salva!');
      } catch (err) { showFeedback('error', 'Erro ao salvar.'); }
    }
    setShowQR({ rack: itemToSave.rack, level: itemToSave.level, pos: itemToSave.position });
    setSelectedPosition(null);
  };

  const stats = useMemo(() => {
    const total = RACKS.length * LEVEL_LABELS.length * POSITIONS_PER_LEVEL;
    return { totalPositions: total, occupiedPositions: inventory.length, occupancyRate: total > 0 ? Math.round((inventory.length / total) * 100) : 0 };
  }, [inventory]);

  const generatePDF = async () => {
    setIsGeneratingPDF(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const itemsToPrint: {code: string, label: string}[] = [];
      if (printMenuTab === 'single') {
        itemsToPrint.push({ code: `PP-${singlePrintData.rack}-L-${singlePrintData.level}-P-${singlePrintData.pos}`, label: `PP ${singlePrintData.rack} ${getLevelLetter(singlePrintData.level - 1)}${singlePrintData.pos}` });
      } else {
        const racksToProcess = printFilter.rack === 'ALL' ? RACKS : [printFilter.rack];
        for (const r of racksToProcess) {
          for (let l = printFilter.startLevel; l <= printFilter.endLevel; l++) {
            for (let p = printFilter.startPos; p <= printFilter.endPos; p++) {
               const levelLetter = LEVEL_LABELS[l - 1];
               itemsToPrint.push({ code: `PP-${r}-L-${l}-P-${p}`, label: `PP ${r} ${levelLetter}${p}` });
            }
          }
        }
      }
      if (itemsToPrint.length === 0) throw new Error("Nada a imprimir");
      for (let i = 0; i < itemsToPrint.length; i++) {
        const item = itemsToPrint[i];
        if (i > 0 && i % 15 === 0) doc.addPage();
        const idxOnPage = i % 15;
        const col = idxOnPage % 3;
        const row = Math.floor(idxOnPage / 3);
        const x = 15 + (col * 55);
        const y = 15 + (row * 55);
        doc.setDrawColor(200); doc.rect(x, y, 50, 50);
        const qrDataUrl = await QRCode.toDataURL(item.code, { margin: 1 });
        doc.addImage(qrDataUrl, 'PNG', x + 7.5, y + 8, 35, 35);
        doc.setFontSize(12); doc.text(item.label, x + 25, y + 6, { align: "center" });
        doc.setFontSize(6); doc.text(item.code, x + 25, y + 48, { align: "center" });
      }
      doc.save(`etiquetas_${printMenuTab === 'single' ? 'unica' : 'lote'}.pdf`);
      showFeedback('success', 'PDF gerado!');
      setIsPrintMenuOpen(false);
    } catch (err) { showFeedback('error', 'Falha ao gerar etiquetas.'); } finally { setIsGeneratingPDF(false); }
  };

  // --- RENDERIZAÇÃO DA TELA DE LOGIN ---
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Background Decorativo */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/20 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-900/40 blur-[120px] rounded-full"></div>

        <div className="w-full max-w-sm z-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="flex flex-col items-center mb-10 text-center">
            <div className="bg-indigo-600 p-5 rounded-[2.5rem] shadow-2xl shadow-indigo-500/20 mb-6">
              <Warehouse className="text-white w-12 h-12" />
            </div>
            <h1 className="text-4xl font-black text-white italic tracking-tighter uppercase">Porta Pallets</h1>
            <p className="text-indigo-400 font-bold uppercase text-[10px] tracking-[0.4em] mt-2">Sistema de Gestão Logística</p>
          </div>

          <form onSubmit={handleLogin} className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-[3rem] shadow-2xl space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em] ml-2">Usuário</label>
                <div className="relative group">
                  <input 
                    type="text" 
                    autoFocus
                    placeholder="DIGITE O USUÁRIO..." 
                    className={`w-full bg-white/5 border-2 ${loginError ? 'border-rose-500 bg-rose-500/10' : 'border-white/10 group-hover:border-indigo-500/50'} p-4 pl-12 rounded-2xl text-white font-black outline-none transition-all placeholder:text-white/20`}
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                  />
                  <User className={`absolute left-4 top-1/2 -translate-y-1/2 ${loginError ? 'text-rose-500' : 'text-white/20'} transition-colors`} size={18} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em] ml-2">Senha</label>
                <div className="relative group">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    placeholder="DIGITE A SENHA..." 
                    className={`w-full bg-white/5 border-2 ${loginError ? 'border-rose-500 bg-rose-500/10' : 'border-white/10 group-hover:border-indigo-500/50'} p-4 pl-12 pr-12 rounded-2xl text-white font-black outline-none transition-all placeholder:text-white/20`}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                  />
                  <Lock className={`absolute left-4 top-1/2 -translate-y-1/2 ${loginError ? 'text-rose-500' : 'text-white/20'} transition-colors`} size={18} />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            <button 
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white p-5 rounded-3xl font-black uppercase tracking-widest shadow-2xl shadow-indigo-500/20 flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-95 group"
            >
              ENTRAR NO SISTEMA <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>

            {loginError && (
              <p className="text-rose-500 text-center font-black text-[10px] uppercase tracking-widest animate-pulse">Credenciais Incorretas</p>
            )}
            
            <p className="text-white/20 text-center font-bold text-[8px] uppercase tracking-[0.15em]">Sessão expira em 1 hora de uso</p>
          </form>

          <p className="text-center mt-10 text-white/20 font-bold text-[9px] uppercase tracking-[0.2em]">Versão 2.4.5 • Enterprise Edition</p>
        </div>
      </div>
    );
  }

  // --- RENDERIZAÇÃO DO APP PRINCIPAL ---
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row font-sans text-slate-900 overflow-x-hidden">
      <div className="flex flex-col lg:flex-row w-full">
        {feedback && (
          <div className={`fixed top-4 right-4 md:top-6 md:right-6 z-[900] p-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-right-10 ${feedback.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
            {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span className="font-bold text-xs md:text-sm">{feedback.msg}</span>
          </div>
        )}

        {isGeneratingPDF && (
          <div className="fixed inset-0 z-[1000] bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center text-white p-6">
            <Loader2 className="w-12 h-12 md:w-16 md:h-16 animate-spin mb-4" />
            <p className="font-black text-xl md:text-2xl uppercase tracking-tighter italic text-center">Gerando Etiquetas</p>
            <p className="text-indigo-200 animate-pulse font-bold uppercase text-[9px] md:text-[10px] mt-2 tracking-widest text-center max-w-xs">Organizando endereços no arquivo PDF...</p>
          </div>
        )}

        <aside className="w-full lg:w-72 bg-white border-b lg:border-r border-slate-200 p-4 lg:p-6 flex flex-col gap-6 lg:gap-8 h-auto lg:h-screen lg:sticky lg:top-0 shrink-0">
          <div className="flex items-center gap-3">
            <Warehouse className="text-indigo-600 w-7 h-7 md:w-8 md:h-8" />
            <div>
              <h1 className="text-lg md:text-xl font-bold italic tracking-tighter leading-tight">Porta Pallets</h1>
              <p className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-0.5">Gestão Logística</p>
            </div>
          </div>
          <nav className="grid grid-cols-2 lg:flex lg:flex-col gap-2">
            <button onClick={() => setIsSearchOpen(true)} className="flex items-center justify-center lg:justify-start gap-2 md:gap-3 p-3 md:p-4 bg-indigo-600 text-white rounded-xl md:rounded-2xl font-black shadow-lg hover:scale-[1.03] transition-transform uppercase text-[10px] md:text-xs tracking-widest italic col-span-2 lg:col-span-1"><Search size={16} /> Consultar Item</button>
            <button onClick={() => { setIsScannerOpen(true); setIsManualScannerMode(false); }} className="flex items-center justify-center lg:justify-start gap-2 md:gap-3 p-3 md:p-4 text-slate-500 hover:bg-slate-100 rounded-xl md:rounded-2xl transition-all font-bold text-[10px] md:text-xs uppercase tracking-widest"><ScanLine size={16} /> Saída</button>
            <button onClick={() => setIsPrintMenuOpen(true)} className="flex items-center justify-center lg:justify-start gap-2 md:gap-3 p-3 md:p-4 text-indigo-600 hover:bg-indigo-50 rounded-xl md:rounded-2xl transition-all border-2 border-indigo-50 lg:border-indigo-100 font-black text-[10px] md:text-xs uppercase tracking-widest"><Printer size={16} /> Etiquetas</button>
            
            <button 
              onClick={handleLogout} 
              className="flex items-center justify-center lg:justify-start gap-2 md:gap-3 p-3 md:p-4 text-rose-500 hover:bg-rose-50 rounded-xl md:rounded-2xl transition-all font-black text-[10px] md:text-xs uppercase tracking-widest lg:mt-auto border-2 border-transparent hover:border-rose-100"
            >
              <LogOut size={16} /> Sair
            </button>
          </nav>
        </aside>

        <main className="flex-1 p-4 md:p-6 lg:p-10 overflow-hidden">
          <header className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6 mb-6 md:mb-10">
            <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
              <div><p className="text-[8px] md:text-[10px] text-slate-400 font-bold uppercase mb-1">Ocupados</p><h2 className="text-2xl md:text-4xl font-black">{stats.occupiedPositions}</h2></div>
              <Box className="text-indigo-100 w-8 h-8 md:w-12 md:h-12" />
            </div>
            <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
              <div><p className="text-[8px] md:text-[10px] text-slate-400 font-bold uppercase mb-1">Vagas</p><h2 className="text-2xl md:text-4xl font-black">{stats.totalPositions - stats.occupiedPositions}</h2></div>
              <LayoutGrid className="text-emerald-100 w-8 h-8 md:w-12 md:h-12" />
            </div>
            <div className="bg-indigo-600 text-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-lg flex items-center justify-between col-span-2 md:col-span-1">
              <div><p className="text-[8px] md:text-[10px] text-indigo-200 font-bold uppercase mb-1">Ocupação</p><h2 className="text-2xl md:text-4xl font-black">{stats.occupancyRate}%</h2></div>
              <TrendingUp className="text-indigo-300 w-8 h-8 md:w-12 md:h-12" />
            </div>
          </header>

          <div className="bg-white p-4 md:p-6 lg:p-10 rounded-3xl md:rounded-[3rem] shadow-sm border border-slate-100">
            <div className="flex flex-col gap-4 mb-6 md:mb-8">
              <div className="overflow-x-auto no-scrollbar pb-2">
                <div className="flex gap-2 bg-slate-100 p-1 rounded-xl md:rounded-2xl w-max">
                  {RACKS.map(r => (
                    <button key={r} onClick={() => setActiveRack(r)} className={`px-4 md:px-6 py-2 md:py-3 rounded-lg md:rounded-xl font-black transition-all whitespace-nowrap text-[10px] md:text-xs ${activeRack === r ? 'bg-white text-indigo-600 shadow-sm scale-105' : 'text-slate-400 hover:text-slate-600'}`}>PORTA PALLET {r}</button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto no-scrollbar">
                <div className="flex gap-2 w-max">
                  {LEVEL_LABELS.map((l, idx) => (
                    <button key={l} onClick={() => setActiveLevelIndex(idx)} className={`w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-lg md:rounded-2xl font-black transition-all text-xs md:text-sm ${activeLevelIndex === idx ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>{l}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-11 gap-2 md:gap-3 max-h-[50vh] md:max-h-[60vh] overflow-y-auto no-scrollbar pt-2 md:pt-4 px-1">
              {Array.from({ length: POSITIONS_PER_LEVEL }).map((_, i) => {
                const pos = i + 1;
                const occ = inventory.find(p => p.rack === activeRack && p.level === (activeLevelIndex + 1) && p.position === pos);
                return (
                  <button key={pos} onClick={() => handlePositionClick(activeRack, activeLevelIndex, pos)} className={`aspect-square rounded-xl md:rounded-2xl flex flex-col items-center justify-center border-2 transition-all hover:scale-110 active:scale-95 ${occ ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-sm' : 'bg-slate-50 border-transparent text-slate-300'}`}>
                    <span className="text-[8px] md:text-[10px] font-black">{LEVEL_LABELS[activeLevelIndex]}{pos}</span>
                    {occ && <Package size={14} className="mt-0.5 md:mt-1 md:w-4 md:h-4" />}
                  </button>
                );
              })}
            </div>
          </div>
        </main>
      </div>

      {/* MODAL DE SAÍDA */}
      {scannedPosition && (
        <div className="fixed inset-0 bg-rose-950/70 backdrop-blur-md z-[800] flex items-center justify-center p-3 md:p-4">
          <div className="bg-white rounded-3xl md:rounded-[3rem] w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 border-[4px] md:border-[6px] border-rose-100 flex flex-col max-h-[90vh]">
            <div className="p-5 md:p-8 bg-rose-600 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="bg-white/20 p-2 rounded-xl md:rounded-2xl"><LogOut size={22} className="md:w-7 md:h-7" /></div>
                <div>
                  <h3 className="font-black text-lg md:text-2xl uppercase tracking-tighter italic leading-none">Baixa</h3>
                  <p className="text-[8px] md:text-[10px] font-bold opacity-80 uppercase tracking-widest mt-1">Confirmar retirada</p>
                </div>
              </div>
              <button onClick={() => setScannedPosition(null)} className="p-2 hover:bg-white/10 rounded-xl transition-colors"><X /></button>
            </div>

            <form onSubmit={handleProcessExit} className="p-5 md:p-8 space-y-6 md:space-y-8 overflow-y-auto no-scrollbar">
              <div className="bg-rose-50 p-4 md:p-6 rounded-2xl md:rounded-[2.5rem] border-2 border-rose-100 flex flex-col items-center text-center shadow-inner">
                <div className="flex gap-2 mb-3">
                  <span className="bg-rose-600 text-white px-2 md:px-3 py-0.5 md:py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">PP {scannedPosition.rack}</span>
                  <span className="bg-rose-200 text-rose-800 px-2 md:px-3 py-0.5 md:py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">{getLevelLetter(scannedPosition.level - 1)}{scannedPosition.position}</span>
                </div>
                <h2 className="text-xl md:text-2xl font-black text-rose-900 leading-tight uppercase mb-1">{scannedPosition.productName}</h2>
                <p className="text-[10px] md:text-xs font-bold text-rose-400 uppercase tracking-[0.2em] mb-4">ID: {scannedPosition.productId}</p>
                <div className="bg-white px-6 md:px-8 py-3 md:py-4 rounded-xl md:rounded-[1.5rem] border-2 border-rose-100 shadow-sm">
                  <span className="text-[8px] md:text-[10px] font-black text-rose-300 uppercase block leading-none mb-1">Disponível</span>
                  <span className="text-3xl md:text-4xl font-black text-rose-600">{scannedPosition.quantity} <span className="text-xs md:text-sm">un</span></span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <input 
                    type="number" 
                    placeholder="Qtd..." 
                    autoFocus
                    className="w-full p-4 md:p-6 pl-12 md:pl-16 bg-slate-50 rounded-2xl md:rounded-[2.5rem] font-black text-3xl md:text-4xl border-2 border-slate-200 focus:border-rose-500 focus:bg-white outline-none transition-all text-rose-600 shadow-inner text-center" 
                    value={exitQuantity} 
                    onChange={e => setExitQuantity(e.target.value)} 
                  />
                  <Minus className="absolute left-6 md:left-8 top-1/2 -translate-y-1/2 text-rose-300 w-6 h-6 md:w-7 md:h-7" />
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {[1, 5, 10].map(val => (
                    <button 
                      key={val} 
                      type="button"
                      onClick={() => setExitQuantity(val)} 
                      className={`py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-xs md:text-sm border-2 transition-all ${Number(exitQuantity) === val ? 'bg-rose-600 border-rose-600 text-white shadow-lg scale-105' : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-200'}`}
                    >
                      +{val}
                    </button>
                  ))}
                  <button 
                    type="button"
                    onClick={() => setExitQuantity(scannedPosition.quantity || 0)} 
                    className={`py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-[10px] uppercase tracking-tighter border-2 transition-all shadow-sm ${Number(exitQuantity) === scannedPosition.quantity ? 'bg-rose-900 border-rose-900 text-white' : 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100'}`}
                  >
                    TUDO
                  </button>
                </div>
              </div>
              
              <button 
                type="submit" 
                className="w-full bg-rose-600 hover:bg-rose-700 text-white p-5 md:p-7 rounded-2xl md:rounded-[2.5rem] font-black text-lg md:text-xl shadow-2xl shadow-rose-200 uppercase tracking-widest flex items-center justify-center gap-3 transition-all hover:scale-[1.03] active:scale-95 group"
              >
                BAIXAR <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE ETIQUETAS */}
      {isPrintMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[700] flex items-center justify-center p-3 md:p-4">
          <div className="bg-white rounded-3xl md:rounded-[3rem] w-full max-w-4xl max-h-[95vh] md:max-h-[90vh] overflow-hidden shadow-2xl animate-in zoom-in-95 flex flex-col lg:flex-row">
            
            <div className="flex-1 flex flex-col border-b lg:border-r border-slate-100 overflow-y-auto no-scrollbar">
              <div className="p-6 md:p-8 bg-slate-900 text-white flex justify-between items-center sticky top-0 z-10">
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="bg-indigo-500 p-2 rounded-xl md:rounded-2xl shadow-lg"><Printer size={24} className="md:w-7 md:h-7" /></div>
                  <div>
                    <h3 className="font-black text-lg md:text-2xl uppercase tracking-tighter italic leading-none">Etiquetas</h3>
                    <p className="text-[8px] md:text-[10px] font-bold opacity-50 uppercase tracking-widest mt-1">Impressão Logística</p>
                  </div>
                </div>
                <button onClick={() => setIsPrintMenuOpen(false)} className="lg:hidden p-2 hover:bg-white/10 rounded-xl"><X /></button>
              </div>

              <div className="flex bg-slate-100 p-1.5 md:p-2 m-4 md:m-8 rounded-2xl md:rounded-[1.8rem] shrink-0 shadow-inner">
                <button 
                  onClick={() => setPrintMenuTab('single')} 
                  className={`flex-1 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${printMenuTab === 'single' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Hash size={14} /> Unidade
                </button>
                <button 
                  onClick={() => setPrintMenuTab('batch')} 
                  className={`flex-1 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${printMenuTab === 'batch' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Layers size={14} /> Lote
                </button>
              </div>
              
              <div className="px-4 md:px-8 pb-6 md:pb-8 space-y-6 md:space-y-10">
                {printMenuTab === 'single' ? (
                  <div className="space-y-6 md:space-y-8 animate-in slide-in-from-left-4">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 ml-1"><MapPin size={12}/> Porta Pallet</label>
                      <div className="grid grid-cols-4 gap-2 md:gap-3">
                        {RACKS.map(r => (
                          <button key={r} onClick={() => setSinglePrintData({...singlePrintData, rack: r})} className={`p-3 md:p-5 rounded-xl md:rounded-2xl font-black transition-all text-sm border-2 ${singlePrintData.rack === r ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg scale-105' : 'bg-slate-50 border-transparent text-slate-400 hover:bg-slate-100'}`}>{r}</button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 md:gap-6">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 ml-1"><Activity size={12}/> Nível</label>
                        <select className="w-full p-4 md:p-5 bg-slate-50 rounded-xl md:rounded-2xl font-black text-slate-700 border-2 border-transparent focus:border-indigo-500 outline-none shadow-sm text-sm" value={singlePrintData.level} onChange={e => setSinglePrintData({...singlePrintData, level: parseInt(e.target.value)})}>
                          {LEVEL_LABELS.map((l, i) => <option key={l} value={i+1}>Nível {l}</option>)}
                        </select>
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 ml-1"><LayoutGrid size={12}/> Posição</label>
                        <input type="number" min="1" max="66" className="w-full p-4 md:p-5 bg-slate-50 rounded-xl md:rounded-2xl font-black text-slate-700 border-2 border-transparent focus:border-indigo-500 outline-none shadow-sm text-sm" placeholder="Ex: 22" value={singlePrintData.pos} onChange={e => setSinglePrintData({...singlePrintData, pos: parseInt(e.target.value) || 1})} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6 md:space-y-8 animate-in slide-in-from-left-4">
                    <div className="grid grid-cols-2 gap-3 md:gap-4">
                      <button onClick={() => setPrintFilter({...printFilter, rack: 'ALL'})} className={`p-4 md:p-6 rounded-2xl md:rounded-[2.5rem] border-2 text-left transition-all relative overflow-hidden group ${printFilter.rack === 'ALL' ? 'bg-indigo-50 border-indigo-500 shadow-md' : 'bg-slate-50 border-transparent hover:bg-slate-100'}`}>
                        <span className="block font-black text-base md:text-xl mb-1 italic uppercase tracking-tighter">TUDO</span>
                        <span className="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Armazém</span>
                        {printFilter.rack === 'ALL' && <CheckCircle2 className="absolute top-3 right-3 text-indigo-500" size={16}/>}
                      </button>
                      <button onClick={() => setPrintFilter({...printFilter, rack: activeRack})} className={`p-4 md:p-6 rounded-2xl md:rounded-[2.5rem] border-2 text-left transition-all relative group ${printFilter.rack === activeRack ? 'bg-indigo-50 border-indigo-500 shadow-md' : 'bg-slate-50 border-transparent hover:bg-slate-100'}`}>
                        <span className="block font-black text-base md:text-xl mb-1 italic uppercase tracking-tighter">SÓ {activeRack}</span>
                        <span className="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Este Rack</span>
                        {printFilter.rack === activeRack && <CheckCircle2 className="absolute top-3 right-3 text-indigo-500" size={16}/>}
                      </button>
                    </div>

                    <div className="bg-slate-50 p-6 md:p-8 rounded-3xl border-2 border-slate-100 space-y-4 md:space-y-6">
                      <p className="font-black text-[9px] md:text-[11px] uppercase text-slate-400 tracking-[0.2em] flex items-center gap-2">Intervalo de Níveis</p>
                      <div className="grid grid-cols-2 gap-4 md:gap-6">
                        <div className="space-y-1">
                          <span className="text-[8px] md:text-[10px] font-bold text-slate-300 uppercase ml-2">De</span>
                          <select className="w-full p-3 md:p-4 bg-white rounded-xl md:rounded-2xl font-black shadow-sm text-sm" value={printFilter.startLevel} onChange={e => setPrintFilter({...printFilter, startLevel: parseInt(e.target.value)})}>
                            {LEVEL_LABELS.map((l, i) => <option key={l} value={i+1}>{l}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[8px] md:text-[10px] font-bold text-slate-300 uppercase ml-2">Até</span>
                          <select className="w-full p-3 md:p-4 bg-white rounded-xl md:rounded-2xl font-black shadow-sm text-sm" value={printFilter.endLevel} onChange={e => setPrintFilter({...printFilter, endLevel: parseInt(e.target.value)})}>
                            {LEVEL_LABELS.map((l, i) => <option key={l} value={i+1}>{l}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                <button onClick={generatePDF} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-5 md:p-7 rounded-2xl md:rounded-[2.5rem] font-black text-lg md:text-xl uppercase tracking-widest shadow-2xl flex items-center justify-center gap-3 transition-transform active:scale-95 group">
                  <Printer size={20} className="group-hover:rotate-12 transition-transform" /> {printMenuTab === 'single' ? 'Imprimir' : 'Gerar Lote'}
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-50 p-6 md:p-8 flex flex-col items-center justify-center relative min-h-[300px] md:min-h-[400px]">
              <button onClick={() => setIsPrintMenuOpen(false)} className="hidden lg:flex absolute top-8 right-8 p-3 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-2xl shadow-sm transition-all"><X /></button>
              <div className="bg-white w-[240px] h-[240px] md:w-[300px] md:h-[300px] p-6 md:p-8 rounded-3xl md:rounded-[3rem] shadow-xl border-4 border-slate-100 flex flex-col items-center justify-between relative transform rotate-1 md:rotate-2 animate-in zoom-in-50 duration-500">
                <div className="w-full border-b-2 border-slate-100 pb-2 md:pb-3 text-center"><span className="font-black text-lg md:text-2xl text-slate-800 tracking-tighter uppercase">PP {printMenuTab === 'single' ? singlePrintData.rack : (printFilter.rack === 'ALL' ? 'X' : printFilter.rack)} {getLevelLetter((printMenuTab === 'single' ? singlePrintData.level : printFilter.startLevel) - 1)}{printMenuTab === 'single' ? singlePrintData.pos : '??'}</span></div>
                <div className="p-3 bg-white border-2 border-slate-50 rounded-2xl shadow-inner"><QRCodeSVG value={printMenuTab === 'single' ? `PP-${singlePrintData.rack}-L-${singlePrintData.level}-P-${singlePrintData.pos}` : 'LOTE'} size={120} level="H" className="md:w-[140px] md:h-[140px]" /></div>
                <div className="w-full pt-2 md:pt-3 text-center"><span className="font-mono text-[8px] md:text-[10px] text-slate-400 font-black tracking-widest uppercase">{printMenuTab === 'single' ? `PP-${singlePrintData.rack}-L-${singlePrintData.level}-P-${singlePrintData.pos}` : 'DOC_PDF_LOTE'}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ENTRADA */}
      {selectedPosition && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[600] flex items-center justify-center p-3 md:p-4">
          <div className="bg-white rounded-3xl md:rounded-[3rem] w-full max-w-md overflow-hidden animate-in zoom-in-95 shadow-2xl border-[4px] md:border-[6px] border-indigo-50 max-h-[90vh]">
            <div className="p-6 md:p-8 bg-indigo-600 text-white flex justify-between items-center">
              <div>
                <h3 className="font-black text-lg md:text-2xl uppercase tracking-tighter italic leading-none">Armazenar</h3>
                <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-1">{selectedPosition.rack}{getLevelLetter(selectedPosition.level - 1)}{selectedPosition.position}</p>
              </div>
              <button onClick={() => setSelectedPosition(null)} className="p-2 hover:bg-white/10 rounded-xl transition-colors"><X /></button>
            </div>
            <form onSubmit={handleSavePosition} className="p-6 md:p-8 space-y-4 md:space-y-6 overflow-y-auto no-scrollbar">
              <div className="space-y-1">
                <label className="text-[9px] md:text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">ID do Produto *</label>
                <input type="text" placeholder="Ex: SKU-0123" className="w-full p-4 md:p-5 bg-slate-50 rounded-xl md:rounded-2xl font-black uppercase border-2 border-transparent focus:border-indigo-500 outline-none shadow-sm transition-all text-sm" value={selectedPosition.productId || ''} onChange={e => setSelectedPosition({...selectedPosition, productId: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] md:text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Descrição *</label>
                <input type="text" placeholder="Ex: CAIXA ELETRÔNICOS" className="w-full p-4 md:p-5 bg-slate-50 rounded-xl md:rounded-2xl font-black uppercase border-2 border-transparent focus:border-indigo-500 outline-none shadow-sm transition-all text-sm" value={selectedPosition.productName || ''} onChange={e => setSelectedPosition({...selectedPosition, productName: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] md:text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Quantidade *</label>
                <input type="number" placeholder="0" className="w-full p-4 md:p-5 bg-slate-50 rounded-xl md:rounded-2xl font-black border-2 border-transparent focus:border-indigo-500 outline-none shadow-sm transition-all text-sm" value={selectedPosition.quantity || ''} onChange={e => setSelectedPosition({...selectedPosition, quantity: parseInt(e.target.value) || 0})} />
              </div>
              <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-5 md:p-6 rounded-2xl md:rounded-[2.5rem] font-black text-lg md:text-xl uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 transition-transform active:scale-95">Salvar <Save size={20}/></button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONSULTA */}
      {isSearchOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[500] flex items-center justify-center p-2 md:p-4">
          <div className="bg-white rounded-3xl md:rounded-[3.5rem] w-full max-w-2xl h-[95vh] md:h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 border-[4px] md:border-8 border-indigo-50">
            <div className="p-6 md:p-10 bg-indigo-600 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3 md:gap-5">
                <div className="bg-white/20 p-2 md:p-3 rounded-xl md:rounded-2xl shadow-lg"><Search size={24} className="md:w-8 md:h-8" /></div>
                <div>
                  <h3 className="font-black text-xl md:text-3xl uppercase tracking-tighter italic leading-none">Consultar</h3>
                  <p className="text-[9px] md:text-[11px] font-bold opacity-80 uppercase tracking-widest mt-1">Busca de inventário</p>
                </div>
              </div>
              <button onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }} className="p-3 hover:bg-white/10 rounded-xl md:rounded-[1.5rem] transition-colors"><X /></button>
            </div>
            <div className="p-4 md:p-8 bg-indigo-50 border-b border-indigo-100 shrink-0">
              <input type="text" autoFocus placeholder="BUSCAR..." className="w-full p-4 md:p-6 rounded-xl md:rounded-[2rem] border-2 border-indigo-100 bg-white font-black text-lg md:text-xl focus:border-indigo-500 outline-none uppercase shadow-md placeholder:text-slate-300" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4 md:space-y-8 no-scrollbar bg-slate-50">
              {groupedSearchResults.length === 0 && searchQuery && (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 py-20">
                  <Box size={60} className="mb-4 md:mb-6 opacity-10 md:w-20 md:h-20" />
                  <p className="font-black text-base md:text-xl uppercase italic tracking-widest">Nenhum resultado</p>
                </div>
              )}
              {groupedSearchResults.map((group) => (
                <div key={group.productId} className="bg-white rounded-2xl md:rounded-[2.5rem] border-2 border-slate-200 shadow-sm overflow-hidden p-5 md:p-8 animate-in fade-in slide-in-from-bottom-4">
                  <div className="flex justify-between items-start mb-4 md:mb-6">
                    <div>
                      <span className="bg-indigo-100 text-indigo-700 px-3 md:px-4 py-1 rounded-lg md:rounded-xl text-[8px] md:text-xs font-black uppercase tracking-widest inline-block mb-1 md:mb-2">{group.productId}</span>
                      <h4 className="font-black text-lg md:text-2xl text-slate-800 uppercase leading-none">{group.productName}</h4>
                    </div>
                    <div className="text-right">
                      <p className="text-[8px] md:text-[10px] font-black text-slate-300 uppercase tracking-widest">Total</p>
                      <p className="text-2xl md:text-4xl font-black text-indigo-600 leading-none">{group.totalQty}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                    {group.locations.map(loc => (
                      <div key={loc.id} className="p-3 md:p-4 bg-slate-50 rounded-xl md:rounded-2xl border-2 border-slate-100 flex justify-between items-center group hover:border-indigo-200 transition-colors shadow-sm">
                        <div className="flex items-center gap-2 md:gap-3">
                          <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-white border border-slate-200 flex items-center justify-center font-black text-[10px] md:text-xs text-indigo-600 shadow-sm">
                            {loc.rack}
                          </div>
                          <span className="font-black text-xs md:text-sm text-slate-600 tracking-tight">Nível {getLevelLetter(loc.level-1)} - {loc.position}</span>
                        </div>
                        <span className="font-black text-indigo-600 bg-white px-2 md:px-3 py-1 rounded-lg md:rounded-xl border-2 border-indigo-50 shadow-sm text-xs md:text-sm">{loc.quantity} u</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL SCANNER */}
      {isScannerOpen && (
        <div className="fixed inset-0 bg-black/95 z-[900] flex flex-col items-center justify-center">
          <div className="w-full max-w-md bg-white rounded-3xl md:rounded-[3rem] overflow-hidden h-[85vh] md:h-[600px] flex flex-col relative shadow-2xl border-4 border-slate-800">
            <button onClick={() => setIsScannerOpen(false)} className="absolute top-4 right-4 z-[1000] bg-black/60 text-white p-2 rounded-xl hover:bg-rose-600 transition-colors backdrop-blur-md"><X size={20} /></button>
            {!isManualScannerMode ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div id="reader" className="flex-1 bg-black"></div>
                <div className="p-4 md:p-6 bg-slate-900 text-white text-center">
                  <p className="text-[10px] md:text-xs font-black uppercase tracking-[0.3em] italic animate-pulse">Câmera Traseira Ativa</p>
                  <p className="text-[8px] md:text-[10px] text-slate-500 uppercase mt-1">Aponte para o QR Code do Pallet</p>
                </div>
              </div>
            ) : (
              <div className="p-6 md:p-10 flex-1 flex flex-col justify-center gap-6 md:gap-8 bg-white overflow-y-auto no-scrollbar">
                <div className="text-center"><Keyboard size={48} className="mx-auto text-indigo-600 mb-3 animate-bounce md:w-16 md:h-16"/><p className="font-black text-xl md:text-3xl uppercase tracking-tighter italic">Endereço Manual</p></div>
                <div className="grid grid-cols-4 gap-2">
                  {RACKS.map(r => (
                    <button key={r} onClick={() => setManualEntryData({...manualEntryData, rack: r})} className={`p-4 md:p-6 rounded-xl md:rounded-2xl font-black border-2 transition-all text-lg md:text-xl ${manualEntryData.rack === r ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl scale-110' : 'bg-slate-50 border-transparent text-slate-400 hover:bg-slate-100'}`}>{r}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-4 md:gap-6">
                  <div className="space-y-1">
                    <span className="text-[9px] md:text-[10px] font-black text-slate-300 uppercase ml-1 tracking-widest">Nível</span>
                    <select className="w-full p-4 md:p-5 bg-slate-50 rounded-xl md:rounded-2xl font-black text-lg md:text-xl outline-none shadow-sm border-2 border-transparent focus:border-indigo-500" value={manualEntryData.level} onChange={e => setManualEntryData({...manualEntryData, level: parseInt(e.target.value)})}>
                      {LEVEL_LABELS.map((l, i) => <option key={l} value={i+1}>{l}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] md:text-[10px] font-black text-slate-300 uppercase ml-1 tracking-widest">Posição</span>
                    <input type="number" min="1" max="66" className="w-full p-4 md:p-5 bg-slate-50 rounded-xl md:rounded-2xl font-black text-lg md:text-xl outline-none shadow-sm border-2 border-transparent focus:border-indigo-500" value={manualEntryData.pos} onChange={e => setManualEntryData({...manualEntryData, pos: parseInt(e.target.value)})}/>
                  </div>
                </div>
                <button onClick={handleManualScanSubmit} className="w-full bg-indigo-600 text-white p-5 md:p-6 rounded-2xl md:rounded-[2.5rem] font-black text-lg md:text-xl shadow-2xl uppercase tracking-widest transition-transform active:scale-95 flex items-center justify-center gap-3">Buscar <Search size={20}/></button>
              </div>
            )}
            <button onClick={() => setIsManualScannerMode(!isManualScannerMode)} className="p-5 md:p-6 bg-slate-50 text-indigo-600 font-black uppercase text-[10px] md:text-xs tracking-[0.2em] border-t-2 border-slate-100 hover:bg-indigo-50 transition-colors shrink-0">
              {isManualScannerMode ? 'Ativar Câmera' : 'Digitar Endereço'}
            </button>
          </div>
        </div>
      )}

      {showQR && <QRCodeModal position={showQR} onClose={() => setShowQR(null)} />}
    </div>
  );
};

export default App;
