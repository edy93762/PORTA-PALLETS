
// @ts-nocheck
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Package, Warehouse, X, Loader2, 
  ClipboardList, CheckCircle2, 
  LayoutDashboard, Box, User, Lock,
  UserCheck, Search, Trash2, Layers, LogOut,
  TrendingUp, History, ArrowUpRight, ArrowDownLeft, Plus,
  MousePointer2, Zap, AlertTriangle, Users, Filter, CalendarClock, XCircle, FileText, CheckSquare, FileSignature
} from 'lucide-react';
import { jsPDF } from "jspdf";
import { PalletPosition, RackId, MasterProduct, AppUser, ActivityLog } from './types';
import { 
  initializeDatabase, 
  fetchInventoryFromDB, 
  saveItemToDB, 
  deleteItemFromDB, 
  fetchMasterProductsFromDB,
  saveMasterProductToDB,
  registerUserDB,
  loginUserDB,
  saveLogToDB,
  fetchLogsFromDB
} from './services/neonService';

// --- CONFIGURAÇÃO ---
const PP_RACKS: RackId[] = ['A', 'B', 'C', 'D']; 
const LEVELS_PP_LABELS = ['A', 'B', 'C', 'D', 'E']; 
const RACK_CONFIG: Record<string, { type: 'PP', positions: number, levels: number }> = {
  'A': { type: 'PP', positions: 66, levels: 5 },
  'B': { type: 'PP', positions: 66, levels: 5 },
  'C': { type: 'PP', positions: 66, levels: 5 },
  'D': { type: 'PP', positions: 62, levels: 5 }
};
const FIXED_DB_STRING = "postgresql://neondb_owner:npg_JaZLTzrqMc09@ep-fragrant-cherry-ac95x95d-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require";

const getLabelForPosition = (rack: RackId, level: number, pos: number) => {
    return `${rack} ${pos} ${LEVELS_PP_LABELS[level-1] || '?'}`;
};

// --- LOGIN COMPONENT ---
const LoginScreen = ({ onLoginSuccess }: { onLoginSuccess: (user: AppUser) => void }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [formData, setFormData] = useState({ username: '', password: '', fullName: '' });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{type: 'error' | 'success', text: string} | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
        if (isRegistering) {
            const res = await registerUserDB(FIXED_DB_STRING, { 
                username: formData.username, 
                password: formData.password, 
                fullName: formData.fullName, 
                role: 'operator', 
                status: 'pending' 
            });
            if (res.success) {
                setMsg({ type: 'success', text: res.message });
                setIsRegistering(false);
            } else {
                setMsg({ type: 'error', text: res.message });
            }
        } else {
            const res = await loginUserDB(FIXED_DB_STRING, formData.username, formData.password);
            if (res.user) {
                onLoginSuccess(res.user);
            } else {
                setMsg({ type: 'error', text: res.msg || 'Erro ao logar' });
            }
        }
    } catch (error) {
        setMsg({ type: 'error', text: 'Erro de conexão.' });
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
       <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl">
           <div className="flex justify-center mb-6">
               <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg"><Warehouse size={32}/></div>
           </div>
           <h2 className="text-2xl font-black text-center text-slate-800 mb-2">ALMOX <span className="text-indigo-600">PRO</span></h2>
           <p className="text-center text-slate-400 text-xs font-bold uppercase tracking-widest mb-8">{isRegistering ? 'Solicitar Acesso' : 'Entrar no Sistema'}</p>

           {msg && (
               <div className={`p-4 rounded-xl mb-6 text-xs font-bold uppercase text-center ${msg.type === 'error' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                   {msg.text}
               </div>
           )}

           <form onSubmit={handleSubmit} className="space-y-4">
               {isRegistering && (
                   <div>
                       <label className="text-[10px] font-black uppercase text-slate-400 pl-2">Nome Completo</label>
                       <div className="relative">
                           <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                           <input required className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 rounded-xl font-bold text-sm outline-none focus:border-indigo-500 transition-all" placeholder="SEU NOME" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} />
                       </div>
                   </div>
               )}
               <div>
                   <label className="text-[10px] font-black uppercase text-slate-400 pl-2">Usuário</label>
                   <div className="relative">
                       <UserCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                       <input required className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 rounded-xl font-bold text-sm outline-none focus:border-indigo-500 transition-all" placeholder="USUÁRIO" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
                   </div>
               </div>
               <div>
                   <label className="text-[10px] font-black uppercase text-slate-400 pl-2">Senha</label>
                   <div className="relative">
                       <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                       <input required type="password" className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 rounded-xl font-bold text-sm outline-none focus:border-indigo-500 transition-all" placeholder="••••••••" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                   </div>
               </div>

               <button disabled={loading} className="w-full bg-indigo-600 text-white p-5 rounded-xl font-black uppercase shadow-lg active:scale-95 transition-all flex justify-center">
                   {loading ? <Loader2 className="animate-spin"/> : (isRegistering ? 'Cadastrar' : 'Entrar')}
               </button>
           </form>

           <div className="mt-6 text-center">
               <button onClick={() => { setIsRegistering(!isRegistering); setMsg(null); }} className="text-xs font-bold text-slate-400 hover:text-indigo-600 uppercase transition-colors">
                   {isRegistering ? 'Já tenho conta' : 'Criar nova conta'}
               </button>
           </div>
       </div>
    </div>
  );
};

// --- MODAIS ---

const SearchStockModal = ({ isOpen, onClose, inventory }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);

    useEffect(() => {
        if (!query.trim()) { setResults([]); return; }
        const grouped = inventory.reduce((acc, item) => {
            if (!item.productId || item.isBlocked) return acc;
            const key = item.productId;
            if (!acc[key]) acc[key] = { productId: item.productId, productName: item.productName, totalQty: 0, locations: [] };
            acc[key].totalQty += (item.quantity || 0);
            acc[key].locations.push(item);
            return acc;
        }, {});
        const filtered = Object.values(grouped).filter((g: any) => 
            g.productId.toLowerCase().includes(query.toLowerCase()) || 
            g.productName.toLowerCase().includes(query.toLowerCase())
        );
        setResults(filtered);
    }, [query, inventory]);

    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-slate-900/90 z-[8000] flex justify-center pt-20 px-4 backdrop-blur-sm">
            <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[80vh] relative animate-in zoom-in-95 duration-200">
                <button onClick={onClose} className="absolute top-4 right-4 z-50 p-2 bg-rose-100 text-rose-600 rounded-full hover:bg-rose-600 hover:text-white transition-all shadow-md"><X size={32}/></button>
                <div className="p-6 border-b bg-slate-50 flex gap-4 items-center">
                    <Search className="text-slate-400"/><input autoFocus placeholder="Buscar produto..." className="flex-1 bg-transparent text-lg font-black uppercase outline-none" value={query} onChange={e => setQuery(e.target.value)} />
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {results.map((res: any) => (
                        <div key={res.productId} className="bg-white p-6 rounded-2xl border shadow-sm">
                            <h3 className="text-xl font-black text-slate-800 uppercase">{res.productName}</h3>
                            <div className="text-xs font-bold text-slate-400 mb-4">SKU: {res.productId} | Total: {res.totalQty} UN</div>
                            <div className="space-y-1">
                                {res.locations.map((loc, i) => <div key={i} className="text-xs font-bold p-2 bg-slate-50 rounded">L: {getLabelForPosition(loc.rack, loc.level, loc.position)} | Qtd: {loc.quantity}</div>)}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const MasterProductModal = ({ masterProducts, onClose, onSave }) => {
    const [formData, setFormData] = useState({ productId: '', productName: '', standardQuantity: '' });
    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({ productId: formData.productId.toUpperCase(), productName: formData.productName.toUpperCase(), standardQuantity: parseInt(formData.standardQuantity) });
        setFormData({ productId: '', productName: '', standardQuantity: '' });
    };
    return (
        <div className="fixed inset-0 bg-slate-900/90 z-[8000] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-2xl rounded-3xl overflow-hidden flex flex-col h-[70vh] relative animate-in zoom-in-95 duration-200">
                <button onClick={onClose} className="absolute top-4 right-4 z-50 p-2 bg-rose-100 text-rose-600 rounded-full hover:bg-rose-600 hover:text-white transition-all shadow-md"><X size={32}/></button>
                <header className="p-6 border-b flex justify-between items-center"><h2 className="font-black uppercase text-indigo-600 italic">Produtos Mestre</h2></header>
                <form onSubmit={handleSubmit} className="p-6 bg-slate-50 grid grid-cols-12 gap-3">
                    <input className="col-span-3 p-3 border rounded-xl font-bold" placeholder="SKU" value={formData.productId} onChange={e => setFormData({...formData, productId: e.target.value})} required />
                    <input className="col-span-6 p-3 border rounded-xl font-bold" placeholder="NOME" value={formData.productName} onChange={e => setFormData({...formData, productName: e.target.value})} required />
                    <input className="col-span-3 p-3 border rounded-xl font-bold" type="number" placeholder="QTD PADRÃO" value={formData.standardQuantity} onChange={e => setFormData({...formData, standardQuantity: e.target.value})} required />
                    <button className="col-span-12 bg-indigo-600 text-white p-3 rounded-xl font-black uppercase">Salvar Produto</button>
                </form>
                <div className="flex-1 overflow-y-auto p-6 space-y-2">
                    {masterProducts.map(p => <div key={p.productId} className="p-3 bg-slate-50 rounded border flex justify-between uppercase text-xs font-bold"><b>{p.productId}</b><span>{p.productName}</span></div>)}
                </div>
            </div>
        </div>
    );
};

const HistoryModal = ({ isOpen, onClose }) => {
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState<string | null>(null);

    // Carregar logs ao abrir
    useEffect(() => { 
        if (isOpen) { 
            setLoading(true); 
            fetchLogsFromDB(FIXED_DB_STRING).then(d => { 
                setLogs(d); 
                setLoading(false); 
            }); 
            setSelectedUser(null);
        } 
    }, [isOpen]);

    // Agrupa usuários para o menu lateral
    const usersList = useMemo(() => {
        const users = new Set(logs.map(l => l.username));
        return Array.from(users).sort();
    }, [logs]);

    // Filtra e ORDENA OS LOGS DO MAIS ANTIGO PARA O MAIS NOVO (CRONOLÓGICO)
    // O banco retorna DESC (mais novo primeiro), então invertemos.
    const currentUserLogs = useMemo(() => {
        if (!selectedUser) return [];
        return logs
            .filter(l => l.username === selectedUser)
            .reverse(); // INVERTE PARA: 01/01 (TOPO) -> 05/01 (FUNDO)
    }, [logs, selectedUser]);

    const generatePDF = () => {
        if (!selectedUser || currentUserLogs.length === 0) return;

        const doc = new jsPDF();
        
        // Header
        doc.setFillColor(30, 41, 59); 
        doc.rect(0, 0, 210, 35, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.text("FICHA INDIVIDUAL DE EPI / MOVIMENTAÇÃO", 105, 15, { align: "center" });
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text("Histórico Completo e Atualizado - Documento Oficial", 105, 25, { align: "center" });

        // User Info
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(255, 255, 255);
        doc.rect(14, 40, 182, 18);
        
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("COLABORADOR:", 18, 52);
        doc.setFont("helvetica", "normal");
        doc.text(selectedUser.toUpperCase(), 55, 52);
        
        // Table Header
        let y = 65;
        doc.setFillColor(241, 245, 249); 
        doc.rect(14, y-6, 182, 8, 'F');
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(71, 85, 105);
        doc.text("DATA / HORA", 16, y);
        doc.text("AÇÃO", 45, y);
        doc.text("DESCRIÇÃO DO ITEM", 75, y);
        doc.text("QTD", 150, y);
        doc.text("ASSINATURA", 170, y);
        
        y += 8;

        // Rows
        doc.setFont("helvetica", "normal");
        currentUserLogs.forEach((log, index) => {
            if (y > 275) { doc.addPage(); y = 20; }

            // Zebra
            if (index % 2 === 1) {
                doc.setFillColor(248, 250, 252);
                doc.rect(14, y-4, 182, 8, 'F');
            }

            const date = new Date(log.timestamp);
            const isEntry = log.action === 'ENTRADA';

            doc.setTextColor(30, 41, 59);
            doc.text(`${date.toLocaleDateString()} ${date.toLocaleTimeString().slice(0,5)}`, 16, y+1);
            
            doc.setTextColor(isEntry ? 22 : 185, isEntry ? 163 : 28, isEntry ? 74 : 28);
            doc.setFont("helvetica", "bold");
            doc.text(log.action, 45, y+1);
            
            doc.setTextColor(30, 41, 59);
            doc.setFont("helvetica", "normal");
            doc.text((log.sku || log.details).substring(0, 35).toUpperCase(), 75, y+1);
            doc.text(String(log.quantity), 150, y+1);

            // Mock Signature
            doc.setTextColor(150, 150, 150);
            doc.setFontSize(7);
            doc.text("[ VISTO ]", 170, y+1);
            doc.setFontSize(8);

            doc.setDrawColor(226, 232, 240);
            doc.line(14, y+4, 196, y+4);

            y += 8;
        });

        // Footer Text
        y += 10;
        if(y > 260) { doc.addPage(); y = 30; }
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text("Declaro ter recebido os itens acima relacionados em perfeito estado de conservação e uso.", 105, y, { align: "center" });

        doc.save(`FICHA_EPI_${selectedUser.toUpperCase().replace(/\s+/g, '_')}.pdf`);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/95 z-[8000] flex justify-center items-center p-4 backdrop-blur-sm">
            <div className="w-full max-w-6xl bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col h-[85vh] relative animate-in zoom-in-95 duration-200">
                
                {/* FECHAR (X) GIGANTE */}
                <button onClick={onClose} className="absolute top-4 right-4 z-50 p-3 bg-rose-100 text-rose-600 rounded-full hover:bg-rose-600 hover:text-white transition-all shadow-md">
                    <X size={32} strokeWidth={3}/>
                </button>

                <div className="flex h-full">
                    {/* SIDEBAR: LISTA DE COLABORADORES */}
                    <aside className="w-72 bg-slate-50 border-r p-6 flex flex-col overflow-y-auto">
                        <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Users size={16}/> Colaboradores
                        </h2>
                        <div className="space-y-2">
                            {usersList.map(u => (
                                <button 
                                    key={u}
                                    onClick={() => setSelectedUser(u)}
                                    className={`w-full p-4 rounded-xl text-left font-black text-xs uppercase transition-all flex items-center justify-between ${selectedUser === u ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-500 hover:bg-slate-100 border border-slate-200'}`}
                                >
                                    {u}
                                    {selectedUser === u && <CheckCircle2 size={16}/>}
                                </button>
                            ))}
                        </div>
                    </aside>

                    {/* MAIN: FICHA TÉCNICA VISUAL */}
                    <main className="flex-1 flex flex-col bg-slate-100 overflow-hidden relative">
                        {selectedUser ? (
                            <>
                                {/* HEADER DA FICHA */}
                                <div className="bg-white p-8 border-b shadow-sm z-10 flex justify-between items-start">
                                    <div>
                                        <h1 className="text-2xl font-black text-slate-800 uppercase italic">Ficha Individual</h1>
                                        <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-wider">Colaborador: <span className="text-indigo-600">{selectedUser}</span></p>
                                    </div>
                                    <button 
                                        onClick={generatePDF}
                                        className="bg-slate-800 text-white px-6 py-4 rounded-xl font-black text-xs uppercase flex items-center gap-3 hover:bg-slate-900 shadow-xl active:scale-95 transition-all"
                                    >
                                        <FileSignature size={20}/> Baixar Ficha Atualizada (PDF)
                                    </button>
                                </div>

                                {/* PAPEL DA FICHA (TABELA) */}
                                <div className="flex-1 overflow-y-auto p-8">
                                    <div className="bg-white rounded shadow-sm min-h-[500px] max-w-4xl mx-auto border border-slate-200 flex flex-col">
                                        
                                        {/* CABEÇALHO DO PAPEL */}
                                        <div className="p-6 border-b-2 border-slate-100 flex flex-col items-center justify-center bg-slate-50/50">
                                            <h2 className="text-lg font-black uppercase text-slate-700">Controle de Entrega de EPI / Materiais</h2>
                                            <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Ordem Cronológica: Antigo (Topo) &rarr; Novo (Fundo)</p>
                                        </div>

                                        {/* TABELA REAL */}
                                        <div className="flex-1">
                                            <div className="grid grid-cols-12 bg-slate-100 p-3 text-[10px] font-black uppercase text-slate-500 border-b border-slate-200">
                                                <div className="col-span-2">Data</div>
                                                <div className="col-span-2">Tipo</div>
                                                <div className="col-span-6">Item / Descrição</div>
                                                <div className="col-span-1 text-center">Qtd</div>
                                                <div className="col-span-1 text-center">Visto</div>
                                            </div>
                                            
                                            {currentUserLogs.map((log, idx) => (
                                                <div key={idx} className={`grid grid-cols-12 p-3 text-xs border-b border-slate-100 items-center hover:bg-yellow-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                                    <div className="col-span-2 text-slate-500 font-bold">
                                                        {new Date(log.timestamp).toLocaleDateString()}
                                                        <span className="block text-[9px] font-normal opacity-60">{new Date(log.timestamp).toLocaleTimeString().slice(0,5)}</span>
                                                    </div>
                                                    <div className="col-span-2">
                                                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${log.action === 'ENTRADA' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                            {log.action}
                                                        </span>
                                                    </div>
                                                    <div className="col-span-6 font-bold text-slate-700 uppercase">
                                                        {log.sku || log.details}
                                                    </div>
                                                    <div className="col-span-1 text-center font-black text-slate-800">
                                                        {log.quantity}
                                                    </div>
                                                    <div className="col-span-1 flex justify-center opacity-30">
                                                        <CheckSquare size={14}/>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        
                                        {/* RODAPÉ DO PAPEL */}
                                        <div className="p-8 border-t border-slate-200 mt-auto">
                                            <p className="text-[9px] text-slate-400 text-center uppercase">Este documento é gerado eletronicamente e possui validade para controle interno.</p>
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
                                <FileText size={64} className="mb-4 opacity-50"/>
                                <p className="font-black uppercase tracking-widest">Selecione um colaborador ao lado</p>
                            </div>
                        )}
                    </main>
                </div>
            </div>
        </div>
    );
};

const OperationModal = ({ isOpen, context, inventory, masterProducts, currentUser, onSave, onClose }) => {
    const [sku, setSku] = useState('');
    const [qty, setQty] = useState('');
    const [slots, setSlots] = useState<1 | 2>(1);
    const [suggestions, setSuggestions] = useState<MasterProduct[]>([]);
    const [loading, setLoading] = useState(false);

    const itemsInPos = inventory.filter(i => i.rack === context?.rack && i.level === context?.level && i.position === context?.pos && i.productId);
    const isExtension = inventory.some(i => i.rack === context?.rack && i.level === context?.level && i.position === context?.pos && i.isBlocked && i.blockReason?.includes('Vaga dupla'));
    const isBlocked = inventory.some(i => i.rack === context?.rack && i.level === context?.level && i.position === context?.pos && i.isBlocked && !i.blockReason?.includes('Vaga dupla'));

    useEffect(() => {
        if(sku.length > 1) setSuggestions(masterProducts.filter(p => p.productName.toLowerCase().includes(sku.toLowerCase()) || p.productId.includes(sku.toUpperCase())).slice(0, 5));
        else setSuggestions([]);
    }, [sku, masterProducts]);

    if (!isOpen || !context) return null;

    const handleAction = async (type: 'ENTRY' | 'EXIT', itemData?: any) => {
        setLoading(true);
        try {
            if (type === 'ENTRY') {
                if (!sku || !qty) throw new Error("Preencha todos os campos");
                await onSave('ENTRY', { rack: context.rack, level: context.level, pos: context.pos, sku, qty: parseInt(qty), slots });
                setSku(''); setQty('');
            } else {
                await onSave('EXIT', itemData);
            }
        } catch (e) { alert(e.message); }
        finally { setLoading(false); }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/90 z-[9000] flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-white w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl max-h-[90vh] flex flex-col relative animate-in zoom-in-95 duration-200">
                <button onClick={onClose} className="absolute top-6 right-6 z-50 p-2 bg-white/20 hover:bg-white/40 text-white rounded-full transition-all"><X size={24}/></button>
                <header className={`p-8 text-white flex justify-between items-start ${itemsInPos.length > 0 ? 'bg-red-600' : (isExtension ? 'bg-red-800' : 'bg-emerald-600')}`}>
                    <div>
                        <h2 className="text-2xl font-black italic uppercase tracking-tighter">{getLabelForPosition(context.rack, context.level, context.pos)}</h2>
                        <p className="text-[10px] font-black uppercase opacity-80 mt-1">{itemsInPos.length > 0 ? `${itemsInPos.length} item(s) presentes` : 'Vaga Disponível'}</p>
                    </div>
                </header>

                <div className="p-8 space-y-6 overflow-y-auto">
                    {isBlocked && !isExtension && <div className="p-8 bg-slate-100 rounded-3xl text-center font-black text-slate-500 uppercase border-2 border-dashed">LOCAL BLOQUEADO</div>}
                    
                    {itemsInPos.length > 0 && (
                        <div className="space-y-3">
                            <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Produtos na vaga</h3>
                            {itemsInPos.map(item => (
                                <div key={item.id} className="p-4 bg-slate-50 border rounded-2xl flex justify-between items-center hover:bg-white transition-all">
                                    <div className="min-w-0 flex-1">
                                        <div className="font-black text-slate-800 text-sm truncate uppercase">{item.productName}</div>
                                        <div className="text-[10px] font-bold text-red-600 uppercase">{item.productId} • {item.quantity} UN</div>
                                    </div>
                                    <button onClick={() => handleAction('EXIT', item)} className="ml-3 p-3 text-rose-600 bg-rose-50 rounded-xl hover:bg-rose-600 hover:text-white transition-all shadow-sm"><Trash2 size={18}/></button>
                                </div>
                            ))}
                        </div>
                    )}

                    {!isBlocked && !isExtension && (
                        <div className="pt-6 border-t border-slate-100 space-y-4">
                            <h3 className="text-[10px] font-black uppercase text-indigo-500 flex items-center gap-2"><Plus size={14}/> Registrar Nova Entrada</h3>
                            <div className="relative">
                                <input autoFocus className="w-full p-4 bg-slate-50 border-2 rounded-2xl font-bold uppercase outline-none focus:border-indigo-500" placeholder="SKU OU NOME" value={sku} onChange={e => setSku(e.target.value)} />
                                {suggestions.length > 0 && (
                                    <div className="absolute top-full left-0 w-full bg-white border-2 border-t-0 shadow-xl rounded-b-2xl z-50">
                                        {suggestions.map(s => (
                                            <button key={s.productId} onClick={() => { setSku(s.productId); setSuggestions([]); setQty(s.standardQuantity.toString()); }} className="w-full text-left p-4 hover:bg-indigo-50 border-b text-xs font-black uppercase block">
                                                {s.productName} ({s.productId})
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <input type="number" className="p-4 bg-slate-50 border-2 rounded-2xl font-bold text-center outline-none focus:border-indigo-500" placeholder="QTD" value={qty} onChange={e => setQty(e.target.value)} />
                                <div className="flex bg-slate-100 p-1 rounded-2xl h-[58px]">
                                    <button onClick={() => setSlots(1)} className={`flex-1 rounded-xl text-[10px] font-black uppercase ${slots === 1 ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>1 Vaga</button>
                                    <button onClick={() => setSlots(2)} className={`flex-1 rounded-xl text-[10px] font-black uppercase ${slots === 2 ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>2 Vagas</button>
                                </div>
                            </div>
                            <button disabled={loading} onClick={() => handleAction('ENTRY')} className="w-full bg-indigo-600 text-white p-5 rounded-2xl font-black uppercase text-sm shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3">
                                {loading ? <Loader2 className="animate-spin"/> : <><ArrowDownLeft/> Registrar Entrada</>}
                            </button>
                        </div>
                    )}
                    {isExtension && <div className="text-center py-10 opacity-40"><Layers size={64} className="mx-auto mb-2 text-slate-300"/><p className="text-[10px] font-black uppercase tracking-widest">Extensão de Vaga Dupla</p></div>}
                </div>
            </div>
        </div>
    );
};

// --- APP PRINCIPAL ---
const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [activeRack, setActiveRack] = useState<RackId>('A');
  const [activeTabLevel, setActiveTabLevel] = useState(1);
  const [inventory, setInventory] = useState<PalletPosition[]>([]);
  const [masterProducts, setMasterProducts] = useState<MasterProduct[]>([]);
  const [feedback, setFeedback] = useState<{type: 'success' | 'error', msg: string} | null>(null);
  const [isMasterMenuOpen, setIsMasterMenuOpen] = useState(false);
  const [operationContext, setOperationContext] = useState<{rack: RackId, level: number, pos: number} | null>(null);

  // NOVO: Estados de Operação Rápida
  const [operationMode, setOperationMode] = useState<'NAV' | 'FAST_ENTRY' | 'FAST_EXIT'>('NAV');
  const [fastEntryData, setFastEntryData] = useState({ sku: '', qty: '', slots: 1 });
  const [fastSuggestions, setFastSuggestions] = useState<MasterProduct[]>([]);

  const stats = useMemo(() => {
    let totalPos = 0;
    PP_RACKS.forEach(r => { totalPos += RACK_CONFIG[r].levels * RACK_CONFIG[r].positions; });
    const occupiedCoords = new Set(inventory.filter(i => i.productId || i.isBlocked).map(i => `${i.rack}-${i.level}-${i.position}`));
    return { totalPos, occupied: occupiedCoords.size, free: totalPos - occupiedCoords.size };
  }, [inventory]);

  const loadData = useCallback(async () => {
      try {
        const [inv, prod] = await Promise.all([fetchInventoryFromDB(FIXED_DB_STRING), fetchMasterProductsFromDB(FIXED_DB_STRING)]);
        setInventory(inv || []);
        setMasterProducts(prod || []);
      } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { initializeDatabase(FIXED_DB_STRING).then(() => { if(currentUser) loadData(); }); }, [currentUser, loadData]);

  const handleOperationSave = async (type: 'ENTRY' | 'EXIT', data: any) => {
      if (type === 'ENTRY') {
          const { rack, level, pos, sku, qty, slots } = data;
          const master = masterProducts.find(m => m.productId === sku.toUpperCase());
          const newItem = {
              id: `${rack}-${level}-${pos}-${sku.toUpperCase()}-${Date.now()}`,
              rack, level, position: pos, productId: sku.toUpperCase(),
              productName: master?.productName || 'PRODUTO AVULSO',
              quantity: qty, slots, createdAt: new Date().toISOString(), lastUpdated: new Date().toISOString()
          };
          await saveItemToDB(FIXED_DB_STRING, newItem);
          if (slots === 2) {
              await saveItemToDB(FIXED_DB_STRING, { id: `${rack}-${level}-${pos+1}-BLOCK-${Date.now()}`, rack, level, position: pos + 1, isBlocked: true, blockReason: `Vaga dupla de ${rack}-${pos}`, createdAt: new Date().toISOString() });
          }
          await saveLogToDB(FIXED_DB_STRING, { username: currentUser.username, action: 'ENTRADA', details: `${sku.toUpperCase()}`, quantity: qty, sku: sku.toUpperCase(), location: getLabelForPosition(rack, level, pos), timestamp: new Date().toISOString() });
          setFeedback({ type: 'success', msg: 'Entrada registrada!' });
      } else {
          await deleteItemFromDB(FIXED_DB_STRING, data);
          if (data.slots === 2) {
              const blockers = inventory.filter(i => i.rack === data.rack && i.level === data.level && i.position === data.position + 1 && i.isBlocked);
              for(const b of blockers) await deleteItemFromDB(FIXED_DB_STRING, b);
          }
          await saveLogToDB(FIXED_DB_STRING, { username: currentUser.username, action: 'SAIDA', details: `${data.productId}`, quantity: data.quantity, sku: data.productId, location: getLabelForPosition(data.rack, data.level, data.position), timestamp: new Date().toISOString() });
          setFeedback({ type: 'success', msg: 'Saída registrada!' });
      }
      setTimeout(() => setFeedback(null), 2000);
      await loadData();
  };

  const onGridClick = async (rack: RackId, level: number, pos: number) => {
      if (operationMode === 'NAV') {
          setOperationContext({ rack, level, pos });
          return;
      }

      if (operationMode === 'FAST_ENTRY') {
          if (!fastEntryData.sku || !fastEntryData.qty) {
              setFeedback({ type: 'error', msg: 'Configure o produto primeiro!' });
              setTimeout(() => setFeedback(null), 2000);
              return;
          }
          // Verificar se já tem algo (Opcional, mas seguro)
          const info = getPosInfo(rack, level, pos);
          if (info.isBlocked || info.isExtension) {
            setFeedback({ type: 'error', msg: 'Local bloqueado!' });
            setTimeout(() => setFeedback(null), 2000);
            return;
          }
          await handleOperationSave('ENTRY', { rack, level, pos, sku: fastEntryData.sku, qty: parseInt(fastEntryData.qty), slots: fastEntryData.slots });
      }

      if (operationMode === 'FAST_EXIT') {
          const info = getPosInfo(rack, level, pos);
          if (info.items.length > 0) {
              // Saída de todos os itens daquela posição
              for (const item of info.items) {
                  await handleOperationSave('EXIT', item);
              }
          }
      }
  };

  const getPosInfo = (rack, level, pos) => {
      const allInPos = inventory.filter(i => i.rack === rack && i.level === level && i.position === pos);
      const isBlocked = allInPos.some(i => i.isBlocked);
      const isExtension = allInPos.some(i => i.isBlocked && i.blockReason?.includes('Vaga dupla'));
      const realItems = allInPos.filter(i => !!i.productId);
      return { items: realItems, isBlocked, isExtension, count: realItems.length };
  };

  // Sugestões para entrada rápida
  useEffect(() => {
    if(fastEntryData.sku.length > 1) {
        setFastSuggestions(masterProducts.filter(p => p.productName.toLowerCase().includes(fastEntryData.sku.toLowerCase()) || p.productId.includes(fastEntryData.sku.toUpperCase())).slice(0, 5));
    } else {
        setFastSuggestions([]);
    }
  }, [fastEntryData.sku, masterProducts]);

  if (!currentUser) return <LoginScreen onLoginSuccess={setCurrentUser} />;

  return (
    <div className="h-screen w-screen bg-[#F8FAFC] flex flex-col lg:flex-row overflow-hidden font-sans select-none">
      {/* SIDEBAR */}
      <aside className="w-80 bg-white border-r p-8 flex flex-col hidden lg:flex shadow-sm z-20">
        <div className="flex items-center gap-3 mb-10"><Warehouse className="text-indigo-600"/><h1 className="text-2xl font-black italic tracking-tighter uppercase leading-none">Almox <span className="text-indigo-600">Pro</span></h1></div>
        
        <div className="mb-8 p-6 bg-slate-50 rounded-3xl border border-slate-100">
            <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">Modo de Operação</h4>
            <div className="space-y-2">
                <button onClick={() => setOperationMode('NAV')} className={`w-full p-3 rounded-xl flex items-center gap-3 font-bold text-xs uppercase transition-all ${operationMode === 'NAV' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-white'}`}><MousePointer2 size={16}/> Navegar</button>
                <button onClick={() => setOperationMode('FAST_ENTRY')} className={`w-full p-3 rounded-xl flex items-center gap-3 font-bold text-xs uppercase transition-all ${operationMode === 'FAST_ENTRY' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:bg-white'}`}><ArrowDownLeft size={16}/> Entrada Rápida</button>
                <button onClick={() => setOperationMode('FAST_EXIT')} className={`w-full p-3 rounded-xl flex items-center gap-3 font-bold text-xs uppercase transition-all ${operationMode === 'FAST_EXIT' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-500 hover:bg-white'}`}><ArrowUpRight size={16}/> Saída Rápida</button>
            </div>
        </div>

        <nav className="space-y-2 flex-1">
            <button onClick={() => setIsHistoryOpen(true)} className="w-full flex items-center gap-4 p-4 text-slate-500 font-black text-xs uppercase tracking-widest hover:bg-slate-50 rounded-2xl transition-all"><History size={18}/> Log de Atividades</button>
            <button onClick={() => setIsSearchOpen(true)} className="w-full flex items-center gap-4 p-4 text-slate-500 font-black text-xs uppercase tracking-widest hover:bg-slate-50 rounded-2xl transition-all"><Search size={18}/> Pesquisar Estoque</button>
            <button onClick={() => setIsMasterMenuOpen(true)} className="w-full flex items-center gap-4 p-4 text-slate-500 font-black text-xs uppercase tracking-widest hover:bg-slate-50 rounded-2xl transition-all"><ClipboardList size={18}/> Produtos Mestre</button>
        </nav>
        <button onClick={() => window.location.reload()} className="mt-auto flex items-center gap-4 p-4 text-slate-400 font-bold text-xs uppercase tracking-widest hover:text-rose-500 transition-colors"><LogOut size={18}/> Sair</button>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative">
         {/* DASHBOARD CONTENT */}
         <div className="flex-1 overflow-y-auto p-4 lg:p-10 space-y-8">
            
            {/* PAINEL DE CONFIGURAÇÃO DE ENTRADA RÁPIDA (FLUTUANTE) */}
            {operationMode === 'FAST_ENTRY' && (
                <div className="bg-emerald-50 border-2 border-emerald-200 p-6 rounded-[2.5rem] shadow-xl flex flex-wrap items-center gap-4 animate-in slide-in-from-top-4">
                    <div className="bg-emerald-600 p-3 rounded-2xl text-white shadow-md"><Zap size={24}/></div>
                    <div className="flex-1 min-w-[200px] relative">
                        <label className="text-[9px] font-black uppercase text-emerald-600 ml-2 mb-1 block">Escolha o Produto para "Carimbar"</label>
                        <input className="w-full p-3 bg-white border-2 border-emerald-100 rounded-xl font-bold uppercase outline-none focus:border-emerald-500 text-sm" placeholder="SKU OU NOME" value={fastEntryData.sku} onChange={e => setFastEntryData({...fastEntryData, sku: e.target.value})} />
                        {fastSuggestions.length > 0 && (
                            <div className="absolute top-full left-0 w-full bg-white border-2 border-emerald-100 shadow-2xl rounded-b-2xl z-[100] max-h-48 overflow-y-auto">
                                {fastSuggestions.map(s => (
                                    <button key={s.productId} onClick={() => { setFastEntryData({...fastEntryData, sku: s.productId, qty: s.standardQuantity.toString()}); setFastSuggestions([]); }} className="w-full text-left p-3 hover:bg-emerald-50 border-b text-xs font-black uppercase block">
                                        {s.productName} ({s.productId})
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="w-24">
                        <label className="text-[9px] font-black uppercase text-emerald-600 ml-2 mb-1 block">Qtd</label>
                        <input type="number" className="w-full p-3 bg-white border-2 border-emerald-100 rounded-xl font-bold text-center outline-none focus:border-emerald-500 text-sm" value={fastEntryData.qty} onChange={e => setFastEntryData({...fastEntryData, qty: e.target.value})} />
                    </div>
                    <div className="bg-white p-1 rounded-xl flex border-2 border-emerald-100 h-[52px]">
                        <button onClick={() => setFastEntryData({...fastEntryData, slots: 1})} className={`px-4 rounded-lg text-[10px] font-black transition-all ${fastEntryData.slots === 1 ? 'bg-emerald-600 text-white shadow' : 'text-slate-400'}`}>1 Vaga</button>
                        <button onClick={() => setFastEntryData({...fastEntryData, slots: 2})} className={`px-4 rounded-lg text-[10px] font-black transition-all ${fastEntryData.slots === 2 ? 'bg-emerald-600 text-white shadow' : 'text-slate-400'}`}>2 Vagas</button>
                    </div>
                </div>
            )}

            {operationMode === 'FAST_EXIT' && (
                <div className="bg-rose-50 border-2 border-rose-200 p-6 rounded-[2.5rem] shadow-xl flex items-center gap-6 animate-in slide-in-from-top-4">
                    <div className="bg-rose-600 p-3 rounded-2xl text-white shadow-md"><Trash2 size={24}/></div>
                    <div>
                        <h4 className="text-rose-600 font-black uppercase text-sm italic tracking-tight">Modo de Saída Rápida Ativo</h4>
                        <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">Atenção: Clicar em uma vaga ocupada removerá TODOS os itens dela instantaneamente.</p>
                    </div>
                </div>
            )}

            {/* HEADER COM ESTATÍSTICAS */}
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-4xl font-black text-slate-800 uppercase italic tracking-tighter">Armazém • Rua {activeRack}</h2>
                    <div className="flex gap-4 mt-4">
                        <div className="bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            <span className="text-[10px] font-black uppercase text-emerald-600">{stats.free} Vagas Livres</span>
                        </div>
                        <div className="bg-red-50 px-4 py-2 rounded-xl border border-red-100 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-600"></span>
                            <span className="text-[10px] font-black uppercase text-red-600">{stats.occupied} Em Uso</span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2 bg-white p-2 rounded-2xl border shadow-sm">
                    {PP_RACKS.map(r => (
                        <button key={r} onClick={() => { setActiveRack(r); setActiveTabLevel(1); }} className={`w-14 h-12 rounded-xl font-black text-sm transition-all ${activeRack === r ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>
                            {r}
                        </button>
                    ))}
                </div>
            </div>

            {/* GRADE PORTA PALLET */}
            <div className="bg-white rounded-[3rem] border shadow-xl overflow-hidden flex flex-col relative min-h-[500px]">
                <div className="p-6 border-b flex gap-3 overflow-x-auto no-scrollbar bg-slate-50/50 items-center">
                    {LEVELS_PP_LABELS.map((label, i) => (
                        <button key={i} onClick={() => setActiveTabLevel(i+1)} className={`w-14 h-14 shrink-0 rounded-2xl font-black text-lg flex items-center justify-center border-2 transition-all ${activeTabLevel === i+1 ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg scale-110' : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-200'}`}>
                            {label}
                        </button>
                    ))}
                    <div className="ml-auto text-[10px] font-black uppercase text-slate-400 tracking-widest border border-slate-200 px-4 py-2 rounded-full">Nível {LEVELS_PP_LABELS[activeTabLevel-1]}</div>
                </div>
                
                <div className="p-8 sm:p-12 bg-white flex-1">
                    <div className="grid gap-4 grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-11">
                        {Array.from({length: RACK_CONFIG[activeRack].positions}).map((_, i) => {
                            const pos = i + 1;
                            const { items, isBlocked, isExtension, count } = getPosInfo(activeRack, activeTabLevel, pos);
                            
                            // Lógica de Cores e Estilos
                            let baseColor = "bg-emerald-500 hover:bg-emerald-600";
                            if (isBlocked && !isExtension) baseColor = "bg-slate-700 opacity-80 cursor-not-allowed";
                            else if (count > 0 || isExtension) baseColor = "bg-red-600 hover:bg-red-700";

                            // Destaque do Modo Ativo
                            let modeRing = "border-transparent";
                            if (operationMode === 'FAST_ENTRY' && !isBlocked && !isExtension && count === 0) modeRing = "border-emerald-300 ring-4 ring-emerald-100 animate-pulse";
                            if (operationMode === 'FAST_EXIT' && count > 0) modeRing = "border-rose-300 ring-4 ring-rose-100 animate-pulse";

                            const tooltip = isExtension ? "EXTENSÃO DUPLA" : 
                                            isBlocked ? "BLOQUEADO" :
                                            count > 0 ? items.map(it => `${it.productName} (${it.quantity} UN)`).join(' | ') : 
                                            "Livre";

                            return (
                                <button 
                                    key={pos} 
                                    title={tooltip}
                                    onClick={() => onGridClick(activeRack, activeTabLevel, pos)} 
                                    className={`aspect-square rounded-[1.5rem] flex flex-col items-center justify-center relative text-white shadow-sm transition-all active:scale-90 border-4 ${baseColor} ${modeRing}`}
                                >
                                    <span className="absolute top-1.5 left-2 text-[10px] font-black opacity-30">{pos}</span>
                                    {isExtension ? <Layers size={18}/> : (count > 0 ? <Package size={22}/> : <CheckCircle2 size={22} className="opacity-20"/>)}
                                    {count > 1 && (
                                        <div className="absolute -bottom-2 -right-2 bg-white text-red-600 text-[10px] w-6 h-6 flex items-center justify-center rounded-full font-black shadow-xl border-2 border-red-500">
                                            {count}
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
         </div>

         {/* FEEDBACK FLUTUANTE */}
         {feedback && (
            <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[9999] px-8 py-5 rounded-[2.5rem] font-black uppercase text-xs shadow-2xl animate-in slide-in-from-bottom-10 flex items-center gap-3 border-2 ${feedback.type === 'success' ? 'bg-emerald-600 text-white border-emerald-400' : 'bg-rose-600 text-white border-rose-400'}`}>
                {feedback.type === 'success' ? <CheckCircle2 size={18}/> : <AlertTriangle size={18}/>}
                {feedback.msg}
            </div>
         )}
      </main>

      {/* MODAIS */}
      <HistoryModal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />
      <OperationModal isOpen={!!operationContext} context={operationContext} inventory={inventory} masterProducts={masterProducts} currentUser={currentUser} onSave={handleOperationSave} onClose={() => setOperationContext(null)} />
      <SearchStockModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} inventory={inventory} />
      {isMasterMenuOpen && <MasterProductModal masterProducts={masterProducts} onClose={() => setIsMasterMenuOpen(false)} onSave={async (p) => { await saveMasterProductToDB(FIXED_DB_STRING, p); loadData(); }} />}
    </div>
  );
};

export default App;
