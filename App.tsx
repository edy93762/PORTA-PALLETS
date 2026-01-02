
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Package, Warehouse, Search, LayoutGrid, QrCode, TrendingUp, Box, 
  Save, Trash2, X, MapPin, ScanLine, Settings, 
  Download, Upload, HardDrive, AlertCircle, CheckCircle2,
  Printer, FileDown, Check, ArrowRight, Loader2, LogOut, Minus, Activity, Cloud, Keyboard, Camera
} from 'lucide-react';
import { PalletPosition, RackId } from './types';
import { QRCodeModal } from './components/QRCodeModal';
import { generateCSV, parseCSV } from './services/sheetsService';
import { initializeDatabase, fetchInventoryFromDB, saveItemToDB, deleteItemFromDB, clearDatabase } from './services/neonService';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { jsPDF } from "jspdf";
import QRCode from "qrcode";

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
  
  // Neon DB Config - Inicia com a string fixa
  const [dbConnectionString, setDbConnectionString] = useState(FIXED_DB_STRING);
  const [isDbConnected, setIsDbConnected] = useState(false);
  const [isLoadingDb, setIsLoadingDb] = useState(false);

  // Estados para Scanner e Saída
  const [scannedPosition, setScannedPosition] = useState<PalletPosition | null>(null);
  const [exitQuantity, setExitQuantity] = useState<number | string>(''); 
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isManualScannerMode, setIsManualScannerMode] = useState(false); // Alternar entre Câmera e Manual
  const [manualEntryData, setManualEntryData] = useState({ rack: 'A' as RackId, level: 1, pos: 1 });
  
  // Estados para UI
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  const getLevelLetter = (lvlIndex: number) => LEVEL_LABELS[lvlIndex] || (lvlIndex + 1).toString();

  // Load Data (Prioridade para Neon DB Fixo)
  useEffect(() => {
    // Tenta conectar automaticamente ao carregar a página
    loadFromNeon(FIXED_DB_STRING);
  }, []);

  const loadFromNeon = async (str: string) => {
    setIsLoadingDb(true);
    try {
      // Tenta inicializar (criar tabela) caso seja a primeira vez
      await initializeDatabase(str);
      const data = await fetchInventoryFromDB(str);
      setInventory(data);
      setIsDbConnected(true);
      showFeedback('success', 'Conectado ao Banco de Dados!');
    } catch (error) {
      console.error(error);
      setIsDbConnected(false);
      showFeedback('error', 'Erro na conexão com Banco.');
      
      // Fallback para dados locais se a conexão falhar
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
    // Mantido para permitir reconexão manual se necessário, mas usa a string do estado
    await loadFromNeon(dbConnectionString);
  };

  // Lógica do Scanner QR Code
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
          alert("QR Code não reconhecido pelo sistema RackMaster.");
        }
      }, (errorMessage) => {
        // Ignorar erros de leitura contínua
      });

      return () => {
        scanner.clear().catch(console.error);
      };
    }
  }, [isScannerOpen, isManualScannerMode]);

  // Calcula o estoque total de um ID específico
  const getTotalStockById = (productId: string) => {
    if (!productId) return 0;
    return inventory
      .filter(p => p.productId === productId)
      .reduce((acc, curr) => acc + (curr.quantity || 0), 0);
  };

  // Lógica de Busca (Resultados)
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
    // Garante que o scanner feche
    setIsScannerOpen(false);
    setIsManualScannerMode(false);

    const existing = inventory.find(p => p.rack === rack && p.level === level && p.position === pos);
    
    if (existing) {
      setExitQuantity(''); 
      setScannedPosition(existing);
    } else {
      // Se não existe, não dá pra dar saída, mas podemos abrir pra entrada ou avisar
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
      showFeedback('success', 'Item removido completamente. Posição liberada.');
    }
    
    // Update State & Storage
    setInventory(newInv);
    
    if (isDbConnected) {
      try {
        if (updatedItem) {
          await saveItemToDB(dbConnectionString, updatedItem);
        } else {
          // AQUI: Passamos o objeto completo scannedPosition para a exclusão robusta
          await deleteItemFromDB(dbConnectionString, scannedPosition);
        }
      } catch (err) {
        showFeedback('error', 'Erro ao sincronizar saída com Neon.');
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

  const handleExportData = () => {
    const csvContent = generateCSV(inventory);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `estoque_portapallets_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const parsedData = parseCSV(text);
      if (parsedData.length > 0) {
        setInventory(parsedData);
        
        if (isDbConnected) {
            setIsLoadingDb(true);
            try {
                // Bulk insert/update simulation
                for (const item of parsedData) {
                    await saveItemToDB(dbConnectionString, item);
                }
                showFeedback('success', 'Dados importados para o Neon!');
            } catch (err) {
                showFeedback('error', 'Erro ao salvar importação no Neon.');
            } finally {
                setIsLoadingDb(false);
            }
        } else {
            localStorage.setItem('rackmaster-local-data', JSON.stringify(parsedData));
            showFeedback('success', 'Dados importados localmente!');
        }
        setIsSettingsOpen(false);
      } else {
        showFeedback('error', 'CSV inválido.');
      }
    };
    reader.readAsText(file);
  };

  const handleClearAllData = async () => {
    if (!window.confirm("ATENÇÃO: Isso apagará TODOS os itens do estoque permanentemente do Banco de Dados.\n\nTem certeza absoluta?")) return;
    
    setIsLoadingDb(true);
    try {
        if (isDbConnected) {
            await clearDatabase(dbConnectionString);
        }
        setInventory([]);
        localStorage.removeItem('rackmaster-local-data');
        showFeedback('success', 'Estoque resetado com sucesso!');
        setIsSettingsOpen(false);
    } catch (e) {
        console.error(e);
        showFeedback('error', 'Erro ao limpar banco de dados.');
    } finally {
        setIsLoadingDb(false);
    }
  }

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

    if (!selectedPosition.productName?.trim()) {
      showFeedback('error', 'O NOME do item é OBRIGATÓRIO!');
      return;
    }
    if (!selectedPosition.productId?.trim()) {
      showFeedback('error', 'O ID do item é OBRIGATÓRIO!');
      return;
    }
    if (!selectedPosition.quantity || selectedPosition.quantity <= 0) {
      showFeedback('error', 'A QUANTIDADE deve ser maior que 0!');
      return;
    }

    const itemToSave = { ...selectedPosition, lastUpdated: new Date().toISOString() };
    const newInv = inventory.filter(p => p.id !== selectedPosition.id);
    newInv.push(itemToSave);
    
    setInventory(newInv);
    
    if (isDbConnected) {
      try {
        await saveItemToDB(dbConnectionString, itemToSave);
        showFeedback('success', 'Salvo no Neon DB!');
      } catch (err) {
        showFeedback('error', 'Erro ao salvar no Neon.');
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
      const labelSize = 50;
      const marginLeft = 15;
      const marginTop = 15;
      const gap = 5;
      const cols = 3;
      const rows = 5;
      const itemsPerPage = cols * rows;

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
        if (i > 0 && i % itemsPerPage === 0) doc.addPage();
        const indexOnPage = i % itemsPerPage;
        const col = indexOnPage % cols;
        const row = Math.floor(indexOnPage / cols);
        const x = marginLeft + (col * (labelSize + gap));
        const y = marginTop + (row * (labelSize + gap));

        doc.setLineWidth(0.1);
        doc.setDrawColor(200, 200, 200);
        doc.rect(x, y, labelSize, labelSize);

        const qrDataUrl = await QRCode.toDataURL(item.code, { errorCorrectionLevel: 'H', width: 200, margin: 1 });
        const qrSize = 35; 
        const qrX = x + (labelSize - qrSize) / 2;
        const qrY = y + 8;
        doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        doc.text(item.label, x + labelSize / 2, y + 6, { align: "center" });

        doc.setFont("courier", "normal");
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        doc.text(item.code, x + labelSize / 2, y + labelSize - 3, { align: "center" });
      }
      doc.save("etiquetas_portapallets.pdf");
      showFeedback('success', 'PDF baixado!');
      setIsPrintMenuOpen(false);
    } catch (err) {
      console.error(err);
      showFeedback('error', 'Erro ao gerar PDF.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row font-sans text-slate-900">
      
      {/* Interface Principal */}
      <div className="flex flex-col lg:flex-row w-full">
        {feedback && (
          <div className={`fixed top-6 right-6 z-[400] p-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-right-10 ${feedback.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
            {feedback.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <span className="font-bold text-sm">{feedback.msg}</span>
          </div>
        )}

        {isGeneratingPDF && (
          <div className="fixed inset-0 z-[1000] bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center text-white">
            <Loader2 className="w-16 h-16 animate-spin mb-4 text-indigo-400" />
            <p className="font-black text-2xl uppercase tracking-tighter">Gerando PDF...</p>
          </div>
        )}

        {/* Sidebar */}
        <aside className="w-full lg:w-72 bg-white border-r border-slate-200 p-6 flex flex-col gap-8 h-auto lg:h-screen lg:sticky lg:top-0">
          <div className="flex items-center gap-3">
            <Warehouse className="text-indigo-600 w-8 h-8" />
            <div className="flex flex-col">
                <h1 className="text-xl font-bold tracking-tighter italic">Porta Pallets <span className="text-xs bg-slate-100 px-2 py-0.5 rounded not-italic">PRO</span></h1>
                {isDbConnected ? 
                    <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-bold uppercase"><Cloud size={10} /> Conectado (Neon)</span> :
                    <span className="flex items-center gap-1 text-[10px] text-amber-600 font-bold uppercase"><HardDrive size={10} /> Conectando...</span>
                }
            </div>
          </div>
          
          <nav className="flex flex-col gap-2">
            <button onClick={() => setIsSearchOpen(true)} className="flex items-center gap-3 p-3 bg-indigo-600 text-white rounded-xl font-semibold shadow-lg shadow-indigo-100 hover:scale-105 transition-transform"><Search size={20} /> Consultar Item</button>
            <button className="flex items-center gap-3 p-3 text-slate-600 hover:bg-slate-100 rounded-xl transition-all font-medium"><LayoutGrid size={20} /> Mapa de Carga</button>
            <button onClick={() => { setIsScannerOpen(true); setIsManualScannerMode(false); }} className="flex items-center gap-3 p-3 text-slate-500 hover:bg-slate-100 rounded-xl transition-all"><ScanLine size={20} /> Escanear QR (Saída)</button>
            <button onClick={() => setIsPrintMenuOpen(true)} className="flex items-center gap-3 p-3 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all border border-indigo-100 font-bold">
              <Printer size={20} /> Baixar Etiquetas
            </button>
            <button onClick={handleExportData} className="flex items-center gap-3 p-3 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all border border-emerald-100 mt-2 font-bold">
              <Download size={20} /> Backup CSV
            </button>
            <button onClick={() => setIsSettingsOpen(true)} className="flex items-center gap-3 p-3 text-slate-500 hover:bg-slate-100 rounded-xl transition-all"><Settings size={20} /> Configurações</button>
          </nav>
        </aside>

        <main className="flex-1 p-6 lg:p-10">
          <header className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mb-1">Pallets Ativos</p>
                <h2 className="text-4xl font-black">{stats.occupiedPositions}</h2>
              </div>
              <Box className="text-indigo-100 w-12 h-12" />
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mb-1">Posições Livres</p>
                <h2 className="text-4xl font-black">{stats.totalPositions - stats.occupiedPositions}</h2>
              </div>
              <LayoutGrid className="text-emerald-100 w-12 h-12" />
            </div>
            <div className="bg-indigo-600 text-white p-6 rounded-3xl shadow-lg shadow-indigo-200 flex items-center justify-between">
              <div>
                <p className="text-indigo-200 font-bold uppercase text-[10px] tracking-widest mb-1">Taxa de Ocupação</p>
                <h2 className="text-4xl font-black">{stats.occupancyRate}%</h2>
              </div>
              <TrendingUp className="text-indigo-300 w-12 h-12" />
            </div>
          </header>

          <div className="bg-white p-6 lg:p-10 rounded-[2.5rem] shadow-sm border border-slate-100">
             {isLoadingDb && (
                 <div className="mb-4 bg-indigo-50 text-indigo-700 p-3 rounded-xl flex items-center gap-2 text-sm font-bold animate-pulse">
                     <Loader2 className="animate-spin" size={16}/> Sincronizando com Neon DB...
                 </div>
             )}

            <div className="flex flex-wrap items-center justify-between gap-6 mb-8">
              <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl">
                {RACKS.map(r => (
                  <button 
                    key={r} 
                    onClick={() => setActiveRack(r)} 
                    className={`px-6 py-3 rounded-xl font-black transition-all ${activeRack === r ? 'bg-white text-indigo-600 shadow-md scale-105' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    P. PALLET {r}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                {LEVEL_LABELS.map((l, idx) => (
                  <button 
                    key={l} 
                    onClick={() => setActiveLevelIndex(idx)} 
                    className={`w-14 h-14 flex items-center justify-center rounded-2xl font-black text-lg transition-all ${activeLevelIndex === idx ? 'bg-indigo-600 text-white shadow-xl scale-110' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-6 sm:grid-cols-11 lg:grid-cols-11 gap-2 max-h-[500px] overflow-y-auto no-scrollbar pb-4 pr-2 border-t border-slate-50 pt-8">
              {Array.from({ length: POSITIONS_PER_LEVEL }).map((_, i) => {
                const pos = i + 1;
                const occ = inventory.find(p => p.rack === activeRack && p.level === (activeLevelIndex + 1) && p.position === pos);
                return (
                  <button 
                    key={pos} 
                    onClick={() => handlePositionClick(activeRack, activeLevelIndex, pos)} 
                    className={`aspect-square rounded-xl flex flex-col items-center justify-center border-2 transition-all hover:scale-105 active:scale-90 ${occ ? 'bg-white border-indigo-200 text-indigo-600 shadow-sm' : 'bg-slate-50 border-transparent text-slate-300 hover:border-slate-200'}`}
                  >
                    <span className="text-[10px] font-black uppercase">{LEVEL_LABELS[activeLevelIndex]}{pos}</span>
                    {occ && <Package size={18} className="mt-1 animate-in zoom-in duration-300" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Modal: Editar / Entrada */}
          {selectedPosition && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[150] flex items-center justify-center p-4">
              <div className="bg-white rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95">
                <div className="p-8 bg-indigo-600 text-white flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="bg-white/20 p-3 rounded-2xl"><Package size={24} /></div>
                    <div>
                      <h3 className="font-black text-2xl uppercase tracking-tighter italic">PP {selectedPosition.rack} {getLevelLetter(selectedPosition.level - 1)}{selectedPosition.position}</h3>
                      <p className="text-xs opacity-70 font-bold uppercase tracking-widest">Nova Entrada</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedPosition(null)} className="p-2 hover:bg-white/10 rounded-xl"><X /></button>
                </div>
                <form onSubmit={handleSavePosition} className="p-8 space-y-6">
                  {/* CAMPO 1: NOME DO ITEM */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Item <span className="text-red-500">*</span></label>
                    <input 
                      type="text" 
                      placeholder="EX: ARROZ BRANCO 5KG"
                      className="w-full p-5 bg-slate-50 rounded-2xl font-black text-lg border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none transition-all" 
                      value={selectedPosition.productName || ''} 
                      onChange={e => setSelectedPosition({...selectedPosition, productName: e.target.value.toUpperCase()})} 
                    />
                  </div>
                  
                  {/* CAMPO 2: ID */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ID / Código <span className="text-red-500">*</span></label>
                    <input 
                      type="text" 
                      placeholder="EX: 12045"
                      className="w-full p-5 bg-slate-50 rounded-2xl font-black text-lg border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none transition-all" 
                      value={selectedPosition.productId || ''} 
                      onChange={e => setSelectedPosition({...selectedPosition, productId: e.target.value.toUpperCase()})} 
                    />
                  </div>

                  {/* CAMPO 3: QUANTIDADE */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Quantidade <span className="text-red-500">* (Maior que 0)</span></label>
                    <input 
                      type="number"
                      placeholder="0"
                      min="1"
                      className="w-full p-5 bg-slate-50 rounded-2xl font-black text-lg border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none transition-all" 
                      value={selectedPosition.quantity || ''} 
                      onChange={e => setSelectedPosition({...selectedPosition, quantity: parseInt(e.target.value) || 0})} 
                    />
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button type="submit" disabled={isLoadingDb} className="flex-[2] bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white p-5 rounded-[1.5rem] font-black text-lg flex items-center justify-center gap-3 shadow-xl">
                      {isLoadingDb ? <Loader2 className="animate-spin" /> : <Save size={24}/>} SALVAR
                    </button>
                    
                    <button type="button" onClick={() => setShowQR({ rack: selectedPosition.rack, level: selectedPosition.level, pos: selectedPosition.position })} className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-5 rounded-[1.5rem]">
                      <QrCode size={24} />
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal: Consultar Estoque */}
          {isSearchOpen && (
             <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
              <div className="bg-white rounded-[2.5rem] w-full max-w-lg h-[600px] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95">
                <div className="p-8 bg-indigo-600 text-white flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-4">
                    <Search size={28} />
                    <div>
                      <h3 className="font-black text-xl uppercase tracking-tighter italic">Consulta Global</h3>
                      <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Buscar em todo estoque</p>
                    </div>
                  </div>
                  <button onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }} className="p-2 hover:bg-white/10 rounded-xl"><X /></button>
                </div>
                
                <div className="p-6 shrink-0 bg-indigo-50/50 border-b border-indigo-100">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-300" />
                    <input 
                      type="text" 
                      autoFocus
                      placeholder="Digite ID ou Nome..." 
                      className="w-full p-4 pl-12 rounded-2xl border-2 border-indigo-100 bg-white font-black text-lg text-indigo-900 focus:border-indigo-500 outline-none uppercase"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
                  {searchQuery.trim() === '' ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-50">
                      <Search size={64} className="mb-4"/>
                      <p className="font-bold text-sm uppercase tracking-widest">Aguardando busca...</p>
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-rose-300 opacity-80">
                      <AlertCircle size={64} className="mb-4"/>
                      <p className="font-bold text-sm uppercase tracking-widest">Nenhum item encontrado</p>
                    </div>
                  ) : (
                    <>
                      {/* Card de Resumo Total */}
                      <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-3xl p-6 text-white shadow-lg mb-6 shrink-0">
                         <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-2">Resumo da Busca</p>
                         <div className="flex justify-between items-end">
                            <div>
                              <p className="font-black text-3xl">{searchStats.totalQty}</p>
                              <p className="text-sm font-medium opacity-80">Unidades Totais</p>
                            </div>
                            <div className="text-right">
                              <p className="font-black text-2xl">{searchStats.locations}</p>
                              <p className="text-xs font-medium opacity-80">Paletes Encontrados</p>
                            </div>
                         </div>
                      </div>

                      <p className="font-bold text-xs uppercase text-slate-400 tracking-widest mb-2 px-2">Localizações</p>
                      
                      {searchResults.map((item) => (
                        <div key={item.id} className="bg-white border-2 border-slate-100 p-4 rounded-2xl flex items-center justify-between group hover:border-indigo-200 transition-colors">
                          <div className="flex-1 min-w-0 pr-4">
                            <div className="flex items-center gap-2 mb-1">
                               <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider">{item.productId}</span>
                               <span className="font-bold text-sm truncate block text-slate-800">{item.productName}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                               <MapPin size={12} />
                               <span>PP {item.rack} • NÍVEL {item.level} • POS {item.position}</span>
                            </div>
                          </div>
                          <div className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-xl font-black text-lg min-w-[4rem] text-center">
                            {item.quantity}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
             </div>
          )}

          {/* Modal: Confirmar Saída (Scanner) */}
          {scannedPosition && (
            <div className="fixed inset-0 bg-rose-900/60 backdrop-blur-md z-[350] flex items-center justify-center p-4">
               <div className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 border-4 border-rose-100">
                <div className="p-8 bg-rose-600 text-white flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <LogOut size={28} />
                    <div>
                      <h3 className="font-black text-xl uppercase tracking-tighter italic">Saída de Material</h3>
                      <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Retirar do Estoque</p>
                    </div>
                  </div>
                  <button onClick={() => setScannedPosition(null)} className="p-2 hover:bg-white/10 rounded-xl"><X /></button>
                </div>
                <form onSubmit={handleProcessExit} className="p-8 space-y-6">
                  <div className="bg-rose-50 p-6 rounded-3xl border border-rose-100 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><Package size={80} className="text-rose-600" /></div>
                    <p className="text-[10px] text-rose-400 font-bold uppercase tracking-widest mb-2">Item Identificado</p>
                    <h2 className="text-2xl font-black text-rose-900 mb-1 leading-tight">{scannedPosition.productName}</h2>
                    <p className="text-lg font-bold text-rose-700 mb-4">ID: {scannedPosition.productId}</p>
                    
                    <div className="flex gap-2">
                       <div className="bg-white/80 backdrop-blur-sm px-4 py-2 rounded-xl border border-rose-100 shadow-sm flex flex-col">
                         <span className="text-[10px] font-bold text-rose-400 uppercase">Neste Pallet</span>
                         <span className="text-xl font-black text-rose-600">{scannedPosition.quantity} <span className="text-xs">un</span></span>
                       </div>
                       <div className="bg-rose-200/50 backdrop-blur-sm px-4 py-2 rounded-xl border border-rose-200 shadow-sm flex flex-col flex-1">
                         <div className="flex items-center gap-1 text-rose-700">
                           <Activity size={12}/>
                           <span className="text-[10px] font-bold uppercase">Estoque Total (ID)</span>
                         </div>
                         <span className="text-xl font-black text-rose-800">{getTotalStockById(scannedPosition.productId || '')} <span className="text-xs">un</span></span>
                       </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Quantidade a Retirar</label>
                    <div className="relative">
                      <input 
                        type="number"
                        placeholder="Digite a qtd..."
                        autoFocus
                        className="w-full p-5 pl-14 bg-slate-50 rounded-2xl font-black text-xl border-2 border-rose-100 focus:border-rose-500 focus:bg-white outline-none transition-all text-rose-600" 
                        value={exitQuantity} 
                        onChange={e => setExitQuantity(e.target.value)} 
                      />
                      <Minus className="absolute left-5 top-1/2 -translate-y-1/2 text-rose-300" />
                    </div>
                    <p className="text-xs text-center text-slate-400 font-medium">
                      {Number(exitQuantity) >= (scannedPosition.quantity || 0) ? 
                        "Atenção: Essa ação irá zerar esta posição." : 
                        "A posição continuará ocupada com o restante."}
                    </p>
                  </div>
                  
                  <button 
                    type="submit"
                    disabled={isLoadingDb}
                    className="w-full bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white p-6 rounded-[2rem] font-black text-xl shadow-xl shadow-rose-200 flex items-center justify-center gap-3 uppercase tracking-widest transition-all hover:scale-105 active:scale-95"
                  >
                    {isLoadingDb ? <Loader2 className="animate-spin" /> : <LogOut />} CONFIRMAR SAÍDA
                  </button>
                </form>
               </div>
            </div>
          )}

          {/* Menu de Download PDF */}
          {isPrintMenuOpen && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
              <div className="bg-white rounded-[3rem] w-full max-w-xl overflow-hidden shadow-2xl animate-in zoom-in-95">
                <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="bg-indigo-400 text-white p-2 rounded-xl"><FileDown size={24} /></div>
                    <div>
                      <h3 className="font-black text-xl uppercase tracking-tighter italic">Central de Impressão</h3>
                      <p className="text-[10px] font-bold opacity-50 uppercase tracking-widest">Etiquetas 5x5cm</p>
                    </div>
                  </div>
                  <button onClick={() => setIsPrintMenuOpen(false)} className="p-2 hover:bg-white/10 rounded-xl"><X /></button>
                </div>
                
                <div className="p-8 space-y-6">
                  {/* Atalhos Rápidos */}
                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={() => {
                        setPrintFilter({...printFilter, rack: 'ALL', startLevel: 1, endLevel: 5, startPos: 1, endPos: 66});
                      }}
                      className={`p-4 rounded-3xl border-2 text-left transition-all ${printFilter.rack === 'ALL' ? 'bg-indigo-50 border-indigo-500' : 'bg-slate-50 border-transparent hover:bg-slate-100'}`}
                    >
                      <span className="block font-black text-lg mb-1">TUDO</span>
                      <span className="text-xs font-bold text-slate-400 uppercase">Todos os Porta Pallets (A-D)</span>
                    </button>
                    <button 
                      onClick={() => {
                        setPrintFilter({...printFilter, rack: activeRack, startLevel: 1, endLevel: 5, startPos: 1, endPos: 66});
                      }}
                      className={`p-4 rounded-3xl border-2 text-left transition-all ${printFilter.rack === activeRack ? 'bg-indigo-50 border-indigo-500' : 'bg-slate-50 border-transparent hover:bg-slate-100'}`}
                    >
                      <span className="block font-black text-lg mb-1">P. PALLET {activeRack}</span>
                      <span className="text-xs font-bold text-slate-400 uppercase">Apenas Atual</span>
                    </button>
                  </div>

                  <div className="border-t border-slate-100 pt-6">
                    <p className="font-bold text-xs uppercase text-slate-400 tracking-widest mb-4">Personalizar Seleção</p>
                    
                    <div className="space-y-4">
                      {/* Seletor de Rack Manual */}
                      <div className="flex gap-2">
                        {RACKS.map(r => (
                          <button 
                            key={r} 
                            onClick={() => setPrintFilter({...printFilter, rack: r})}
                            className={`flex-1 py-3 rounded-xl font-black border-2 ${printFilter.rack === r ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-100 text-slate-400'}`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Níveis</label>
                          <div className="flex gap-2">
                            <select className="flex-1 p-3 bg-slate-50 rounded-xl font-bold text-sm" value={printFilter.startLevel} onChange={e => setPrintFilter({...printFilter, startLevel: parseInt(e.target.value)})}>
                              {LEVEL_LABELS.map((l, i) => <option key={l} value={i+1}>{l}</option>)}
                            </select>
                            <select className="flex-1 p-3 bg-slate-50 rounded-xl font-bold text-sm" value={printFilter.endLevel} onChange={e => setPrintFilter({...printFilter, endLevel: parseInt(e.target.value)})}>
                              {LEVEL_LABELS.map((l, i) => <option key={l} value={i+1}>{l}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Posições</label>
                          <div className="flex gap-2">
                            <input type="number" className="w-full p-3 bg-slate-50 rounded-xl font-bold text-sm" value={printFilter.startPos} onChange={e => setPrintFilter({...printFilter, startPos: parseInt(e.target.value)})}/>
                            <input type="number" className="w-full p-3 bg-slate-50 rounded-xl font-bold text-sm" value={printFilter.endPos} onChange={e => setPrintFilter({...printFilter, endPos: parseInt(e.target.value)})}/>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={generatePDF}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-5 rounded-3xl font-black text-lg uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 mt-2"
                  >
                    BAIXAR PDF (A4) <FileDown />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Configurações */}
          {isSettingsOpen && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
              <div className="bg-white rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95">
                <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
                  <h3 className="font-black text-xl uppercase tracking-widest italic">Configurações</h3>
                  <button onClick={() => setIsSettingsOpen(false)} className="p-2 hover:bg-white/10 rounded-xl"><X /></button>
                </div>
                <div className="p-8 space-y-6">
                  
                  {/* Neon DB Connection */}
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Conexão Neon DB (PostgreSQL)</label>
                    <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                        <input 
                            type="password"
                            placeholder="postgres://user:pass@ep-xyz.neon.tech/neondb?sslmode=require"
                            className="w-full bg-white p-3 rounded-xl border border-slate-200 text-sm font-mono text-slate-600 focus:border-indigo-500 outline-none mb-3"
                            value={dbConnectionString}
                            onChange={(e) => setDbConnectionString(e.target.value)}
                        />
                        <button 
                            onClick={handleSaveDbConfig}
                            disabled={isLoadingDb}
                            className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 ${isDbConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                        >
                            {isLoadingDb ? <Loader2 className="animate-spin" size={16}/> : isDbConnected ? <Check size={16}/> : <Cloud size={16}/>}
                            {isDbConnected ? "Conectado e Sincronizado" : "Salvar e Conectar"}
                        </button>
                        <p className="text-[10px] text-slate-400 mt-2 text-center">Cole sua Connection String do Console do Neon aqui.</p>
                    </div>
                  </div>

                  <hr className="border-slate-100"/>

                  <div className="space-y-3">
                     <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Dados Locais</label>
                     <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center justify-between p-6 bg-amber-50 text-amber-700 rounded-3xl border border-amber-100 font-black uppercase text-sm hover:bg-amber-100 transition-colors">
                        Restaurar via CSV <Upload size={20} />
                     </button>
                     <input type="file" ref={fileInputRef} onChange={handleImportData} hidden accept=".csv" />
                  </div>

                  <div className="pt-6 border-t border-slate-100">
                      <p className="text-xs font-bold text-rose-500 uppercase tracking-widest mb-3">Zona de Perigo</p>
                      <button 
                          onClick={handleClearAllData}
                          className="w-full py-4 bg-rose-100 text-rose-700 rounded-2xl font-black uppercase text-sm border-2 border-rose-200 hover:bg-rose-200 hover:border-rose-300 transition-all flex items-center justify-center gap-2"
                      >
                          <Trash2 size={20} /> Resetar Todo o Estoque
                      </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* QR Scanner & Manual Exit Modal */}
          {isScannerOpen && (
            <div className="fixed inset-0 bg-slate-900/98 backdrop-blur-2xl z-[300] flex flex-col items-center justify-center p-6">
              <div className="w-full max-w-md bg-white rounded-[3rem] overflow-hidden shadow-2xl animate-in zoom-in-95 relative flex flex-col h-[600px]">
                
                {/* Header do Modal */}
                <div className="p-8 bg-slate-900 text-white flex justify-between items-center z-10 relative shrink-0">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isManualScannerMode ? 'bg-indigo-500' : 'bg-emerald-500'}`}>
                        {isManualScannerMode ? <Keyboard size={24} /> : <ScanLine size={24} />}
                    </div>
                    <div>
                      <span className="font-black uppercase tracking-widest text-sm italic block">Modo Saída</span>
                      <span className="text-[10px] text-slate-400">
                          {isManualScannerMode ? 'Entrada Manual de Posição' : 'Aponte para o QR Code'}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => {setIsScannerOpen(false); setIsManualScannerMode(false);}} className="p-2 hover:bg-white/10 rounded-xl"><X /></button>
                </div>

                {/* Conteúdo: Câmera ou Formulário */}
                <div className="flex-1 bg-black relative flex flex-col">
                    {!isManualScannerMode ? (
                         <div id="reader" className="w-full h-full bg-black"></div>
                    ) : (
                        <div className="w-full h-full bg-slate-50 p-8 flex flex-col justify-center">
                            <form onSubmit={handleManualScanSubmit} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Selecione o Rack</label>
                                    <div className="flex gap-2">
                                        {RACKS.map(r => (
                                            <button 
                                                key={r}
                                                type="button"
                                                onClick={() => setManualEntryData({...manualEntryData, rack: r})}
                                                className={`flex-1 py-4 rounded-xl font-black text-xl border-2 transition-all ${manualEntryData.rack === r ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-400'}`}
                                            >
                                                {r}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Nível (1-5)</label>
                                        <select 
                                            className="w-full p-4 rounded-xl border-2 border-slate-200 font-bold text-lg bg-white"
                                            value={manualEntryData.level}
                                            onChange={(e) => setManualEntryData({...manualEntryData, level: parseInt(e.target.value)})}
                                        >
                                            {LEVEL_LABELS.map((l, i) => <option key={l} value={i+1}>{l}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Posição (1-66)</label>
                                        <input 
                                            type="number" 
                                            min="1" 
                                            max="66"
                                            className="w-full p-4 rounded-xl border-2 border-slate-200 font-bold text-lg bg-white"
                                            value={manualEntryData.pos}
                                            onChange={(e) => setManualEntryData({...manualEntryData, pos: parseInt(e.target.value)})}
                                        />
                                    </div>
                                </div>

                                <div className="bg-indigo-50 p-4 rounded-xl flex items-center justify-center gap-2 text-indigo-700 font-black text-lg border-2 border-indigo-100 border-dashed">
                                    <MapPin size={20}/>
                                    PP {manualEntryData.rack} {getLevelLetter(manualEntryData.level-1)}{manualEntryData.pos}
                                </div>

                                <button type="submit" className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-2">
                                    Buscar Posição <ArrowRight />
                                </button>
                            </form>
                        </div>
                    )}

                    {/* Botão de Alternância no Rodapé */}
                    <div className="p-4 bg-white border-t border-slate-100 flex justify-center">
                        <button 
                            onClick={() => setIsManualScannerMode(!isManualScannerMode)}
                            className="text-indigo-600 font-bold text-sm flex items-center gap-2 bg-indigo-50 px-6 py-3 rounded-full hover:bg-indigo-100 transition-colors"
                        >
                            {isManualScannerMode ? <><Camera size={18}/> Usar Câmera</> : <><Keyboard size={18}/> Digitar Código Manualmente</>}
                        </button>
                    </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {showQR && <QRCodeModal position={showQR} onClose={() => setShowQR(null)} />}
    </div>
  );
};

export default App;
