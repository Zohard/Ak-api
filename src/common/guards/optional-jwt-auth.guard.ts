import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Override handleRequest to allow unauthenticated requests
  handleRequest(err, user, info, context) {
    // If user exists, return it (authenticated)
    // If user doesn't exist, return null (guest)
    // Don't throw errors - allow both cases
    return user || null;
  }
}
