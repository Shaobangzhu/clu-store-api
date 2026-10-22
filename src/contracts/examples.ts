import type { z } from 'zod';
import type * as dto from './responses.js';

// Original, illustrative wire values only. None of these accounts/SKUs/orders is provisioned.
export const exampleUserId = '00000000-0000-4000-8000-000000000001';
const adminId = '00000000-0000-4000-8000-000000000002';
export const exampleDate = '2026-01-01T00:00:00.000Z';
export const exampleUser: z.output<typeof dto.safeUser> = { id: exampleUserId, username: 'synthetic_demo_user', email: 'synthetic@example.test', role: 'USER', createdAt: exampleDate };
export const exampleProduct: z.output<typeof dto.product> = { id: 2, name: 'Synthetic example device', title: 'Illustrative product, not a fixture', image: '/media/demo-placeholder.svg',
  startingPrice: '100.00', installments: null, features: [], inStock: true, category: 'Phones', carouselImages: [],
  models: [{ id: 1, name: 'Example full base', specification: 'Synthetic specification', price: '100.00', inStock: true }],
  memorySizes: [{ id: 1, name: 'Example upgrade', price: '20.00', inStock: true }], colors: ['Silver'] };
export const exampleCartItem: z.output<typeof dto.cartItem> = { id: 1, product: { id: 2, name: exampleProduct.name, image: exampleProduct.image },
  model: { id: 1, name: 'Example full base', specification: 'Synthetic specification', price: '100.00' },
  memorySize: { id: 1, name: 'Example upgrade', price: '20.00' }, color: 'Silver', qty: 2, currency: 'CNY', unitPrice: '120.00', lineTotal: '240.00', available: true };
export const exampleCart: z.output<typeof dto.cart> = { id: 1, isDemo: false, currency: 'CNY', items: [exampleCartItem], itemCount: 1, totalQty: 2, totalAmount: '240.00' };
export const examplePlacement: z.output<typeof dto.placedOrderSchema> = { id: 1, status: 'pending', currency: 'CNY', totalAmount: '240.00', createdAt: exampleDate,
  items: [{ id: 1, productId: 2, productName: exampleProduct.name, modelName: 'Example full base', modelSpecification: 'Synthetic specification', memoryName: 'Example upgrade', color: 'Silver', qty: 2, unitPrice: '120.00', lineTotal: '240.00' }] };
export function exampleCurrentOrder(status: 'pending' | 'approved' | 'rejected' = 'pending'): z.output<typeof dto.currentOrder> {
  return { ...examplePlacement, userId: exampleUserId, status, updatedAt: exampleDate,
    statusHistory: [{ id: 1, fromStatus: null, toStatus: 'pending', operatorId: exampleUserId, createdAt: exampleDate, metadata: null },
      ...(status === 'pending' ? [] : [{ id: 2, fromStatus: 'pending' as const, toStatus: status, operatorId: adminId, createdAt: exampleDate, metadata: { note: 'Synthetic review example' } }])] };
}
