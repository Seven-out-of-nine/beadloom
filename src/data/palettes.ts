import { hexToRgb, rgbToLab } from '../lib/color'
import type { BeadColor, Palette } from '../types'

type ColorDefinition = readonly [code: string, name: string, hex: string]

const COLOR_DATA: ColorDefinition[] = [
  ['G01', '曜石黑', '#1d1d1b'],
  ['G02', '炭灰', '#41413f'],
  ['G03', '岩灰', '#6c6d69'],
  ['G04', '雾灰', '#9c9d99'],
  ['G05', '银灰', '#c5c6c1'],
  ['G06', '云白', '#e8e8df'],
  ['G07', '瓷白', '#f7f5e9'],
  ['G08', '纯白', '#fffdf4'],
  ['R01', '酒红', '#7a2430'],
  ['R02', '深红', '#a51e2d'],
  ['R03', '正红', '#d73535'],
  ['R04', '珊瑚红', '#ed5a51'],
  ['R05', '西柚', '#f47d6f'],
  ['R06', '浅粉', '#f7b2b0'],
  ['R07', '樱花粉', '#f5d0d1'],
  ['R08', '玫红', '#c72d68'],
  ['R09', '莓果粉', '#df5a8d'],
  ['O01', '赤陶', '#a9472b'],
  ['O02', '橘红', '#e55f2a'],
  ['O03', '亮橙', '#f58b29'],
  ['O04', '杏橙', '#f7ad5c'],
  ['O05', '蜜桃', '#f7c6a3'],
  ['Y01', '赭黄', '#a8721e'],
  ['Y02', '芥末黄', '#d0a022'],
  ['Y03', '向日葵黄', '#f0c928'],
  ['Y04', '柠檬黄', '#f8e34b'],
  ['Y05', '奶油黄', '#f7ec9f'],
  ['Y06', '米黄', '#ead8ac'],
  ['B01', '咖啡', '#5e382c'],
  ['B02', '栗棕', '#814b38'],
  ['B03', '焦糖', '#a86b43'],
  ['B04', '驼色', '#c28d62'],
  ['B05', '浅棕', '#d9b18b'],
  ['B06', '肤色', '#efc8a8'],
  ['B07', '浅肤色', '#f4ddc8'],
  ['L01', '森林绿', '#1f5138'],
  ['L02', '松柏绿', '#27734b'],
  ['L03', '草绿', '#45a04d'],
  ['L04', '鲜绿', '#70c754'],
  ['L05', '青柠', '#a3d65c'],
  ['L06', '薄荷绿', '#a9dfbd'],
  ['L07', '浅薄荷', '#d0ecd8'],
  ['T01', '深青', '#16565b'],
  ['T02', '孔雀青', '#18868a'],
  ['T03', '湖水绿', '#28acaa'],
  ['T04', '浅青', '#70d0c5'],
  ['T05', '冰蓝', '#b6e4de'],
  ['C01', '藏蓝', '#1d3557'],
  ['C02', '深海蓝', '#1d5590'],
  ['C03', '钴蓝', '#2879bd'],
  ['C04', '天空蓝', '#55a9dd'],
  ['C05', '晴空蓝', '#89c9eb'],
  ['C06', '浅蓝', '#c2dfed'],
  ['P01', '深紫', '#4b326c'],
  ['P02', '葡萄紫', '#694691'],
  ['P03', '紫罗兰', '#8d65b4'],
  ['P04', '薰衣草', '#b596cf'],
  ['P05', '浅紫', '#d8c9e5'],
  ['N01', '墨蓝', '#2d3047'],
  ['N02', '靛青', '#414f86'],
  ['N03', '矢车菊蓝', '#6776bd'],
  ['N04', '淡靛蓝', '#aab4df'],
  ['M01', '荧光粉', '#ff4f87'],
  ['M02', '荧光橙', '#ff8a30'],
  ['M03', '荧光黄', '#eff248'],
  ['M04', '荧光绿', '#7ee35e'],
]

const makeColor = ([code, name, hex]: ColorDefinition): BeadColor => {
  const rgb = hexToRgb(hex)
  return { code, name, hex, ...rgb, lab: rgbToLab(rgb) }
}

const fullColors = COLOR_DATA.map(makeColor)
const basicCodes = new Set([
  'G01', 'G03', 'G05', 'G08',
  'R02', 'R03', 'R05', 'R07',
  'O02', 'O03', 'Y03', 'Y04',
  'B01', 'B03', 'B05', 'B06',
  'L01', 'L03', 'L05', 'L06',
  'T02', 'T04', 'C01', 'C03',
  'C05', 'P01', 'P03', 'P05',
])

export const PALETTES: Palette[] = [
  {
    id: 'studio-66',
    name: '工作室 66 色',
    description: '覆盖常见明暗与冷暖层次，适合照片和细节较多的插画。',
    colors: fullColors,
  },
  {
    id: 'starter-28',
    name: '入门 28 色',
    description: '减少备料种类，适合轮廓清晰的卡通图和新手。',
    colors: fullColors.filter((color) => basicCodes.has(color.code)),
  },
]

export function getPalette(id: string): Palette {
  return PALETTES.find((palette) => palette.id === id) ?? PALETTES[0]
}
