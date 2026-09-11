import React, { useState } from 'react';
import { FurnitureCategory } from '@inneranimalmedia/agentsam-cad-shared';
import { 
  Armchair, 
  Bed, 
  UtensilsCrossed, 
  Bath, 
  Briefcase, 
  TreePine, 
  X,
  Search,
  Plus
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectFurniture: (type: string, name: string, category: FurnitureCategory, w: number, d: number, h: number, color: string) => void;
}

interface FurniturePreset {
  type: string;
  name: string;
  category: FurnitureCategory;
  w: number; // inches
  d: number; // inches
  h: number; // inches
  color: string;
  description: string;
}

const PRESETS: FurniturePreset[] = [
  // Seating
  { type: 'sofa_3seater', name: '3-Seater Modern Sofa', category: 'seating', w: 84, d: 36, h: 32, color: '#334155', description: 'Deep seat upholstered sofa' },
  { type: 'sofa_sectional', name: 'L-Shape Sectional Sofa', category: 'seating', w: 108, d: 72, h: 32, color: '#1e293b', description: 'Corner sectional with chaise' },
  { type: 'armchair', name: 'Accent Lounge Armchair', category: 'seating', w: 34, d: 32, h: 30, color: '#475569', description: 'Comfortable reading chair' },
  // Tables
  { type: 'dining_6', name: '6-Person Dining Table', category: 'tables', w: 72, d: 36, h: 30, color: '#78350f', description: 'Solid oak dining table' },
  { type: 'coffee_table', name: 'Minimalist Coffee Table', category: 'tables', w: 48, d: 24, h: 18, color: '#b45309', description: 'Low profile living room table' },
  { type: 'side_table', name: 'Round End Table', category: 'tables', w: 20, d: 20, h: 22, color: '#d97706', description: 'Compact side accent table' },
  // Bedroom
  { type: 'king_bed', name: 'King Platform Bed', category: 'bedroom', w: 76, d: 80, h: 44, color: '#334155', description: 'Standard King with headboard' },
  { type: 'queen_bed', name: 'Queen Bed Frame', category: 'bedroom', w: 60, d: 80, h: 40, color: '#475569', description: 'Standard Queen platform bed' },
  { type: 'nightstand', name: 'Bedside Nightstand', category: 'bedroom', w: 22, d: 18, h: 24, color: '#92400e', description: '2-drawer nightstand' },
  { type: 'wardrobe', name: 'Modular Wardrobe Closet', category: 'bedroom', w: 72, d: 24, h: 84, color: '#1e293b', description: 'Built-in clothes closet' },
  // Kitchen
  { type: 'kitchen_island', name: 'Central Island with Marble', category: 'kitchen', w: 84, d: 42, h: 36, color: '#cbd5e1', description: 'Prep & bar stool island' },
  { type: 'cooktop_counter', name: 'Range & Cooktop Counter', category: 'kitchen', w: 72, d: 26, h: 36, color: '#64748b', description: 'Induction cooktop unit' },
  { type: 'refrigerator', name: 'French Door Refrigerator', category: 'kitchen', w: 36, d: 34, h: 70, color: '#0f172a', description: 'Stainless steel fridge' },
  // Bathroom
  { type: 'bathtub', name: 'Freestanding Soaking Tub', category: 'bathroom', w: 66, d: 32, h: 26, color: '#f8fafc', description: 'Modern acrylic oval tub' },
  { type: 'vanity', name: 'Double Basin Vanity', category: 'bathroom', w: 60, d: 22, h: 34, color: '#0f172a', description: 'Under-mount sinks & mirror' },
  { type: 'toilet', name: 'Wall-Hung Toilet', category: 'bathroom', w: 18, d: 28, h: 30, color: '#f1f5f9', description: 'Concealed tank modern commode' },
  // Office
  { type: 'desk', name: 'Executive Workstation', category: 'office', w: 64, d: 30, h: 30, color: '#78350f', description: 'Spacious desk with cable routing' },
  { type: 'bookshelf', name: 'Architectural Bookshelf', category: 'office', w: 48, d: 14, h: 78, color: '#334155', description: 'Tall open display shelf' },
  // Decor
  { type: 'potted_plant', name: 'Indoor Fiddle Leaf Fig', category: 'decor', w: 24, d: 24, h: 60, color: '#15803d', description: 'Large architectural houseplant' },
  { type: 'tv_unit', name: 'Media Console & 75" TV', category: 'decor', w: 72, d: 18, h: 54, color: '#020617', description: 'Wall mounted entertainment setup' },
];

export const FurniturePicker: React.FC<Props> = ({ isOpen, onClose, onSelectFurniture }) => {
  const [selectedCategory, setSelectedCategory] = useState<FurnitureCategory | 'all'>('all');
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const filtered = PRESETS.filter((p) => {
    const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const categories: { id: FurnitureCategory | 'all'; label: string; icon: React.ReactNode }[] = [
    { id: 'all', label: 'All Fixtures', icon: <Plus className="w-4 h-4" /> },
    { id: 'seating', label: 'Seating', icon: <Armchair className="w-4 h-4" /> },
    { id: 'tables', label: 'Tables', icon: <UtensilsCrossed className="w-4 h-4" /> },
    { id: 'bedroom', label: 'Bedroom', icon: <Bed className="w-4 h-4" /> },
    { id: 'kitchen', label: 'Kitchen', icon: <UtensilsCrossed className="w-4 h-4" /> },
    { id: 'bathroom', label: 'Bathroom', icon: <Bath className="w-4 h-4" /> },
    { id: 'office', label: 'Office', icon: <Briefcase className="w-4 h-4" /> },
    { id: 'decor', label: 'Decor & Plants', icon: <TreePine className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="bg-[#252525] border border-[#333] rounded w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-3.5 border-b border-[#333] flex items-center justify-between bg-[#252525]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded bg-blue-600/20 border border-blue-500/40 text-blue-400">
              <Armchair className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Architectural Fixture & Furniture Library</h2>
              <p className="text-[11px] text-gray-400">Select standard BIM elements to place in your 2D/3D floorplan</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-[#333] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Category Tabs */}
        <div className="p-3 border-b border-[#333] bg-[#1E1E1E] space-y-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sofa, bed, tub, island, desk..."
              className="w-full bg-[#252525] border border-[#333] rounded pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 placeholder:text-gray-500"
            />
          </div>

          <div className="flex items-center space-x-1 overflow-x-auto pb-0.5 scrollbar-none">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCategory(c.id)}
                className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap flex items-center space-x-1.5 transition ${
                  selectedCategory === c.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-[#252525] text-gray-300 hover:bg-[#333] hover:text-white border border-[#333]'
                }`}
              >
                {c.icon}
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Presets Grid */}
        <div className="flex-1 overflow-y-auto p-3.5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 bg-[#1E1E1E]">
          {filtered.map((item) => (
            <div
              key={item.type}
              onClick={() => {
                onSelectFurniture(item.type, item.name, item.category, item.w, item.d, item.h, item.color);
                onClose();
              }}
              className="p-3 rounded bg-[#252525] hover:bg-[#2e2e2e] border border-[#333] hover:border-blue-500/50 cursor-pointer transition flex flex-col justify-between group shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-white group-hover:text-blue-300 transition">
                    {item.name}
                  </span>
                  <span className="w-2.5 h-2.5 rounded-full border border-white/20" style={{ backgroundColor: item.color }} />
                </div>
                <p className="text-[10px] text-gray-400 mb-2 line-clamp-1">{item.description}</p>
              </div>

              <div className="flex items-center justify-between pt-1.5 border-t border-[#333] text-[10px] text-gray-400 font-mono">
                <span>{item.w}" × {item.d}" × {item.h}"</span>
                <span className="text-blue-400 font-semibold group-hover:translate-x-0.5 transition">Select +</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
