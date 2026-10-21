import type { Env } from '../../config/env.js';
import type { AuthRepository } from './repository.js';
import { serializeUser } from './repository.js';
import { hashPassword, verifyPassword, withPasswordSlot } from './password.js';
import { createTokens, unauthorized } from './token.js';
import type { Registration, Login } from './schemas.js';

export function createAuthService(repository: AuthRepository, config: Env) {
  const tokens = createTokens(config);
  return {
    register: (input: Registration) => withPasswordSlot(async () => {
      const passwordHash = await hashPassword(input.password);
      // The public API always creates USER. No request field can select a role.
      return serializeUser(await repository.create({ username: input.username, email: input.email, passwordHash }));
    }),
    login: (input: Login) => withPasswordSlot(async () => {
      const user = await repository.findCredentials(input.identifier);
      const valid = await verifyPassword(user?.passwordHash, input.password);
      if (!user || !valid) throw unauthorized();
      return { user: serializeUser(user), ...await tokens.issue(user.id) };
    }),
    async authenticate(token: string) {
      const id = await tokens.verify(token);
      // Never authorize from JWT role claims. Demotion/deletion applies on the next request.
      const user = await repository.findSafeById(id);
      if (!user) throw unauthorized();
      return user;
    },
  };
}
export type AuthService = ReturnType<typeof createAuthService>;
