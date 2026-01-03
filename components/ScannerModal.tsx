
import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';

interface ScannerModalProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
  customHeader?: React.ReactNode;
}

export const ScannerModal: React.FC<ScannerModalProps> = ({ onScan, onClose, customHeader }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "qr-reader";
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const stopScanner = async () => {
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            await scannerRef.current.stop();
          }
          await scannerRef.current.clear();
        } catch (e) {
          console.warn("Aviso ao limpar scanner:", e);
        }
      }
    };

    const startScanner = async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
      
      if (!isMounted) return;
      setIsInitializing(true);
      setErrorMsg(null);
      
      try {
        const element = document.getElementById(containerId);
        if (!element) throw new Error("Elemento do scanner não encontrado.");

        if (!scannerRef.current) {
          scannerRef.current = new Html5Qrcode(containerId);
        }

        const config = { 
          fps: 15, 
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        };

        const onScanSuccess = (decodedText: string) => {
          if (isMounted) {
            onScan(decodedText);
            // Não paramos o scanner aqui para permitir fluxos múltiplos se necessário
            // O componente pai decide quando fechar
          }
        };

        try {
          const devices = await Html5Qrcode.getCameras();
          if (!devices || devices.length === 0) {
            await scannerRef.current.start({ facingMode: "environment" }, config, onScanSuccess, () => {});
          } else {
            const backCamera = devices.find(d => 
              d.label.toLowerCase().includes('back') || 
              d.label.toLowerCase().includes('traseira') || 
              d.label.toLowerCase().includes('rear')
            );
            const cameraId = backCamera ? backCamera.id : devices[devices.length - 1].id;
            await scannerRef.current.start(cameraId, config, onScanSuccess, () => {});
          }
          if (isMounted) setIsInitializing(false);
        } catch (innerErr: any) {
          await scannerRef.current.start({ facingMode: "user" }, config, onScanSuccess, () => {});
          if (isMounted) setIsInitializing(false);
        }

      } catch (err: any) {
        if (isMounted) {
          setErrorMsg("Câmera não disponível ou permissão negada.");
          setIsInitializing(false);
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      stopScanner();
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[4500] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white rounded-[3rem] overflow-hidden shadow-2xl animate-in zoom-in-95">
        <header className="p-6 bg-indigo-600 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Camera size={24} />
            <div className="flex flex-col">
              <h3 className="font-black uppercase italic tracking-tighter leading-none">Scanner Ativo</h3>
              {customHeader && <div className="mt-2">{customHeader}</div>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-all">
            <X size={24} />
          </button>
        </header>

        <div className="p-8 flex flex-col items-center min-h-[380px] justify-center relative bg-slate-50">
          {errorMsg ? (
            <div className="w-full p-8 bg-rose-50 border-2 border-rose-100 rounded-[2rem] flex flex-col items-center text-center gap-4">
              <AlertTriangle className="text-rose-500 w-12 h-12" />
              <div>
                <h4 className="font-black text-rose-900 uppercase italic">Erro de Câmera</h4>
                <p className="text-[11px] text-rose-600 font-bold uppercase mt-4 leading-relaxed">
                  {errorMsg}
                </p>
              </div>
              <button onClick={() => window.location.reload()} className="bg-rose-600 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase">REINICIAR</button>
            </div>
          ) : (
            <>
              <div className="relative w-full aspect-square bg-black rounded-[2rem] overflow-hidden border-4 border-white shadow-2xl">
                <div id={containerId} className="w-full h-full"></div>
                {isInitializing && (
                  <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center gap-4 z-10">
                    <Loader2 className="w-10 h-10 animate-spin text-white opacity-50" />
                  </div>
                )}
                {!isInitializing && (
                  <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
                    <div className="w-48 h-48 border-2 border-indigo-500 rounded-3xl opacity-50 animate-pulse"></div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
