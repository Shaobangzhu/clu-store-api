import { randomBytes } from 'node:crypto';
import type { Client } from 'pg';

// Only called after the real test DB/role guard. Each object has a fresh identifier;
// the trigger affects just one run-owned user/cart and is removed in finally.
export async function installCheckoutFault(client: Client, target: { userId: string; cartId: number },
  stage: 'history' | 'delete', sqlstate: '23514' | '40001' | '40P01', failures: number) {
  const name = `p07_fault_${randomBytes(8).toString('hex')}`;
  const sequence = `${name}_seq`;
  const table = stage === 'history' ? 'OrderStatusHistory' : 'CartItem';
  const condition = stage === 'history' ? `NEW."operatorId" = '${target.userId}'::uuid` : `OLD."cartId" = ${target.cartId}`;
  // Identifiers are generated hex, UUID is database-generated, cartId is an integer;
  // none of this DDL is built from request input or environment credentials.
  await client.query(`CREATE SEQUENCE "${sequence}"`);
  try {
    await client.query(`CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF ${condition} THEN
          IF NOT EXISTS (SELECT 1 FROM "Order" o JOIN "OrderItem" i ON i."orderId" = o.id WHERE o."userId" = '${target.userId}'::uuid) THEN
            RAISE EXCEPTION 'Expected partial checkout writes' USING ERRCODE = 'P0001';
          END IF;
          IF nextval('"${sequence}"') <= ${failures} THEN
            RAISE EXCEPTION 'private P07 fault detail' USING ERRCODE = '${sqlstate}';
          END IF;
        END IF;
        RETURN ${stage === 'history' ? 'NEW' : 'OLD'};
      END $$`);
    await client.query(`CREATE TRIGGER "${name}" ${stage === 'history' ? 'BEFORE INSERT' : 'AFTER DELETE'} ON "${table}"
      FOR EACH ROW EXECUTE FUNCTION "${name}"()`);
  } catch (error) {
    await client.query(`DROP FUNCTION IF EXISTS "${name}"()`);
    await client.query(`DROP SEQUENCE "${sequence}"`);
    throw error;
  }
  return {
    async attempts() {
      const state = (await client.query<{ last_value: string; is_called: boolean }>(`SELECT last_value, is_called FROM "${sequence}"`)).rows[0]!;
      return state.is_called ? Number(state.last_value) : 0;
    },
    async remove() {
      await client.query(`DROP TRIGGER "${name}" ON "${table}"`);
      await client.query(`DROP FUNCTION "${name}"()`);
      await client.query(`DROP SEQUENCE "${sequence}"`);
    },
  };
}
