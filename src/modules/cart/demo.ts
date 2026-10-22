import { Prisma } from '../../generated/prisma/client.js';
import { serializeMoney } from '../../lib/money.js';
import type { z } from 'zod';
import type { cartDemo } from '../../contracts/responses.js';

// Original synthetic presentation only. Null IDs cannot be used as sellable SKU IDs.
// No database access, account/token inputs, clocks, or real catalog dependencies.
export function demoCart(): z.output<typeof cartDemo> {
  const modelPrice = new Prisma.Decimal('100.00');
  const memoryPrice = new Prisma.Decimal('20.00');
  const unitPrice = modelPrice.plus(memoryPrice);
  const lineTotal = unitPrice.times(2);
  return { id: null, isDemo: true, currency: 'CNY', itemCount: 1, totalQty: 2, totalAmount: serializeMoney(lineTotal),
    items: [{ id: null, product: { id: null, name: 'Synthetic demo device', image: '/media/demo-placeholder.svg' },
      model: { id: null, name: 'Demo base model', specification: 'Synthetic example; not a sellable configuration', price: serializeMoney(modelPrice) },
      memorySize: { id: null, name: 'Demo memory upgrade', price: serializeMoney(memoryPrice) },
      color: 'Demo silver', qty: 2, currency: 'CNY', unitPrice: serializeMoney(unitPrice),
      lineTotal: serializeMoney(lineTotal), available: false,
    }],
  };
}
