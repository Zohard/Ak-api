import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface FriendData {
  id: number;
  realName: string;
  lastLogin: number;
  avatar?: string;
  isMutual?: boolean;
  lastLoginFormatted?: string;
}

export interface FriendshipStats {
  totalFriends: number;
  mutualFriends: number;
  recentlyActive: number;
}

@Injectable()
export class FriendsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get user's friends list
   */
  async getFriends(userId: number): Promise<{
    friends: FriendData[];
    stats: FriendshipStats;
  }> {
    if (!userId || userId <= 0) {
      throw new BadRequestException('Invalid user ID');
    }

    // Get user's buddy list from SMF table
    const user = await this.prisma.$queryRaw<Array<{ buddy_list: string }>>`
      SELECT buddy_list 
      FROM smf_members 
      WHERE id_member = ${userId}
      LIMIT 1
    `;

    if (!user.length) {
      throw new NotFoundException('User not found');
    }

    const buddyListStr = user[0].buddy_list;
    if (!buddyListStr || buddyListStr.trim() === '') {
      return {
        friends: [],
        stats: { totalFriends: 0, mutualFriends: 0, recentlyActive: 0 }
      };
    }

    // Parse comma-separated friend IDs
    const friendIds = buddyListStr
      .split(',')
      .map(id => parseInt(id.trim()))
      .filter(id => !isNaN(id) && id > 0);

    if (friendIds.length === 0) {
      return {
        friends: [],
        stats: { totalFriends: 0, mutualFriends: 0, recentlyActive: 0 }
      };
    }

    // Get friend details
    const friendsData = await this.prisma.$queryRaw<Array<{
      id_member: number;
      real_name: string;
      last_login: number;
      avatar: string;
      buddy_list: string;
    }>>`
      SELECT id_member, real_name, last_login, avatar, buddy_list
      FROM smf_members 
      WHERE id_member IN (${friendIds.join(',')})
      ORDER BY real_name ASC
    `;

    // Process friends data
    const currentTime = Math.floor(Date.now() / 1000);
    const oneDayAgo = currentTime - (24 * 60 * 60);
    
    let mutualCount = 0;
    let recentlyActiveCount = 0;

    const friends: FriendData[] = friendsData.map(friend => {
      // Check if friendship is mutual
      const isMutual = friend.buddy_list && 
        friend.buddy_list.split(',').includes(userId.toString());
      
      if (isMutual) mutualCount++;

      // Check if recently active
      if (friend.last_login > oneDayAgo) {
        recentlyActiveCount++;
      }

      return {
        id: friend.id_member,
        realName: friend.real_name,
        lastLogin: friend.last_login,
        avatar: friend.avatar || '../img/noavatar.png',
        isMutual,
        lastLoginFormatted: this.formatLastLogin(friend.last_login)
      };
    });

    const stats: FriendshipStats = {
      totalFriends: friends.length,
      mutualFriends: mutualCount,
      recentlyActive: recentlyActiveCount
    };

    return { friends, stats };
  }

  /**
   * Add a friend
   */
  async addFriend(userId: number, targetUserId: number): Promise<{
    success: boolean;
    message: string;
    isMutual: boolean;
  }> {
    if (!userId || userId <= 0) {
      throw new BadRequestException('Invalid user ID');
    }

    if (!targetUserId || targetUserId <= 0) {
      throw new BadRequestException('Invalid target user ID');
    }

    if (userId === targetUserId) {
      throw new BadRequestException('Cannot add yourself as a friend');
    }

    // Check if target user exists
    const targetUser = await this.prisma.$queryRaw<Array<{ id_member: number }>>`
      SELECT id_member 
      FROM smf_members 
      WHERE id_member = ${targetUserId}
      LIMIT 1
    `;

    if (!targetUser.length) {
      throw new NotFoundException('Target user not found');
    }

    // Get current user's buddy list
    const currentUser = await this.prisma.$queryRaw<Array<{ buddy_list: string }>>`
      SELECT buddy_list 
      FROM smf_members 
      WHERE id_member = ${userId}
      LIMIT 1
    `;

    if (!currentUser.length) {
      throw new NotFoundException('User not found');
    }

    const buddyListStr = currentUser[0].buddy_list || '';
    const currentBuddies = buddyListStr
      .split(',')
      .map(id => parseInt(id.trim()))
      .filter(id => !isNaN(id) && id > 0);

    // Check if already friends
    if (currentBuddies.includes(targetUserId)) {
      throw new BadRequestException('Already friends with this user');
    }

    // Add to buddy list
    currentBuddies.push(targetUserId);
    const newBuddyList = currentBuddies.join(',');

    // Update database
    await this.prisma.$executeRaw`
      UPDATE smf_members 
      SET buddy_list = ${newBuddyList}
      WHERE id_member = ${userId}
    `;

    // Check if friendship is mutual
    const targetUserData = await this.prisma.$queryRaw<Array<{ buddy_list: string }>>`
      SELECT buddy_list 
      FROM smf_members 
      WHERE id_member = ${targetUserId}
      LIMIT 1
    `;

    const targetBuddyList = targetUserData[0]?.buddy_list || '';
    const isMutual = targetBuddyList.split(',').includes(userId.toString());

    return {
      success: true,
      message: isMutual ? 'Mutual friendship established' : 'Friend added successfully',
      isMutual
    };
  }

  /**
   * Remove a friend
   */
  async removeFriend(userId: number, targetUserId: number): Promise<{
    success: boolean;
    message: string;
  }> {
    if (!userId || userId <= 0) {
      throw new BadRequestException('Invalid user ID');
    }

    if (!targetUserId || targetUserId <= 0) {
      throw new BadRequestException('Invalid target user ID');
    }

    // Get current user's buddy list
    const currentUser = await this.prisma.$queryRaw<Array<{ buddy_list: string }>>`
      SELECT buddy_list 
      FROM smf_members 
      WHERE id_member = ${userId}
      LIMIT 1
    `;

    if (!currentUser.length) {
      throw new NotFoundException('User not found');
    }

    const buddyListStr = currentUser[0].buddy_list || '';
    const currentBuddies = buddyListStr
      .split(',')
      .map(id => parseInt(id.trim()))
      .filter(id => !isNaN(id) && id > 0);

    // Check if they are friends
    const friendIndex = currentBuddies.indexOf(targetUserId);
    if (friendIndex === -1) {
      throw new BadRequestException('Not friends with this user');
    }

    // Remove from buddy list
    currentBuddies.splice(friendIndex, 1);
    const newBuddyList = currentBuddies.join(',');

    // Update database
    await this.prisma.$executeRaw`
      UPDATE smf_members 
      SET buddy_list = ${newBuddyList}
      WHERE id_member = ${userId}
    `;

    return {
      success: true,
      message: 'Friend removed successfully'
    };
  }

  /**
   * Check friendship status between two users
   */
  async getFriendshipStatus(userId: number, targetUserId: number): Promise<{
    areFriends: boolean;
    isMutual: boolean;
    targetHasUser: boolean;
  }> {
    if (!userId || !targetUserId || userId === targetUserId) {
      return { areFriends: false, isMutual: false, targetHasUser: false };
    }

    // Get both users' buddy lists
    const users = await this.prisma.$queryRaw<Array<{
      id_member: number;
      buddy_list: string;
    }>>`
      SELECT id_member, buddy_list 
      FROM smf_members 
      WHERE id_member IN (${userId}, ${targetUserId})
    `;

    const userMap = new Map(users.map(u => [u.id_member, u.buddy_list || '']));
    
    const userBuddyList = userMap.get(userId) || '';
    const targetBuddyList = userMap.get(targetUserId) || '';

    const userBuddies = userBuddyList.split(',').map(id => parseInt(id.trim()));
    const targetBuddies = targetBuddyList.split(',').map(id => parseInt(id.trim()));

    const areFriends = userBuddies.includes(targetUserId);
    const targetHasUser = targetBuddies.includes(userId);
    const isMutual = areFriends && targetHasUser;

    return { areFriends, isMutual, targetHasUser };
  }

  /**
   * Get mutual friends between two users
   */
  async getMutualFriends(userId: number, targetUserId: number): Promise<FriendData[]> {
    if (!userId || !targetUserId || userId === targetUserId) {
      return [];
    }

    // Get both users' buddy lists
    const users = await this.prisma.$queryRaw<Array<{
      id_member: number;
      buddy_list: string;
    }>>`
      SELECT id_member, buddy_list 
      FROM smf_members 
      WHERE id_member IN (${userId}, ${targetUserId})
    `;

    if (users.length !== 2) {
      return [];
    }

    const userMap = new Map(users.map(u => [u.id_member, u.buddy_list || '']));
    
    const userBuddyList = userMap.get(userId) || '';
    const targetBuddyList = userMap.get(targetUserId) || '';

    const userBuddies = userBuddyList.split(',')
      .map(id => parseInt(id.trim()))
      .filter(id => !isNaN(id) && id > 0);
    
    const targetBuddies = targetBuddyList.split(',')
      .map(id => parseInt(id.trim()))
      .filter(id => !isNaN(id) && id > 0);

    // Find mutual friends
    const mutualFriendIds = userBuddies.filter(id => targetBuddies.includes(id));

    if (mutualFriendIds.length === 0) {
      return [];
    }

    // Get mutual friends data
    const mutualFriendsData = await this.prisma.$queryRaw<Array<{
      id_member: number;
      real_name: string;
      last_login: number;
      avatar: string;
    }>>`
      SELECT id_member, real_name, last_login, avatar
      FROM smf_members 
      WHERE id_member IN (${mutualFriendIds.join(',')})
      ORDER BY real_name ASC
    `;

    return mutualFriendsData.map(friend => ({
      id: friend.id_member,
      realName: friend.real_name,
      lastLogin: friend.last_login,
      avatar: friend.avatar || '../img/noavatar.png',
      lastLoginFormatted: this.formatLastLogin(friend.last_login)
    }));
  }

  /**
   * Search for potential friends
   */
  async searchUsers(query: string, userId: number, limit = 10): Promise<Array<{
    id: number;
    realName: string;
    avatar: string;
    areFriends: boolean;
    isMutual: boolean;
  }>> {
    if (!query || query.trim().length < 2) {
      throw new BadRequestException('Search query must be at least 2 characters');
    }

    const searchQuery = `%${query.trim()}%`;

    // Search users by name
    const users = await this.prisma.$queryRaw<Array<{
      id_member: number;
      real_name: string;
      avatar: string;
    }>>`
      SELECT id_member, real_name, avatar
      FROM smf_members 
      WHERE (real_name LIKE ${searchQuery} OR member_name LIKE ${searchQuery})
        AND id_member != ${userId}
        AND is_activated = 1
      ORDER BY real_name ASC
      LIMIT ${limit}
    `;

    if (users.length === 0) {
      return [];
    }

    // Get current user's buddy list to check friendship status
    const currentUser = await this.prisma.$queryRaw<Array<{ buddy_list: string }>>`
      SELECT buddy_list 
      FROM smf_members 
      WHERE id_member = ${userId}
      LIMIT 1
    `;

    const buddyListStr = currentUser[0]?.buddy_list || '';
    const currentBuddies = buddyListStr
      .split(',')
      .map(id => parseInt(id.trim()))
      .filter(id => !isNaN(id) && id > 0);

    return users.map(user => ({
      id: user.id_member,
      realName: user.real_name,
      avatar: user.avatar || '../img/noavatar.png',
      areFriends: currentBuddies.includes(user.id_member),
      isMutual: false // Would need additional query to determine this
    }));
  }

  /**
   * Format last login time
   */
  private formatLastLogin(lastLogin: number): string {
    if (!lastLogin || lastLogin === 0) {
      return 'jamais...';
    }

    const now = Math.floor(Date.now() / 1000);
    const daysDiff = Math.floor((now - lastLogin) / (24 * 60 * 60));

    if (daysDiff <= 0) {
      return "Moins d'un jour";
    } else if (daysDiff === 1) {
      return '1 jour';
    } else {
      return `${daysDiff} jours`;
    }
  }

  /**
   * Get friend recommendations based on mutual friends
   */
  async getFriendRecommendations(userId: number, limit = 5): Promise<Array<{
    id: number;
    realName: string;
    avatar: string;
    mutualFriendsCount: number;
    mutualFriends: string[];
  }>> {
    // Get user's current friends
    const { friends } = await this.getFriends(userId);
    const userFriendIds = friends.map(f => f.id);

    if (userFriendIds.length === 0) {
      return [];
    }

    // Get friends of friends
    const friendsOfFriends = await this.prisma.$queryRaw<Array<{
      id_member: number;
      real_name: string;
      avatar: string;
      buddy_list: string;
    }>>`
      SELECT DISTINCT id_member, real_name, avatar, buddy_list
      FROM smf_members 
      WHERE id_member IN (
        SELECT DISTINCT CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(buddy_list, ',', numbers.n), ',', -1) AS UNSIGNED) as friend_id
        FROM smf_members
        CROSS JOIN (
          SELECT 1 n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
          UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10
        ) numbers
        WHERE id_member IN (${userFriendIds.join(',')})
          AND CHAR_LENGTH(buddy_list) - CHAR_LENGTH(REPLACE(buddy_list, ',', '')) >= numbers.n - 1
          AND buddy_list != ''
      )
      AND id_member != ${userId}
      AND id_member NOT IN (${userFriendIds.join(',')})
      AND is_activated = 1
      LIMIT ${limit * 3}
    `;

    // Calculate mutual friends for each recommendation
    const recommendations = friendsOfFriends
      .map(user => {
        const userBuddies = (user.buddy_list || '').split(',')
          .map(id => parseInt(id.trim()))
          .filter(id => !isNaN(id) && id > 0);
        
        const mutualFriendIds = userFriendIds.filter(id => userBuddies.includes(id));
        const mutualFriends = friends
          .filter(f => mutualFriendIds.includes(f.id))
          .map(f => f.realName);

        return {
          id: user.id_member,
          realName: user.real_name,
          avatar: user.avatar || '../img/noavatar.png',
          mutualFriendsCount: mutualFriendIds.length,
          mutualFriends
        };
      })
      .filter(rec => rec.mutualFriendsCount > 0)
      .sort((a, b) => b.mutualFriendsCount - a.mutualFriendsCount)
      .slice(0, limit);

    return recommendations;
  }
}