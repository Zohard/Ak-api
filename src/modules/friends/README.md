# Friends Management Module

This module provides comprehensive friends management functionality using the existing SMF (Simple Machines Forum) database structure.

## Overview

The friends system leverages the existing `smf_members` table with the `buddy_list` column that stores comma-separated friend IDs. This maintains compatibility with the existing PHP/SMF system while providing modern REST API endpoints.

## Database Structure

- **Table**: `smf_members`
- **Column**: `buddy_list` (TEXT)
- **Format**: Comma-separated list of member IDs (e.g., "123,456,789")

## Features

### Core Functionality
- ✅ **Get Friends List**: Retrieve user's friends with statistics
- ✅ **Add Friends**: Add users to friends list with mutual relationship detection
- ✅ **Remove Friends**: Remove users from friends list
- ✅ **Friendship Status**: Check relationship status between users
- ✅ **Mutual Friends**: Find friends in common between users

### Advanced Features
- ✅ **User Search**: Search for potential friends by name
- ✅ **Friend Recommendations**: AI-powered recommendations based on mutual friends
- ✅ **Bulk Operations**: Add/remove multiple friends in one request
- ✅ **Statistics**: Comprehensive friendship analytics

## API Endpoints

### Authentication
All endpoints require JWT authentication via `Bearer` token.

### Core Endpoints

#### GET /friends
Get current user's friends list
```json
{
  "friends": [
    {
      "id": 123,
      "realName": "John Doe",
      "lastLogin": 1640995200,
      "avatar": "../img/avatar123.jpg",
      "isMutual": true,
      "lastLoginFormatted": "2 jours"
    }
  ],
  "stats": {
    "totalFriends": 15,
    "mutualFriends": 12,
    "recentlyActive": 8
  }
}
```

#### GET /friends/user/:userId
Get specific user's friends list (public view)

#### POST /friends/add/:targetUserId
Add a friend
```json
{
  "success": true,
  "message": "Friend added successfully",
  "isMutual": true
}
```

#### DELETE /friends/remove/:targetUserId
Remove a friend
```json
{
  "success": true,
  "message": "Friend removed successfully"
}
```

#### GET /friends/status/:targetUserId
Check friendship status
```json
{
  "areFriends": true,
  "isMutual": true,
  "targetHasUser": true
}
```

#### GET /friends/mutual/:targetUserId
Get mutual friends between users

### Search & Discovery

#### GET /friends/search?q=query&limit=10
Search for users by name
```json
[
  {
    "id": 789,
    "realName": "Bob Johnson",
    "avatar": "../img/avatar789.jpg",
    "areFriends": false,
    "isMutual": false
  }
]
```

#### GET /friends/recommendations?limit=5
Get friend recommendations based on mutual friends
```json
[
  {
    "id": 999,
    "realName": "Alice Cooper",
    "avatar": "../img/avatar999.jpg",
    "mutualFriendsCount": 3,
    "mutualFriends": ["John Doe", "Jane Smith", "Bob Johnson"]
  }
]
```

### Bulk Operations

#### POST /friends/bulk-add
Add multiple friends at once
```json
{
  "userIds": [123, 456, 789]
}
```

#### DELETE /friends/bulk-remove
Remove multiple friends at once
```json
{
  "userIds": [123, 456, 789]
}
```

## Data Types

### FriendData
- `id`: User ID
- `realName`: Display name
- `lastLogin`: Unix timestamp
- `avatar`: Avatar image path
- `isMutual`: Whether friendship is bidirectional
- `lastLoginFormatted`: Human-readable last login time

### FriendshipStats
- `totalFriends`: Total number of friends
- `mutualFriends`: Number of mutual friendships
- `recentlyActive`: Friends active in last 24 hours

## Error Handling

The module includes comprehensive error handling:

- **400 Bad Request**: Invalid parameters, already friends, etc.
- **401 Unauthorized**: Missing or invalid authentication
- **404 Not Found**: User not found
- **403 Forbidden**: Permission denied

## Usage Examples

### JavaScript/TypeScript
```typescript
// Get friends list
const response = await fetch('/api/friends', {
  headers: { 'Authorization': 'Bearer ' + token }
});
const { friends, stats } = await response.json();

// Add friend
await fetch('/api/friends/add/123', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + token }
});

// Search users
const searchResults = await fetch('/api/friends/search?q=john&limit=5', {
  headers: { 'Authorization': 'Bearer ' + token }
});
```

### cURL Examples
```bash
# Get friends
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/friends

# Add friend
curl -X POST -H "Authorization: Bearer <token>" http://localhost:3000/api/friends/add/123

# Search users
curl -H "Authorization: Bearer <token>" "http://localhost:3000/api/friends/search?q=john&limit=5"
```

## Integration Notes

### Compatibility
- ✅ **SMF Forum**: Fully compatible with existing SMF buddy system
- ✅ **PHP Legacy**: Works alongside existing PHP friend functions
- ✅ **Database**: Uses existing table structure, no migrations needed

### Performance Considerations
- Raw SQL queries for optimal performance with large datasets
- Indexed searches on member names
- Efficient comma-separated list parsing
- Pagination support for large friend lists

### Security
- JWT authentication required
- User ID validation
- SQL injection protection via Prisma
- Rate limiting recommended for search endpoints

## Development

### Prerequisites
- NestJS application
- Prisma ORM configured
- SMF database access
- JWT authentication setup

### Installation
1. Copy the module files to your NestJS project
2. Import `FriendsModule` in your main module
3. Ensure Prisma is configured with SMF database access
4. Update authentication guards as needed

### Testing
```bash
# Unit tests
npm run test -- friends

# E2E tests
npm run test:e2e -- friends
```

## Future Enhancements

### Potential Features
- [ ] **Real-time Notifications**: WebSocket support for friend requests
- [ ] **Friend Groups**: Organize friends into custom groups
- [ ] **Privacy Controls**: Enhanced privacy settings for friendship visibility
- [ ] **Activity Feed**: Show friends' recent activities
- [ ] **Friendship History**: Track when friendships were established

### Performance Optimizations
- [ ] **Caching**: Redis cache for frequently accessed friend lists
- [ ] **Database Indexes**: Optimize queries with proper indexing
- [ ] **Batch Processing**: Queue system for bulk operations
- [ ] **Pagination**: Advanced pagination for large datasets

## License

This module is part of the Anime-Kun project and follows the same licensing terms.