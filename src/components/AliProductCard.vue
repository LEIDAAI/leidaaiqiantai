<script setup lang="ts">
/**
 * 1688商品详情展示卡片
 * 在对话气泡中展示商品详情、评论分析、店铺信息、热销SKU
 */
import { ref, computed } from 'vue'
import { Ali1688ProductData } from '../stores/chat'

const props = defineProps<{
  data: Ali1688ProductData
}>()

// Tab 状态
const activeTab = ref<'product' | 'reviews' | 'shop' | 'skus'>('product')

const tabs = [
  { key: 'product', label: '商品详情', icon: '📦' },
  { key: 'reviews', label: '评论分析', icon: '💬' },
  { key: 'shop', label: '店铺信息', icon: '🏪' },
  { key: 'skus', label: '热销SKU', icon: '🔥' }
] as const

// 评分星星
const ratingStars = computed(() => {
  const rating = props.data.reviews.rating
  const full = Math.floor(rating)
  const half = rating % 1 >= 0.5
  return { full, half, empty: 5 - full - (half ? 1 : 0) }
})

// 格式化销量
const formatSales = (sales: number) => {
  if (sales >= 10000) {
    return (sales / 10000).toFixed(1) + '万'
  }
  return sales.toString()
}
</script>

<template>
  <div class="ali-product-card">
    <!-- Tab 导航 -->
    <div class="apc-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="apc-tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        <span class="apc-tab-icon">{{ tab.icon }}</span>
        <span class="apc-tab-label">{{ tab.label }}</span>
      </button>
    </div>

    <!-- Tab 内容 -->
    <div class="apc-content">
      <!-- 商品详情 -->
      <div v-if="activeTab === 'product'" class="apc-panel">
        <div class="apc-product-header">
          <div class="apc-product-gallery">
            <img :src="data.product.images[0]" :alt="data.product.title" class="apc-main-img" />
            <div class="apc-thumb-list">
              <img
                v-for="(img, idx) in data.product.images.slice(1, 4)"
                :key="idx"
                :src="img"
                class="apc-thumb"
              />
            </div>
          </div>
          <div class="apc-product-info">
            <h3 class="apc-product-title">{{ data.product.title }}</h3>
            <div class="apc-product-price">
              <span class="apc-price">{{ data.product.price }}</span>
              <span class="apc-moq">{{ data.product.moq }}</span>
            </div>
          </div>
        </div>
        <div class="apc-attributes">
          <div v-for="(attr, idx) in data.product.attributes" :key="idx" class="apc-attr-item">
            <span class="apc-attr-label">{{ attr.label }}</span>
            <span class="apc-attr-value">{{ attr.value }}</span>
          </div>
        </div>
      </div>

      <!-- 评论分析 -->
      <div v-if="activeTab === 'reviews'" class="apc-panel">
        <div class="apc-reviews-summary">
          <div class="apc-rating">
            <span class="apc-rating-num">{{ data.reviews.rating.toFixed(1) }}</span>
            <div class="apc-stars">
              <span v-for="i in ratingStars.full" :key="'f'+i" class="apc-star">★</span>
              <span v-if="ratingStars.half" class="apc-star half">★</span>
              <span v-for="i in ratingStars.empty" :key="'e'+i" class="apc-star empty">★</span>
            </div>
            <span class="apc-review-count">{{ data.reviews.count }} 条评价</span>
          </div>
          <div class="apc-keywords">
            <span v-for="(kw, idx) in data.reviews.keywords" :key="idx" class="apc-keyword">{{ kw }}</span>
          </div>
        </div>
        <div class="apc-reviews-list">
          <div v-for="(review, idx) in data.reviews.samples" :key="idx" class="apc-review-item">
            <div class="apc-review-header">
              <span class="apc-review-user">{{ review.user }}</span>
              <div class="apc-review-stars">
                <span v-for="i in review.rating" :key="i" class="apc-star">★</span>
              </div>
              <span class="apc-review-time">{{ review.time }}</span>
            </div>
            <p class="apc-review-content">{{ review.content }}</p>
          </div>
        </div>
      </div>

      <!-- 店铺信息 -->
      <div v-if="activeTab === 'shop'" class="apc-panel">
        <div class="apc-shop-info">
          <div class="apc-shop-header">
            <div class="apc-shop-avatar">🏪</div>
            <div class="apc-shop-details">
              <h4 class="apc-shop-name">{{ data.shop.name }}</h4>
              <div class="apc-shop-meta">
                <span class="apc-shop-level">{{ data.shop.level }}</span>
                <span class="apc-shop-transaction">{{ data.shop.transactionData }}</span>
              </div>
            </div>
          </div>
          <div class="apc-shop-stats">
            <div class="apc-stat-item">
              <span class="apc-stat-label">主营类目</span>
              <span class="apc-stat-value">{{ data.shop.mainCategory }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 热销SKU -->
      <div v-if="activeTab === 'skus'" class="apc-panel">
        <div class="apc-sku-list">
          <div v-for="(sku, idx) in data.hotSKUs" :key="idx" class="apc-sku-item">
            <div class="apc-sku-spec">{{ sku.spec }}</div>
            <div class="apc-sku-details">
              <div class="apc-sku-row">
                <span class="apc-sku-label">价格</span>
                <span class="apc-sku-value price">{{ sku.price }}</span>
              </div>
              <div class="apc-sku-row">
                <span class="apc-sku-label">销量</span>
                <span class="apc-sku-value">{{ formatSales(sku.sales) }}</span>
              </div>
              <div class="apc-sku-row">
                <span class="apc-sku-label">库存</span>
                <span class="apc-sku-value">{{ sku.stock }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ali-product-card {
  background: var(--card);
  border-radius: var(--r-xl);
  border: 1px solid var(--border);
  overflow: hidden;
  max-width: 520px;
  margin: 8px 0;
}

/* Tab 导航 */
.apc-tabs {
  display: flex;
  background: #fafafa;
  border-bottom: 1px solid var(--border);
}

.apc-tab {
  flex: 1;
  padding: 12px 8px;
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  transition: all 0.2s;
  border-bottom: 2px solid transparent;
}

.apc-tab:hover {
  background: #f5f5f5;
  color: var(--text);
}

.apc-tab.active {
  color: var(--brand);
  background: var(--card);
  border-bottom-color: var(--brand);
  font-weight: 500;
}

.apc-tab-icon {
  font-size: 14px;
}

/* 内容面板 */
.apc-content {
  padding: 16px;
}

.apc-panel {
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 商品详情 */
.apc-product-header {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.apc-product-gallery {
  flex-shrink: 0;
  width: 140px;
}

.apc-main-img {
  width: 140px;
  height: 140px;
  object-fit: cover;
  border-radius: var(--r);
  background: #f5f5f5;
}

.apc-thumb-list {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.apc-thumb {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: var(--r-sm);
  background: #f5f5f5;
  cursor: pointer;
  border: 1px solid var(--border);
}

.apc-product-info {
  flex: 1;
  min-width: 0;
}

.apc-product-title {
  font-size: 15px;
  font-weight: 500;
  line-height: 1.5;
  margin: 0 0 12px 0;
  color: var(--text);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.apc-product-price {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.apc-price {
  font-size: 22px;
  font-weight: 600;
  color: var(--brand);
}

.apc-moq {
  font-size: 13px;
  color: var(--text-muted);
}

.apc-attributes {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid var(--border-light);
}

.apc-attr-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.apc-attr-label {
  font-size: 12px;
  color: var(--text-muted);
}

.apc-attr-value {
  font-size: 13px;
  color: var(--text);
}

/* 评论分析 */
.apc-reviews-summary {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-light);
}

.apc-rating {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.apc-rating-num {
  font-size: 28px;
  font-weight: 600;
  color: var(--brand);
}

.apc-stars {
  display: flex;
  gap: 2px;
}

.apc-star {
  color: #ffc107;
  font-size: 16px;
}

.apc-star.empty {
  color: #e0e0e0;
}

.apc-star.half {
  background: linear-gradient(90deg, #ffc107 50%, #e0e0e0 50%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.apc-review-count {
  font-size: 13px;
  color: var(--text-muted);
}

.apc-keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.apc-keyword {
  padding: 4px 10px;
  background: var(--brand-soft);
  color: var(--brand);
  border-radius: 12px;
  font-size: 12px;
}

.apc-reviews-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.apc-review-item {
  padding: 12px;
  background: #fafafa;
  border-radius: var(--r);
}

.apc-review-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.apc-review-user {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.apc-review-stars {
  display: flex;
  gap: 1px;
}

.apc-review-stars .apc-star {
  font-size: 12px;
}

.apc-review-time {
  font-size: 12px;
  color: var(--text-muted);
  margin-left: auto;
}

.apc-review-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
  margin: 0;
}

/* 店铺信息 */
.apc-shop-info {
  padding: 8px 0;
}

.apc-shop-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
}

.apc-shop-avatar {
  width: 56px;
  height: 56px;
  background: var(--brand-soft);
  border-radius: var(--r-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
}

.apc-shop-details {
  flex: 1;
}

.apc-shop-name {
  font-size: 15px;
  font-weight: 500;
  margin: 0 0 8px 0;
  color: var(--text);
}

.apc-shop-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.apc-shop-level {
  padding: 2px 8px;
  background: var(--brand);
  color: white;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}

.apc-shop-transaction {
  font-size: 13px;
  color: var(--text-secondary);
}

.apc-shop-stats {
  padding-top: 16px;
  border-top: 1px solid var(--border-light);
}

.apc-stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.apc-stat-label {
  font-size: 13px;
  color: var(--text-muted);
}

.apc-stat-value {
  font-size: 13px;
  color: var(--text);
  font-weight: 500;
}

/* 热销SKU */
.apc-sku-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.apc-sku-item {
  padding: 14px;
  background: #fafafa;
  border-radius: var(--r);
  border: 1px solid var(--border-light);
}

.apc-sku-spec {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 10px;
}

.apc-sku-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.apc-sku-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.apc-sku-label {
  font-size: 12px;
  color: var(--text-muted);
}

.apc-sku-value {
  font-size: 13px;
  color: var(--text);
  font-weight: 500;
}

.apc-sku-value.price {
  color: var(--brand);
  font-size: 15px;
}
</style>
