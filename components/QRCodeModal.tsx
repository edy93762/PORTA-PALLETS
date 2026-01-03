
import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { Loader2, FileDown } from 'lucide-react';

interface QRCodeModalProps {
  position: { rack: string; level: number; pos: number };
  onClose: () => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ position, onClose }) => {
  const [loading, setLoading] = useState(false);
  const levelLabels = ['A', 'B', 'C', 'D', 'E'];
  const levelLetter = levelLabels[position.level - 1] || position.level.toString();
  
  // Novo padrão: Rack Pos Level (ex: A 1 A)
  const labelText = `${position.rack} ${position.pos} ${levelLetter}`;
  // Valor interno para link (mantém hifens para integridade técnica se necessário)
  const codeValue = `PP-${position.rack}-P-${position.pos}-L-${position.level}`;

  const handleDownloadSingle = async () => {
    setLoading(true);
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [50, 50] // Página tamanho exato da etiqueta 5x5cm
      });

      // Borda
      doc.setLineWidth(0.1);
      doc.rect(1, 1, 48, 48);

      // QR
      const qrDataUrl = await QRCode.toDataURL(codeValue, { errorCorrectionLevel: 'H', width: 200, margin: 0 });
      doc.addImage(qrDataUrl, 'PNG', 7.5, 8, 35, 35);

      // Textos
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14); // Um pouco maior para o novo padrão espaçado
      doc.text(labelText, 25, 6, { align: "center" });

      doc.setFont("courier", "normal");
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[250] p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 flex flex-col items-center animate-in zoom-in-95">
        <p className="text-slate-800 mb-6 font-black bg-indigo-50 text-indigo-600 border border-indigo-100 px-8 py-3 rounded-2xl text-2xl uppercase tracking-widest italic">
          {labelText}
        </p>
        
        <div className="p-6 bg-white border-2 border-slate-200 rounded-3xl mb-8 shadow-sm">
          <QRCodeSVG value={codeValue} size={200} level="H" />
        </div>

        <div className="flex gap-3 w-full">
          <button 
            onClick={handleDownloadSingle}
            disabled={loading}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-xl transition-all shadow-lg text-sm uppercase tracking-widest flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin"/> : <><FileDown size={18}/> PDF 5x5</>}
          </button>
          <button 
            onClick={onClose}
            className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-black py-4 rounded-xl transition-all text-sm uppercase tracking-widest"
          >
            FECHAR
          </button>
        </div>
      </div>
    </div>
  );
};
