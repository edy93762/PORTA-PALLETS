
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, Warehouse, Search, LayoutGrid, QrCode, TrendingUp, Box, 
  Save, X, MapPin, ScanLine, Settings, 
  HardDrive, AlertCircle, CheckCircle2,
  Printer, FileDown, Check, ArrowRight, Loader2, LogOut, Minus, Activity, Cloud, Keyboard, Camera
} from 'lucide-react';
import { PalletPosition, RackId } from './types';
import { QRCodeModal } from './components/QRCodeModal';
import { initializeDatabase, fetchInventoryFromDB, saveItemToDB, deleteItemFromDB } from './services/neonService';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { jsPDF } from "jspdf";
import QRCode from "qrcode";

// DEFINIÇÃO DOS RACKS: Apenas 3 (A, B, C)
const RACKS: RackId[] = ['A', 'B', 'C'];
const LEVEL_LABELS = ['A', 'B', 'C', 'D', 'E'];
const POSITIONS_PER_LEVEL = 66;

// STRING DE CONEXÃO FIXA DO NEON DB
const FIXED_DB_STRING = "postgresql://neondb_owner:npg_JaZLTzrqMc09@ep-fragrant-cherry-ac95x95d-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require";

const App: React.FC = () => {
  const [inventory, setInventory] = useState<PalletPosition[]>([]);
  const [activeRack, setActiveRack] = useState<RackId>('A');
  const [activeLevelIndex, setActiveLevelIndex] = useState<number>(0); 
  const [selectedPosition, setSelectedPosition] = useState<PalletPosition | null>(null);
  
  const [dbConnectionString, setDbConnectionString] = useState(FIXED_DB_STRING);
  const [isDbConnected, setIsDbConnected] = useState(false);
  const [isLoadingDb, setIsLoadingDb] = useState(false);

  const [scannedPosition, setScannedPosition] = useState<PalletPosition | null>(null);
  const [exitQuantity, setExitQuantity] = useState<number | string>(''); 
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isManualScannerMode, setIsManualScannerMode] = useState(false); 
  const [manualEntryData, setManualEntryData] = useState({ rack: 'A' as RackId, level: 1, pos: 1 });
  
  const [showQR, setShowQR] = useState<{ rack: string; level: number; pos: number } | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPrintMenuOpen, setIsPrintMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false); 
  const [searchQuery, setSearchQuery] = useState(''); 
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  
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
      showFeedback('success', 'Conectado ao Banco de Dados!');
    } catch (error) {
      console.error(error);
      setIsDbConnected(false);
      showFeedback('error', 'Erro na conexão com Banco.');
      const savedInv = localStorage.getItem('rackmaster-local-data');
      if (savedInv) {
        try {
          setInventory(JSON.parse(savedInv));
          showFeedback('error', 'Usando dados offline temporariamente.');
        } catch (e) { console.error("Erro ao carregar dados locais"); }
      }
    } finally {
      setIsLoadingDb(false);
    }
  };

  const handleSaveDbConfig = async () => {
    await loadFromNeon(dbConnectionString);
  };

  useEffect(() => {
    if (isScannerOpen && !isManualScannerMode) {
      const scanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
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
            alert("QR Code inválido ou formato desconhecido.");
          }
        } else {
          alert("QR Code não reconhecido pelo sistema.");
        }
      }, (errorMessage) => {
        // Ignorar
      });

      return () => {
        scanner.clear().catch(console.error);
      };
    }
  }, [isScannerOpen, isManualScannerMode]);

  const getTotalStockById = (productId: string) => {
    if (!productId) return 0;
    return inventory
      .filter(p => p.productId === productId)
      .reduce((acc, curr) => acc + (curr.quantity || 0), 0);
  };

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toUpperCase();
    return inventory.filter(p => 
      p.productId?.includes(q) || p.productName?.includes(q)
    );
  }, [searchQuery, inventory]);

  const searchStats = useMemo(() => {
    const totalQty = searchResults.reduce((acc, curr) => acc + (curr.quantity || 0), 0);
    const locations = searchResults.length;
    return { totalQty, locations };
  }, [searchResults]);

  const handleScanSuccess = (rack: RackId, level: number, pos: number) => {
    setIsScannerOpen(false);
    setIsManualScannerMode(false);
    const existing = inventory.find(p => p.rack === rack && p.level === level && p.position === pos);
    if (existing) {
      setExitQuantity(''); 
      setScannedPosition(existing);
    } else {
      handlePositionClick(rack, level - 1, pos);
      showFeedback('success', 'Posição livre identificada.');
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
    if (qtdToRemove <= 0) {
      showFeedback('error', 'Digite uma quantidade válida.');
      return;
    }
    let newInv = inventory.filter(p => p.id !== scannedPosition.id);
    let updatedItem: PalletPosition | null = null;
    if (qtdToRemove < currentQty) {
      updatedItem = {
        ...scannedPosition,
        quantity: currentQty - qtdToRemove,
        lastUpdated: new Date().toISOString()
      };
      newInv.push(updatedItem);
      showFeedback('success', `Retirado ${qtdToRemove} un. Restam ${updatedItem.quantity}.`);
    } else {
      showFeedback('success', 'Item removido completamente.');
    }
    setInventory(newInv);
    if (isDbConnected) {
      try {
        if (updatedItem) {
          await saveItemToDB(dbConnectionString, updatedItem);
        } else {
          await deleteItemFromDB(dbConnectionString, scannedPosition);
        }
      } catch (err) {
        showFeedback('error', 'Erro ao sincronizar com Neon.');
      }
    } else {
      localStorage.setItem('rackmaster-local-data', JSON.stringify(newInv));
    }
    setScannedPosition(null);
  };

  const showFeedback = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handlePositionClick = (rack: RackId, levelIdx: number, pos: number) => {
    const existing = inventory.find(p => p.rack === rack && p.level === (levelIdx + 1) && p.position === pos);
    setSelectedPosition(existing || {
      id: `${rack}${getLevelLetter(levelIdx)}${pos}`,
      rack, level: levelIdx + 1, position: pos,
      productId: '',
      productName: '',
      quantity: 0
    });
  };

  const handleSavePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPosition) return;
    if (!selectedPosition.productName?.trim() || !selectedPosition.productId?.trim() || (selectedPosition.quantity || 0) <= 0) {
      showFeedback('error', 'Preencha todos os campos corretamente!');
      return;
    }
    const itemToSave = { ...selectedPosition, lastUpdated: new Date().toISOString() };
    const newInv = inventory.filter(p => p.id !== selectedPosition.id);
    newInv.push(itemToSave);
    setInventory(newInv);
    if (isDbConnected) {
      try {
        await saveItemToDB(dbConnectionString, itemToSave);
        showFeedback('success', 'Salvo no Banco!');
      } catch (err) {
        showFeedback('error', 'Erro ao salvar no Banco.');
      }
    } else {
      localStorage.setItem('rackmaster-local-data', JSON.stringify(newInv));
      showFeedback('success', 'Salvo Localmente!');
    }
    setSelectedPosition(null);
  };

  const stats = useMemo(() => {
    const total = RACKS.length * LEVEL_LABELS.length * POSITIONS_PER_LEVEL;
    return { 
      totalPositions: total, 
      occupiedPositions: inventory.length, 
      occupancyRate: total > 0 ? Math.round((inventory.length / total) * 100) : 0 
    };
  }, [inventory]);

  const generatePDF = async () => {
    setIsGeneratingPDF(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const itemsToPrint: {code: string, label: string}[] = [];
      const racksToProcess = printFilter.rack === 'ALL' ? RACKS : [printFilter.rack];
      for (const r of racksToProcess) {
        for (let l = printFilter.startLevel; l <= printFilter.endLevel; l++) {
          for (let p = printFilter.startPos; p <= printFilter.endPos; p++) {
             const levelLetter = LEVEL_LABELS[l - 1];
             itemsToPrint.push({
               code: `PP-${r}-L-${l}-P-${p}`,
               label: `PP ${r} ${levelLetter}${p}`
             });
          }
        }
      }
      for (let i = 0; i < itemsToPrint.length; i++) {
        const item = itemsToPrint[i];
        if (i > 0 && i % 15 === 0) doc.addPage();
        const idxOnPage = i % 15;
        const col = idxOnPage % 3;
        const row = Math.floor(idxOnPage / 3);
        const x = 15 + (col * 55);
        const y = 15 + (row * 55);
        doc.setDrawColor(200);
        doc.rect(x, y, 50, 50);
        const qrDataUrl = await QRCode.toDataURL(item.code, { margin: 1 });
        doc.addImage(qrDataUrl, 'PNG', x + 7.5, y + 8, 35, 35);
        doc.setFontSize(12);
        doc.text(item.label, x + 25, y + 6, { align: "center" });
        doc.setFontSize(6);
        doc.text(item.code, x + 25, y + 48, { align: "center" });
      }
      doc.save("etiquetas.pdf");
      showFeedback('success', 'PDF pronto!');
      setIsPrintMenuOpen(false);
    } catch (err) {
      showFeedback('error', 'Erro no PDF.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row font-sans text-slate-900">
      <div className="flex flex-col lg:flex-row w-full">
        {feedback && (
          <div className={`fixed top-6 right-6 z-[400] p-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-right-10 ${feedback.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
            {feedback.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <span className="font-bold text-sm">{feedback.msg}</span>
          </div>
        )}

        {isGeneratingPDF && (
          <div className="fixed inset-0 z-[1000] bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center text-white">
            <Loader2 className="w-16 h-16 animate-spin mb-4" />
            <p className="font-black text-2xl uppercase">Gerando Etiquetas...</p>
          </div>
        )}

        <aside className="w-full lg:w-72 bg-white border-r border-slate-200 p-6 flex flex-col gap-8 h-auto lg:h-screen lg:sticky lg:top-0">
          <div className="flex items-center gap-3">
            <Warehouse className="text-indigo-600 w-8 h-8" />
            <div>
              <h1 className="text-xl font-bold italic tracking-tighter">Porta Pallets</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Controle de Estoque</p>
            </div>
          </div>
          <nav className="flex flex-col gap-2">
            <button onClick={() => setIsSearchOpen(true)} className="flex items-center gap-3 p-3 bg-indigo-600 text-white rounded-xl font-semibold shadow-lg hover:scale-105 transition-transform"><Search size={20} /> Buscar Item</button>
            <button onClick={() => { setIsScannerOpen(true); setIsManualScannerMode(false); }} className="flex items-center gap-3 p-3 text-slate-500 hover:bg-slate-100 rounded-xl"><ScanLine size={20} /> Saída (QR Code)</button>
            <button onClick={() => setIsPrintMenuOpen(true)} className="flex items-center gap-3 p-3 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all border border-indigo-100 font-bold"><Printer size={20} /> Gerar QRs</button>
            <button onClick={() => setIsSettingsOpen(true)} className="flex items-center gap-3 p-3 text-slate-500 hover:bg-slate-100 rounded-xl transition-all"><Settings size={20} /> Configurações</button>
          </nav>
        </aside>

        <main className="flex-1 p-6 lg:p-10">
          <header className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
              <div><p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Pallets Ativos</p><h2 className="text-4xl font-black">{stats.occupiedPositions}</h2></div>
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

          <div className="bg-white p-6 lg:p-10 rounded-[2.5rem] shadow-sm border border-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-6 mb-8">
              <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl">
                {RACKS.map(r => (
                  <button key={r} onClick={() => setActiveRack(r)} className={`px-6 py-3 rounded-xl font-black transition-all ${activeRack === r ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400'}`}>RACK {r}</button>
                ))}
              </div>
              <div className="flex gap-2">
                {LEVEL_LABELS.map((l, idx) => (
                  <button key={l} onClick={() => setActiveLevelIndex(idx)} className={`w-12 h-12 flex items-center justify-center rounded-2xl font-black transition-all ${activeLevelIndex === idx ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{l}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-6 sm:grid-cols-11 gap-2 max-h-[500px] overflow-y-auto no-scrollbar pt-4">
              {Array.from({ length: POSITIONS_PER_LEVEL }).map((_, i) => {
                const pos = i + 1;
                const occ = inventory.find(p => p.rack === activeRack && p.level === (activeLevelIndex + 1) && p.position === pos);
                return (
                  <button key={pos} onClick={() => handlePositionClick(activeRack, activeLevelIndex, pos)} className={`aspect-square rounded-xl flex flex-col items-center justify-center border-2 transition-all ${occ ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-slate-50 border-transparent text-slate-300'}`}>
                    <span className="text-[9px] font-black">{LEVEL_LABELS[activeLevelIndex]}{pos}</span>
                    {occ && <Package size={16} className="mt-1" />}
                  </button>
                );
              })}
            </div>
          </div>
        </main>
      </div>

      {selectedPosition && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="p-6 bg-indigo-600 text-white flex justify-between items-center">
              <h3 className="font-black text-xl">Entrada {selectedPosition.rack}{getLevelLetter(selectedPosition.level - 1)}{selectedPosition.position}</h3>
              <button onClick={() => setSelectedPosition(null)}><X /></button>
            </div>
            <form onSubmit={handleSavePosition} className="p-6 space-y-4">
              <input type="text" placeholder="ID Produto" className="w-full p-4 bg-slate-50 rounded-xl font-bold" value={selectedPosition.productId || ''} onChange={e => setSelectedPosition({...selectedPosition, productId: e.target.value.toUpperCase()})} />
              <input type="text" placeholder="Nome / Descrição" className="w-full p-4 bg-slate-50 rounded-xl font-bold" value={selectedPosition.productName || ''} onChange={e => setSelectedPosition({...selectedPosition, productName: e.target.value.toUpperCase()})} />
              <input type="number" placeholder="Quantidade" className="w-full p-4 bg-slate-50 rounded-xl font-bold" value={selectedPosition.quantity || ''} onChange={e => setSelectedPosition({...selectedPosition, quantity: parseInt(e.target.value) || 0})} />
              <button type="submit" className="w-full bg-indigo-600 text-white p-4 rounded-xl font-black">SALVAR</button>
            </form>
          </div>
        </div>
      )}

      {isScannerOpen && (
        <div className="fixed inset-0 bg-black z-[300] flex flex-col items-center justify-center">
          <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden h-[500px] flex flex-col relative">
            <button onClick={() => setIsScannerOpen(false)} className="absolute top-4 right-4 z-50 bg-white/20 p-2 rounded-full"><X /></button>
            {!isManualScannerMode ? <div id="reader" className="flex-1"></div> : (
              <div className="p-8 flex-1 flex flex-col justify-center gap-4">
                <p className="font-black text-center text-indigo-600">Busca Manual</p>
                <div className="flex gap-2">
                  {RACKS.map(r => <button key={r} onClick={() => setManualEntryData({...manualEntryData, rack: r})} className={`flex-1 p-4 rounded-xl font-black ${manualEntryData.rack === r ? 'bg-indigo-600 text-white' : 'bg-slate-100'}`}>{r}</button>)}
                </div>
                <button onClick={handleManualScanSubmit} className="w-full bg-indigo-600 text-white p-4 rounded-xl font-black">BUSCAR POSIÇÃO</button>
              </div>
            )}
            <button onClick={() => setIsManualScannerMode(!isManualScannerMode)} className="p-4 bg-slate-50 text-indigo-600 font-bold">{isManualScannerMode ? 'Usar Câmera' : 'Entrada Manual'}</button>
          </div>
        </div>
      )}

      {showQR && <QRCodeModal position={showQR} onClose={() => setShowQR(null)} />}
    </div>
  );
};

export default App;
