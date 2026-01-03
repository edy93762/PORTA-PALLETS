
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { Loader2, FileDown, X, Settings2, PackageCheck, PackagePlus } from 'lucide-react';

interface QRCodeModalProps {
  position: { rack: string; level: number; pos: number };
  onClose: () => void;
  isOccupied?: boolean;
  onManage?: () => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ position, onClose, isOccupied, onManage }) => {
  const [loading, setLoading] = useState(false);
  const levelLabels = ['A', 'B', 'C', 'D', 'E'];
  const levelLetter = levelLabels[position.level - 1] || position.level.toString();
  
  const labelText = `${position.rack} ${position.pos} ${levelLetter}`;
  const codeValue = `PP-${position.rack}-P-${position.pos}-L-${position.level}`;

  const handleDownloadSingle = async () => {
    setLoading(true);
    try {
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
      doc.save(`Endereco_${position.rack}_${position.pos}_${levelLetter}.pdf`);
    } catch (e) {
      console.error(e);
      alert("Erro ao gerar PDF");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center z-[9000] p-4">
      <div className="bg-white rounded-[3rem] shadow-2xl max-w-sm w-full p-8 flex flex-col items-center animate-in zoom-in-95 duration-200">
        <header className="w-full flex justify-between items-center mb-6">
           <div className="flex flex-col">
             <h3 className="font-black text-indigo-600 uppercase italic text-xs tracking-widest">Etiqueta de Endereço</h3>
             <span className={`text-[9px] font-bold uppercase mt-1 px-2 py-0.5 rounded-full w-fit ${isOccupied ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
               {isOccupied ? 'Ocupado' : 'Livre'}
             </span>
           </div>
           <button onClick={onClose} className="p-2 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"><X/></button>
        </header>
        
        <p className="text-slate-800 mb-6 font-black bg-indigo-50 text-indigo-600 border border-indigo-100 px-8 py-4 rounded-3xl text-3xl uppercase tracking-widest italic shadow-sm">
          {labelText}
        </p>
        
        <div className="p-6 bg-white border-2 border-slate-100 rounded-[2.5rem] mb-8 shadow-sm flex items-center justify-center">
          <QRCodeSVG value={codeValue} size={180} level="H" />
        </div>

        <div className="w-full grid grid-cols-1 gap-3">
          <button 
            onClick={handleDownloadSingle}
            disabled={loading}
            className="w-full bg-slate-800 hover:bg-slate-900 text-white font-black py-4 rounded-2xl transition-all shadow-lg text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={18}/> : <><FileDown size={18}/> Baixar PDF 5x5</>}
          </button>

          {onManage && (
            <button 
              onClick={() => {
                onClose();
                onManage();
              }}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-2xl transition-all shadow-lg text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
            >
              {isOccupied ? <><PackageCheck size={18}/> Ver Detalhes / Saída</> : <><PackagePlus size={18}/> Realizar Entrada</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
