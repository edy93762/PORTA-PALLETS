
// @ts-nocheck
import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, Text, ContactShadows } from '@react-three/drei';
import { PalletPosition, RackId } from '../types';

interface Warehouse3DProps {
  inventory: PalletPosition[];
  onPositionClick?: (rack: RackId, level: number, pos: number) => void;
  highlightProductId?: string | null;
}

const RACK_CONFIG: Record<string, { type: 'PP' | 'PR' | 'GAIOLA', positions: number, levels: number }> = {
  'A': { type: 'PP', positions: 66, levels: 5 },
  'B': { type: 'PP', positions: 66, levels: 5 },
  'C': { type: 'PP', positions: 66, levels: 5 },
  'D': { type: 'PP', positions: 62, levels: 5 }
};

const PalletBox = ({ position, occupied, isExtension, isBlocked, isHighlighted, type, onClick }: any) => {
  let boxArgs = [1, 1, 1];
  if (type === 'PP') boxArgs = [0.8, 0.6, 1.0];

  // OCUPADA OU EXTENSÃO DE DUPLA = VERMELHO
  let baseColor = isHighlighted ? '#f59e0b' : ((occupied || isExtension) ? '#dc2626' : '#10b981');
  
  if (isBlocked && !isExtension) baseColor = '#334155'; // Cinza para bloqueio manual

  return (
    <mesh position={position} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <boxGeometry args={boxArgs} />
      <meshStandardMaterial color={baseColor} transparent opacity={(occupied || isExtension || isBlocked) ? 1 : 0.4} />
    </mesh>
  );
};

export const Warehouse3D: React.FC<Warehouse3DProps> = ({ inventory, onPositionClick, highlightProductId }) => {
  const inventoryMap = useMemo(() => {
    const map = new Map<string, PalletPosition>();
    if (inventory) inventory.forEach(item => map.set(`${item.rack}-${item.level}-${item.position}`, item));
    return map;
  }, [inventory]);

  return (
    <div className="w-full h-full bg-slate-100 rounded-[2rem] overflow-hidden relative border border-slate-200">
      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[60, 70, 120]} fov={50} />
        <OrbitControls enableDamping dampingFactor={0.05} target={[30, 0, 30]} />
        <ambientLight intensity={0.7} />
        <spotLight position={[50, 100, 50]} intensity={1} castShadow />
        
        <group>
          <group position={[0, 0, 0]}>
             {['A', 'B', 'C', 'D'].map((rack, rIdx) => {
                 const config = RACK_CONFIG[rack];
                 return (
                 <group key={rack} position={[0, 0, rIdx * 15]}>
                     <Text position={[config.positions / 2, 8, 2]} fontSize={2} color="#1e293b" rotation={[0, 0, 0]}>RUA {rack}</Text>
                     {Array.from({length: config.levels}).map((_, l) => (
                         <group key={l}>
                             {Array.from({length: config.positions}).map((_, p) => {
                                 const pos = p + 1;
                                 const level = l + 1;
                                 const key = `${rack}-${level}-${pos}`;
                                 const item = inventoryMap.get(key);
                                 const isExt = item?.isBlocked && item?.blockReason?.includes('Vaga dupla');
                                 return (
                                     <PalletBox 
                                        key={key} 
                                        position={[p * 1.1, l * 1.3, 0]} 
                                        occupied={!!item && !item.isBlocked} 
                                        isExtension={isExt}
                                        isBlocked={item?.isBlocked}
                                        type="PP" 
                                        onClick={() => onPositionClick && onPositionClick(rack, level, pos)}
                                     />
                                 );
                             })}
                         </group>
                     ))}
                 </group>
                 );
             })}
          </group>
        </group>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
          <planeGeometry args={[300, 300]} />
          <meshStandardMaterial color="#f1f5f9" />
        </mesh>
        <Environment preset="warehouse" />
      </Canvas>
    </div>
  );
};
