
import React, { useState, useMemo } from 'react';
import { X, Printer, FileDown, Loader2, Check } from 'lucide-react';
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { RackId } from '../types';

interface BulkPrintModalProps {
  onClose: () => void;
}

const RACK_CONFIG: Record<string, { positions: number }> = {
  'A': { positions: 66 },
  'B': { positions: 66 },
  'C': { positions: 66 },
  'D': { positions: 62 }
};

export const BulkPrintModal: React.FC<BulkPrintModalProps> = ({ onClose }) => {
  const [selectedRack, setSelectedRack] = useState<RackId>('A');
  const [selectedLevel, setSelectedLevel] = useState<number>(1);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);

  const levels = ['A', 'B', 'C', 'D', 'E'];
  const racks: RackId[] = ['A', 'B', 'C', 'D'];

  const togglePosition = (pos: number) => {
    const key = `${selectedRack}-${selectedLevel}-${pos}`;
    const newSet = new Set(selectedItems);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setSelectedItems(newSet);
  };

  const handleGeneratePDF = async () => {
    if (selectedItems.size === 0) return;
    setIsGenerating(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [50, 50] });
      const items = Array.from(selectedItems) as string[];

      for (let i = 0; i < items.length; i++) {
        if (i > 0) doc.addPage([50, 50], 'portrait');
        
        const [rack, level, pos] = items[i].split('-');
        const levelChar = levels[parseInt(level) - 1];
        const labelText = `${rack} ${pos} ${levelChar}`;
        const codeValue = `${rack} ${pos} ${levelChar}`;

        doc.setLineWidth(0.1);
        doc.rect(1, 1, 48, 48);
        
        const qrDataUrl = await QRCode.toDataURL(codeValue, { 
          errorCorrectionLevel: 'H', 
          width: 200, 
          margin: 0 
        });
        
        doc.addImage(qrDataUrl, 'PNG', 7.5, 9, 35, 35); 
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10); 
        doc.text(labelText, 25, 7, { align: "center" });
        
        doc.setFontSize(6);
        doc.text(codeValue, 25, 46, { align: "center" });
      }

      doc.save(`Etiquetas_Lote_${new Date().getTime()}.pdf`);
      onClose();
    } catch (e) {
      console.error(e);
      alert("Erro ao gerar PDF");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-[9500] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-6xl h-[90vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        <header className="p-6 border-b flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
              <Printer size={24} />
            </div>
            <h2 className="text-2xl font-black italic text-slate-800 uppercase tracking-tight">Impressão em Massa</h2>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-200 rounded-full transition-colors">
            <X size={24} />
          </button>
        </header>

        <div className="flex-1 flex overflow-hidden">
          <aside className="w-80 border-r bg-white p-8 overflow-y-auto space-y-8">
            <section>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4 block">1. Escolha a Rua</label>
              <div className="grid grid-cols-2 gap-3">
                {racks.map(r => (
                  <button 
                    key={r}
                    onClick={() => { setSelectedRack(r); }}
                    className={`p-4 rounded-xl font-black text-lg transition-all border-2 ${selectedRack === r ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-indigo-200'}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4 block">2. Escolha o Nível</label>
              <div className="flex flex-wrap gap-2">
                {levels.map((label, i) => (
                  <button 
                    key={label}
                    onClick={() => setSelectedLevel(i + 1)}
                    className={`w-12 h-12 rounded-xl font-black text-sm transition-all border-2 ${selectedLevel === i + 1 ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-indigo-200'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            <section className="bg-slate-50 p-6 rounded-3xl border border-slate-100 text-center">
              <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Total Selecionado</span>
              <span className="text-5xl font-black text-indigo-600">{selectedItems.size}</span>
            </section>

            <button 
              onClick={handleGeneratePDF}
              disabled={selectedItems.size === 0 || isGenerating}
              className={`w-full py-5 rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 transition-all shadow-xl active:scale-95 ${selectedItems.size > 0 ? 'bg-slate-800 text-white hover:bg-slate-900' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
            >
              {isGenerating ? <Loader2 className="animate-spin" /> : <FileDown size={20} />}
              Gerar PDF
            </button>
          </aside>

          <main className="flex-1 bg-slate-50/50 p-10 overflow-y-auto">
             <div className="mb-6 text-center">
                <p className="text-xs font-black uppercase text-slate-400 tracking-[0.2em]">3. Selecione as vagas na grade</p>
                <h3 className="text-xl font-black text-slate-800 mt-1">RUA {selectedRack} - NÍVEL {levels[selectedLevel-1]}</h3>
                <p className="text-[10px] text-slate-400 uppercase font-bold">Capacidade: {RACK_CONFIG[selectedRack].positions} posições</p>
             </div>

             <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-11 gap-3 max-w-4xl mx-auto">
                {Array.from({ length: RACK_CONFIG[selectedRack].positions }).map((_, i) => {
                  const pos = i + 1;
                  const key = `${selectedRack}-${selectedLevel}-${pos}`;
                  const isSelected = selectedItems.has(key);
                  return (
                    <button
                      key={pos}
                      onClick={() => togglePosition(pos)}
                      className={`aspect-square rounded-xl flex items-center justify-center font-black text-xs transition-all border-2 relative ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white shadow-md scale-105' : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-300'}`}
                    >
                      {pos}
                      {isSelected && (
                        <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                          <Check size={10} className="text-white" strokeWidth={4} />
                        </div>
                      )}
                    </button>
                  );
                })}
             </div>
          </main>
        </div>
      </div>
    </div>
  );
};
