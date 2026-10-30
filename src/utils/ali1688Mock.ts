/**
 * 1688商品分析假数据模块
 * 用于演示1688商品链接/ID识别后的详情展示
 */

import { Ali1688ProductData } from '../stores/chat'

/**
 * 从用户输入中提取1688商品链接或ID
 * 支持格式：
 * - https://detail.1688.com/offer/123456789.html
 * - https://m.1688.com/offer/123456789.html
 * - 123456789（纯数字ID）
 */
export function extract1688Id(input: string): string | null {
  const trimmed = input.trim()

  // 匹配1688链接
  const urlMatch = trimmed.match(/(?:detail\.1688\.com|1688\.com)\/offer\/(\d+)/)
  if (urlMatch) {
    return urlMatch[1]
  }

  // 匹配纯数字ID（至少8位）
  const idMatch = trimmed.match(/^(\d{8,})$/)
  if (idMatch) {
    return idMatch[1]
  }

  return null
}

/**
 * 根据商品ID生成假数据
 * 实际项目中这里应该调用后端接口
 */
export function generateMockProductData(productId: string): Ali1688ProductData {
  // 基于ID生成一些变化，让不同ID显示不同数据
  const seed = parseInt(productId.slice(-4)) || 1234

  return {
    product: {
      title: `【热销爆款】${getRandomProductName(seed)} 跨境专供 外贸货源`,
      images: [
        `https://cbu01.alicdn.com/img/ibank/O1CN01example${seed}_1.jpg`,
        `https://cbu01.alicdn.com/img/ibank/O1CN01example${seed}_2.jpg`,
        `https://cbu01.alicdn.com/img/ibank/O1CN01example${seed}_3.jpg`
      ],
      price: `¥${(20 + seed % 80).toFixed(2)}`,
      moq: `${2 + seed % 10}件起批`,
      attributes: [
        { label: '品牌', value: 'OEM/自有品牌' },
        { label: '材质', value: getRandomMaterial(seed) },
        { label: '产地', value: '浙江义乌' },
        { label: '是否跨境', value: '是' },
        { label: '主要销售地区', value: '北美、欧洲、东南亚' },
        { label: '发货时效', value: '48小时内' }
      ]
    },
    reviews: {
      rating: 4.5 + (seed % 5) * 0.1,
      count: 100 + seed % 900,
      keywords: ['质量好', '发货快', '包装精美', '性价比高', '回购多次'],
      samples: [
        {
          user: '张***店',
          content: '质量非常好，已经是第三次回购了，客户反馈都很满意。',
          rating: 5,
          time: '2024-01-15'
        },
        {
          user: '李***贸',
          content: '发货速度快，包装也很用心，跨境客户很喜欢。',
          rating: 5,
          time: '2024-01-10'
        },
        {
          user: '王***家',
          content: '性价比很高，比同行便宜不少，会继续合作。',
          rating: 4,
          time: '2024-01-05'
        }
      ]
    },
    shop: {
      name: `义乌市${getRandomShopName(seed)}贸易有限公司`,
      level: `L${3 + seed % 5}`,
      transactionData: `近90天成交 ${50 + seed % 200} 万元`,
      mainCategory: getRandomCategory(seed)
    },
    hotSKUs: [
      {
        spec: '黑色 / 大号',
        price: `¥${(25 + seed % 30).toFixed(2)}`,
        sales: 1000 + seed % 5000,
        stock: 500 + seed % 1000
      },
      {
        spec: '白色 / 中号',
        price: `¥${(22 + seed % 25).toFixed(2)}`,
        sales: 800 + seed % 4000,
        stock: 300 + seed % 800
      },
      {
        spec: '灰色 / 小号',
        price: `¥${(20 + seed % 20).toFixed(2)}`,
        sales: 600 + seed % 3000,
        stock: 200 + seed % 600
      },
      {
        spec: '蓝色 / 大号',
        price: `¥${(28 + seed % 35).toFixed(2)}`,
        sales: 400 + seed % 2000,
        stock: 150 + seed % 400
      }
    ]
  }
}

// 辅助函数：随机产品名称
function getRandomProductName(seed: number): string {
  const products = [
    '无线蓝牙耳机',
    '智能手表',
    '手机支架',
    '充电宝',
    'LED台灯',
    '保温杯',
    '运动手环',
    '车载充电器',
    '迷你风扇',
    '收纳盒套装'
  ]
  return products[seed % products.length]
}

// 辅助函数：随机材质
function getRandomMaterial(seed: number): string {
  const materials = ['ABS塑料', '不锈钢', '硅胶', '涤纶', 'PU皮革', '铝合金']
  return materials[seed % materials.length]
}

// 辅助函数：随机店铺名
function getRandomShopName(seed: number): string {
  const names = ['鼎盛', '恒通', '优品', '智联', '创想', '远航']
  return names[seed % names.length]
}

// 辅助函数：随机主营类目
function getRandomCategory(seed: number): string {
  const categories = ['数码配件', '家居日用', '户外运动', '美妆工具', '箱包配件']
  return categories[seed % categories.length]
}
