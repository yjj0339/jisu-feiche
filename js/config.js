// ===== 全局配置：赛车 / 赛道 / 道具 =====
export const ROAD_HALF = 7.0;          // 路面半宽
export const LAPS = 3;

export const CARS = [
  { name: '橘子小子', glb: 'kart0.glb', color: '#FF7A00', price: 0,
    stats: { speed: 1.00, accel: 1.00, drift: 1.00, handling: 1.00 },
    desc: '均衡入门车，人车合一的 第一台伙伴' },
  { name: '蓝色闪电', glb: 'kart1.glb', color: '#1E7FFF', price: 0,
    stats: { speed: 1.06, accel: 0.98, drift: 0.95, handling: 0.97 },
    desc: '直道王者，极速略胜一筹' },
  { name: '粉粉兔', glb: 'kart2.glb', color: '#FF6FA5', price: 0,
    stats: { speed: 0.96, accel: 1.04, drift: 1.02, handling: 1.10 },
    desc: '转向灵活，弯道小能手' },
  { name: '绿豆蛙', glb: 'kart3.glb', color: '#35C24E', price: 0,
    stats: { speed: 0.98, accel: 1.10, drift: 1.00, handling: 1.02 },
    desc: '起步飞快，加速度惊人' },
  { name: '雷鸣黄', glb: 'kart4.glb', color: '#FFC400', price: 800,
    stats: { speed: 1.09, accel: 1.02, drift: 1.10, handling: 0.96 },
    desc: '集气更快，漂移大师之选' },
  { name: '紫电幽灵', glb: 'kart5.glb', color: '#8B5CF6', price: 2000,
    stats: { speed: 1.13, accel: 1.06, drift: 1.12, handling: 1.04 },
    desc: '传说级座驾，全属性顶尖' },
];

// 控制点 near: 控制点索引（用于定位坡道/加速带/道具箱）
export const TRACKS = [
  {
    id: 'beach', name: '海滨大道', diff: 1, laps: 3, scale: 1.0,
    desc: '阳光沙滩，海风与引擎齐鸣',
    pts: [
      [0, 0, 0], [0, 0, 90], [18, 0.5, 160], [70, 1.5, 205], [130, 2, 195],
      [168, 1.5, 150], [168, 1, 95], [140, 0.5, 55], [95, 0, 40], [60, 0.8, 12],
      [30, 1.6, -35], [35, 2.6, -95], [10, 1.2, -140], [-40, 0.5, -150],
      [-90, 0, -120], [-108, 0, -70], [-92, 0, -25], [-55, 0, -5],
    ],
    startAt: [0, 0, 45],
    ramps: [{ near: 11, len: 14, k: 0.30 }],
    pads: [{ near: 1 }, { near: 4 }, { near: 8 }],
    items: [{ near: 2 }, { near: 6 }, { near: 10 }, { near: 13 }, { near: 16 }],
    theme: {
      skyTop: '#8ED8FF', skyBottom: '#FFF3D6', fog: '#DFF3FF',
      road: '#9A8F86', ground: '#FFE9B8', ground2: '#FFD98F',
      water: '#5BC8E8', prop: 'palm', propTint: 0xffffff,
      smoke: '#FFF6E8', hemiSky: '#BFE8FF', hemiGround: '#FFE0B0',
      accent: '#FF8A3C',
    },
  },
  {
    id: 'sakura', name: '樱花山丘', diff: 2, laps: 3, scale: 1.0,
    desc: '春樱漫舞，山道连环弯',
    pts: [
      [0, 0, 0], [0, 0, 75], [-14, 1, 145], [-62, 2, 182], [-125, 2.8, 158],
      [-158, 2.2, 100], [-150, 1.6, 42], [-172, 1.2, -14], [-196, 0.8, -78],
      [-170, 0.4, -128], [-112, 0.8, -152], [-78, 1.6, -190], [-18, 2.4, -200],
      [38, 3.0, -165], [58, 3.3, -108], [88, 2.0, -52], [98, 1.0, 8],
      [72, 0.4, 48], [36, 0, -10],
    ],
    startAt: [0, 0, 40],
    ramps: [{ near: 14, len: 14, k: 0.32 }],
    pads: [{ near: 2 }, { near: 8 }, { near: 12 }],
    items: [{ near: 3 }, { near: 7 }, { near: 11 }, { near: 15 }, { near: 17 }],
    theme: {
      skyTop: '#9FD9FF', skyBottom: '#FFE9F3', fog: '#FFE9F0',
      road: '#8E8A92', ground: '#B9E7A6', ground2: '#9AD982',
      water: null, prop: 'sakura', propTint: 0xffffff,
      smoke: '#FFE4EE', hemiSky: '#FFDDEB', hemiGround: '#CDEFB8',
      accent: '#FF7FAE',
    },
  },
  {
    id: 'snow', name: '极地冰雪', diff: 3, laps: 3, scale: 1.0,
    desc: '极光雪原，高速与冰上漂移',
    pts: [
      [0, 0, 0], [0, 0, 80], [26, 0.5, 150], [86, 1, 182], [150, 1, 160],
      [180, 0.6, 104], [168, 0.2, 48], [196, 0.4, -10], [210, 1, -76],
      [176, 1.6, -128], [118, 1.2, -148], [96, 1.8, -186], [140, 2.6, -208],
      [96, 3.2, -238], [30, 2.6, -215], [18, 1.8, -160], [-38, 1.2, -140],
      [-72, 1.6, -92], [-128, 1.2, -96], [-158, 0.6, -44], [-120, 0, -6],
      [-64, 0, 10],
    ],
    startAt: [0, 0, 40],
    ramps: [{ near: 13, len: 16, k: 0.34 }],
    pads: [{ near: 1 }, { near: 9 }, { near: 16 }],
    items: [{ near: 4 }, { near: 10 }, { near: 12 }, { near: 18 }, { near: 20 }],
    theme: {
      skyTop: '#A8E1FF', skyBottom: '#F4FBFF', fog: '#EAF6FF',
      road: '#AAB4C4', ground: '#F2F8FF', ground2: '#DDEBF8',
      water: null, prop: 'snowtree', propTint: 0xffffff,
      smoke: '#FFFFFF', hemiSky: '#D6EEFF', hemiGround: '#EAF4FF',
      accent: '#54B8F0',
    },
  },
];

export const AI_DRIVERS = [
  { name: '小美', kart: 2 }, { name: '阿明', kart: 1 }, { name: '强哥', kart: 4 },
  { name: '露露', kart: 3 }, { name: '贝贝', kart: 5 },
];

export const ITEMS = {
  missile: { key: 'missile', icon: '🚀', name: '追踪导弹', color: '#FF5A4E' },
  water:   { key: 'water',   icon: '💦', name: '水炸弹',   color: '#4EC9FF' },
  magnet:  { key: 'magnet',  icon: '🧲', name: '磁铁',     color: '#FFB53C' },
  angel:   { key: 'angel',   icon: '😇', name: '天使护盾', color: '#FFE97A' },
  boost:   { key: 'boost',   icon: '💨', name: '氮气瓶',   color: '#7AFF9E' },
};

export const REWARDS = [100, 70, 50, 35, 25, 15];
