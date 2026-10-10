export type SaleMode = 'weight' | 'unit'
export type Method = 'cash' | 'transfer'
export const methodLabel: Record<Method, string> = { cash: 'Efectivo', transfer: 'Transferencia' }

export interface Category { id: string; name: string }
export interface Product {
  id: string; name: string; description: string | null; category_id: string | null
  sale_mode: SaleMode; price: number; cost: number; stock: number; min_stock: number; active: boolean
  image_url?: string | null
}
export interface Customer { id: string; name: string; phone: string | null; notes: string | null; created_at: string; active?: boolean }
export interface SaleItem { id: string; product_name: string; sale_mode: SaleMode; quantity: number; unit_price: number; line_total: number }
export interface SalePayment { id: string; method: Method; amount: number }
export interface Sale {
  id: string; number: number; user_id: string; customer_id: string | null; status: 'completed' | 'voided'
  subtotal: number; discount: number; total: number; paid_total: number; pending: number
  void_reason: string | null; created_at: string
}
export interface SaleFull extends Sale { sale_items: SaleItem[]; sale_payments: SalePayment[] }
export interface DebtPayment {
  id: string; amount: number; method: Method; created_at: string; user_id: string
  reversed_at: string | null; reverse_reason: string | null
}
export interface Debt {
  id: string; sale_id: string; customer_id: string; original_amount: number; balance: number
  status: 'pending' | 'paid' | 'voided'; created_at: string
  sales: { number: number } | null; debt_payments: DebtPayment[]
}
export interface CashSession {
  id: string; opened_by: string; opened_at: string; opening_float: number; closed_at: string | null
  expected_cash: number | null; counted_cash: number | null; difference: number | null
}
export interface CashMovement {
  id: string; kind: string; method: Method; amount: number; note: string | null; user_id: string; created_at: string
}
export interface Expense {
  id: string; description: string; category_id: string | null; amount: number; method: Method
  expense_date: string; notes: string | null; user_id: string
}
export interface InventoryMovement {
  id: string; kind: string; quantity: number; reason: string | null; user_id: string; created_at: string
}

export type OrderStatus = 'received' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
export const orderStatusLabel: Record<OrderStatus, string> = {
  received: 'Recibido', confirmed: 'Confirmado', preparing: 'En preparación',
  ready: 'Listo para entregar o recoger', delivered: 'Entregado', cancelled: 'Cancelado',
}
export interface OrderItem { id: string; product_name: string; sale_mode: SaleMode; quantity: number; unit_price: number; line_total: number }
export interface Order {
  id: string; number: number; customer_name: string; phone: string; delivery_method: 'pickup' | 'delivery'
  address: string | null; notes: string | null; status: OrderStatus; estimated_total: number; delivery_fee: number
  sale_id: string | null; created_at: string; order_items: OrderItem[]
}
export interface PublicProduct {
  id: string; name: string; description: string | null; category: string | null
  sale_mode: SaleMode; price: number; available: boolean
}
export interface PublicInfo {
  business_name: string; whatsapp_number: string | null; address: string | null
  delivery_enabled: boolean; delivery_fee: number
}
export interface PublicOrderStatus {
  number: number; status: OrderStatus; delivery_method: 'pickup' | 'delivery'
  estimated_total: number; delivery_fee: number; created_at: string
  items: { product_name: string; sale_mode: SaleMode; quantity: number; line_total: number }[]
}
export interface AuditRow {
  id: number; user_id: string | null; action: string; table_name: string; record_id: string | null
  reason: string | null; old_values: unknown; new_values: unknown; created_at: string
}
