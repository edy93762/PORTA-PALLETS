
import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { Loader2, FileDown, X, PackageCheck, PackagePlus, Box, Hash } from 'lucide-react';
import { PalletPosition } from '../types';

interface QRCodeModalProps {
  position: { rack: string; level: number; pos: number };
  onClose: () => void;
  item?: PalletPosition; // Adicionado para receber os dados do item
  onManage?: () => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ position, onClose, item, onManage }) => {
  const [loading, setLoading] = useState(false);
  const levelLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const levelLetter = levelLabels[position.level - 1] || position.level.toString();
  
  // Alterado para formato sem espaços: A2A
  const labelText = `${position.rack}${position.pos}${levelLetter}`;
  const codeValue = `PP-${position.rack}-P-${position.pos}-L-${position.level}`;
  const isOccupied = !!item;

  const handleDownloadSingle = async () => {
    setLoading(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [50, 50] });
      doc.setLineWidth(0.1);
      doc.rect(1, 1, 48, 48);
      const qrDataUrl = await QRCode.toDataURL(codeValue, { errorCorrectionLevel: 'H', width: 200, margin: 0 });
      doc.addImage(qrDataUrl, 'PNG', 7.5, 9, 35, 35); // Ajustado verticalmente
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14); // Fonte maior para leitura fácil
      doc.text(labelText, 25, 7, { align: "center" });
      
      doc.setFontSize(8);
      doc.text(codeValue, 25, 46, { align: "center" });
      doc.save(`Endereco_${labelText}.pdf`);
    } catch (e) {
      console.error(e);
      alert("Erro ao gerar PDF");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center z-[9000] p-4">
      <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200 relative">
        
        {/* Header Decorativo */}
        <div className={`h-24 w-full flex items-center justify-center relative ${isOccupied ? 'bg-rose-500' : 'bg-emerald-500'}`}>
            <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors"><X size={20}/></button>
            <h2 className="text-white font-black text-3xl italic tracking-widest uppercase opacity-90">{labelText}</h2>
        </div>

        <div className="p-8 flex flex-col items-center -mt-6">
            {/* Cartão de Informação do Produto (Se ocupado) */}
            {isOccupied ? (
                <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6 w-full mb-6 relative z-10">
                    <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 flex items-center gap-1"><Box size={12}/> Produto Armazenado</div>
                    <h3 className="text-xl font-black text-slate-800 uppercase leading-tight mb-3">{item.productName}</h3>
                    
                    <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                        <div>
                            <span className="text-[9px] font-bold text-slate-400 uppercase block">Quantidade</span>
                            <span className="text-2xl font-black text-indigo-600">{item.quantity} <span className="text-xs text-slate-400">un</span></span>
                        </div>
                        <div className="text-right">
                             <span className="text-[9px] font-bold text-slate-400 uppercase block">ID / SKU</span>
                             <span className="text-sm font-black text-slate-600 bg-slate-100 px-2 py-1 rounded-md">{item.productId}</span>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-4 w-full mb-6 relative z-10 text-center">
                    <span className="text-emerald-500 font-black uppercase text-sm flex items-center justify-center gap-2"><PackageCheck size={18}/> Posição Livre</span>
                </div>
            )}

            {/* Área do QR Code */}
            <div className="p-4 bg-white border-2 border-slate-100 rounded-3xl shadow-inner mb-6">
                <QRCodeSVG value={codeValue} size={140} level="H" />
            </div>

            {/* Ações */}
            <div className="w-full grid grid-cols-1 gap-3">
            <button 
                onClick={handleDownloadSingle}
                disabled={loading}
                className="w-full bg-slate-800 hover:bg-slate-900 text-white font-black py-4 rounded-xl transition-all shadow-lg text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95"
            >
                {loading ? <Loader2 className="animate-spin" size={16}/> : <><FileDown size={16}/> Imprimir Etiqueta</>}
            </button>

            {onManage && (
                <button 
                onClick={() => {
                    onClose();
                    onManage();
                }}
                className={`w-full font-black py-4 rounded-xl transition-all shadow-lg text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95
                    ${isOccupied ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' : 'bg-indigo-600 text-white hover:bg-indigo-700'}
                `}
                >
                {isOccupied ? <><PackageCheck size={16}/> Gerenciar / Saída</> : <><PackagePlus size={16}/> Realizar Entrada</>}
                </button>
            )}
            </div>
        </div>
      </div>
    </div>
  );
};