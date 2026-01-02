
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, Warehouse, Search, LayoutGrid, QrCode, TrendingUp, Box, 
  Save, X, MapPin, ScanLine, Settings, 
  HardDrive, AlertCircle, CheckCircle2,
  Printer, FileDown, Check, ArrowRight, Loader2, LogOut, Minus, Activity, Cloud, Keyboard, Camera, ChevronRight, Hash, Layers, Plus
} from 'lucide-react';
import { PalletPosition, RackId } from './types';
import { QRCodeModal } from './components/QRCodeModal';
import { initializeDatabase, fetchInventoryFromDB, saveItemToDB, deleteItemFromDB } from './services/neonService';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { QRCodeSVG } from 'qrcode.react';

// DEFINIÇÃO DOS RACKS: 4 Porta Paletes (A, B, C, D)
const RACKS: RackId[] = ['A', 'B', 'C', 'D'];
const LEVEL_LABELS = ['A', 'B', 'C', 'D', 'E'];
const POSITIONS_PER_LEVEL = 66;

// STRING DE CONEXÃO FIXA DO NEON DB
const FIXED_DB_STRING = "postgresql://neondb_owner:npg_JaZLTzrqMc09@ep-fragrant-cherry-ac95x95d-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require";

const App: React.FC = () => {
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

  useEffect(() => {
    loadFromNeon(FIXED_DB_STRING);
  }, []);

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
      // Configuração para forçar a câmera frontal (facingMode: "user")
      const scanner = new Html5QrcodeScanner(
        "reader",
        { 
          fps: 10, 
          qrbox: { width: 250, height: 250 },
          videoConstraints: { facingMode: "user" }
        },
        false
      );

      scanner.render((decodedText) => {
        const parts = decodedText.split('-');
        if (parts.length >= 6 && parts[0] === 'PP') {
          const rack = parts[1] as RackId;
          const level = parseInt(parts[3]);
          const pos = parseInt(parts[5]);

          if (RACKS.includes(rack) && !isNaN(level) && !isNaN(pos)) {
            scanner.clear().catch(console.error);
            setIsScannerOpen(false);
            handleScanSuccess(rack, level, pos);
          } else {
            alert("QR Code inválido.");
          }
        } else {
          alert("QR Code não reconhecido.");
        }
      }, () => {});

      return () => {
        scanner.clear().catch(console.error);
      };
    }
  }, [isScannerOpen, isManualScannerMode]);

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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row font-sans text-slate-900">
      <div className="flex flex-col lg:flex-row w-full">
        {feedback && (
          <div className={`fixed top-6 right-6 z-[900] p-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-right-10 ${feedback.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
            {feedback.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <span className="font-bold text-sm">{feedback.msg}</span>
          </div>
        )}

        {isGeneratingPDF && (
          <div className="fixed inset-0 z-[1000] bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center text-white">
            <Loader2 className="w-16 h-16 animate-spin mb-4" />
            <p className="font-black text-2xl uppercase tracking-tighter italic">Gerando Etiquetas</p>
            <p className="text-indigo-200 animate-pulse font-bold uppercase text-[10px] mt-2 tracking-widest text-center max-w-xs">Organizando endereços no arquivo PDF...</p>
          </div>
        )}

        <aside className="w-full lg:w-72 bg-white border-r border-slate-200 p-6 flex flex-col gap-8 h-auto lg:h-screen lg:sticky lg:top-0">
          <div className="flex items-center gap-3">
            <Warehouse className="text-indigo-600 w-8 h-8" />
            <div>
              <h1 className="text-xl font-bold italic tracking-tighter leading-tight">Porta Pallets</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-0.5">Gestão Logística</p>
            </div>
          </div>
          <nav className="flex flex-col gap-2">
            <button onClick={() => setIsSearchOpen(true)} className="flex items-center gap-3 p-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl hover:scale-[1.03] transition-transform uppercase text-xs tracking-widest italic"><Search size={18} /> Consultar Item</button>
            <button onClick={() => { setIsScannerOpen(true); setIsManualScannerMode(false); }} className="flex items-center gap-3 p-4 text-slate-500 hover:bg-slate-100 rounded-2xl transition-all font-bold text-xs uppercase tracking-widest"><ScanLine size={18} /> Saída (Scanner)</button>
            <button onClick={() => setIsPrintMenuOpen(true)} className="flex items-center gap-3 p-4 text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all border-2 border-indigo-100 font-black text-xs uppercase tracking-widest"><Printer size={18} /> Etiquetas</button>
          </nav>
        </aside>

        <main className="flex-1 p-6 lg:p-10 overflow-hidden">
          <header className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
              <div><p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Paletes Ativos</p><h2 className="text-4xl font-black">{stats.occupiedPositions}</h2></div>
              <Box className="text-indigo-100 w-12 h-12" />
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
              <div><p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Vagas Livres</p><h2 className="text-4xl font-black">{stats.totalPositions - stats.occupiedPositions}</h2></div>
              <LayoutGrid className="text-emerald-100 w-12 h-12" />
            </div>
            <div className="bg-indigo-600 text-white p-6 rounded-3xl shadow-lg flex items-center justify-between">
              <div><p className="text-[10px] text-indigo-200 font-bold uppercase mb-1">Ocupação</p><h2 className="text-4xl font-black">{stats.occupancyRate}%</h2></div>
              <TrendingUp className="text-indigo-300 w-12 h-12" />
            </div>
          </header>

          <div className="bg-white p-6 lg:p-10 rounded-[3rem] shadow-sm border border-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-6 mb-8">
              <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl">
                {RACKS.map(r => (
                  <button key={r} onClick={() => setActiveRack(r)} className={`px-6 py-3 rounded-xl font-black transition-all ${activeRack === r ? 'bg-white text-indigo-600 shadow-md scale-105' : 'text-slate-400 hover:text-slate-600'}`}>PORTA PALLET {r}</button>
                ))}
              </div>
              <div className="flex gap-2">
                {LEVEL_LABELS.map((l, idx) => (
                  <button key={l} onClick={() => setActiveLevelIndex(idx)} className={`w-12 h-12 flex items-center justify-center rounded-2xl font-black transition-all ${activeLevelIndex === idx ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>{l}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-6 sm:grid-cols-11 gap-3 max-h-[60vh] overflow-y-auto no-scrollbar pt-4 px-1">
              {Array.from({ length: POSITIONS_PER_LEVEL }).map((_, i) => {
                const pos = i + 1;
                const occ = inventory.find(p => p.rack === activeRack && p.level === (activeLevelIndex + 1) && p.position === pos);
                return (
                  <button key={pos} onClick={() => handlePositionClick(activeRack, activeLevelIndex, pos)} className={`aspect-square rounded-2xl flex flex-col items-center justify-center border-2 transition-all hover:scale-110 active:scale-95 ${occ ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-sm' : 'bg-slate-50 border-transparent text-slate-300'}`}>
                    <span className="text-[10px] font-black">{LEVEL_LABELS[activeLevelIndex]}{pos}</span>
                    {occ && <Package size={18} className="mt-1" />}
                  </button>
                );
              })}
            </div>
          </div>
        </main>
      </div>

      {/* MODAL DE SAÍDA - COM ATALHOS DE QUANTIDADE */}
      {scannedPosition && (
        <div className="fixed inset-0 bg-rose-950/70 backdrop-blur-md z-[800] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 border-[6px] border-rose-100 flex flex-col">
            <div className="p-8 bg-rose-600 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4">
                <div className="bg-white/20 p-2 rounded-2xl"><LogOut size={28} /></div>
                <div>
                  <h3 className="font-black text-2xl uppercase tracking-tighter italic leading-none">Baixa de Item</h3>
                  <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-1">Confirme a retirada do estoque</p>
                </div>
              </div>
              <button onClick={() => setScannedPosition(null)} className="p-3 hover:bg-white/10 rounded-2xl transition-colors"><X /></button>
            </div>

            <form onSubmit={handleProcessExit} className="p-8 space-y-8 overflow-y-auto no-scrollbar">
              <div className="bg-rose-50 p-6 rounded-[2.5rem] border-2 border-rose-100 flex flex-col items-center text-center shadow-inner">
                <div className="flex gap-2 mb-3">
                  <span className="bg-rose-600 text-white px-3 py-1 rounded-lg text-xs font-black uppercase tracking-widest">PP {scannedPosition.rack}</span>
                  <span className="bg-rose-200 text-rose-800 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-widest">{getLevelLetter(scannedPosition.level - 1)}{scannedPosition.position}</span>
                </div>
                <h2 className="text-2xl font-black text-rose-900 leading-tight uppercase mb-1">{scannedPosition.productName}</h2>
                <p className="text-xs font-bold text-rose-400 uppercase tracking-[0.2em] mb-4">ID: {scannedPosition.productId}</p>
                <div className="bg-white px-8 py-4 rounded-[1.5rem] border-2 border-rose-100 shadow-sm">
                  <span className="text-[10px] font-black text-rose-300 uppercase block leading-none mb-1">Disponível Agora</span>
                  <span className="text-4xl font-black text-rose-600">{scannedPosition.quantity} <span className="text-sm">un</span></span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <input 
                    type="number" 
                    placeholder="Qtd..." 
                    autoFocus
                    className="w-full p-6 pl-16 bg-slate-50 rounded-[2.5rem] font-black text-4xl border-2 border-slate-200 focus:border-rose-500 focus:bg-white outline-none transition-all text-rose-600 shadow-inner text-center" 
                    value={exitQuantity} 
                    onChange={e => setExitQuantity(e.target.value)} 
                  />
                  <Minus className="absolute left-8 top-1/2 -translate-y-1/2 text-rose-300" size={28} />
                </div>

                {/* BOTOES DE ATALHO DE QUANTIDADE */}
                <div className="grid grid-cols-4 gap-2">
                  {[1, 5, 10].map(val => (
                    <button 
                      key={val} 
                      type="button"
                      onClick={() => setExitQuantity(val)} 
                      className={`p-4 rounded-2xl font-black text-sm border-2 transition-all ${Number(exitQuantity) === val ? 'bg-rose-600 border-rose-600 text-white shadow-lg scale-105' : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-200'}`}
                    >
                      +{val}
                    </button>
                  ))}
                  <button 
                    type="button"
                    onClick={() => setExitQuantity(scannedPosition.quantity || 0)} 
                    className={`p-4 rounded-2xl font-black text-xs uppercase tracking-tighter border-2 transition-all shadow-sm ${Number(exitQuantity) === scannedPosition.quantity ? 'bg-rose-900 border-rose-900 text-white' : 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100'}`}
                  >
                    TUDO
                  </button>
                </div>
              </div>
              
              <button 
                type="submit" 
                className="w-full bg-rose-600 hover:bg-rose-700 text-white p-7 rounded-[2.5rem] font-black text-xl shadow-2xl shadow-rose-200 uppercase tracking-widest flex items-center justify-center gap-4 transition-all hover:scale-[1.03] active:scale-95 group"
              >
                CONFIRMAR SAÍDA <ArrowRight className="group-hover:translate-x-2 transition-transform" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE ETIQUETAS - REFORMULADO */}
      {isPrintMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[700] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl animate-in zoom-in-95 flex flex-col lg:flex-row">
            
            <div className="flex-1 flex flex-col border-r border-slate-100 overflow-y-auto no-scrollbar">
              <div className="p-8 bg-slate-900 text-white flex justify-between items-center sticky top-0 z-10">
                <div className="flex items-center gap-4">
                  <div className="bg-indigo-500 p-2 rounded-2xl shadow-lg"><Printer size={28} /></div>
                  <div>
                    <h3 className="font-black text-2xl uppercase tracking-tighter italic leading-none">Etiquetas</h3>
                    <p className="text-[10px] font-bold opacity-50 uppercase tracking-widest mt-1">Impressão em Alta Resolução</p>
                  </div>
                </div>
                <button onClick={() => setIsPrintMenuOpen(false)} className="lg:hidden p-3 hover:bg-white/10 rounded-2xl"><X /></button>
              </div>

              <div className="flex bg-slate-100 p-2 m-8 rounded-[1.8rem] sticky top-[100px] z-10 shadow-inner">
                <button 
                  onClick={() => setPrintMenuTab('single')} 
                  className={`flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${printMenuTab === 'single' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Hash size={16} /> Individual
                </button>
                <button 
                  onClick={() => setPrintMenuTab('batch')} 
                  className={`flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${printMenuTab === 'batch' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Layers size={16} /> Lote / Todas
                </button>
              </div>
              
              <div className="px-8 pb-8 space-y-10">
                {printMenuTab === 'single' ? (
                  <div className="space-y-8 animate-in slide-in-from-left-4">
                    <div className="space-y-3">
                      <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 ml-1"><MapPin size={12}/> Escolha o Porta Pallet</label>
                      <div className="grid grid-cols-4 gap-3">
                        {RACKS.map(r => (
                          <button key={r} onClick={() => setSinglePrintData({...singlePrintData, rack: r})} className={`p-5 rounded-2xl font-black transition-all text-sm border-2 ${singlePrintData.rack === r ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg scale-105' : 'bg-slate-50 border-transparent text-slate-400 hover:bg-slate-100'}`}>{r}</button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 ml-1"><Activity size={12}/> Nível</label>
                        <select className="w-full p-5 bg-slate-50 rounded-2xl font-black text-slate-700 border-2 border-transparent focus:border-indigo-500 outline-none shadow-sm" value={singlePrintData.level} onChange={e => setSinglePrintData({...singlePrintData, level: parseInt(e.target.value)})}>
                          {LEVEL_LABELS.map((l, i) => <option key={l} value={i+1}>Nível {l}</option>)}
                        </select>
                      </div>
                      <div className="space-y-3">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 ml-1"><LayoutGrid size={12}/> Posição</label>
                        <input type="number" min="1" max="66" className="w-full p-5 bg-slate-50 rounded-2xl font-black text-slate-700 border-2 border-transparent focus:border-indigo-500 outline-none shadow-sm" placeholder="Ex: 22" value={singlePrintData.pos} onChange={e => setSinglePrintData({...singlePrintData, pos: parseInt(e.target.value) || 1})} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8 animate-in slide-in-from-left-4">
                    <div className="grid grid-cols-2 gap-4">
                      <button onClick={() => setPrintFilter({...printFilter, rack: 'ALL'})} className={`p-6 rounded-[2.5rem] border-2 text-left transition-all relative overflow-hidden group ${printFilter.rack === 'ALL' ? 'bg-indigo-50 border-indigo-500 shadow-md' : 'bg-slate-50 border-transparent hover:bg-slate-100'}`}>
                        <span className="block font-black text-xl mb-1 italic uppercase tracking-tighter">Imprimir Todas</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Armazém Inteiro</span>
                        {printFilter.rack === 'ALL' && <CheckCircle2 className="absolute top-4 right-4 text-indigo-500" size={20}/>}
                      </button>
                      <button onClick={() => setPrintFilter({...printFilter, rack: activeRack})} className={`p-6 rounded-[2.5rem] border-2 text-left transition-all relative group ${printFilter.rack === activeRack ? 'bg-indigo-50 border-indigo-500 shadow-md' : 'bg-slate-50 border-transparent hover:bg-slate-100'}`}>
                        <span className="block font-black text-xl mb-1 italic uppercase tracking-tighter">Só PP {activeRack}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">330 Endereços</span>
                        {printFilter.rack === activeRack && <CheckCircle2 className="absolute top-4 right-4 text-indigo-500" size={20}/>}
                      </button>
                    </div>

                    <div className="bg-slate-50 p-8 rounded-[3rem] border-2 border-slate-100 space-y-6">
                      <p className="font-black text-[11px] uppercase text-slate-400 tracking-[0.2em] flex items-center gap-2">Intervalo de Níveis</p>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <span className="text-[10px] font-bold text-slate-300 uppercase ml-2">De</span>
                          <select className="w-full p-4 bg-white rounded-2xl font-black shadow-sm" value={printFilter.startLevel} onChange={e => setPrintFilter({...printFilter, startLevel: parseInt(e.target.value)})}>
                            {LEVEL_LABELS.map((l, i) => <option key={l} value={i+1}>Nível {l}</option>)}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <span className="text-[10px] font-bold text-slate-300 uppercase ml-2">Até</span>
                          <select className="w-full p-4 bg-white rounded-2xl font-black shadow-sm" value={printFilter.endLevel} onChange={e => setPrintFilter({...printFilter, endLevel: parseInt(e.target.value)})}>
                            {LEVEL_LABELS.map((l, i) => <option key={l} value={i+1}>Nível {l}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                <button onClick={generatePDF} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-7 rounded-[2.5rem] font-black text-xl uppercase tracking-widest shadow-2xl shadow-indigo-100 flex items-center justify-center gap-4 transition-transform active:scale-95 group">
                  <Printer className="group-hover:rotate-12 transition-transform" /> {printMenuTab === 'single' ? 'Gerar Etiqueta' : 'Gerar Documento Lote'}
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-50 p-8 flex flex-col items-center justify-center relative min-h-[400px]">
              <button onClick={() => setIsPrintMenuOpen(false)} className="hidden lg:flex absolute top-8 right-8 p-4 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-3xl shadow-sm transition-all"><X /></button>
              <div className="text-center mb-10"><p className="text-[11px] font-black text-slate-300 uppercase tracking-[0.4em] mb-3 italic">Mockup de Visualização</p><div className="h-1.5 w-16 bg-indigo-100 mx-auto rounded-full"></div></div>
              
              <div className="bg-white w-[300px] h-[300px] p-8 rounded-[3rem] shadow-2xl border-4 border-slate-100 flex flex-col items-center justify-between relative transform rotate-2 animate-in zoom-in-50 duration-500">
                <div className="w-full border-b-2 border-slate-100 pb-3 text-center"><span className="font-black text-2xl text-slate-800 tracking-tighter">PP {printMenuTab === 'single' ? singlePrintData.rack : (printFilter.rack === 'ALL' ? 'X' : printFilter.rack)} {printMenuTab === 'single' ? getLevelLetter(singlePrintData.level - 1) : getLevelLetter(printFilter.startLevel - 1)}{printMenuTab === 'single' ? singlePrintData.pos : '??'}</span></div>
                <div className="p-4 bg-white border-2 border-slate-50 rounded-[2rem] shadow-inner"><QRCodeSVG value={printMenuTab === 'single' ? `PP-${singlePrintData.rack}-L-${singlePrintData.level}-P-${singlePrintData.pos}` : 'LOTE'} size={140} level="H" /></div>
                <div className="w-full pt-3 text-center"><span className="font-mono text-[10px] text-slate-400 font-black tracking-widest uppercase">{printMenuTab === 'single' ? `PP-${singlePrintData.rack}-L-${singlePrintData.level}-P-${singlePrintData.pos}` : 'MULTI_PRINT_PDF'}</span></div>
              </div>

              <div className="mt-12 flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-5 py-2.5 rounded-full border-2 border-emerald-100">
                  <Check size={16} className="animate-bounce" />
                  <span className="text-[11px] font-black uppercase tracking-widest italic">Formato Padrão 5x5cm</span>
                </div>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-tight text-center opacity-60">Papel Etiqueta Térmica Autoadesiva</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ENTRADA */}
      {selectedPosition && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[600] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-md overflow-hidden animate-in zoom-in-95 shadow-2xl border-[6px] border-indigo-50">
            <div className="p-8 bg-indigo-600 text-white flex justify-between items-center">
              <div>
                <h3 className="font-black text-2xl uppercase tracking-tighter italic leading-none">Armazenar</h3>
                <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-1">{selectedPosition.rack}{getLevelLetter(selectedPosition.level - 1)}{selectedPosition.position}</p>
              </div>
              <button onClick={() => setSelectedPosition(null)} className="p-3 hover:bg-white/10 rounded-2xl transition-colors"><X /></button>
            </div>
            <form onSubmit={handleSavePosition} className="p-8 space-y-6">
              <div className="space-y-1">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-2">ID do Produto *</label>
                <input type="text" placeholder="Ex: SKU-0123" className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase border-2 border-transparent focus:border-indigo-500 outline-none shadow-sm transition-all" value={selectedPosition.productId || ''} onChange={e => setSelectedPosition({...selectedPosition, productId: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-2">Descrição *</label>
                <input type="text" placeholder="Ex: CAIXA ELETRÔNICOS" className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase border-2 border-transparent focus:border-indigo-500 outline-none shadow-sm transition-all" value={selectedPosition.productName || ''} onChange={e => setSelectedPosition({...selectedPosition, productName: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-2">Quantidade *</label>
                <input type="number" placeholder="0" className="w-full p-5 bg-slate-50 rounded-2xl font-black border-2 border-transparent focus:border-indigo-500 outline-none shadow-sm transition-all" value={selectedPosition.quantity || ''} onChange={e => setSelectedPosition({...selectedPosition, quantity: parseInt(e.target.value) || 0})} />
              </div>
              <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-6 rounded-[2.5rem] font-black text-xl uppercase tracking-widest shadow-2xl shadow-indigo-100 flex items-center justify-center gap-4 transition-transform active:scale-95">Salvar Entrada <Save /></button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONSULTA */}
      {isSearchOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[500] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3.5rem] w-full max-w-2xl h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 border-8 border-indigo-50">
            <div className="p-10 bg-indigo-600 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-5">
                <div className="bg-white/20 p-3 rounded-2xl shadow-lg"><Search size={32} /></div>
                <div>
                  <h3 className="font-black text-3xl uppercase tracking-tighter italic leading-none">Consultar</h3>
                  <p className="text-[11px] font-bold opacity-80 uppercase tracking-widest mt-1">Localização global de itens</p>
                </div>
              </div>
              <button onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }} className="p-4 hover:bg-white/10 rounded-[1.5rem] transition-colors"><X /></button>
            </div>
            <div className="p-8 bg-indigo-50 border-b border-indigo-100 shrink-0">
              <input type="text" autoFocus placeholder="PESQUISE ID OU DESCRIÇÃO..." className="w-full p-6 rounded-[2rem] border-2 border-indigo-100 bg-white font-black text-xl focus:border-indigo-500 outline-none uppercase shadow-md placeholder:text-slate-300" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar bg-slate-50">
              {groupedSearchResults.length === 0 && searchQuery && (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 py-20">
                  <Box size={80} className="mb-6 opacity-10" />
                  <p className="font-black text-xl uppercase italic tracking-widest">Nenhum resultado</p>
                </div>
              )}
              {groupedSearchResults.map((group) => (
                <div key={group.productId} className="bg-white rounded-[2.5rem] border-2 border-slate-200 shadow-sm overflow-hidden p-8 animate-in fade-in slide-in-from-bottom-4">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <span className="bg-indigo-100 text-indigo-700 px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest inline-block mb-2">{group.productId}</span>
                      <h4 className="font-black text-2xl text-slate-800 uppercase leading-none">{group.productName}</h4>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Saldo Total</p>
                      <p className="text-4xl font-black text-indigo-600 leading-none">{group.totalQty}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {group.locations.map(loc => (
                      <div key={loc.id} className="p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 flex justify-between items-center group hover:border-indigo-200 transition-colors shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center font-black text-xs text-indigo-600 shadow-sm">
                            {loc.rack}
                          </div>
                          <span className="font-black text-sm text-slate-600 tracking-tight">Nível {getLevelLetter(loc.level-1)} - Pos {loc.position}</span>
                        </div>
                        <span className="font-black text-indigo-600 bg-white px-3 py-1.5 rounded-xl border-2 border-indigo-50 shadow-sm text-sm">{loc.quantity} un</span>
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
          <div className="w-full max-w-md bg-white rounded-[3rem] overflow-hidden h-[600px] flex flex-col relative shadow-2xl border-4 border-slate-800">
            <button onClick={() => setIsScannerOpen(false)} className="absolute top-6 right-6 z-[1000] bg-black/60 text-white p-3 rounded-2xl hover:bg-rose-600 transition-colors backdrop-blur-md"><X /></button>
            {!isManualScannerMode ? (
              <div className="flex-1 flex flex-col">
                <div id="reader" className="flex-1 bg-slate-100"></div>
                <div className="p-6 bg-slate-900 text-white text-center">
                  <p className="text-xs font-black uppercase tracking-[0.3em] italic animate-pulse">Bipagem de Endereço</p>
                  <p className="text-[10px] text-slate-500 uppercase mt-1">Aponte a câmera para o QR Code do Pallet</p>
                </div>
              </div>
            ) : (
              <div className="p-10 flex-1 flex flex-col justify-center gap-8 bg-white">
                <div className="text-center"><Keyboard size={64} className="mx-auto text-indigo-600 mb-4 animate-bounce"/><p className="font-black text-3xl uppercase tracking-tighter italic">Endereço Manual</p></div>
                <div className="grid grid-cols-4 gap-3">
                  {RACKS.map(r => (
                    <button key={r} onClick={() => setManualEntryData({...manualEntryData, rack: r})} className={`p-6 rounded-2xl font-black border-2 transition-all text-xl ${manualEntryData.rack === r ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl scale-110' : 'bg-slate-50 border-transparent text-slate-400 hover:bg-slate-100'}`}>{r}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-slate-300 uppercase ml-2 tracking-widest">Nível</span>
                    <select className="w-full p-5 bg-slate-50 rounded-2xl font-black text-xl outline-none shadow-sm border-2 border-transparent focus:border-indigo-500" value={manualEntryData.level} onChange={e => setManualEntryData({...manualEntryData, level: parseInt(e.target.value)})}>
                      {LEVEL_LABELS.map((l, i) => <option key={l} value={i+1}>{l}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-slate-300 uppercase ml-2 tracking-widest">Posição</span>
                    <input type="number" min="1" max="66" className="w-full p-5 bg-slate-50 rounded-2xl font-black text-xl outline-none shadow-sm border-2 border-transparent focus:border-indigo-500" value={manualEntryData.pos} onChange={e => setManualEntryData({...manualEntryData, pos: parseInt(e.target.value)})}/>
                  </div>
                </div>
                <button onClick={handleManualScanSubmit} className="w-full bg-indigo-600 text-white p-6 rounded-[2.5rem] font-black text-xl shadow-2xl uppercase tracking-widest transition-transform active:scale-95 flex items-center justify-center gap-4">Buscar Palete <Search/></button>
              </div>
            )}
            <button onClick={() => setIsManualScannerMode(!isManualScannerMode)} className="p-6 bg-slate-50 text-indigo-600 font-black uppercase text-xs tracking-[0.2em] border-t-2 border-slate-100 hover:bg-indigo-50 transition-colors">
              {isManualScannerMode ? 'Ativar Câmera (Scanner)' : 'Digitar Endereço Manualmente'}
            </button>
          </div>
        </div>
      )}

      {showQR && <QRCodeModal position={showQR} onClose={() => setShowQR(null)} />}
    </div>
  );
};

export default App;
