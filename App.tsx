// @ts-nocheck
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Package, Warehouse, X, ScanLine, Printer, Loader2, 
  ClipboardList, Menu, CheckCircle2, ListChecks, PlusCircle, 
  PackagePlus, PackageMinus, LayoutDashboard,
  Box, Cuboid, Info, LogOut, MinusCircle, User, Lock, Users, History, UserCheck, XSquare,
  Link, Calendar, Search, Trash2, ArrowRight, FileDown, ChevronDown, ChevronUp, Layers, Combine, Ban,
  PieChart, BarChart3, MoveRight, MapPin, QrCode
} from 'lucide-react';
import { PalletPosition, RackId, MasterProduct, AppUser, ActivityLog } from './types';
import { ScannerModal } from './components/ScannerModal';
import { Warehouse3D } from './components/Warehouse3D';
import { QRCodeModal } from './components/QRCodeModal';
import { 
  initializeDatabase, 
  fetchInventoryFromDB, 
  saveItemToDB, 
  deleteItemFromDB, 
  fetchMasterProductsFromDB,
  saveMasterProductToDB,
  deleteMasterProductFromDB,
  registerUserDB,
  loginUserDB,
  getPendingUsersDB,
  updateUserStatusDB,
  saveLogToDB,
  fetchLogsFromDB
} from './services/neonService';
import { jsPDF } from "jspdf";
import QRCode from "qrcode";

// --- CONFIGURAÇÃO ---
const PP_RACKS: RackId[] = ['A', 'B', 'C', 'D']; 
const LEVELS_STREET = ['A', 'B', 'C', 'D', 'E']; 
const LEVELS_ALL = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']; 

const RACK_POSITIONS: Record<RackId, number> = {
  'A': 62, 'B': 66, 'C': 66, 'D': 62
};

const FIXED_DB_STRING = "postgresql://neondb_owner:npg_JaZLTzrqMc09@ep-fragrant-cherry-ac95x95d-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require";

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
           <p className="text-center text-slate-400 text-xs font-bold uppercase tracking-widest mb-8">{isRegistering ? 'Solicitar Acesso' : 'Controle de Acesso'}</p>

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
                   {isRegistering ? 'Já tenho conta' : 'Não tenho cadastro? Criar conta'}
               </button>
           </div>
       </div>
    </div>
  );
};

// --- MODAL: CADASTRO DE PRODUTOS ---
const MasterProductModal = ({ masterProducts, onClose, onSave, onDelete }: any) => {
    const [formData, setFormData] = useState({ productId: '', productName: '', standardQuantity: '' });
    const [search, setSearch] = useState('');
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSave({ ...formData, standardQuantity: parseInt(formData.standardQuantity) });
        setFormData({ productId: '', productName: '', standardQuantity: '' });
    };
    const filtered = masterProducts.filter(p => p.productName.toLowerCase().includes(search.toLowerCase()) || p.productId.toLowerCase().includes(search.toLowerCase()));
    return (
        <div className="fixed inset-0 bg-slate-900/90 z-[7000] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[85vh]">
                <div className="p-6 border-b flex justify-between items-center bg-slate-50"><h3 className="font-black text-xl uppercase flex items-center gap-2"><ClipboardList className="text-indigo-600"/> Gestão de Produtos</h3><button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full"><X/></button></div>
                <div className="p-6 border-b bg-slate-50">
                     <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-4">
                         <input required placeholder="SKU / CÓDIGO" className="flex-1 p-3 rounded-xl border font-bold uppercase text-sm" value={formData.productId} onChange={e => setFormData({...formData, productId: e.target.value.toUpperCase()})} />
                         <input required placeholder="NOME DO PRODUTO" className="flex-[2] p-3 rounded-xl border font-bold uppercase text-sm" value={formData.productName} onChange={e => setFormData({...formData, productName: e.target.value.toUpperCase()})} />
                         <input required type="number" placeholder="QTD PADRÃO" className="w-32 p-3 rounded-xl border font-bold uppercase text-sm" value={formData.standardQuantity} onChange={e => setFormData({...formData, standardQuantity: e.target.value})} />
                         <button type="submit" className="bg-indigo-600 text-white px-6 rounded-xl font-black uppercase text-sm shadow-lg hover:bg-indigo-700">Salvar</button>
                     </form>
                </div>
                <div className="p-4 bg-white border-b"><input placeholder="Buscar produtos..." className="w-full p-3 bg-slate-100 rounded-xl font-bold uppercase text-sm" value={search} onChange={e => setSearch(e.target.value)} /></div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-100">
                    {filtered.map(p => (
                        <div key={p.productId} className="bg-white p-4 rounded-xl border shadow-sm flex justify-between items-center">
                            <div><div className="font-black text-slate-800 uppercase">{p.productName}</div><div className="text-xs font-bold text-slate-400">SKU: {p.productId} • PADRÃO: {p.standardQuantity} UN</div></div>
                            <button onClick={() => onDelete(p.productId)} className="text-rose-400 hover:text-rose-600 p-2"><Trash2 size={18}/></button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// --- MODAL: SALDO DE ESTOQUE ---
const InventoryBalanceModal = ({ inventory, onClose }: any) => {
    const [search, setSearch] = useState('');
    const [expandedSku, setExpandedSku] = useState<string | null>(null);

    const aggregated = useMemo(() => {
        const acc: any = {};
        inventory.forEach((item: PalletPosition) => {
             if (item.isBlocked) return;
             if (!acc[item.productId]) {
                 acc[item.productId] = { 
                     sku: item.productId, 
                     name: item.productName, 
                     totalQty: 0, 
                     count: 0,
                     locations: [] 
                 };
             }
             acc[item.productId].totalQty += item.quantity;
             acc[item.productId].count += 1;
             acc[item.productId].locations.push(item);
        });
        return Object.values(acc).sort((a: any, b: any) => b.totalQty - a.totalQty);
    }, [inventory]);

    const filtered = aggregated.filter((i: any) => 
        i.name.toLowerCase().includes(search.toLowerCase()) || 
        i.sku.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="fixed inset-0 bg-slate-900/90 z-[7000] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[85vh]">
                <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="font-black text-xl uppercase flex items-center gap-2"><ListChecks className="text-indigo-600"/> Saldo de Estoque</h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full"><X/></button>
                </div>
                <div className="p-4 bg-white border-b relative">
                     <Search className="absolute left-7 top-1/2 -translate-y-1/2 text-slate-400" size={20}/>
                     <input 
                        autoFocus 
                        placeholder="Buscar por Nome ou SKU..." 
                        className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-200 rounded-xl font-bold uppercase text-sm outline-none focus:border-indigo-500 transition-all" 
                        value={search} 
                        onChange={e => setSearch(e.target.value)} 
                     />
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50">
                    {filtered.map((item: any) => (
                        <div key={item.sku} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm transition-all">
                            <button 
                                onClick={() => setExpandedSku(expandedSku === item.sku ? null : item.sku)}
                                className="w-full p-4 flex justify-between items-center hover:bg-slate-50 text-left"
                            >
                                <div>
                                    <div className="font-black text-slate-800 uppercase text-lg">{item.name}</div>
                                    <div className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded inline-block mt-1">SKU: {item.sku}</div>
                                </div>
                                <div className="text-right flex items-center gap-4">
                                    <div>
                                        <div className="font-black text-indigo-600 text-2xl">{item.totalQty}</div>
                                        <div className="text-[10px] font-bold text-slate-400 uppercase">Em {item.count} Pallets</div>
                                    </div>
                                    {expandedSku === item.sku ? <ChevronUp className="text-slate-400"/> : <ChevronDown className="text-slate-400"/>}
                                </div>
                            </button>
                            
                            {expandedSku === item.sku && (
                                <div className="bg-slate-50 border-t p-4 animate-in slide-in-from-top-2">
                                    <h5 className="text-[10px] font-black uppercase text-slate-400 mb-2">Localizações</h5>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                        {item.locations.map((loc: PalletPosition) => (
                                            <div key={loc.id} className="bg-white p-2 rounded-lg border flex justify-between items-center">
                                                <span className="font-black text-slate-700 text-xs">{loc.rack}{loc.position}{LEVELS_ALL[loc.level-1] || loc.level}</span>
                                                <span className="font-bold text-indigo-600 text-xs">{loc.quantity} un</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    {filtered.length === 0 && <div className="text-center py-10 text-slate-400 font-bold uppercase text-sm">Nenhum item encontrado</div>}
                </div>
            </div>
        </div>
    );
};

// --- MODAL: FIFO ---
const FIFOModal = ({ inventory, onClose }: any) => {
    const [search, setSearch] = useState('');
    const sortedInv = inventory
        .filter((i: any) => !i.isBlocked && (i.productName?.toLowerCase().includes(search.toLowerCase()) || i.productId?.toLowerCase().includes(search.toLowerCase())))
        .sort((a: any, b: any) => new Date(a.createdAt || a.lastUpdated || 0).getTime() - new Date(b.createdAt || b.lastUpdated || 0).getTime());

    return (
        <div className="fixed inset-0 bg-slate-900/90 z-[7000] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[85vh]">
                <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="font-black text-xl uppercase flex items-center gap-2"><Calendar className="text-indigo-600"/> Controle FIFO</h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full"><X/></button>
                </div>
                <div className="p-4 bg-slate-50 border-b">
                    <input autoFocus placeholder="Filtrar produto..." className="w-full p-3 rounded-xl border font-bold uppercase text-sm" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-100">
                    {sortedInv.map((item: any, idx: number) => (
                        <div key={item.id} className="bg-white p-4 rounded-xl border shadow-sm flex justify-between items-center group hover:border-indigo-500 transition-all">
                            <div className="flex items-center gap-4">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-white ${idx === 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}>
                                    {idx + 1}
                                </div>
                                <div>
                                    <div className="font-black text-slate-800 uppercase">{item.productName}</div>
                                    <div className="text-xs font-bold text-slate-400">Entrada: {new Date(item.createdAt || item.lastUpdated).toLocaleDateString()} • {new Date(item.createdAt || item.lastUpdated).toLocaleTimeString()}</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="font-black text-indigo-600 text-lg">{item.rack}{item.position}{LEVELS_ALL[item.level-1] || item.level}</div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase">{item.quantity} UN</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// --- ADMIN USERS PANEL ---
const AdminUsersPanel = ({ currentUser, onClose }: { currentUser: AppUser, onClose: () => void }) => {
    const [pendingUsers, setPendingUsers] = useState<AppUser[]>([]);
    
    useEffect(() => {
        getPendingUsersDB(FIXED_DB_STRING).then(setPendingUsers);
    }, []);

    const handleAction = async (user: AppUser, action: 'approved' | 'rejected') => {
        await updateUserStatusDB(FIXED_DB_STRING, user.username, action, currentUser.username);
        setPendingUsers(prev => prev.filter(u => u.username !== user.username));
    };

    return (
        <div className="fixed inset-0 bg-slate-900/90 z-[7000] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
                <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="font-black text-xl uppercase flex items-center gap-2"><Users className="text-indigo-600"/> Aprovação de Usuários</h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full"><X/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {pendingUsers.length === 0 ? (
                        <div className="text-center py-10 text-slate-400 font-bold uppercase text-xs">Nenhum usuário pendente</div>
                    ) : (
                        pendingUsers.map(user => (
                            <div key={user.username} className="bg-white border-2 border-slate-100 p-4 rounded-xl flex justify-between items-center">
                                <div>
                                    <div className="font-black text-slate-800 uppercase">{user.fullName || user.username}</div>
                                    <div className="text-xs font-bold text-slate-400">@{user.username}</div>
                                    <div className="text-[10px] font-bold text-slate-300 mt-1">{new Date(user.createdAt!).toLocaleString()}</div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleAction(user, 'rejected')} className="p-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100"><XSquare size={20}/></button>
                                    <button onClick={() => handleAction(user, 'approved')} className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100"><CheckCircle2 size={20}/></button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

// --- REPORT PANEL ---
const ReportsPanel = ({ onClose }: { onClose: () => void }) => {
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [filters, setFilters] = useState({ user: '', sku: '', type: '' });
    
    useEffect(() => {
        fetchLogsFromDB(FIXED_DB_STRING, filters).then(setLogs);
    }, [filters]); 

    return (
        <div className="fixed inset-0 bg-slate-900/95 z-[7000] flex flex-col p-4 backdrop-blur-md">
            <div className="bg-white w-full h-full rounded-3xl overflow-hidden shadow-2xl flex flex-col">
                <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="font-black text-xl uppercase flex items-center gap-2"><History className="text-indigo-600"/> Relatório</h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full"><X/></button>
                </div>
                <div className="p-4 bg-slate-50 border-b grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <input placeholder="Filtrar Usuário" className="p-3 rounded-xl border font-bold text-xs uppercase" value={filters.user} onChange={e => setFilters({...filters, user: e.target.value})} />
                    <input placeholder="Filtrar SKU" className="p-3 rounded-xl border font-bold text-xs uppercase" value={filters.sku} onChange={e => setFilters({...filters, sku: e.target.value})} />
                    <select className="p-3 rounded-xl border font-bold text-xs uppercase" value={filters.type} onChange={e => setFilters({...filters, type: e.target.value})}>
                        <option value="">Todas Ações</option>
                        <option value="ENTRADA">Entrada</option>
                        <option value="SAIDA">Saída</option>
                        <option value="SAIDA_PARCIAL">Saída Parcial</option>
                        <option value="MOVIMENTACAO">Movimentação</option>
                    </select>
                </div>
                <div className="flex-1 overflow-y-auto p-0">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-100 text-slate-500 uppercase text-[10px] font-black sticky top-0">
                            <tr><th className="p-4">Data</th><th className="p-4">Usuário</th><th className="p-4">Ação</th><th className="p-4">Detalhes</th><th className="p-4">Local</th></tr>
                        </thead>
                        <tbody className="divide-y">
                            {logs.map(log => (
                                <tr key={log.id} className="hover:bg-slate-50">
                                    <td className="p-4 font-mono text-xs text-slate-500">{new Date(log.timestamp).toLocaleString()}</td>
                                    <td className="p-4 font-bold text-slate-700 uppercase">{log.username}</td>
                                    <td className="p-4"><span className="px-2 py-1 rounded text-[10px] font-black uppercase bg-slate-100">{log.action}</span></td>
                                    <td className="p-4 font-medium text-slate-600 uppercase text-xs">{log.details}</td>
                                    <td className="p-4 font-mono text-xs font-bold bg-slate-50">{log.location}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// --- BULK GRID MODAL ---
const BulkGridModal = ({ mode, inventory, masterProducts, onClose, onConfirm }: any) => {
    const [rack, setRack] = useState<RackId>('A');
    const [level, setLevel] = useState(1);
    const [selectedPos, setSelectedPos] = useState<number[]>([]);
    const [entryData, setEntryData] = useState({ sku: '', qty: '', slots: 1 });
    const [suggestions, setSuggestions] = useState<MasterProduct[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        if(mode === 'ENTRY' && entryData.sku) {
            setSuggestions(masterProducts.filter((p: any) => p.productName.toLowerCase().includes(entryData.sku.toLowerCase()) || p.productId.includes(entryData.sku.toUpperCase())).slice(0, 5));
        } else { setSuggestions([]); }
    }, [entryData.sku, masterProducts, mode]);

    const togglePos = (p: number) => {
        if (mode === 'EXIT') {
             if (selectedPos.includes(p)) setSelectedPos(prev => prev.filter(x => x !== p));
             else setSelectedPos(prev => [...prev, p]);
        } else {
             if (selectedPos.includes(p)) setSelectedPos(prev => prev.filter(x => x !== p));
             else setSelectedPos(prev => [...prev, p]);
        }
    };

    const handleConfirm = async () => {
        if (selectedPos.length === 0) return;
        setIsProcessing(true);
        try { await onConfirm({ rack, level, positions: selectedPos, ...entryData }); onClose(); } finally { setIsProcessing(false); }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/95 z-[7000] flex flex-col p-4 backdrop-blur-md overflow-hidden">
            <div className="bg-white w-full h-full rounded-3xl overflow-hidden shadow-2xl flex flex-col">
                <div className={`p-6 border-b flex justify-between items-center ${mode === 'ENTRY' ? 'bg-indigo-50' : 'bg-rose-50'}`}>
                    <h3 className="font-black text-2xl uppercase">{mode === 'ENTRY' ? 'Entrada em Lote' : 'Saída em Lote'}</h3>
                    <button onClick={onClose}><X/></button>
                </div>
                <div className="p-4 bg-white border-b flex flex-col xl:flex-row gap-4">
                    {mode === 'ENTRY' && (
                        <div className="flex-1 flex gap-4 bg-slate-50 p-3 rounded-xl border">
                             <div className="flex-[2] relative">
                                 <label className="text-[10px] uppercase text-slate-400">Produto</label>
                                 <input className="w-full p-2 rounded border font-bold uppercase" value={entryData.sku} onChange={e => setEntryData({...entryData, sku: e.target.value})} />
                                 {suggestions.length > 0 && (
                                     <div className="absolute top-full w-full bg-white border shadow-xl z-50">
                                         {suggestions.map(s => <button key={s.productId} onClick={() => { setEntryData({...entryData, sku: s.productId, qty: s.standardQuantity.toString()}); setSuggestions([]); }} className="w-full text-left p-2 hover:bg-indigo-50 border-b text-xs font-bold uppercase">{s.productName}</button>)}
                                     </div>
                                 )}
                             </div>
                             <div className="flex-1"><label className="text-[10px] uppercase text-slate-400">Qtd</label><input type="number" className="w-full p-2 rounded border font-bold" value={entryData.qty} onChange={e => setEntryData({...entryData, qty: e.target.value})} /></div>
                        </div>
                    )}
                    <div className="flex gap-4 items-center bg-slate-50 p-3 rounded-xl border">
                        <div className="flex gap-1">{PP_RACKS.filter(r => r !== 'FLOOR').map(r => <button key={r} onClick={() => { setRack(r); setSelectedPos([]); }} className={`w-10 h-10 rounded font-black ${rack === r ? 'bg-slate-800 text-white' : 'bg-white border'}`}>{r}</button>)}</div>
                        <div className="flex gap-1">{LEVELS_STREET.map((l, i) => <button key={l} onClick={() => { setLevel(i+1); setSelectedPos([]); }} className={`w-10 h-10 rounded font-black ${level === i+1 ? 'bg-slate-800 text-white' : 'bg-white border'}`}>{l}</button>)}</div>
                    </div>
                    <button onClick={handleConfirm} className="ml-auto bg-indigo-600 text-white px-8 rounded-xl font-black uppercase">{isProcessing ? <Loader2 className="animate-spin"/> : 'Confirmar'}</button>
                </div>
                <div className="flex-1 bg-slate-100 p-8 overflow-y-auto">
                    <div className="grid gap-2 grid-cols-12">
                        {Array.from({length: RACK_POSITIONS[rack] || 60}).map((_, i) => {
                            const p = i + 1;
                            const occupied = inventory.some((inv: any) => inv.rack === rack && inv.level === level && inv.position === p);
                            const isSelected = selectedPos.includes(p);
                            return <button key={p} onClick={() => togglePos(p)} className={`aspect-square rounded flex items-center justify-center font-bold text-xs border ${isSelected ? 'bg-indigo-600 text-white' : occupied ? 'bg-rose-500 text-white' : 'bg-white'}`}>{p}</button>;
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- NOVO: PAINEL DE GESTÃO DO CHÃO ---
const FloorPanel = ({ inventory, masterProducts, onClose, onAdd, onMoveStart, currentUser, onGenerateLabel }: any) => {
    const floorItems = inventory.filter(i => i.rack === 'FLOOR');
    const [entryData, setEntryData] = useState({ sku: '', qty: '', volumes: '1' });
    const [suggestions, setSuggestions] = useState<MasterProduct[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Filtrar sugestões
    useEffect(() => {
        if(entryData.sku) {
            setSuggestions(masterProducts.filter(p => 
                p.productName.toLowerCase().includes(entryData.sku.toLowerCase()) || 
                p.productId.includes(entryData.sku.toUpperCase())
            ).slice(0, 5));
        } else { setSuggestions([]); }
    }, [entryData.sku, masterProducts]);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await onAdd(entryData.sku, parseInt(entryData.qty), parseInt(entryData.volumes));
            setEntryData({ sku: '', qty: '', volumes: '1' });
        } finally { setIsSubmitting(false); }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/95 z-[7000] flex flex-col p-4 backdrop-blur-md">
            <div className="bg-white w-full h-full rounded-3xl overflow-hidden shadow-2xl flex flex-col">
                <div className="p-6 border-b flex justify-between items-center bg-slate-100">
                    <h3 className="font-black text-2xl uppercase flex items-center gap-3 text-slate-800"><Layers className="text-indigo-600"/> ZONA DE RECEBIMENTO (CHÃO)</h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full"><X/></button>
                </div>

                <div className="flex flex-col lg:flex-row h-full overflow-hidden">
                    {/* COLUNA ESQUERDA: Form de Entrada */}
                    <div className="w-full lg:w-1/3 bg-white border-r p-6 overflow-y-auto">
                        <h4 className="font-black text-sm uppercase text-slate-400 mb-4 flex items-center gap-2"><PackagePlus size={16}/> Entrada de Mercadoria</h4>
                        <form onSubmit={handleAdd} className="space-y-4">
                            <div className="relative">
                                <label className="text-[10px] font-black uppercase text-slate-400">Produto</label>
                                <input required className="w-full p-3 bg-slate-50 border-2 rounded-xl font-black uppercase text-sm" value={entryData.sku} onChange={e => setEntryData({...entryData, sku: e.target.value})} placeholder="BUSCAR SKU / NOME" />
                                {suggestions.length > 0 && (
                                     <div className="absolute top-full left-0 w-full bg-white border shadow-xl rounded-b-xl z-50">
                                         {suggestions.map(s => (
                                             <button key={s.productId} type="button" onClick={() => { setEntryData({...entryData, sku: s.productId, qty: s.standardQuantity.toString()}); setSuggestions([]); }} className="w-full text-left p-3 hover:bg-indigo-50 border-b text-xs font-bold uppercase">
                                                 {s.productName}
                                             </button>
                                         ))}
                                     </div>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400">Qtd por Volume</label>
                                    <input required type="number" className="w-full p-3 bg-slate-50 border-2 rounded-xl font-black text-center text-lg" value={entryData.qty} onChange={e => setEntryData({...entryData, qty: e.target.value})} />
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400">Nº de Volumes</label>
                                    <input required type="number" min="1" max="50" className="w-full p-3 bg-slate-50 border-2 rounded-xl font-black text-center text-lg text-indigo-600" value={entryData.volumes} onChange={e => setEntryData({...entryData, volumes: e.target.value})} />
                                </div>
                            </div>
                            <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 text-amber-700 text-xs font-bold">
                                <Info size={14} className="inline mr-1"/>
                                Serão geradas {entryData.volumes} etiquetas individuais.
                            </div>
                            <button disabled={isSubmitting} className="w-full bg-indigo-600 text-white p-4 rounded-xl font-black uppercase shadow-lg flex justify-center items-center gap-2">
                                {isSubmitting ? <Loader2 className="animate-spin"/> : <><Printer size={18}/> Gerar Etiquetas</>}
                            </button>
                        </form>
                    </div>

                    {/* COLUNA DIREITA: Lista de Itens no Chão */}
                    <div className="flex-1 bg-slate-50 p-6 overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="font-black text-sm uppercase text-slate-400 flex items-center gap-2"><Package size={16}/> Itens Aguardando ({floorItems.length})</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {floorItems.map(item => (
                                <div key={item.id} className="bg-white p-4 rounded-xl border shadow-sm relative group hover:border-indigo-400 transition-all">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest">{item.productId}</div>
                                        <button onClick={() => onGenerateLabel([item])} className="text-slate-300 hover:text-slate-600"><Printer size={16}/></button>
                                    </div>
                                    <div className="font-black text-slate-800 text-sm uppercase leading-tight mb-2">{item.productName}</div>
                                    <div className="flex justify-between items-end">
                                        <div className="text-xs text-slate-400 font-mono">{new Date(item.createdAt).toLocaleDateString()}</div>
                                        <div className="text-xl font-black text-slate-800">{item.quantity} <span className="text-[10px] text-slate-400">UN</span></div>
                                    </div>
                                    <div className="mt-3 pt-3 border-t flex gap-2">
                                        {/* ADMIN: Botão de Mover Manual */}
                                        {currentUser.role === 'admin' && (
                                            <button onClick={() => onMoveStart(item)} className="flex-1 bg-slate-800 text-white py-2 rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-2 hover:bg-slate-900">
                                                <MoveRight size={14}/> Mover p/ Rack
                                            </button>
                                        )}
                                        {/* OPERADOR: Instrução */}
                                        {currentUser.role === 'operator' && (
                                            <div className="flex-1 bg-slate-100 text-slate-400 py-2 rounded-lg text-[10px] font-black uppercase text-center flex items-center justify-center gap-1">
                                                <ScanLine size={12}/> Bipe p/ Mover
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {floorItems.length === 0 && (
                                <div className="col-span-full py-20 text-center text-slate-300 font-black uppercase text-sm">
                                    Nenhum item no chão
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  
  // Modais
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isReportsPanelOpen, setIsReportsPanelOpen] = useState(false);
  const [isMasterMenuOpen, setIsMasterMenuOpen] = useState(false);
  const [isInventoryReportOpen, setIsInventoryReportOpen] = useState(false);
  const [isFIFOMenuOpen, setIsFIFOMenuOpen] = useState(false);
  const [isPrintMenuOpen, setIsPrintMenuOpen] = useState(false);
  const [bulkModalMode, setBulkModalMode] = useState<'ENTRY' | 'EXIT' | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isFloorPanelOpen, setIsFloorPanelOpen] = useState(false);

  // Operator & Flow Logic
  const [operatorTarget, setOperatorTarget] = useState<PalletPosition | {rack: string, level: number, pos: number} | null>(null);
  const [moveSourceItem, setMoveSourceItem] = useState<PalletPosition | null>(null); // Item sendo movido (Admin ou Operador)

  const [inventory, setInventory] = useState<PalletPosition[]>([]);
  const [masterProducts, setMasterProducts] = useState<MasterProduct[]>([]);
  
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // Estados de Interface
  const [viewMode, setViewMode] = useState<'2D' | '3D'>('2D');
  const [activeRack, setActiveRack] = useState<RackId>('A');
  const [activeTabLevel, setActiveTabLevel] = useState(1);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Estados de Detalhe / Sidebar
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<'ENTRY' | 'DETAIL'>('ENTRY');
  const [currentLevelContext, setCurrentLevelContext] = useState<{rack: RackId, level: number} | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);
  
  // Estados de Formulários
  const [manualEntryData, setManualEntryData] = useState({ sku: '', qty: '', slots: 1 });
  const [partialOutputItem, setPartialOutputItem] = useState<PalletPosition | null>(null);
  const [partialOutputQty, setPartialOutputQty] = useState('');
  
  // Estados Impressão
  const [printSelectionData, setPrintSelectionData] = useState({ targetRack: 'A' as RackId, targetLevel: 1, selectedPositions: [] as number[] });
  const [hoveredPosition, setHoveredPosition] = useState<{rack: string, pos: number, level: number} | null>(null);

  const isOperator = currentUser?.role === 'operator';
  const isAdmin = currentUser?.role === 'admin';

  // --- DATA LOADING ---
  const loadInitialData = useCallback(async () => {
    try {
      const [inv, masters] = await Promise.all([fetchInventoryFromDB(FIXED_DB_STRING), fetchMasterProductsFromDB(FIXED_DB_STRING)]);
      setInventory(inv);
      setMasterProducts(masters);
    } catch (e) { console.error("Erro ao carregar dados:", e); }
  }, []);

  useEffect(() => {
    initializeDatabase(FIXED_DB_STRING).then(() => {
        console.log("Database initialized & Admin ensured.");
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (currentUser) {
        loadInitialData();
        const interval = setInterval(loadInitialData, 30000);
        return () => clearInterval(interval);
    }
  }, [currentUser, loadInitialData]);

  const showFeedback = (type: 'success' | 'error', msg: string) => { 
    setFeedback({ type, msg }); 
    setTimeout(() => setFeedback(null), 3000); 
  };

  const closeAllModals = () => { 
    setIsPrintMenuOpen(false); 
    setIsMasterMenuOpen(false); 
    setIsInventoryReportOpen(false); 
    setIsFIFOMenuOpen(false); 
    setBulkModalMode(null);
    setIsAdminPanelOpen(false);
    setIsReportsPanelOpen(false);
    setIsSidebarOpen(false);
    setIsFloorPanelOpen(false);
    setOperatorTarget(null);
    setMoveSourceItem(null);
  };

  // --- ACTIONS ---

  const handleMasterProductSave = async (product: MasterProduct) => {
      await saveMasterProductToDB(FIXED_DB_STRING, product);
      await loadInitialData();
      showFeedback('success', 'Produto salvo com sucesso!');
  };

  const handleMasterProductDelete = async (id: string) => {
      if(!confirm('Excluir este produto?')) return;
      await deleteMasterProductFromDB(FIXED_DB_STRING, id);
      await loadInitialData();
  };

  // --- FLOOR MANAGEMENT ---
  const handleAddToFloor = async (sku: string, qty: number, volumes: number) => {
      const master = masterProducts.find(m => m.productId === sku.toUpperCase());
      const productName = master?.productName || 'RECEBIMENTO MANUAL';
      
      const newItems = [];
      const timestamp = Date.now();
      
      for(let i = 0; i < volumes; i++) {
          newItems.push({
              id: `FL-${timestamp}-${i}`, // ID Único para cada volume
              rack: 'FLOOR' as RackId,
              level: 0,
              position: 0,
              productId: sku.toUpperCase(),
              productName: productName,
              quantity: qty,
              slots: 1,
              lastUpdated: new Date().toISOString(),
              createdAt: new Date().toISOString()
          });
      }

      try {
          for (const item of newItems) {
              await saveItemToDB(FIXED_DB_STRING, item);
          }
          await saveLogToDB(FIXED_DB_STRING, {
              username: currentUser?.username || 'unknown',
              action: 'ENTRADA',
              details: `Entrada Chão: ${volumes} vol. de ${sku}`,
              quantity: qty * volumes,
              location: 'CHÃO',
              timestamp: new Date().toISOString(),
              sku: sku.toUpperCase()
          });
          await loadInitialData();
          showFeedback('success', `${volumes} volumes adicionados ao Chão.`);
          // Opcional: Gerar PDFs automaticamente? Por enquanto o usuário clica.
      } catch(e) {
          console.error(e);
          showFeedback('error', 'Erro ao adicionar ao chão.');
      }
  };

  const handleMoveItemStart = (item: PalletPosition) => {
      setMoveSourceItem(item);
      setIsFloorPanelOpen(false);
      showFeedback('success', 'Item selecionado. Clique na posição de destino no Rack.');
  };

  const handleMoveItemCommit = async (targetRack: RackId, targetLevel: number, targetPos: number) => {
      if (!moveSourceItem) return;
      
      // Validações de Destino
      const itemsAtDest = inventory.filter(i => i.rack === targetRack && i.level === targetLevel && i.position === targetPos);
      if (itemsAtDest.some(i => i.isBlocked)) {
          showFeedback('error', 'Destino bloqueado.');
          return;
      }
      
      // Verifica 2 slots se necessário (se o item movido exigir, mas por padrão 1)
      // Aqui simplificamos: movemos com slots=1 a menos que editado. 
      // Se fosse manter slots, precisaria validar vizinho.
      
      setIsProcessingAction(true);
      try {
          // Atualiza o item com novo local
          const updatedItem = {
              ...moveSourceItem,
              rack: targetRack,
              level: targetLevel,
              position: targetPos,
              lastUpdated: new Date().toISOString()
          };
          
          // Remove do antigo (update sobrescreve se ID for mesmo? Não, ID do banco é chave. Se mudarmos Rack/Pos, é update do registro ou novo?)
          // No DB `id` é Primary Key. Se o ID for `FL-...`, e mudarmos só os campos rack/level/pos, ele atualiza a linha.
          // O `saveItemToDB` faz UPSERT no `id`. Então atualiza o registro existente `FL-...` para ter localização de Rack. Perfeito.
          
          await saveItemToDB(FIXED_DB_STRING, updatedItem);
          
          await saveLogToDB(FIXED_DB_STRING, {
              username: currentUser?.username || 'unknown',
              action: 'MOVIMENTACAO',
              details: `De CHÃO para ${targetRack}${targetPos}${LEVELS_ALL[targetLevel-1]}`,
              quantity: updatedItem.quantity,
              location: `${targetRack}-${targetPos}-${targetLevel}`,
              timestamp: new Date().toISOString(),
              sku: updatedItem.productId,
              labelId: updatedItem.id
          });

          await loadInitialData();
          showFeedback('success', 'Item armazenado com sucesso!');
          setMoveSourceItem(null);
          setSidebarMode('DETAIL');
      } finally {
          setIsProcessingAction(false);
      }
  };

  // --- MANUAL ENTRY (SIDEBAR) ---
  const handleManualEntrySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentLevelContext || !selectedPosition) return;
    
    const rack = currentLevelContext.rack;
    const level = currentLevelContext.level;
    const pos = selectedPosition;

    // Verificar bloqueio
    const currentItems = inventory.filter(i => i.rack === rack && i.level === level && i.position === pos);
    if (currentItems.some(i => i.isBlocked)) {
        showFeedback('error', 'Esta vaga está bloqueada manualmente.');
        return;
    }

    // Verifica 2 slots
    if (manualEntryData.slots === 2) {
        const nextPos = pos + 1;
        if (nextPos > RACK_POSITIONS[rack]) { showFeedback('error', 'Vaga dupla excede limite.'); return; }
        const nextItems = inventory.filter(i => i.rack === rack && i.level === level && i.position === nextPos);
        if (nextItems.length > 0) { showFeedback('error', 'Vaga vizinha ocupada.'); return; }
    }

    setIsProcessingAction(true);
    const master = masterProducts.find(m => m.productId === manualEntryData.sku.toUpperCase());
    
    try {
      const newItem = { 
        id: `${rack}-${level}-${pos}-${Date.now()}`, 
        rack, level, position: pos, 
        productId: manualEntryData.sku.toUpperCase(), 
        productName: master?.productName || 'PRODUTO AVULSO', 
        quantity: parseInt(manualEntryData.qty), 
        slots: parseInt(manualEntryData.slots), 
        lastUpdated: new Date().toISOString(), 
        createdAt: new Date().toISOString() 
      };

      await saveItemToDB(FIXED_DB_STRING, newItem);
      await saveLogToDB(FIXED_DB_STRING, {
          username: currentUser?.username || 'unknown',
          action: 'ENTRADA',
          details: `${newItem.productId} - ${newItem.productName} (Direto)`,
          quantity: parseInt(manualEntryData.qty),
          location: `${newItem.rack}${newItem.position}${LEVELS_ALL[newItem.level-1]}`,
          timestamp: new Date().toISOString(),
          sku: newItem.productId
      });

      await loadInitialData(); 
      showFeedback('success', 'Item adicionado!');
      setSidebarMode('DETAIL');
      setManualEntryData({ sku: '', qty: '', slots: 1 });
    } finally { setIsProcessingAction(false); }
  };

  const handleBulkProcess = async (data: any) => {
     if (bulkModalMode === 'ENTRY') {
         const { rack, level, positions, sku, qty, slots } = data;
         const master = masterProducts.find(m => m.productId === sku.toUpperCase());
         for (const pos of positions) {
             const newItem = {
                id: `${rack}-${level}-${pos}-${Date.now()}`,
                rack, level, position: pos,
                productId: sku.toUpperCase(),
                productName: master?.productName || 'LOTE',
                quantity: parseInt(qty),
                slots: slots,
                lastUpdated: new Date().toISOString(),
                createdAt: new Date().toISOString()
             };
             await saveItemToDB(FIXED_DB_STRING, newItem);
         }
         await saveLogToDB(FIXED_DB_STRING, { username: currentUser.username, action: 'ENTRADA', details: `Lote ${positions.length} pos.`, quantity: positions.length * parseInt(qty), timestamp: new Date().toISOString(), sku });
         showFeedback('success', 'Entrada em lote concluída.');
     } else {
         const { rack, level, positions } = data;
         for (const pos of positions) {
             const items = inventory.filter(i => i.rack === rack && i.level === level && i.position === pos);
             for (const item of items) await deleteItemFromDB(FIXED_DB_STRING, item);
         }
         await saveLogToDB(FIXED_DB_STRING, { username: currentUser.username, action: 'SAIDA', details: `Saída Lote ${positions.length} pos.`, quantity: positions.length, timestamp: new Date().toISOString(), sku: 'VARIOS' });
         showFeedback('success', 'Saída em lote concluída.');
     }
     await loadInitialData();
  };

  // --- ACTIONS (Block/Unblock/Labels/Partial/Delete) - Mantidos do anterior ---
  const handleBlockPosition = async () => { 
      if (!currentLevelContext || !selectedPosition) return;
      const reason = window.prompt("Motivo do bloqueio:");
      if (!reason) return;
      const { rack, level } = currentLevelContext;
      const pos = selectedPosition;
      // Validação de anterior duplo
      const prevItems = inventory.filter(i => i.rack === rack && i.level === level && i.position === pos - 1);
      if (prevItems.some(i => i.slots === 2)) { showFeedback('error', 'Ocupada pela anterior.'); return; }

      setIsProcessingAction(true);
      try {
          const newItem = { id: `${rack}-${level}-${pos}-BLOCK`, rack, level, position: pos, isBlocked: true, blockReason: reason, productName: 'VAGA BLOQUEADA' };
          await saveItemToDB(FIXED_DB_STRING, newItem);
          await saveLogToDB(FIXED_DB_STRING, { username: currentUser?.username, action: 'BLOQUEIO', details: `Motivo: ${reason}`, location: `${rack}${pos}${LEVELS_ALL[level-1]}`, timestamp: new Date().toISOString() });
          await loadInitialData(); showFeedback('success', 'Bloqueada.'); setIsSidebarOpen(false);
      } finally { setIsProcessingAction(false); }
  };
  const handleUnblockPosition = async (item: PalletPosition) => {
      if (!confirm('Desbloquear?')) return;
      setIsProcessingAction(true);
      try {
          await deleteItemFromDB(FIXED_DB_STRING, item);
          await saveLogToDB(FIXED_DB_STRING, { username: currentUser?.username, action: 'DESBLOQUEIO', details: 'Manual', location: `${item.rack}${item.position}${LEVELS_ALL[item.level-1]}`, timestamp: new Date().toISOString() });
          await loadInitialData(); showFeedback('success', 'Desbloqueada.'); setIsSidebarOpen(false);
      } finally { setIsProcessingAction(false); }
  };
  const handleGenerateLabels = async (targets: any[]) => { 
      setIsGeneratingPDF(true);
      try {
          const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [50, 50] });
          for (let i = 0; i < targets.length; i++) {
              if (i > 0) doc.addPage();
              
              // Verifica se é item do chão (ID começa com FL) ou Posição física
              const target = targets[i];
              const isFloorItem = target.id && target.id.startsWith('FL');
              
              let code = '';
              let label = '';
              
              if (isFloorItem) {
                  // Etiqueta de ITEM (CHÃO)
                  code = `ITEM-${target.id}`; // Formato especial para scanner reconhecer item
                  label = `CHÃO ${target.productId}`;
              } else {
                  // Etiqueta de POSIÇÃO
                  const { rack, level, pos } = target;
                  const levelChar = LEVELS_ALL[level - 1];
                  code = `PP-${rack}-P-${pos}-L-${level}`;
                  label = `${rack}${pos}${levelChar}`;
              }
              
              doc.setLineWidth(0.1); doc.rect(1, 1, 48, 48);
              const qrUrl = await QRCode.toDataURL(code, { errorCorrectionLevel: 'H', width: 200, margin: 0 });
              doc.addImage(qrUrl, 'PNG', 7.5, 9, 35, 35);
              doc.setFont("helvetica", "bold"); doc.setFontSize(10);
              doc.text(label, 25, 7, { align: "center" });
              doc.setFontSize(6); doc.text(code, 25, 46, { align: "center" });
          }
          doc.save("etiquetas.pdf");
      } finally { setIsGeneratingPDF(false); }
  };
  const handlePartialOutput = async (e: React.FormEvent) => { 
      e.preventDefault(); if (!partialOutputItem) return;
      const qty = parseInt(partialOutputQty);
      if (qty > partialOutputItem.quantity) { showFeedback('error', 'Qtd inválida'); return; }
      setIsProcessingAction(true);
      try {
          const remaining = partialOutputItem.quantity - qty;
          if (remaining === 0) await deleteItemFromDB(FIXED_DB_STRING, partialOutputItem);
          else await saveItemToDB(FIXED_DB_STRING, { ...partialOutputItem, quantity: remaining, lastUpdated: new Date().toISOString() });
          await saveLogToDB(FIXED_DB_STRING, { username: currentUser.username, action: 'SAIDA_PARCIAL', details: `Saída ${qty} un.`, quantity: qty, timestamp: new Date().toISOString(), sku: partialOutputItem.productId });
          await loadInitialData(); showFeedback('success', 'Saída realizada.'); setPartialOutputItem(null);
      } finally { setIsProcessingAction(false); }
  };
  const handleDeleteItem = async (item: PalletPosition) => { 
      if(!confirm('Saída total?')) return;
      await deleteItemFromDB(FIXED_DB_STRING, item);
      await saveLogToDB(FIXED_DB_STRING, { username: currentUser.username, action: 'SAIDA', details: `Total`, quantity: item.quantity, timestamp: new Date().toISOString(), sku: item.productId });
      await loadInitialData(); showFeedback('success', 'Item removido.');
  };

  // --- CLICK LOGIC & SCANNER ---
  const handlePositionClick = (rack: RackId, level: number, pos: number) => {
      // Se estamos no meio de uma movimentação (source set), clicar no destino executa o movimento
      if (moveSourceItem) {
          handleMoveItemCommit(rack, level, pos);
          return;
      }

      const items = inventory.filter(i => i.rack === rack && i.level === level && i.position === pos);

      // FLUXO DE OPERADOR: MOSTRAR ETIQUETA PARA BIPAR (Se for apenas consulta)
      // MAS se o operador estiver movendo algo (source set), já caiu no if acima.
      if (isOperator && !moveSourceItem) { 
          if (items.some(i => i.isBlocked)) { showFeedback('error', 'Bloqueado.'); return; }
          // Mostra QR da posição para ele bipar e "entrar" virtualmente se quiser, 
          // ou abre modal se ele quiser ver o que tem. 
          // O prompt diz: "Operador bipa... abre fluxo".
          setOperatorTarget(items.length > 0 ? items[0] : { rack, level, pos: pos as number }); 
          return; 
      }
      
      const prevItems = inventory.filter(i => i.rack === rack && i.level === level && i.position === pos - 1);
      if (prevItems.some(i => i.slots === 2)) { handlePositionClick(rack, level, pos - 1); return; }

      setCurrentLevelContext({ rack, level });
      setSelectedPosition(pos);
      
      // AGORA: Sempre abre no modo DETAIL se tiver itens, mas permite adicionar
      setSidebarMode(items.length > 0 ? 'DETAIL' : 'ENTRY');
      if(items.length === 0) setManualEntryData({ sku: '', qty: '', slots: 1 });
      setIsSidebarOpen(true);
  };
  
  const handleScanLogic = (text: string) => {
      // 1. SCAN DE ETIQUETA DE ITEM (CHÃO) -> ITEM-FL-123...
      const itemMatch = text.match(/^ITEM-(.+)$/);
      if (itemMatch) {
          const itemId = itemMatch[1];
          const item = inventory.find(i => i.id === itemId);
          if (item) {
              setIsScannerOpen(false);
              setMoveSourceItem(item); // Define como origem
              showFeedback('success', `Item ${item.productId} identificado! Agora bipe o destino.`);
              // Fecha scanner? Ou mantém aberto para o destino? Melhor fechar e dar feedback visual.
              return;
          }
      }

      // 2. SCAN DE LOCAL (DESTINO ou CONSULTA) -> PP-A-P-1-L-1
      const locMatch = text.match(/PP-([A-D])-P-(\d+)-L-(\d+)/);
      if (locMatch) {
          setIsScannerOpen(false);
          const rack = locMatch[1] as RackId; const pos = parseInt(locMatch[2]); const level = parseInt(locMatch[3]);
          
          if (moveSourceItem) {
              // É um destino de movimento
              handleMoveItemCommit(rack, level, pos);
          } else {
              // É consulta/abertura
              const items = inventory.filter(i => i.rack === rack && i.level === level && i.position === pos);
              if (items.some(i => i.isBlocked)) { showFeedback('error', 'Vaga Bloqueada.'); return; }
              setCurrentLevelContext({ rack, level }); setSelectedPosition(pos);
              setSidebarMode(items.length > 0 ? 'DETAIL' : 'ENTRY');
              if(items.length === 0) setManualEntryData({ sku: '', qty: '', slots: 1 });
              setIsSidebarOpen(true);
              showFeedback('success', 'Local identificado.');
          }
      } else {
          // showFeedback('error', 'Código não reconhecido.');
      }
  };

  // --- RENDER HELPERS ---
  const getPositionStatus = (rack: RackId, level: number, pos: number) => {
      const items = inventory.filter(i => i.rack === rack && i.level === level && i.position === pos);
      const prevItems = inventory.filter(i => i.rack === rack && i.level === level && i.position === pos - 1);
      const blockedByPrev = prevItems.some(i => i.slots === 2);
      return { items, blockedByPrev };
  };

  const levelStats = useMemo(() => {
      const total = RACK_POSITIONS[activeRack];
      const occupiedSet = new Set<number>();
      const blockedSet = new Set<number>();
      inventory.filter(inv => inv.rack === activeRack && inv.level === activeTabLevel).forEach(item => {
          if (item.isBlocked) blockedSet.add(item.position);
          else {
              occupiedSet.add(item.position);
              if (item.slots === 2) occupiedSet.add(item.position + 1);
          }
      });
      const realOccupied = occupiedSet.size;
      const realBlocked = blockedSet.size; 
      const free = total - realOccupied - realBlocked;
      return { total, free: Math.max(0, free), occupied: realOccupied, blocked: realBlocked };
  }, [inventory, activeRack, activeTabLevel]);

  if (!currentUser) return <LoginScreen onLoginSuccess={setCurrentUser} />;

  return (
    <div className="h-screen w-screen bg-[#F8FAFC] flex flex-col lg:flex-row overflow-hidden font-sans">
      {/* TOOLTIP FLUTUANTE */}
      {hoveredPosition && (
          <div className="fixed bottom-6 left-6 z-[8000] bg-slate-900/95 backdrop-blur text-white p-4 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-5 w-72 border border-slate-700 pointer-events-none">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex justify-between">
                  <span>{hoveredPosition.rack}{hoveredPosition.pos}{LEVELS_ALL[hoveredPosition.level-1]}</span>
                  <Info size={12}/>
              </div>
              {(() => {
                  const { items, blockedByPrev } = getPositionStatus(hoveredPosition.rack, hoveredPosition.level, hoveredPosition.pos);
                  if (items.some(i => i.isBlocked)) return <div className="py-2 text-rose-400 font-black"><Lock size={14} className="inline mr-1"/> BLOQUEADA</div>;
                  if (items.length > 0) return <div className="space-y-2 mt-2">{items.map((it, i) => <div key={i} className="border-t border-white/10 pt-1"><div className="font-bold text-sm">{it.productName}</div><div className="text-emerald-400 font-bold">{it.quantity} un</div></div>)}</div>;
                  if (blockedByPrev) return <div className="text-amber-400 font-bold py-2">Extensão Anterior</div>;
                  return <div className="text-emerald-400 font-bold py-2">LIVRE</div>;
              })()}
          </div>
      )}

      {feedback && <div className="fixed top-6 right-6 z-[9999] px-6 py-4 rounded-2xl bg-slate-900 text-white font-bold shadow-2xl flex items-center gap-3 animate-in slide-in-from-right"><CheckCircle2 className="text-emerald-400"/> {feedback.msg}</div>}
      
      {/* AVISO DE MOVIMENTAÇÃO ATIVA */}
      {moveSourceItem && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] px-8 py-4 rounded-full bg-indigo-600 text-white font-black shadow-2xl flex items-center gap-4 animate-pulse border-4 border-white/20">
              <PackageMinus className="animate-bounce"/>
              <div>
                  <div className="text-[10px] uppercase opacity-80 tracking-widest">Movendo Item</div>
                  <div className="text-sm">{moveSourceItem.productId} - {moveSourceItem.quantity} UN</div>
              </div>
              <ArrowRight className="mx-2"/>
              <div className="text-xs uppercase bg-white/20 px-3 py-1 rounded-lg">Selecione Destino</div>
              <button onClick={() => setMoveSourceItem(null)} className="ml-2 p-1 hover:bg-white/20 rounded-full"><X size={16}/></button>
          </div>
      )}

      {/* SIDEBAR NAVIGATION */}
      <aside className="w-80 bg-white border-r p-8 flex flex-col hidden lg:flex shadow-sm z-20">
        <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg"><Warehouse size={20}/></div>
            <div><h1 className="text-xl font-black italic text-slate-900">ALMOX <span className="text-indigo-600">PRO</span></h1><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">v5.0</span></div>
        </div>
        
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-6 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-black uppercase ${currentUser.role === 'admin' ? 'bg-indigo-600' : 'bg-emerald-500'}`}>{currentUser.username[0]}</div>
            <div className="flex-1 overflow-hidden">
                <div className="font-black text-slate-800 text-sm truncate uppercase">{currentUser.fullName || currentUser.username}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{currentUser.role === 'admin' ? 'Admin' : 'Operador'}</div>
            </div>
            <button onClick={() => setCurrentUser(null)} className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-lg"><LogOut size={16}/></button>
        </div>

        <nav className="space-y-1 flex-1">
            <button onClick={() => closeAllModals()} className="w-full flex items-center gap-4 p-4 hover:bg-indigo-50 hover:text-indigo-700 text-slate-500 rounded-2xl font-bold text-xs uppercase transition-all"><LayoutDashboard size={18}/> Visão Geral</button>
            <button onClick={() => { closeAllModals(); setIsFloorPanelOpen(true); }} className="w-full flex items-center gap-4 p-4 hover:bg-amber-50 text-slate-500 hover:text-amber-600 rounded-2xl font-bold text-xs uppercase transition-all"><Layers size={18}/> Recebimento / Chão</button>
            <button onClick={() => { closeAllModals(); setIsPrintMenuOpen(true); }} className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 text-slate-500 rounded-2xl font-bold text-xs uppercase transition-all"><Printer size={18}/> Etiquetas QR</button>
            <button onClick={() => { closeAllModals(); setIsFIFOMenuOpen(true); }} className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 text-slate-500 rounded-2xl font-bold text-xs uppercase transition-all"><Calendar size={18}/> Controle FIFO</button>
            
            {!isOperator && (
                <div className="pt-4 mt-4 border-t border-slate-100">
                    <div className="px-4 text-[10px] font-black uppercase text-slate-400 mb-2">Administração</div>
                    <button onClick={() => { closeAllModals(); setIsMasterMenuOpen(true); }} className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 text-slate-500 rounded-2xl font-bold text-xs uppercase transition-all"><ClipboardList size={18}/> Cadastro Produtos</button>
                    <button onClick={() => { closeAllModals(); setIsAdminPanelOpen(true); }} className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 text-slate-500 rounded-2xl font-bold text-xs uppercase transition-all"><UserCheck size={18}/> Usuários</button>
                    <button onClick={() => { closeAllModals(); setIsReportsPanelOpen(true); }} className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 text-slate-500 rounded-2xl font-bold text-xs uppercase transition-all"><History size={18}/> Logs Sistema</button>
                    <button onClick={() => { closeAllModals(); setIsInventoryReportOpen(true); }} className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 text-slate-500 rounded-2xl font-bold text-xs uppercase transition-all"><ListChecks size={18}/> Saldo Estoque</button>
                </div>
            )}
        </nav>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* MOBILE HEADER */}
        <header className="p-4 bg-white border-b flex justify-between items-center lg:hidden z-30 sticky top-0">
          <div className="flex items-center gap-2"><Warehouse size={20}/><h1 className="font-black">ALMOX PRO</h1></div>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 bg-slate-100 rounded-lg"><Menu size={20}/></button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-10 space-y-8">
            {/* TOP BAR */}
            <div className="flex flex-col xl:flex-row gap-8 justify-between items-start xl:items-center">
                 <div>
                     <h2 className="text-3xl font-black text-slate-800 tracking-tight">Grade de Operação</h2>
                     <span className="text-xs font-bold text-slate-400 uppercase">Selecione Nível e Rua para visualizar</span>
                 </div>
                 <div className="flex flex-wrap gap-3">
                    <button onClick={() => { closeAllModals(); setIsFloorPanelOpen(true); }} className="bg-amber-100 text-amber-700 px-6 py-4 rounded-2xl font-black uppercase text-sm shadow-sm flex items-center gap-3 hover:bg-amber-200 transition-all"><Layers size={20}/> CHÃO ({inventory.filter(i => i.rack === 'FLOOR').length})</button>
                    <button onClick={() => setIsScannerOpen(true)} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black uppercase text-sm shadow-xl flex items-center gap-3 hover:bg-slate-800 transition-all"><ScanLine/> SCANNER</button>
                    {!isOperator && (
                        <>
                        <button onClick={() => { closeAllModals(); setBulkModalMode('ENTRY'); }} className="bg-white text-indigo-600 border-2 border-indigo-100 px-6 py-3 rounded-2xl font-black uppercase text-xs shadow-sm flex items-center gap-2"><PackagePlus size={18}/> Entrada Rápida</button>
                        <button onClick={() => { closeAllModals(); setBulkModalMode('EXIT'); }} className="bg-white text-rose-600 border-2 border-rose-100 px-6 py-3 rounded-2xl font-black uppercase text-xs shadow-sm flex items-center gap-2"><PackageMinus size={18}/> Saída Rápida</button>
                        </>
                    )}
                 </div>
            </div>

            {/* MAIN WAREHOUSE VIEW */}
            <div className="bg-white rounded-[2.5rem] border shadow-sm overflow-hidden flex flex-col min-h-[600px] relative">
                {isOperator && viewMode === '2D' && <div className="absolute top-6 right-6 z-10 bg-slate-900/80 text-white px-4 py-2 rounded-xl text-xs font-bold backdrop-blur"><Info size={14} className="inline mr-2"/> Clique no box para abrir Etiqueta</div>}
                
                <div className="p-6 border-b flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="bg-slate-100 p-1.5 rounded-xl flex gap-1 w-full sm:w-auto">
                        <button onClick={() => setViewMode('2D')} className={`flex-1 px-6 py-2 rounded-lg text-xs font-black uppercase transition-all flex items-center gap-2 ${viewMode === '2D' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}><ListChecks size={16}/> Grade 2D</button>
                        <button onClick={() => setViewMode('3D')} className={`flex-1 px-6 py-2 rounded-lg text-xs font-black uppercase transition-all flex items-center gap-2 ${viewMode === '3D' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}><Cuboid size={16}/> Mapa 3D</button>
                    </div>
                    {viewMode === '2D' && (
                        <div className="flex gap-2">
                             {PP_RACKS.filter(r => r !== 'FLOOR').map(r => (
                                <button key={r} onClick={() => setActiveRack(r)} className={`w-10 h-10 rounded-xl font-black text-sm flex items-center justify-center border-2 transition-all ${activeRack === r ? 'bg-indigo-600 border-indigo-600 text-white shadow-md scale-110' : 'bg-white border-slate-100 text-slate-400'}`}>{r}</button>
                             ))}
                        </div>
                    )}
                </div>

                {/* PAINEL DE ESTATÍSTICAS DA RUA/NÍVEL ATUAL */}
                <div className="px-8 py-4 bg-slate-50/80 border-b flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-black uppercase tracking-widest text-slate-500">
                    <div className="flex items-center gap-2"><BarChart3 size={16}/> Estatísticas (Rua {activeRack} - Nível {LEVELS_ALL[activeTabLevel-1]})</div>
                    <div className="flex gap-4">
                        <span className="flex items-center gap-1.5 text-slate-400"><div className="w-2 h-2 rounded-full bg-slate-300"></div> Total: {levelStats.total}</span>
                        <span className="flex items-center gap-1.5 text-emerald-600"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Livres: {levelStats.free}</span>
                        <span className="flex items-center gap-1.5 text-rose-600"><div className="w-2 h-2 rounded-full bg-rose-500"></div> Ocupadas: {levelStats.occupied}</span>
                        {levelStats.blocked > 0 && <span className="flex items-center gap-1.5 text-slate-600"><div className="w-2 h-2 rounded-full bg-slate-700"></div> Bloqueadas: {levelStats.blocked}</span>}
                    </div>
                </div>

                <div className="flex-1 bg-slate-50/50 relative">
                    {viewMode === '2D' ? (
                        <div className="p-4 sm:p-8 flex flex-col h-full overflow-y-auto">
                             <div className="grid gap-3 grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-11 pb-20">
                                {Array.from({length: RACK_POSITIONS[activeRack]}).map((_, i) => {
                                    const p = i + 1;
                                    const levelChar = LEVELS_ALL[activeTabLevel - 1];
                                    const addressLabel = `${activeRack}${p}${levelChar}`;

                                    const { items, blockedByPrev } = getPositionStatus(activeRack, activeTabLevel, p);
                                    
                                    const occupied = items.length > 0;
                                    const hasDouble = items.some(i => i.slots === 2);
                                    const isBlocked = items.some(i => i.isBlocked);
                                    
                                    let bgClass = 'bg-emerald-500';
                                    let content = <Box size={16} className="opacity-40"/>;
                                    let styles = '';

                                    if (isBlocked) {
                                        bgClass = 'bg-slate-800';
                                        content = <Lock size={16} className="text-rose-500"/>;
                                    } else if (blockedByPrev) {
                                        bgClass = 'bg-rose-500';
                                        content = <Link size={16} className="opacity-50 text-white"/>;
                                        styles = 'border-l-0 rounded-l-none opacity-60';
                                    } else if (occupied) {
                                        bgClass = 'bg-rose-500';
                                        content = (
                                            <div className="flex flex-col items-center">
                                                <div className="text-[7px] font-black uppercase text-white bg-black/20 px-1 rounded mb-0.5">EM USO</div>
                                                {items.length > 1 ? <Layers size={14}/> : <Package size={14}/>}
                                                <span className="text-[8px] mt-0.5 font-bold">{items.length > 1 ? `x${items.length}` : (hasDouble ? '2V' : '1V')}</span>
                                            </div>
                                        );
                                        if (hasDouble) styles = 'border-r-0 rounded-r-none z-10 w-[calc(100%+0.5rem)]';
                                    } else {
                                        bgClass = 'bg-emerald-500 hover:bg-emerald-400';
                                        content = (
                                            <div className="flex flex-col items-center opacity-70">
                                                <div className="text-[7px] font-black uppercase text-white bg-black/10 px-1 rounded mb-0.5">LIVRE</div>
                                                <Box size={14} className="opacity-60"/>
                                            </div>
                                        );
                                    }

                                    return (
                                        <button 
                                            key={p} 
                                            onMouseEnter={() => setHoveredPosition({rack: activeRack, level: activeTabLevel, pos: p})}
                                            onMouseLeave={() => setHoveredPosition(null)}
                                            onClick={() => handlePositionClick(activeRack, activeTabLevel, p)} 
                                            className={`aspect-square rounded-2xl font-black text-[10px] flex flex-col items-center justify-center relative shadow-sm group transition-all active:scale-95 text-white ${bgClass} ${styles}`}
                                        >
                                            {!blockedByPrev && !isBlocked && <span className="opacity-60 absolute top-1 left-2 text-[8px]">{addressLabel}</span>}
                                            {content}
                                        </button>
                                    );
                                })}
                             </div>
                        </div>
                    ) : <Warehouse3D inventory={inventory} onPositionClick={(r, l, p) => !isOperator && handlePositionClick(r, l, p)} />}
                </div>
            </div>
        </div>
      </main>

      {/* SIDEBAR DIREITA (ENTRADA/SAIDA) */}
      <div className={`fixed inset-y-0 right-0 w-full sm:w-[450px] bg-white shadow-2xl z-[5000] transform transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'} border-l flex flex-col`}>
          {currentLevelContext && selectedPosition && (
              <>
                <header className={`p-8 text-white flex justify-between items-start ${sidebarMode === 'DETAIL' ? 'bg-rose-600' : 'bg-emerald-600'}`}>
                    <div>
                        <h2 className="font-black italic text-3xl uppercase">{currentLevelContext.rack}{selectedPosition}{LEVELS_ALL[currentLevelContext.level-1]}</h2>
                        <span className="text-white/70 font-bold text-xs uppercase tracking-widest">{sidebarMode === 'DETAIL' ? 'Itens Armazenados' : 'Posição Livre'}</span>
                    </div>
                    <button onClick={() => setIsSidebarOpen(false)} className="p-2 bg-white/10 rounded-xl hover:bg-white/20"><X/></button>
                </header>
                
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                    {/* Botões Admin */}
                    {isAdmin && (
                        <div className="mb-6">
                            {inventory.filter(i => i.rack === currentLevelContext.rack && i.level === currentLevelContext.level && i.position === selectedPosition && i.isBlocked).length > 0 ? (
                                <button onClick={() => handleUnblockPosition(inventory.find(i => i.rack === currentLevelContext.rack && i.level === currentLevelContext.level && i.position === selectedPosition && i.isBlocked)!)} className="w-full bg-emerald-100 text-emerald-700 py-3 rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2 hover:bg-emerald-200">
                                    <CheckCircle2 size={16}/> Liberar Vaga Bloqueada
                                </button>
                            ) : (
                                sidebarMode === 'ENTRY' && (
                                    <button onClick={handleBlockPosition} className="w-full bg-slate-200 text-slate-600 py-3 rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2 hover:bg-slate-300">
                                        <Ban size={16}/> Bloquear Vaga Manualmente
                                    </button>
                                )
                            )}
                        </div>
                    )}

                    {sidebarMode === 'ENTRY' ? (
                        <form onSubmit={handleManualEntrySubmit} className="space-y-4 bg-white p-6 rounded-3xl border shadow-sm">
                            <h4 className="font-black text-xs uppercase text-slate-400 mb-2">Entrada Manual</h4>
                            <div><label className="text-[10px] font-black uppercase text-slate-400">Produto</label><div className="flex gap-2"><input autoFocus className="flex-1 p-3 bg-slate-50 border-2 rounded-xl font-black uppercase text-sm" value={manualEntryData.sku} onChange={e => {const sku = e.target.value.toUpperCase(); setManualEntryData({...manualEntryData, sku}); const m = masterProducts.find(x => x.productId === sku); if (m) setManualEntryData(prev => ({...prev, qty: m.standardQuantity.toString()}));}} placeholder="SKU" required /><button type="button" onClick={() => setIsMasterMenuOpen(true)} className="p-3 bg-slate-100 rounded-xl"><Search size={18}/></button></div></div>
                            <div><label className="text-[10px] font-black uppercase text-slate-400">Quantidade</label><input type="number" className="w-full p-3 bg-slate-50 border-2 rounded-xl font-black text-center text-lg" value={manualEntryData.qty} onChange={e => setManualEntryData({...manualEntryData, qty: e.target.value})} required /></div>
                            <div><label className="text-[10px] font-black uppercase text-slate-400">Vagas</label><div className="flex gap-2"><button type="button" onClick={() => setManualEntryData({...manualEntryData, slots: 1})} className={`flex-1 p-3 rounded-xl font-black text-xs uppercase border-2 ${manualEntryData.slots === 1 ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200'}`}>1 Vaga</button><button type="button" onClick={() => setManualEntryData({...manualEntryData, slots: 2})} className={`flex-1 p-3 rounded-xl font-black text-xs uppercase border-2 ${manualEntryData.slots === 2 ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200'}`}>2 Vagas</button></div></div>
                            <button type="submit" disabled={isProcessingAction} className="w-full bg-emerald-600 text-white p-4 rounded-xl font-black uppercase shadow-lg mt-4">{isProcessingAction ? <Loader2 className="animate-spin mx-auto"/> : 'Confirmar Entrada'}</button>
                        </form>
                    ) : (
                        <div className="space-y-4">
                             {/* ITENS AGRUPADOS - LISTA DETALHADA */}
                             {inventory.some(i => i.rack === currentLevelContext.rack && i.level === currentLevelContext.level && i.position === selectedPosition && i.isBlocked) ? (
                                 <div className="bg-slate-100 p-6 rounded-2xl text-center border-2 border-slate-200"><Ban size={48} className="text-slate-400 mx-auto mb-4"/><h3 className="font-black text-slate-800 uppercase">Bloqueada</h3><p className="text-xs text-slate-500 mt-2 uppercase">{inventory.find(i => i.rack === currentLevelContext.rack && i.level === currentLevelContext.level && i.position === selectedPosition && i.isBlocked)?.blockReason}</p></div>
                             ) : (
                                <>
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs font-black uppercase text-slate-400">Lista de Itens</span>
                                        <button onClick={() => setSidebarMode('ENTRY')} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase flex items-center gap-1 hover:bg-indigo-700"><PlusCircle size={12}/> Adicionar</button>
                                    </div>
                                    
                                    {inventory.filter(i => i.rack === currentLevelContext.rack && i.level === currentLevelContext.level && i.position === selectedPosition && !i.isBlocked).map((item, idx) => (
                                        <div key={item.id} className="bg-white p-4 rounded-xl border-2 border-slate-100 shadow-sm relative group mb-2">
                                            {/* Cabeçalho do Item */}
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-black bg-slate-100 text-slate-500 px-2 py-0.5 rounded w-fit mb-1">{item.productId}</span>
                                                    <h4 className="font-black text-slate-800 uppercase text-sm leading-tight">{item.productName}</h4>
                                                </div>
                                                {!isOperator && <button onClick={() => handleDeleteItem(item)} className="p-1.5 bg-rose-50 text-rose-400 rounded-lg hover:bg-rose-100"><Trash2 size={14}/></button>}
                                            </div>
                                            
                                            {/* Detalhes */}
                                            <div className="flex justify-between items-end border-t border-slate-50 pt-2 mt-2">
                                                <div>
                                                    <div className="text-[9px] font-bold text-slate-400 uppercase">Entrada</div>
                                                    <div className="text-xs font-mono text-slate-600">{new Date(item.createdAt).toLocaleDateString()}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[9px] font-bold text-slate-400 uppercase">Qtd</div>
                                                    <div className="text-xl font-black text-indigo-600">{item.quantity}</div>
                                                </div>
                                            </div>

                                            {/* Ações por Item */}
                                            {!isOperator && (
                                                <div className="flex gap-2 mt-3">
                                                    <button onClick={() => setPartialOutputItem(item)} className="flex-1 bg-slate-50 text-slate-600 h-8 rounded-lg font-black text-[10px] uppercase hover:bg-slate-100 transition-all">Saída Parcial</button>
                                                </div>
                                            )}
                                            
                                            {/* Formulário de Saída Parcial Embutido */}
                                            {partialOutputItem?.id === item.id && (
                                                <form onSubmit={handlePartialOutput} className="mt-2 bg-slate-100 p-2 rounded-lg flex gap-2 animate-in slide-in-from-top-2">
                                                    <input autoFocus type="number" className="w-16 p-1 rounded font-bold text-center text-sm" value={partialOutputQty} onChange={e => setPartialOutputQty(e.target.value)} placeholder="QTD" />
                                                    <button type="submit" className="flex-1 bg-emerald-500 text-white rounded text-[10px] font-black uppercase">OK</button>
                                                    <button type="button" onClick={() => setPartialOutputItem(null)} className="p-1 text-slate-400"><X size={14}/></button>
                                                </form>
                                            )}
                                        </div>
                                    ))}
                                    {inventory.filter(i => i.rack === currentLevelContext.rack && i.level === currentLevelContext.level && i.position === selectedPosition && !i.isBlocked).length === 0 && (
                                        <div className="text-center py-10 text-slate-300 font-black uppercase text-sm">Vazio</div>
                                    )}
                                </>
                             )}
                        </div>
                    )}
                </div>
              </>
          )}
      </div>

      {/* MODAIS GERAIS */}
      {isMasterMenuOpen && <MasterProductModal masterProducts={masterProducts} onClose={closeAllModals} onSave={handleMasterProductSave} onDelete={handleMasterProductDelete} />}
      {isInventoryReportOpen && <InventoryBalanceModal inventory={inventory} onClose={closeAllModals} />}
      {isFIFOMenuOpen && <FIFOModal inventory={inventory} onClose={closeAllModals} />}
      {isAdminPanelOpen && <AdminUsersPanel currentUser={currentUser} onClose={closeAllModals} />}
      {isReportsPanelOpen && <ReportsPanel onClose={closeAllModals} />}
      {isScannerOpen && <ScannerModal onClose={() => setIsScannerOpen(false)} onScan={handleScanLogic} />}
      {isFloorPanelOpen && <FloorPanel inventory={inventory} masterProducts={masterProducts} onClose={() => setIsFloorPanelOpen(false)} onAdd={handleAddToFloor} onMoveStart={handleMoveItemStart} currentUser={currentUser} onGenerateLabel={handleGenerateLabels} />}

      {bulkModalMode && ( <BulkGridModal mode={bulkModalMode} inventory={inventory} masterProducts={masterProducts} onClose={() => setBulkModalMode(null)} onConfirm={handleBulkProcess} /> )}

      {operatorTarget && (
        <QRCodeModal 
            position={operatorTarget.rack ? operatorTarget : { rack: operatorTarget.rack, level: operatorTarget.level, pos: operatorTarget.pos }}
            item={inventory.find(i => i.rack === operatorTarget.rack && i.level === operatorTarget.level && i.position === operatorTarget.position && !i.isBlocked)}
            onClose={() => setOperatorTarget(null)}
        />
      )}

      {/* MODAL IMPRESSÃO */}
      {isPrintMenuOpen && (
             <div className="fixed inset-0 z-[6000] bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-4">
                <div className="bg-white rounded-[2rem] w-full max-w-7xl h-[95vh] flex flex-col shadow-2xl overflow-hidden relative animate-in zoom-in-95">
                    <div className="p-5 border-b bg-white flex justify-between items-center shrink-0"><h3 className="text-2xl font-black italic text-slate-800 uppercase flex items-center gap-3"><span className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><Printer/></span> Impressão por Seleção</h3><button onClick={closeAllModals} className="p-2 hover:bg-slate-100 rounded-full"><X/></button></div>
                    <div className="flex-1 flex overflow-hidden">
                        <div className="w-full lg:w-[350px] border-r bg-slate-50 p-6 space-y-6 flex flex-col overflow-y-auto">
                             <div><label className="text-[10px] font-black uppercase text-slate-400 mb-2 block">1. Escolha a Rua</label><div className="grid grid-cols-2 gap-2">{PP_RACKS.filter(r => r !== 'FLOOR').map(r => <button key={r} onClick={() => setPrintSelectionData({...printSelectionData, targetRack: r, selectedPositions: []})} className={`p-4 rounded-xl border-2 font-black transition-all ${printSelectionData.targetRack === r ? 'border-indigo-600 bg-indigo-600 text-white shadow-md' : 'border-slate-200 text-slate-400 hover:bg-white'}`}>{r}</button>)}</div></div>
                             <div><label className="text-[10px] font-black uppercase text-slate-400 mb-2 block">2. Escolha o Nível</label><div className="flex flex-wrap gap-2">{LEVELS_STREET.map((l, i) => <button key={l} onClick={() => setPrintSelectionData({...printSelectionData, targetLevel: i+1, selectedPositions: []})} className={`w-11 h-11 flex-none rounded-xl border-2 font-black transition-all ${printSelectionData.targetLevel === i+1 ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 text-slate-400 hover:bg-white'}`}>{l}</button>)}</div></div>
                             <div className="mt-auto bg-white p-6 rounded-2xl border text-center shadow-sm"><span className="block text-xs font-bold text-slate-400 uppercase mb-1">Total Selecionado</span><span className="block text-4xl font-black text-slate-800">{printSelectionData.selectedPositions.length}</span></div>
                             <button onClick={() => handleGenerateLabels(printSelectionData.selectedPositions.map(p => ({ rack: printSelectionData.targetRack, level: printSelectionData.targetLevel, pos: p })))} disabled={isGeneratingPDF || printSelectionData.selectedPositions.length === 0} className="w-full bg-slate-900 text-white p-5 rounded-2xl font-black uppercase shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-30">{isGeneratingPDF ? <Loader2 className="animate-spin"/> : <FileDown/>} GERAR PDF</button>
                        </div>
                        <div className="flex-1 bg-slate-100 p-8 overflow-y-auto">
                            <div className="max-w-5xl mx-auto"><h4 className="font-black text-slate-400 uppercase text-xs tracking-widest mb-6 text-center">3. Clique nos boxes para marcar a impressão</h4>
                                <div className="grid gap-3 grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-11">
                                    {Array.from({length: RACK_POSITIONS[printSelectionData.targetRack]}).map((_, i) => {
                                        const p = i + 1; const isSelected = printSelectionData.selectedPositions.includes(p);
                                        return (
                                            <button key={p} onClick={() => { const current = [...printSelectionData.selectedPositions]; const idx = current.indexOf(p); if(idx > -1) current.splice(idx, 1); else current.push(p); setPrintSelectionData({...printSelectionData, selectedPositions: current}); }} className={`aspect-square rounded-xl font-black text-xs flex flex-col items-center justify-center border-2 transition-all shadow-sm ${isSelected ? 'bg-indigo-600 text-white border-indigo-600 scale-105 z-10' : 'bg-white text-slate-400 border-slate-200 hover:border-indigo-300'}`}><span>{p}</span>{isSelected && <CheckCircle2 size={14} className="mt-1"/>}</button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
      )}

    </div>
  );
};

export default App;