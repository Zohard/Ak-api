import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserData {
  id: number;
  username: string;
  email: string;
  groupId: number;
  role: string;
  isAdmin: boolean;
}

/**
 * Decorator to get the current authenticated user from the request
 * @example
 * async myMethod(@CurrentUser() user: CurrentUserData) {
 *   console.log(user.id, user.role);
 * }
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): CurrentUserData => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
