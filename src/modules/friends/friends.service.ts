import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/services/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

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

import { CacheService } from '../../shared/services/cache.service';

@Injectable()
export class FriendsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private cacheService: CacheService
  ) { }

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
    const friendsIdsSql = Prisma.sql`(${Prisma.join(friendIds)})`;
    const friendsData = await this.prisma.$queryRaw<Array<{
      id_member: number;
      real_name: string;
      last_login: number;
      avatar: string;
      buddy_list: string;
    }>>`
      SELECT id_member, real_name, last_login, avatar, buddy_list
      FROM smf_members 
      WHERE id_member IN ${friendsIdsSql}
      ORDER BY real_name ASC
    `;

    // Process friends data
    const currentTime = Math.floor(Date.now() / 1000);
    const oneDayAgo = currentTime - (24 * 60 * 60);

    let mutualCount = 0;
    let recentlyActiveCount = 0;

    const friends: FriendData[] = friendsData.map(friend => {
      // Check if friendship is mutual (ensure boolean, not empty string)
      const isMutual = friend.buddy_list
        ? friend.buddy_list.split(',').includes(userId.toString())
        : false;

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
    const targetUserData = await this.prisma.$queryRaw<Array<{ buddy_list: string; real_name: string }>>`
      SELECT buddy_list, real_name 
      FROM smf_members 
      WHERE id_member = ${targetUserId}
      LIMIT 1
    `;

    const targetBuddyList = targetUserData[0]?.buddy_list || '';
    const isMutual = targetBuddyList.split(',').includes(userId.toString());

    // Get sender's name for notification
    const senderData = await this.prisma.$queryRaw<Array<{ real_name: string }>>`
      SELECT real_name 
      FROM smf_members 
      WHERE id_member = ${userId}
      LIMIT 1
    `;

    const senderName = senderData[0]?.real_name || 'Un utilisateur';
    const targetName = targetUserData[0]?.real_name || 'Utilisateur';

    // Send notification to target user
    if (isMutual) {
      // If mutual, notify that they are now mutual friends
      await this.notificationsService.sendNotification({
        userId: targetUserId,
        type: 'friend_accepted',
        title: 'Amitié mutuelle établie',
        message: `${senderName} a accepté votre demande d'ami. Vous êtes maintenant amis !`,
        priority: 'medium',
        data: { friendId: userId, friendName: senderName }
      });

      // Also notify the sender that mutual friendship is established
      await this.notificationsService.sendNotification({
        userId: userId,
        type: 'friend_accepted',
        title: 'Amitié mutuelle établie',
        message: `Vous et ${targetName} êtes maintenant amis mutuels !`,
        priority: 'medium',
        data: { friendId: targetUserId, friendName: targetName }
      });
    } else {
      // If not mutual, it's a new friend request
      await this.notificationsService.sendNotification({
        userId: targetUserId,
        type: 'friend_request',
        title: 'Nouvelle demande d\'ami',
        message: `${senderName} souhaite vous ajouter en ami`,
        priority: 'medium',
        data: { requesterId: userId, requesterName: senderName }
      });
    }

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

    const userMap = new Map<number, string>(users.map(u => [u.id_member, u.buddy_list || '']));

    const userBuddyList: string = userMap.get(userId) || '';
    const targetBuddyList: string = userMap.get(targetUserId) || '';

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

    const userMap = new Map<number, string>(users.map(u => [u.id_member, u.buddy_list || '']));

    const userBuddyList: string = userMap.get(userId) || '';
    const targetBuddyList: string = userMap.get(targetUserId) || '';

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
    const mutualIdsSql = Prisma.sql`(${Prisma.join(mutualFriendIds)})`;
    const mutualFriendsData = await this.prisma.$queryRaw<Array<{
      id_member: number;
      real_name: string;
      last_login: number;
      avatar: string;
    }>>`
      SELECT id_member, real_name, last_login, avatar
      FROM smf_members 
      WHERE id_member IN ${mutualIdsSql}
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

  /**
   * Get pending friend requests (users who have added current user but not mutual)
   */
  async getPendingFriendRequests(userId: number): Promise<FriendData[]> {
    if (!userId || userId <= 0) {
      throw new BadRequestException('Invalid user ID');
    }

    // Find users who have this user in their buddy list but they're not in the user's buddy list
    const pendingRequests = await this.prisma.$queryRaw<Array<{
      id_member: number;
      real_name: string;
      last_login: number;
      avatar: string;
      buddy_list: string;
    }>>`
      SELECT sender.id_member, sender.real_name, sender.last_login, sender.avatar, sender.buddy_list
      FROM smf_members sender
      LEFT JOIN smf_members receiver ON receiver.id_member = ${userId}
      WHERE sender.id_member != ${userId}
        AND (
          sender.buddy_list LIKE ${`%,${userId},%`} 
          OR sender.buddy_list LIKE ${`${userId},%`} 
          OR sender.buddy_list LIKE ${`%,${userId}`} 
          OR sender.buddy_list = ${userId.toString()}
        )
        AND (
          receiver.buddy_list IS NULL 
          OR (
            receiver.buddy_list NOT LIKE CONCAT('%,', sender.id_member, ',%') 
            AND receiver.buddy_list NOT LIKE CONCAT(sender.id_member, ',%')
            AND receiver.buddy_list NOT LIKE CONCAT('%,', sender.id_member)
            AND receiver.buddy_list <> sender.id_member::text
          )
        )
      ORDER BY sender.real_name ASC
    `;

    return pendingRequests.map(request => ({
      id: request.id_member,
      realName: request.real_name,
      lastLogin: request.last_login,
      avatar: request.avatar || '../img/noavatar.png',
      lastLoginFormatted: this.formatLastLogin(request.last_login)
    }));
  }

  /**
   * Accept a friend request
   */
  async acceptFriendRequest(userId: number, requesterId: number): Promise<{ success: boolean; message: string }> {
    if (!userId || !requesterId || userId === requesterId) {
      throw new BadRequestException('Invalid user IDs');
    }

    // Verify that the requester has actually sent a friend request
    const requester = await this.prisma.$queryRaw<Array<{ buddy_list: string }>>`
      SELECT buddy_list 
      FROM smf_members 
      WHERE id_member = ${requesterId}
      LIMIT 1
    `;

    if (!requester.length) {
      throw new NotFoundException('Requester not found');
    }

    const requesterBuddyList = requester[0].buddy_list || '';
    const requesterBuddies = requesterBuddyList.split(',')
      .map(id => parseInt(id.trim()))
      .filter(id => !isNaN(id) && id > 0);

    if (!requesterBuddies.includes(userId)) {
      throw new BadRequestException('No pending friend request from this user');
    }

    // Add requester to current user's buddy list (this will make it mutual)
    const result = await this.addFriend(userId, requesterId);

    // Note: addFriend already sends notifications, but we'll make sure the message is appropriate for acceptance
    return {
      success: true,
      message: result.isMutual ? 'Friend request accepted - you are now mutual friends!' : 'Friend request accepted!'
    };
  }

  /**
   * Decline a friend request
   */
  async declineFriendRequest(userId: number, requesterId: number): Promise<{ success: boolean; message: string }> {
    if (!userId || !requesterId || userId === requesterId) {
      throw new BadRequestException('Invalid user IDs');
    }

    // Verify that the requester has actually sent a friend request
    const requester = await this.prisma.$queryRaw<Array<{ buddy_list: string }>>`
      SELECT buddy_list
      FROM smf_members
      WHERE id_member = ${requesterId}
      LIMIT 1
    `;

    if (!requester.length) {
      throw new NotFoundException('Requester not found');
    }

    const requesterBuddyList = requester[0].buddy_list || '';
    const requesterBuddies = requesterBuddyList.split(',')
      .map(id => parseInt(id.trim()))
      .filter(id => !isNaN(id) && id > 0);

    if (!requesterBuddies.includes(userId)) {
      throw new BadRequestException('No pending friend request from this user');
    }

    // Remove current user from requester's buddy list
    const updatedBuddies = requesterBuddies.filter(id => id !== userId);
    const newBuddyList = updatedBuddies.length > 0 ? updatedBuddies.join(',') : '';

    await this.prisma.$queryRaw`
      UPDATE smf_members
      SET buddy_list = ${newBuddyList}
      WHERE id_member = ${requesterId}
    `;

    return {
      success: true,
      message: 'Friend request declined'
    };
  }

  /**
   * Get friends' activity timeline
   */
  async getFriendsActivity(
    userId: number,
    page: number = 1,
    limit: number = 20,
    typeFilter: string = 'all',
    contentTypeFilter: string = 'all'
  ): Promise<{
    activities: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasMore: boolean;
  }> {
    if (!userId || userId <= 0) {
      throw new BadRequestException('Invalid user ID');
    }

    if (page < 1) page = 1;
    if (limit < 1 || limit > 50) limit = 20;

    // Check cache first
    const cachedActivity = await this.cacheService.getFriendsActivity(userId, page, limit, typeFilter, contentTypeFilter);
    if (cachedActivity) {
      return cachedActivity;
    }

    // Get user's friends list
    const { friends } = await this.getFriends(userId);
    const friendIds = friends.map(f => f.id);

    if (friendIds.length === 0) {
      const emptyResult = {
        activities: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
        hasMore: false
      };
      // Cache the empty result too
      await this.cacheService.setFriendsActivity(userId, page, limit, typeFilter, contentTypeFilter, emptyResult, 120);
      return emptyResult;
    }

    const offset = (page - 1) * limit;
    const activities: any[] = [];

    // Fetch anime ratings
    if (typeFilter === 'all' || typeFilter === 'rating') {
      const animeRatings = await this.prisma.$queryRaw<Array<{
        id: number;
        user_id: number;
        anime_id: number;
        rating: number;
        updatedat: Date;
        real_name: string;
        avatar: string;
        titre: string;
        image: string;
      }>>`
    SELECT
      ual.id, ual.user_id, ual.anime_id, ual.rating, ual.updatedat,
      m.real_name, m.avatar,
      a.titre, a.image
    FROM ak_user_anime_list ual
    JOIN smf_members m ON ual.user_id = m.id_member
    JOIN ak_animes a ON ual.anime_id = a.id_anime
    WHERE ual.user_id IN (${Prisma.join(friendIds)})
      AND ual.rating IS NOT NULL
      AND ual.rating > 0
      AND ual.updatedat IS NOT NULL
    ORDER BY ual.updatedat DESC
    LIMIT ${limit + 100}
  `;

      activities.push(...animeRatings.map(r => {
        // Convert from base-5 to base-10 for display consistency
        const displayRating = (r.rating * 2);

        return {
          id: `anime-rating-${r.id}`,
          type: 'rating',
          userId: r.user_id,
          userName: r.real_name,
          userAvatar: r.avatar || '../img/noavatar.png',
          createdAt: r.updatedat,
          contentType: 'anime',
          contentId: r.anime_id,
          contentTitle: r.titre,
          contentImage: r.image,
          rating: displayRating,
          actionText: `a attribué ${displayRating}/10 à la série ${r.titre}`
        };
      }));
    }

    // Fetch game ratings
    // Fetch game ratings
    if (typeFilter === 'all' || typeFilter === 'rating') {
      const gameRatings = await this.prisma.$queryRaw<Array<{
        id_collection: number;
        id_membre: number;
        id_jeu: number;
        evaluation: number;
        date_modified: Date;
        real_name: string;
        avatar: string;
        titre: string;
        image: string;
      }>>`
    SELECT
      cj.id_collection, cj.id_membre, cj.id_jeu, cj.evaluation, cj.date_modified,
      m.real_name, m.avatar,
      jv.titre, jv.image
    FROM collection_jeuxvideo cj
    JOIN smf_members m ON cj.id_membre = m.id_member
    JOIN ak_jeux_video jv ON cj.id_jeu = jv.id_jeu
    WHERE cj.id_membre IN (${Prisma.join(friendIds)})
      AND cj.evaluation IS NOT NULL
      AND cj.evaluation > 0
      AND cj.date_modified IS NOT NULL
    ORDER BY cj.date_modified DESC
    LIMIT ${limit + 100}
  `;

      activities.push(...gameRatings.map(r => {
        // Convert from base-5 to base-10 for display consistency
        const displayRating = (r.evaluation * 2);

        return {
          id: `game-rating-${r.id_collection}`,
          type: 'rating',
          userId: r.id_membre,
          userName: r.real_name,
          userAvatar: r.avatar || '../img/noavatar.png',
          createdAt: r.date_modified,
          contentType: 'game',
          contentId: r.id_jeu,
          contentTitle: r.titre,
          contentImage: r.image,
          rating: displayRating,
          actionText: `a attribué ${displayRating}/10 au jeu ${r.titre}`
        };
      }));
    }

    // Fetch manga ratings
    if (typeFilter === 'all' || typeFilter === 'rating') {
      const mangaRatings = await this.prisma.$queryRaw<Array<{
        id_collection: number;
        id_membre: number;
        id_manga: number;
        evaluation: number;
        updated_at: Date;
        real_name: string;
        avatar: string;
        titre: string;
        image: string;
      }>>`
    SELECT
      cm.id_collection, cm.id_membre, cm.id_manga, cm.evaluation, cm.updated_at,
      m.real_name, m.avatar,
      mg.titre, mg.image
    FROM collection_mangas cm
    JOIN smf_members m ON cm.id_membre = m.id_member
    JOIN ak_mangas mg ON cm.id_manga = mg.id_manga
    WHERE cm.id_membre IN (${Prisma.join(friendIds)})
      AND cm.evaluation IS NOT NULL
      AND cm.evaluation > 0
      AND cm.updated_at IS NOT NULL
    ORDER BY cm.updated_at DESC
    LIMIT ${limit + 100}
  `;

      activities.push(...mangaRatings.map(r => {
        // Convert from base-5 to base-10 for display
        const displayRating = (r.evaluation * 2);

        return {
          id: `manga-rating-${r.id_collection}`,
          type: 'rating',
          userId: r.id_membre,
          userName: r.real_name,
          userAvatar: r.avatar || '../img/noavatar.png',
          createdAt: r.updated_at,
          contentType: 'manga',
          contentId: r.id_manga,
          contentTitle: r.titre,
          contentImage: r.image,
          rating: displayRating,
          actionText: `a attribué ${displayRating}/10 au manga ${r.titre}`
        };
      }));
    }

    // Fetch reviews
    if (typeFilter === 'all' || typeFilter === 'review') {
      const reviews = await this.prisma.$queryRaw<Array<{
        id_critique: number;
        id_membre: number;
        titre: string;
        critique: string;
        notation: number;
        date_critique: Date;
        id_anime: number | null;
        id_manga: number | null;
        id_jeu: number | null;
        real_name: string;
        avatar: string;
        content_titre: string | null;
        content_image: string | null;
        content_type: string;
      }>>`
        SELECT
          c.id_critique, c.id_membre, c.titre, c.critique, c.notation, c.date_critique,
          c.id_anime, c.id_manga, c.id_jeu,
          m.real_name, m.avatar,
          COALESCE(a.titre, mg.titre, jv.titre) as content_titre,
          COALESCE(a.image, mg.image, jv.image) as content_image,
          CASE
            WHEN c.id_anime > 0 THEN 'anime'
            WHEN c.id_manga > 0 THEN 'manga'
            WHEN c.id_jeu > 0 THEN 'game'
            ELSE 'other'
          END as content_type
        FROM ak_critique c
        JOIN smf_members m ON c.id_membre = m.id_member
        LEFT JOIN ak_animes a ON c.id_anime = a.id_anime
        LEFT JOIN ak_mangas mg ON c.id_manga = mg.id_manga
        LEFT JOIN ak_jeux_video jv ON c.id_jeu = jv.id_jeu
        WHERE c.id_membre IN (${Prisma.join(friendIds)})
          AND c.date_critique IS NOT NULL
          AND c.statut = 0
        ORDER BY c.date_critique DESC
        LIMIT ${limit + 100}
      `;

      activities.push(...reviews.map(r => {
        const excerpt = r.critique ? r.critique.substring(0, 150).replace(/<[^>]*>/g, '') : '';
        return {
          id: `review-${r.id_critique}`,
          type: 'review',
          userId: r.id_membre,
          userName: r.real_name,
          userAvatar: r.avatar || '../img/noavatar.png',
          createdAt: r.date_critique,
          contentType: r.content_type,
          contentId: r.id_anime || r.id_manga || r.id_jeu,
          contentTitle: r.content_titre,
          contentImage: r.content_image,
          rating: r.notation,
          reviewTitle: r.titre,
          reviewExcerpt: excerpt,
          actionText: `a écrit une critique sur ${r.content_type === 'anime' ? 'la série' : r.content_type === 'manga' ? 'le manga' : 'le jeu'} ${r.content_titre}${r.notation ? ` et lui a attribué ${r.notation}/10` : ''}`
        };
      }));
    }

    // Fetch top lists
    if (typeFilter === 'all' || typeFilter === 'top_list') {
      const topLists = await this.prisma.$queryRaw<Array<{
        id: number;
        title: string;
        createdat: Date;
        updatedat: Date;
        createdby_id: number;
        real_name: string;
        avatar: string;
        items_count: number;
      }>>`
        SELECT
          tl.id, tl.title, tl.createdat, tl.updatedat, tl.createdby_id,
          m.real_name, m.avatar,
          COUNT(tli.id) as items_count
        FROM ak_top_lists tl
        JOIN smf_members m ON tl.createdby_id = m.id_member
        LEFT JOIN ak_top_list_items tli ON tl.id = tli.toplist_id
        WHERE tl.createdby_id IN (${Prisma.join(friendIds)})
          AND tl.ispublic = 1
          AND tl.updatedat IS NOT NULL
        GROUP BY tl.id, tl.title, tl.createdat, tl.updatedat, tl.createdby_id, m.real_name, m.avatar
        ORDER BY tl.updatedat DESC
        LIMIT ${limit + 50}
      `;

      activities.push(...topLists.map(tl => ({
        id: `top-list-${tl.id}`,
        type: 'top_list',
        userId: tl.createdby_id,
        userName: tl.real_name,
        userAvatar: tl.avatar || '../img/noavatar.png',
        createdAt: tl.updatedat,
        listName: tl.title,
        itemsCount: Number(tl.items_count),
        actionText: `a créé/mis à jour la liste "${tl.title}"`
      })));
    }

    // Fetch social posts
    if (typeFilter === 'all' || typeFilter === 'post') {
      const posts = await this.prisma.$queryRaw<Array<{
        id_post: number;
        user_id: number;
        content: string;
        image_url: string;
        created_at: Date;
        real_name: string;
        avatar: string;
        likes_count: number;
        comments_count: number;
      }>>`
        SELECT
          p.id_post, p.user_id, p.content, p.image_url, p.created_at,
          m.real_name, m.avatar,
          (SELECT COUNT(*) FROM ak_social_likes l WHERE l.post_id = p.id_post) as likes_count,
          (SELECT COUNT(*) FROM ak_social_comments c WHERE c.post_id = p.id_post) as comments_count
        FROM ak_social_posts p
        JOIN smf_members m ON p.user_id = m.id_member
        WHERE p.user_id IN (${Prisma.join(friendIds)})
        ORDER BY p.created_at DESC
        LIMIT ${limit + 50}
      `;

      activities.push(...posts.map(p => ({
        id: `post-${p.id_post}`,
        type: 'post',
        userId: p.user_id,
        userName: p.real_name,
        userAvatar: p.avatar || '../img/noavatar.png',
        createdAt: p.created_at,
        content: p.content,
        image: p.image_url,
        likesCount: Number(p.likes_count),
        commentsCount: Number(p.comments_count),
        actionText: `a publié un message`
      })));
    }

    // Sort all activities by date
    activities.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });

    // Apply content type filter
    let filteredActivities = activities;
    if (contentTypeFilter !== 'all') {
      filteredActivities = activities.filter(a =>
        a.contentType === contentTypeFilter || a.type === 'top_list' || a.type === 'following'
      );
    }

    const total = filteredActivities.length;
    const paginatedActivities = filteredActivities.slice(offset, offset + limit);

    // Format time ago
    const formattedActivities = paginatedActivities.map(activity => ({
      ...activity,
      createdAt: new Date(activity.createdAt).toISOString(),
      timeAgo: this.formatTimeAgo(new Date(activity.createdAt))
    }));

    const result = {
      activities: formattedActivities,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: offset + limit < total
    };

    // Cache the result for 2 minutes
    await this.cacheService.setFriendsActivity(userId, page, limit, typeFilter, contentTypeFilter, result, 120);

    return result;
  }

  /**
   * Format time ago
   */
  private formatTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);

    if (diffMinutes < 1) return 'À l\'instant';
    if (diffMinutes < 60) return `Il y a ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
    if (diffHours < 24) return `Il y a ${diffHours} heure${diffHours > 1 ? 's' : ''}`;
    if (diffDays === 1) return 'Hier';
    if (diffDays < 7) return `Il y a ${diffDays} jours`;
    if (diffWeeks < 4) return `Il y a ${diffWeeks} semaine${diffWeeks > 1 ? 's' : ''}`;
    if (diffMonths < 12) return `Il y a ${diffMonths} mois`;

    return date.toLocaleDateString('fr-FR');
  }

  /**
   * Get list of animes currently being watched by friends
   */
  async getFriendsWatching(userId: number, limit: number = 20) {
    if (!userId || userId <= 0) {
      throw new BadRequestException('Invalid user ID');
    }

    // Get user's friends list
    const { friends } = await this.getFriends(userId);
    const friendIds = friends.map(f => f.id);

    if (friendIds.length === 0) {
      return [];
    }

    // Query friends watching list from collection_animes
    const watchingList = await this.prisma.$queryRaw<Array<{
      user_id: number;
      anime_id: number;
      updated_at: Date;
      current_episode: number;
      real_name: string;
      avatar: string;
      titre: string;
      image: string;
      slug: string;
    }>>`
      SELECT
        ca.id_membre as user_id, ca.id_anime as anime_id, ca.updated_at, 0 as current_episode,
        m.real_name, m.avatar,
        a.titre, a.image, a.nice_url as slug
      FROM collection_animes ca
      JOIN smf_members m ON ca.id_membre = m.id_member
      JOIN ak_animes a ON ca.id_anime = a.id_anime
      WHERE ca.id_membre IN (${Prisma.join(friendIds)})
        AND ca.type = 2
      ORDER BY ca.updated_at DESC
      LIMIT ${limit}
    `;

    return watchingList.map(item => ({
      userId: item.user_id,
      userName: item.real_name,
      userAvatar: item.avatar || '../img/noavatar.png',
      animeId: item.anime_id,
      animeTitle: item.titre,
      animeImage: item.image,
      animeSlug: item.slug,
      currentEpisode: item.current_episode,
      updatedAt: item.updated_at,
      formattedDate: this.formatTimeAgo(new Date(item.updated_at))
    }));
  }
}


