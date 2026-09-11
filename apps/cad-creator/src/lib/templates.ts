import { ProjectState } from '../types';

export interface TemplateMetadata {
  id: string;
  name: string;
  category: 'architecture' | 'commercial' | 'presentations' | 'brand' | 'social_media';
  categoryLabel: string;
  useCase: string;
  description: string;
  tags: string[];
  dimensions: string;
  approxSqFt: number;
  highlightColor: string;
  project: ProjectState;
}

export const TEMPLATES: Record<string, ProjectState> = {
  modern_villa: {
    id: 'tpl_modern_villa',
    name: 'Modern California Villa',
    scale: 1,
    gridSize: 12,
    snapToGrid: true,
    ceilingHeight: 108,
    roofType: 'flat',
    lighting: {
      sunAltitude: 45,
      sunAzimuth: 135,
      intensity: 1.1,
      timeOfDay: 'noon',
      shadows: true,
      ambientColor: '#ffffff',
    },
    updatedAt: Date.now(),
    version: 1,
    walls: [
      { id: 'w_north', x1: 0, y1: 0, x2: 360, y2: 0, thickness: 8, height3D: 108, material: 'concrete', exterior: true },
      { id: 'w_east', x1: 360, y1: 0, x2: 360, y2: 288, thickness: 8, height3D: 108, material: 'concrete', exterior: true },
      { id: 'w_south', x1: 360, y1: 288, x2: 0, y2: 288, thickness: 8, height3D: 108, material: 'concrete', exterior: true },
      { id: 'w_west', x1: 0, y1: 288, x2: 0, y2: 0, thickness: 8, height3D: 108, material: 'concrete', exterior: true },
      { id: 'w_part1', x1: 216, y1: 0, x2: 216, y2: 288, thickness: 6, height3D: 108, material: 'drywall', exterior: false },
      { id: 'w_part2', x1: 216, y1: 168, x2: 360, y2: 168, thickness: 6, height3D: 108, material: 'drywall', exterior: false },
    ],
    doors: [
      { id: 'd_main', wallId: 'w_south', distanceAlongWall: 0.25, width: 42, height: 84, swing: 'left', openAngle: 30, label: 'Main Entrance' },
      { id: 'd_bed', wallId: 'w_part1', distanceAlongWall: 0.3, width: 36, height: 84, swing: 'right', openAngle: 45, label: 'Master Suite' },
      { id: 'd_bath', wallId: 'w_part2', distanceAlongWall: 0.4, width: 32, height: 84, swing: 'left', openAngle: 30, label: 'En-Suite Bath' },
      { id: 'd_patio', wallId: 'w_south', distanceAlongWall: 0.65, width: 72, height: 96, swing: 'sliding', openAngle: 20, label: 'Glass Patio Door' },
    ],
    windows: [
      { id: 'win_1', wallId: 'w_north', distanceAlongWall: 0.25, width: 72, height: 60, elevation: 32, style: 'picture', label: 'Living Bay Window' },
      { id: 'win_2', wallId: 'w_north', distanceAlongWall: 0.5, width: 48, height: 48, elevation: 42, style: 'casement', label: 'Kitchen Window' },
      { id: 'win_3', wallId: 'w_east', distanceAlongWall: 0.3, width: 60, height: 60, elevation: 36, style: 'sliding', label: 'Bedroom Window' },
      { id: 'win_4', wallId: 'w_east', distanceAlongWall: 0.8, width: 36, height: 36, elevation: 60, style: 'hung', label: 'Bath Window' },
    ],
    rooms: [
      {
        id: 'rm_living',
        name: 'Great Room & Kitchen',
        points: [[0, 0], [216, 0], [216, 288], [0, 288]],
        areaSqFt: 432,
        floorMaterial: 'hardwood',
        color: '#f5efe6',
      },
      {
        id: 'rm_bed',
        name: 'Primary Bedroom',
        points: [[216, 0], [360, 0], [360, 168], [216, 168]],
        areaSqFt: 168,
        floorMaterial: 'hardwood',
        color: '#e8edf3',
      },
      {
        id: 'rm_bath',
        name: 'Primary Bathroom',
        points: [[216, 168], [360, 168], [360, 288], [216, 288]],
        areaSqFt: 120,
        floorMaterial: 'marble',
        color: '#f0f4f8',
      },
    ],
    furniture: [
      { id: 'f_sofa', type: 'sofa_3seater', category: 'seating', name: 'L-Sectional Sofa', x: 96, y: 192, w: 90, d: 38, h: 32, rotation: 0, color: '#334155' },
      { id: 'f_table', type: 'coffee_table', category: 'tables', name: 'Oak Coffee Table', x: 96, y: 140, w: 48, d: 24, h: 18, rotation: 0, color: '#b45309' },
      { id: 'f_tv', type: 'tv_unit', category: 'decor', name: 'Media Console & TV', x: 96, y: 30, w: 72, d: 18, h: 48, rotation: 0, color: '#1e293b' },
      { id: 'f_island', type: 'kitchen_island', category: 'kitchen', name: 'Marble Kitchen Island', x: 168, y: 100, w: 72, d: 36, h: 36, rotation: 90, color: '#cbd5e1' },
      { id: 'f_bed', type: 'king_bed', category: 'bedroom', name: 'King Bed Frame', x: 288, y: 60, w: 76, d: 80, h: 44, rotation: 0, color: '#475569' },
      { id: 'f_ns1', type: 'nightstand', category: 'bedroom', name: 'Left Nightstand', x: 236, y: 60, w: 20, d: 18, h: 24, rotation: 0, color: '#92400e' },
      { id: 'f_ns2', type: 'nightstand', category: 'bedroom', name: 'Right Nightstand', x: 340, y: 60, w: 20, d: 18, h: 24, rotation: 0, color: '#92400e' },
      { id: 'f_tub', type: 'bathtub', category: 'bathroom', name: 'Freestanding Soaking Tub', x: 312, y: 240, w: 66, d: 32, h: 26, rotation: 0, color: '#f8fafc' },
      { id: 'f_vanity', type: 'vanity', category: 'bathroom', name: 'Double Vanity Sink', x: 252, y: 240, w: 48, d: 22, h: 34, rotation: 0, color: '#0f172a' },
      { id: 'f_plant', type: 'potted_plant', category: 'decor', name: 'Fiddle Leaf Fig', x: 30, y: 258, w: 24, d: 24, h: 54, rotation: 0, color: '#15803d' },
    ],
    annotations: [
      { id: 'ann_w', x1: 0, y1: -20, x2: 360, y2: -20, label: '30\' - 0"' },
      { id: 'ann_h', x1: -20, y1: 0, x2: -20, y2: 288, label: '24\' - 0"' },
    ],
  },

  scandinavian_loft: {
    id: 'tpl_scandi_loft',
    name: 'Nordic Open Loft',
    scale: 1,
    gridSize: 12,
    snapToGrid: true,
    ceilingHeight: 120,
    roofType: 'flat',
    lighting: {
      sunAltitude: 35,
      sunAzimuth: 180,
      intensity: 1.2,
      timeOfDay: 'morning',
      shadows: true,
      ambientColor: '#f8fafc',
    },
    updatedAt: Date.now(),
    version: 1,
    walls: [
      { id: 'sw_n', x1: 0, y1: 0, x2: 300, y2: 0, thickness: 8, height3D: 120, material: 'brick', exterior: true },
      { id: 'sw_e', x1: 300, y1: 0, x2: 300, y2: 240, thickness: 8, height3D: 120, material: 'brick', exterior: true },
      { id: 'sw_s', x1: 300, y1: 240, x2: 0, y2: 240, thickness: 8, height3D: 120, material: 'brick', exterior: true },
      { id: 'sw_w', x1: 0, y1: 240, x2: 0, y2: 0, thickness: 8, height3D: 120, material: 'brick', exterior: true },
      { id: 'sw_bath_w', x1: 200, y1: 140, x2: 300, y2: 140, thickness: 6, height3D: 120, material: 'drywall', exterior: false },
      { id: 'sw_bath_s', x1: 200, y1: 140, x2: 200, y2: 240, thickness: 6, height3D: 120, material: 'drywall', exterior: false },
    ],
    doors: [
      { id: 'sd_main', wallId: 'sw_s', distanceAlongWall: 0.25, width: 36, height: 84, swing: 'left', openAngle: 30, label: 'Entryway' },
      { id: 'sd_bath', wallId: 'sw_bath_s', distanceAlongWall: 0.4, width: 32, height: 84, swing: 'sliding', openAngle: 20, label: 'Bath Sliding Door' },
    ],
    windows: [
      { id: 'swin_1', wallId: 'sw_n', distanceAlongWall: 0.2, width: 72, height: 84, elevation: 24, style: 'picture', label: 'North Industrial Window' },
      { id: 'swin_2', wallId: 'sw_n', distanceAlongWall: 0.65, width: 72, height: 84, elevation: 24, style: 'picture', label: 'North Studio Window' },
    ],
    rooms: [
      {
        id: 'srm_main',
        name: 'Studio & Living Zone',
        points: [[0, 0], [300, 0], [300, 140], [200, 140], [200, 240], [0, 240]],
        areaSqFt: 430,
        floorMaterial: 'polished_concrete',
        color: '#e2e8f0',
      },
      {
        id: 'srm_bath',
        name: 'Bathroom Pod',
        points: [[200, 140], [300, 140], [300, 240], [200, 240]],
        areaSqFt: 70,
        floorMaterial: 'tile',
        color: '#cbd5e1',
      },
    ],
    furniture: [
      { id: 'sf_sofa', type: 'sofa_3seater', category: 'seating', name: 'Boucle Sofa', x: 80, y: 140, w: 84, d: 36, h: 30, rotation: 0, color: '#475569' },
      { id: 'sf_desk', type: 'desk', category: 'office', name: 'Architect Draft Desk', x: 60, y: 40, w: 60, d: 30, h: 30, rotation: 0, color: '#b45309' },
      { id: 'sf_bed', type: 'king_bed', category: 'bedroom', name: 'Platform Bed', x: 230, y: 60, w: 72, d: 80, h: 36, rotation: 0, color: '#334155' },
    ],
    annotations: [
      { id: 'sann_w', x1: 0, y1: -20, x2: 300, y2: -20, label: '25\' - 0"' },
      { id: 'sann_h', x1: -20, y1: 0, x2: -20, y2: 240, label: '20\' - 0"' },
    ],
  },

  minimalist_studio: {
    id: 'tpl_minimalist',
    name: 'Minimalist Tokyo Studio',
    scale: 1,
    gridSize: 12,
    snapToGrid: true,
    ceilingHeight: 96,
    roofType: 'flat',
    lighting: {
      sunAltitude: 50,
      sunAzimuth: 110,
      intensity: 1.0,
      timeOfDay: 'morning',
      shadows: true,
      ambientColor: '#ffffff',
    },
    updatedAt: Date.now(),
    version: 1,
    walls: [
      { id: 'mw_n', x1: 0, y1: 0, x2: 216, y2: 0, thickness: 6, height3D: 96, material: 'wood_panel', exterior: true },
      { id: 'mw_e', x1: 216, y1: 0, x2: 216, y2: 192, thickness: 6, height3D: 96, material: 'wood_panel', exterior: true },
      { id: 'mw_s', x1: 216, y1: 192, x2: 0, y2: 192, thickness: 6, height3D: 96, material: 'wood_panel', exterior: true },
      { id: 'mw_w', x1: 0, y1: 192, x2: 0, y2: 0, thickness: 6, height3D: 96, material: 'wood_panel', exterior: true },
      { id: 'mw_b', x1: 144, y1: 120, x2: 216, y2: 120, thickness: 6, height3D: 96, material: 'drywall', exterior: false },
      { id: 'mw_b2', x1: 144, y1: 120, x2: 144, y2: 192, thickness: 6, height3D: 96, material: 'drywall', exterior: false },
    ],
    doors: [
      { id: 'md_in', wallId: 'mw_s', distanceAlongWall: 0.3, width: 34, height: 80, swing: 'left', openAngle: 30, label: 'Genkan' },
      { id: 'md_bath', wallId: 'mw_b2', distanceAlongWall: 0.4, width: 28, height: 80, swing: 'sliding', openAngle: 0, label: 'Unit Bath' },
    ],
    windows: [
      { id: 'mwin_1', wallId: 'mw_n', distanceAlongWall: 0.5, width: 60, height: 48, elevation: 36, style: 'sliding', label: 'Balcony Sash' },
    ],
    rooms: [
      {
        id: 'mrm_main',
        name: 'Tatami Living & Sleep',
        points: [[0, 0], [216, 0], [216, 120], [144, 120], [144, 192], [0, 192]],
        areaSqFt: 240,
        floorMaterial: 'hardwood',
        color: '#fdfbf7',
      },
    ],
    furniture: [
      { id: 'mf_bed', type: 'king_bed', category: 'bedroom', name: 'Low Tatami Bed', x: 60, y: 60, w: 60, d: 78, h: 18, rotation: 0, color: '#78716c' },
      { id: 'mf_table', type: 'coffee_table', category: 'tables', name: 'Low Dining Table', x: 150, y: 60, w: 40, d: 40, h: 14, rotation: 0, color: '#d97706' },
    ],
    annotations: [
      { id: 'mann_1', x1: 0, y1: -16, x2: 216, y2: -16, label: '18\' - 0"' },
      { id: 'mann_2', x1: -16, y1: 0, x2: -16, y2: 192, label: '16\' - 0"' },
    ],
  },

  // 4. Tech Startup Co-Working & Conference Hub (Office / Commercial)
  tech_coworking: {
    id: 'tpl_coworking',
    name: 'Tech Co-Working & Conference Hub',
    scale: 1,
    gridSize: 12,
    snapToGrid: true,
    ceilingHeight: 120,
    roofType: 'flat',
    lighting: {
      sunAltitude: 60,
      sunAzimuth: 140,
      intensity: 1.15,
      timeOfDay: 'noon',
      shadows: true,
      ambientColor: '#f1f5f9',
    },
    updatedAt: Date.now(),
    version: 1,
    walls: [
      { id: 'cw_n', x1: 0, y1: 0, x2: 432, y2: 0, thickness: 8, height3D: 120, material: 'glass', exterior: true },
      { id: 'cw_e', x1: 432, y1: 0, x2: 432, y2: 300, thickness: 8, height3D: 120, material: 'concrete', exterior: true },
      { id: 'cw_s', x1: 432, y1: 300, x2: 0, y2: 300, thickness: 8, height3D: 120, material: 'concrete', exterior: true },
      { id: 'cw_w', x1: 0, y1: 300, x2: 0, y2: 0, thickness: 8, height3D: 120, material: 'concrete', exterior: true },
      // Glass conference room (x: 264 to 432, y: 0 to 180)
      { id: 'cw_conf_w', x1: 264, y1: 0, x2: 264, y2: 180, thickness: 6, height3D: 120, material: 'glass', exterior: false },
      { id: 'cw_conf_s', x1: 264, y1: 180, x2: 432, y2: 180, thickness: 6, height3D: 120, material: 'glass', exterior: false },
    ],
    doors: [
      { id: 'cd_main', wallId: 'cw_s', distanceAlongWall: 0.2, width: 48, height: 90, swing: 'double', openAngle: 30, label: 'Main Office Entrance' },
      { id: 'cd_conf', wallId: 'cw_conf_w', distanceAlongWall: 0.4, width: 36, height: 90, swing: 'sliding', openAngle: 25, label: 'Executive Boardroom' },
    ],
    windows: [
      { id: 'cwin_1', wallId: 'cw_n', distanceAlongWall: 0.3, width: 96, height: 84, elevation: 18, style: 'picture', label: 'Panorama North Window' },
    ],
    rooms: [
      {
        id: 'crm_open',
        name: 'Open Benching & Lounge',
        points: [[0, 0], [264, 0], [264, 180], [432, 180], [432, 300], [0, 300]],
        areaSqFt: 690,
        floorMaterial: 'polished_concrete',
        color: '#e2e8f0',
      },
      {
        id: 'crm_conf',
        name: 'Executive Boardroom',
        points: [[264, 0], [432, 0], [432, 180], [264, 180]],
        areaSqFt: 210,
        floorMaterial: 'hardwood',
        color: '#e8edf5',
      },
    ],
    furniture: [
      // Boardroom Table
      { id: 'cf_conf_tbl', type: 'dining_6', category: 'tables', name: 'Conference Board Table', x: 348, y: 90, w: 96, d: 48, h: 30, rotation: 0, color: '#1e293b' },
      // Open Benching Desks
      { id: 'cf_desk_1', type: 'desk', category: 'office', name: 'Dual Workstation A', x: 100, y: 80, w: 72, d: 36, h: 30, rotation: 0, color: '#3b82f6' },
      { id: 'cf_desk_2', type: 'desk', category: 'office', name: 'Dual Workstation B', x: 100, y: 150, w: 72, d: 36, h: 30, rotation: 0, color: '#3b82f6' },
      // Agile Lounge Pod
      { id: 'cf_lounge', type: 'sofa_3seater', category: 'seating', name: 'Agile Team Sofa', x: 100, y: 240, w: 84, d: 36, h: 32, rotation: 0, color: '#0f172a' },
      { id: 'cf_coffee', type: 'coffee_table', category: 'tables', name: 'Round Coffee Table', x: 100, y: 200, w: 36, d: 36, h: 18, rotation: 0, color: '#d97706' },
      { id: 'cf_plant', type: 'potted_plant', category: 'decor', name: 'Planter Box', x: 240, y: 260, w: 36, d: 18, h: 48, rotation: 0, color: '#16a34a' },
    ],
    annotations: [
      { id: 'cann_w', x1: 0, y1: -20, x2: 432, y2: -20, label: '36\' - 0"' },
      { id: 'cann_h', x1: -20, y1: 0, x2: -20, y2: 300, label: '25\' - 0"' },
    ],
  },

  // 5. Architectural Presentation & Expo Showcase Pavilion (Presentations & Exhibitions)
  presentation_pavilion: {
    id: 'tpl_presentation',
    name: 'Architectural Presentation & Expo Pavilion',
    scale: 1,
    gridSize: 12,
    snapToGrid: true,
    ceilingHeight: 144,
    roofType: 'flat',
    lighting: {
      sunAltitude: 70,
      sunAzimuth: 180,
      intensity: 1.3,
      timeOfDay: 'noon',
      shadows: true,
      ambientColor: '#ffffff',
    },
    updatedAt: Date.now(),
    version: 1,
    walls: [
      // Symmetrical Exhibition Pavilion (384" x 288")
      { id: 'pw_n', x1: 0, y1: 0, x2: 384, y2: 0, thickness: 8, height3D: 144, material: 'wood_panel', exterior: true },
      { id: 'pw_e', x1: 384, y1: 0, x2: 384, y2: 288, thickness: 8, height3D: 144, material: 'glass', exterior: true },
      { id: 'pw_s', x1: 384, y1: 288, x2: 0, y2: 288, thickness: 8, height3D: 144, material: 'wood_panel', exterior: true },
      { id: 'pw_w', x1: 0, y1: 288, x2: 0, y2: 0, thickness: 8, height3D: 144, material: 'glass', exterior: true },
      // Central Presentation Display Spine
      { id: 'pw_spine_l', x1: 120, y1: 96, x2: 264, y2: 96, thickness: 6, height3D: 108, material: 'drywall', exterior: false },
      { id: 'pw_spine_r', x1: 120, y1: 192, x2: 264, y2: 192, thickness: 6, height3D: 108, material: 'drywall', exterior: false },
    ],
    doors: [
      { id: 'pd_entry', wallId: 'pw_s', distanceAlongWall: 0.5, width: 72, height: 96, swing: 'double', openAngle: 45, label: 'Pavilion Portal' },
    ],
    windows: [
      { id: 'pwin_w', wallId: 'pw_w', distanceAlongWall: 0.5, width: 144, height: 108, elevation: 12, style: 'picture', label: 'West Skylight Wall' },
      { id: 'pwin_e', wallId: 'pw_e', distanceAlongWall: 0.5, width: 144, height: 108, elevation: 12, style: 'picture', label: 'East Skylight Wall' },
    ],
    rooms: [
      {
        id: 'prm_gallery',
        name: 'Exhibition & Keynote Gallery',
        points: [[0, 0], [384, 0], [384, 288], [0, 288]],
        areaSqFt: 768,
        floorMaterial: 'terrazzo',
        color: '#f8fafc',
      },
    ],
    furniture: [
      // Showcase Model Pedestals
      { id: 'pf_ped_1', type: 'coffee_table', category: 'decor', name: '3D BIM Model Pedestal 1', x: 192, y: 144, w: 48, d: 48, h: 36, rotation: 0, color: '#0284c7' },
      // Keynote Presentation Stage & Screen Console
      { id: 'pf_screen', type: 'tv_unit', category: 'decor', name: '4K Presentation Video Wall', x: 192, y: 20, w: 96, d: 18, h: 72, rotation: 0, color: '#0f172a' },
      // Audience Seating
      { id: 'pf_bench_1', type: 'sofa_3seater', category: 'seating', name: 'Gallery Bench A', x: 72, y: 144, w: 72, d: 24, h: 18, rotation: 90, color: '#334155' },
      { id: 'pf_bench_2', type: 'sofa_3seater', category: 'seating', name: 'Gallery Bench B', x: 312, y: 144, w: 72, d: 24, h: 18, rotation: 90, color: '#334155' },
    ],
    annotations: [
      { id: 'pann_w', x1: 0, y1: -20, x2: 384, y2: -20, label: '32\' - 0"' },
      { id: 'pann_h', x1: -20, y1: 0, x2: -20, y2: 288, label: '24\' - 0"' },
    ],
  },

  // 6. Brand Flagship Showroom & 3D Logo Spatial Display (Brand & Logos)
  brand_showroom: {
    id: 'tpl_brand_showroom',
    name: 'Flagship Brand Showroom & Logo Spatial Display',
    scale: 1,
    gridSize: 12,
    snapToGrid: true,
    ceilingHeight: 132,
    roofType: 'flat',
    lighting: {
      sunAltitude: 40,
      sunAzimuth: 150,
      intensity: 1.25,
      timeOfDay: 'sunset',
      shadows: true,
      ambientColor: '#fff1f2',
    },
    updatedAt: Date.now(),
    version: 1,
    walls: [
      { id: 'bw_n', x1: 0, y1: 0, x2: 360, y2: 0, thickness: 8, height3D: 132, material: 'wood_panel', exterior: true },
      { id: 'bw_e', x1: 360, y1: 0, x2: 360, y2: 264, thickness: 8, height3D: 132, material: 'concrete', exterior: true },
      { id: 'bw_s', x1: 360, y1: 264, x2: 0, y2: 264, thickness: 8, height3D: 132, material: 'glass', exterior: true },
      { id: 'bw_w', x1: 0, y1: 264, x2: 0, y2: 0, thickness: 8, height3D: 132, material: 'concrete', exterior: true },
      // VIP Lounge Divider
      { id: 'bw_vip', x1: 240, y1: 0, x2: 240, y2: 144, thickness: 6, height3D: 108, material: 'wood_panel', exterior: false },
    ],
    doors: [
      { id: 'bd_main', wallId: 'bw_s', distanceAlongWall: 0.5, width: 60, height: 96, swing: 'double', openAngle: 30, label: 'Storefront Portal' },
    ],
    windows: [
      { id: 'bwin_s1', wallId: 'bw_s', distanceAlongWall: 0.2, width: 72, height: 96, elevation: 12, style: 'picture', label: 'Window Display 1' },
      { id: 'bwin_s2', wallId: 'bw_s', distanceAlongWall: 0.8, width: 72, height: 96, elevation: 12, style: 'picture', label: 'Window Display 2' },
    ],
    rooms: [
      {
        id: 'brm_main',
        name: 'Brand Experience Hall',
        points: [[0, 0], [240, 0], [240, 144], [360, 144], [360, 264], [0, 264]],
        areaSqFt: 530,
        floorMaterial: 'marble',
        color: '#fdf4f5',
      },
      {
        id: 'brm_vip',
        name: 'VIP Client Suite',
        points: [[240, 0], [360, 0], [360, 144], [240, 144]],
        areaSqFt: 130,
        floorMaterial: 'hardwood',
        color: '#faecee',
      },
    ],
    furniture: [
      // Centerpiece 3D Logo Display Island
      { id: 'bf_logo_ped', type: 'coffee_table', category: 'decor', name: 'Hero 3D Logo Monolith', x: 120, y: 132, w: 48, d: 48, h: 42, rotation: 0, color: '#e11d48' },
      // Product Showcases
      { id: 'bf_case_1', type: 'tv_unit', category: 'decor', name: 'Backlit Display Wall', x: 120, y: 20, w: 96, d: 18, h: 60, rotation: 0, color: '#1e293b' },
      // VIP Lounge
      { id: 'bf_vip_sofa', type: 'sofa_3seater', category: 'seating', name: 'Velvet VIP Lounge Sofa', x: 300, y: 72, w: 72, d: 36, h: 32, rotation: 0, color: '#881337' },
      { id: 'bf_vip_table', type: 'coffee_table', category: 'tables', name: 'Brass Drink Table', x: 300, y: 110, w: 28, d: 28, h: 18, rotation: 0, color: '#d97706' },
    ],
    annotations: [
      { id: 'bann_w', x1: 0, y1: -20, x2: 360, y2: -20, label: '30\' - 0"' },
      { id: 'bann_h', x1: -20, y1: 0, x2: -20, y2: 264, label: '22\' - 0"' },
    ],
  },

  // 7. Social Media Creator Studio & Stream Stage (Social Media & Content)
  creator_studio: {
    id: 'tpl_creator_studio',
    name: 'Social Media Creator Studio & Stream Stage',
    scale: 1,
    gridSize: 12,
    snapToGrid: true,
    ceilingHeight: 108,
    roofType: 'flat',
    lighting: {
      sunAltitude: 25,
      sunAzimuth: 220,
      intensity: 0.9,
      timeOfDay: 'sunset',
      shadows: true,
      ambientColor: '#38bdf8',
    },
    updatedAt: Date.now(),
    version: 1,
    walls: [
      { id: 'crw_n', x1: 0, y1: 0, x2: 288, y2: 0, thickness: 8, height3D: 108, material: 'brick', exterior: true },
      { id: 'crw_e', x1: 288, y1: 0, x2: 288, y2: 216, thickness: 8, height3D: 108, material: 'wood_panel', exterior: true },
      { id: 'crw_s', x1: 288, y1: 216, x2: 0, y2: 216, thickness: 8, height3D: 108, material: 'concrete', exterior: true },
      { id: 'crw_w', x1: 0, y1: 216, x2: 0, y2: 0, thickness: 8, height3D: 108, material: 'concrete', exterior: true },
      // Sound Booth Partition
      { id: 'crw_booth', x1: 204, y1: 120, x2: 288, y2: 120, thickness: 6, height3D: 108, material: 'drywall', exterior: false },
      { id: 'crw_booth2', x1: 204, y1: 120, x2: 204, y2: 216, thickness: 6, height3D: 108, material: 'drywall', exterior: false },
    ],
    doors: [
      { id: 'crd_in', wallId: 'crw_s', distanceAlongWall: 0.3, width: 36, height: 84, swing: 'left', openAngle: 30, label: 'Studio Door' },
      { id: 'crd_booth', wallId: 'crw_booth2', distanceAlongWall: 0.4, width: 32, height: 84, swing: 'sliding', openAngle: 0, label: 'Acoustic Soundbooth' },
    ],
    windows: [
      { id: 'crwin_1', wallId: 'crw_n', distanceAlongWall: 0.5, width: 60, height: 48, elevation: 36, style: 'picture', label: 'Diffused RGB Window' },
    ],
    rooms: [
      {
        id: 'crrm_main',
        name: 'Broadcast & Video Set',
        points: [[0, 0], [288, 0], [288, 120], [204, 120], [204, 216], [0, 216]],
        areaSqFt: 375,
        floorMaterial: 'hardwood',
        color: '#0f172a',
      },
      {
        id: 'crrm_booth',
        name: 'Voiceover Acoustic Pod',
        points: [[204, 120], [288, 120], [288, 216], [204, 216]],
        areaSqFt: 57,
        floorMaterial: 'carpet',
        color: '#1e293b',
      },
    ],
    furniture: [
      // Stream Desk Setup
      { id: 'crf_desk', type: 'desk', category: 'office', name: 'Tri-Monitor Stream Desk', x: 80, y: 60, w: 72, d: 36, h: 30, rotation: 0, color: '#8b5cf6' },
      // Podcast Lounge Set
      { id: 'crf_sofa', type: 'sofa_3seater', category: 'seating', name: 'Podcast Interview Couch', x: 100, y: 160, w: 72, d: 34, h: 32, rotation: 0, color: '#06b6d4' },
      { id: 'crf_table', type: 'coffee_table', category: 'tables', name: 'Mic Arm Coffee Table', x: 100, y: 120, w: 36, d: 24, h: 18, rotation: 0, color: '#f59e0b' },
      // Backlit Decor
      { id: 'crf_shelf', type: 'tv_unit', category: 'decor', name: 'LED Accent Shelving', x: 200, y: 40, w: 60, d: 14, h: 60, rotation: 0, color: '#ec4899' },
    ],
    annotations: [
      { id: 'crann_w', x1: 0, y1: -20, x2: 288, y2: -20, label: '24\' - 0"' },
      { id: 'crann_h', x1: -20, y1: 0, x2: -20, y2: 216, label: '18\' - 0"' },
    ],
  },
};

export const TEMPLATE_METADATA_LIST: TemplateMetadata[] = [
  {
    id: 'modern_villa',
    name: 'Modern California Villa',
    category: 'architecture',
    categoryLabel: 'Architecture & Residential',
    useCase: 'Luxury Residential & Spatial Planning',
    description: 'A 30\' x 24\' open-concept villa with primary master suite, en-suite spa bathroom, marble kitchen island, and living patio sliding doors.',
    tags: ['#architecture', '#villa', '#residential', '#luxury-interior'],
    dimensions: '30\' x 24\' (720 sq ft)',
    approxSqFt: 720,
    highlightColor: '#3b82f6',
    project: TEMPLATES.modern_villa,
  },
  {
    id: 'scandinavian_loft',
    name: 'Nordic Open Loft',
    category: 'architecture',
    categoryLabel: 'Architecture & Residential',
    useCase: 'Industrial Studio & Urban Living',
    description: 'High-ceiling Nordic brick loft featuring polished concrete floors, large north-facing industrial bay windows, draft desk, and enclosed bath pod.',
    tags: ['#loft', '#scandinavian', '#industrial', '#open-plan'],
    dimensions: '25\' x 20\' (500 sq ft)',
    approxSqFt: 500,
    highlightColor: '#10b981',
    project: TEMPLATES.scandinavian_loft,
  },
  {
    id: 'minimalist_studio',
    name: 'Minimalist Tokyo Studio',
    category: 'architecture',
    categoryLabel: 'Architecture & Residential',
    useCase: 'Compact Micro-Living & Efficiency',
    description: 'An efficient 18\' x 16\' space-saving apartment layout with entryway Genkan, tatami bed frame, low dining table, and unitary bathroom.',
    tags: ['#minimalist', '#micro-apartment', '#tokyo-style', '#efficiency'],
    dimensions: '18\' x 16\' (288 sq ft)',
    approxSqFt: 288,
    highlightColor: '#f59e0b',
    project: TEMPLATES.minimalist_studio,
  },
  {
    id: 'tech_coworking',
    name: 'Tech Co-Working & Conference Hub',
    category: 'commercial',
    categoryLabel: 'Office & Commercial',
    useCase: 'Commercial Workplace & Agile Teams',
    description: 'Full-floor startup layout with dual team workstation benches, an acoustic glass executive boardroom, and agile collaboration lounge pods.',
    tags: ['#office', '#coworking', '#boardroom', '#commercial-design'],
    dimensions: '36\' x 25\' (900 sq ft)',
    approxSqFt: 900,
    highlightColor: '#6366f1',
    project: TEMPLATES.tech_coworking,
  },
  {
    id: 'presentation_pavilion',
    name: 'Architectural Presentation & Expo Pavilion',
    category: 'presentations',
    categoryLabel: 'Presentations & Exhibitions',
    useCase: 'Keynote Stage, Expo Booths & Presentations',
    description: 'High-impact exhibition pavilion with dual architectural model pedestals, a 4K keynote display wall, terrazzo flooring, and audience seating.',
    tags: ['#presentation', '#keynote', '#exhibition', '#showcase-stage'],
    dimensions: '32\' x 24\' (768 sq ft)',
    approxSqFt: 768,
    highlightColor: '#0ea5e9',
    project: TEMPLATES.presentation_pavilion,
  },
  {
    id: 'brand_showroom',
    name: 'Flagship Brand Showroom & Logo Spatial Display',
    category: 'brand',
    categoryLabel: 'Brand & Logo Spatial',
    useCase: 'Retail Flagship, 3D Brand Logos & VIP Lounge',
    description: 'Retail flagship layout featuring a hero 3D logo pedestal monolith, backlit showcase displays, full-glass storefront, and an exclusive VIP client suite.',
    tags: ['#brand-identity', '#logo-display', '#retail-showroom', '#flagship'],
    dimensions: '30\' x 22\' (660 sq ft)',
    approxSqFt: 660,
    highlightColor: '#ec4899',
    project: TEMPLATES.brand_showroom,
  },
  {
    id: 'creator_studio',
    name: 'Social Media Creator Studio & Stream Stage',
    category: 'social_media',
    categoryLabel: 'Social Media & Creator Sets',
    useCase: 'Social Media Production, Podcasting & Streaming',
    description: 'Multi-set broadcast room with tri-monitor streaming desk, podcast interview sofa, LED shelving, and an enclosed voiceover acoustic booth.',
    tags: ['#social-media', '#stream-set', '#podcast-studio', '#creator-space'],
    dimensions: '24\' x 18\' (432 sq ft)',
    approxSqFt: 432,
    highlightColor: '#8b5cf6',
    project: TEMPLATES.creator_studio,
  },
];
